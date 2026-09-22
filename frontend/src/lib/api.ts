import {
  SERVER_ERROR_CODES,
  type ApiErrorCode,
  type CalculateRequest,
  type CalculateResult,
  type ServerErrorCode,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const NETWORK_FAILURE_MESSAGE = 'Could not reach the calculator service';
const UNEXPECTED_RESPONSE_MESSAGE = 'The calculator service returned an unexpected response';

/**
 * ApiError is the single failure channel of the client: HTTP errors, network
 * failures and unreadable responses all surface as one shape, so the UI has one
 * place to render them (see DESIGN.md D8).
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * calculate performs one arithmetic operation through `POST /api/v1/calculate`.
 * It resolves with the result it verified in the response — the echoed request
 * is not checked, so it is not handed back — or rejects with an {@link ApiError}.
 */
export async function calculate(request: CalculateRequest): Promise<CalculateResult> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', NETWORK_FAILURE_MESSAGE);
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw toApiError(body);
  }
  if (!isRecord(body) || typeof body.result !== 'number' || !Number.isFinite(body.result)) {
    throw new ApiError('UNEXPECTED_ERROR', UNEXPECTED_RESPONSE_MESSAGE);
  }
  return { result: body.result };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Maps the API error envelope onto an ApiError, falling back when it is unreadable. */
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
