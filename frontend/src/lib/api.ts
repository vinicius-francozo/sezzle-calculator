import {
  SERVER_ERROR_CODES,
  type ApiErrorCode,
  type CalculateRequest,
  type CalculateResult,
  type ServerErrorCode,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const NETWORK_FAILURE_MESSAGE = 'Could not reach the calculator service';
const TIMEOUT_MESSAGE = 'The calculator service took too long to respond';
const UNEXPECTED_RESPONSE_MESSAGE = 'The calculator service returned an unexpected response';

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function calculate(
  request: CalculateRequest,
  signal?: AbortSignal,
): Promise<CalculateResult> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw signal?.aborted === true
      ? new ApiError('TIMEOUT', TIMEOUT_MESSAGE)
      : new ApiError('NETWORK_ERROR', NETWORK_FAILURE_MESSAGE);
  }

  const body = await readJson(response, signal);

  if (!response.ok) {
    throw toApiError(body);
  }
  if (!isRecord(body) || typeof body.result !== 'number' || !Number.isFinite(body.result)) {
    throw new ApiError('UNEXPECTED_ERROR', UNEXPECTED_RESPONSE_MESSAGE);
  }
  return { result: body.result };
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    if (signal?.aborted === true) {
      throw new ApiError('TIMEOUT', TIMEOUT_MESSAGE);
    }
    return null;
  }
}

function toApiError(body: unknown): ApiError {
  if (!isRecord(body) || !isRecord(body.error)) {
    return new ApiError('UNEXPECTED_ERROR', UNEXPECTED_RESPONSE_MESSAGE);
  }
  const { code, message } = body.error;
  if (!isServerErrorCode(code) || typeof message !== 'string') {
    return new ApiError('UNEXPECTED_ERROR', UNEXPECTED_RESPONSE_MESSAGE);
  }
  return new ApiError(code, message);
}

function isServerErrorCode(value: unknown): value is ServerErrorCode {
  return SERVER_ERROR_CODES.some((code) => code === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
