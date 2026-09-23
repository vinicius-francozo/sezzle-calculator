export type BinaryOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'percent';

export type UnaryOperation = 'sqrt';

export type Operation = BinaryOperation | UnaryOperation;

export interface CalculateRequest {
  readonly operation: Operation;
  readonly operands: readonly number[];
}

export interface CalculateResponse extends CalculateRequest {
  readonly result: number;
}

export type CalculateResult = Pick<CalculateResponse, 'result'>;

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

export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'UNEXPECTED_ERROR';

export type ApiErrorCode = ServerErrorCode | ClientErrorCode;
