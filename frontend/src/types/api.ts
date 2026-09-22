/**
 * Types mirroring the frozen API contract in `docs/api.md`.
 * Nothing here may drift from that document.
 */

/** Operations the API can perform. Only the binary ones are in scope (see DESIGN.md D1). */
export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export interface CalculateRequest {
  readonly operation: Operation;
  readonly operands: readonly number[];
}

/** The API echoes the request back, so a response is self-describing. */
export interface CalculateResponse extends CalculateRequest {
  readonly result: number;
}

/** Error codes the API can return, per the catalogue in `docs/api.md`. */
export const SERVER_ERROR_CODES = [
  'INVALID_JSON',
  'VALIDATION_ERROR',
  'UNSUPPORTED_OPERATION',
  'DIVISION_BY_ZERO',
  'UNDEFINED_RESULT',
  'OVERFLOW',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

/** Failures detected by the client, which never reach the API. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNEXPECTED_ERROR';

export type ApiErrorCode = ServerErrorCode | ClientErrorCode;
