import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from './api';
import { SERVER_ERROR_CODES, type CalculateRequest } from '../types/api';

const REQUEST: CalculateRequest = { operation: 'divide', operands: [12, 4] };

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

function respondWithText(status: number, text: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(text, { status })),
  );
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (cause) {
    expect(cause).toBeInstanceOf(ApiError);
    return cause as ApiError;
  }
  throw new Error('expected the call to reject with an ApiError');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calculate', () => {
  it('posts the operation to the API and returns the result', async () => {
    respondWith(200, { operation: 'divide', operands: [12, 4], result: 3 });

    await expect(calculate(REQUEST)).resolves.toEqual({ result: 3 });
    expect(fetch).toHaveBeenCalledWith('/api/v1/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"operation":"divide","operands":[12,4]}',
    });
  });

  it.each(SERVER_ERROR_CODES)('surfaces the %s error returned by the API', async (code) => {
    respondWith(400, { error: { code, message: `${code} happened` } });

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe(code);
    expect(error.message).toBe(`${code} happened`);
  });

  it('reports the API message for a division by zero', async () => {
    respondWith(400, {
      error: { code: 'DIVISION_BY_ZERO', message: 'Division by zero is undefined' },
    });

    const error = await expectApiError(calculate({ operation: 'divide', operands: [12, 0] }));

    expect(error.code).toBe('DIVISION_BY_ZERO');
    expect(error.message).toBe('Division by zero is undefined');
  });

  it('collapses a network failure into the same error shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe('Could not reach the calculator service');
  });

  it('rejects an error body that does not follow the envelope', async () => {
    respondWith(400, { message: 'something went wrong' });

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });

  it('rejects an unknown error code', async () => {
    respondWith(400, { error: { code: 'TEAPOT', message: 'I am a teapot' } });

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });

  it('rejects a response body that is not JSON', async () => {
    respondWithText(500, '<html>gateway error</html>');

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });

  it('rejects a success response without a finite result', async () => {
    respondWith(200, { operation: 'divide', operands: [12, 4], result: 'three' });

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });
});
