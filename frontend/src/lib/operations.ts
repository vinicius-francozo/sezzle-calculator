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
