/**
 * Types mirroring the frozen API contract in `docs/api.md`.
 * Nothing here may drift from that document.
 */

/** Operations taking a left and a right operand, entered as `left op right =` (DESIGN.md D1). */
export type BinaryOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'percent';

/**
 * Operations taking a single operand. They have no second operand to wait for, so
 * they apply to the entry at once and need no `=` (see DESIGN.md D24).
 */
export type UnaryOperation = 'sqrt';

/** Operations the API can perform. Arity is a property of the operation (docs/api.md). */
export type Operation = BinaryOperation | UnaryOperation;

export interface CalculateRequest {
  readonly operation: Operation;
  readonly operands: readonly number[];
}

/** The API echoes the request back, so a response is self-describing. */
export interface CalculateResponse extends CalculateRequest {
  readonly result: number;
}

/** The part of a response the client verifies; the echoed request is not re-checked. */
export type CalculateResult = Pick<CalculateResponse, 'result'>;

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
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'UNEXPECTED_ERROR';

export type ApiErrorCode = ServerErrorCode | ClientErrorCode;
