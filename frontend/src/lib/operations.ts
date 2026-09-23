import type { Operation } from '../types/api';

export const OPERATOR_SYMBOLS: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '%',
  sqrt: '√',
};

export const OPERATION_ARITY: Record<Operation, 1 | 2> = {
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  power: 2,
  percent: 2,
  sqrt: 1,
};
