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

/** Reloads the module with a stubbed environment, since the base URL is read once. */
async function calculateWithBaseUrl(value: string | undefined): Promise<void> {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', value);
  const { calculate: reloaded } = await import('./api');
  await reloaded(REQUEST);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
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

  it('reports the API message for a square root that is undefined', async () => {
    respondWith(400, {
      error: { code: 'UNDEFINED_RESULT', message: 'Square root of a negative number is undefined' },
    });

    const error = await expectApiError(calculate({ operation: 'sqrt', operands: [-9] }));

    expect(error.code).toBe('UNDEFINED_RESULT');
    expect(error.message).toBe('Square root of a negative number is undefined');
  });

  it('posts a unary operation with the single operand its arity asks for', async () => {
    respondWith(200, { operation: 'sqrt', operands: [9], result: 3 });

    await expect(calculate({ operation: 'sqrt', operands: [9] })).resolves.toEqual({ result: 3 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/calculate',
      expect.objectContaining({ body: '{"operation":"sqrt","operands":[9]}' }),
    );
  });

  it('reports a request the caller gave up on as a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      ),
    );
    const controller = new AbortController();

    const promise = calculate(REQUEST, controller.signal);
    controller.abort();
    const error = await expectApiError(promise);

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('The calculator service took too long to respond');
  });

  it('reports a deadline that fires while the body is still streaming as a timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          controller.abort();
          throw new DOMException('The operation was aborted', 'AbortError');
        },
      })),
    );

    const error = await expectApiError(calculate(REQUEST, controller.signal));

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('The calculator service took too long to respond');
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

  it('rejects a success response whose result is not a number', async () => {
    respondWith(200, { operation: 'divide', operands: [12, 4], result: 'three' });

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });

  it('rejects a success response whose result is a number but not finite', async () => {
    // JSON has no Infinity, but an out-of-range literal parses into one.
    respondWithText(200, '{"operation":"divide","operands":[12,4],"result":1e999}');

    const error = await expectApiError(calculate(REQUEST));

    expect(error.code).toBe('UNEXPECTED_ERROR');
  });

  it.each([
    ['unset', undefined],
    ['set to an empty string', ''],
  ])('posts to the same-origin /api when the base URL is %s', async (_, value) => {
    respondWith(200, { result: 3 });

    await calculateWithBaseUrl(value);

    expect(fetch).toHaveBeenCalledWith('/api/v1/calculate', expect.anything());
  });

  it('posts to the configured base URL when one is set', async () => {
    respondWith(200, { result: 3 });

    await calculateWithBaseUrl('https://calc.example.test/api');

    expect(fetch).toHaveBeenCalledWith('https://calc.example.test/api/v1/calculate', expect.anything());
  });
});
