import type { Operation } from '../types/api';

/**
 * Symbols an expression is written with, one per API operation. Every key but `xʸ`
 * is labelled with its symbol; `^` alone would not say what that key does.
 * `√` is a prefix — `√9` — because `sqrt` takes a single operand (DESIGN.md D24).
 */
export const OPERATOR_SYMBOLS: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '%',
  sqrt: '√',
};

/**
 * How many operands each operation takes. Arity is a property of the operation and
 * of nothing else (docs/api.md): a request is unary because it is `sqrt`, never
 * because the operands it happens to carry can be counted.
 */
export const OPERATION_ARITY: Record<Operation, 1 | 2> = {
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  power: 2,
  percent: 2,
  sqrt: 1,
};
