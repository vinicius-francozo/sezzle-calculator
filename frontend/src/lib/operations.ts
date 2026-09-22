import type { Operation } from '../types/api';

/** Symbols shown on the keypad and in the expression, one per API operation. */
export const OPERATOR_SYMBOLS: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
};
