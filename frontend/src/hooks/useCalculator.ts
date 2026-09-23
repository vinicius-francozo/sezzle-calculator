import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from '../lib/api';
import { SIGNIFICANT_DIGITS, formatNumber } from '../lib/format';
import { OPERATION_ARITY, OPERATOR_SYMBOLS } from '../lib/operations';
import type { BinaryOperation, Operation, UnaryOperation } from '../types/api';

export interface HistoryEntry {
  readonly id: number;
  readonly expression: string;
  readonly result: string;
}

export interface PendingOperation {
  readonly operation: Operation;
  readonly operands: readonly [number] | readonly [number, number];
  readonly expression: string;
  readonly nextOperator: BinaryOperation | null;
}

export interface Entry {
  readonly text: string;
  readonly value: number;
}

export interface CalculatorState {
  readonly entry: Entry;
  readonly accumulator: number | null;
  readonly operator: BinaryOperation | null;
  readonly overwriteEntry: boolean;
  readonly entryIsOperand: boolean;
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
  readonly pending: PendingOperation | null;
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'undo' }
  | { type: 'operator'; operator: BinaryOperation }
  | { type: 'unary'; operation: UnaryOperation }
  | { type: 'equals' }
  | { type: 'clear' }
  | { type: 'resolved'; result: number }
  | { type: 'rejected'; message: string };

type InputAction = Exclude<CalculatorAction, { type: 'clear' | 'resolved' | 'rejected' }>;

const HISTORY_LIMIT = 10;
const MAX_ENTRY_DIGITS = SIGNIFICANT_DIGITS;
const UNEXPECTED_FAILURE_MESSAGE = 'The calculation could not be completed';
const REQUEST_TIMEOUT_MS = 10_000;

export const initialState: CalculatorState = {
  entry: { text: '0', value: 0 },
  accumulator: null,
  operator: null,
  overwriteEntry: true,
  entryIsOperand: false,
  history: [],
  error: null,
  pending: null,
};

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'clear':
      return initialState;
    case 'resolved':
      return state.pending === null ? state : settle(state, state.pending, action.result);
    case 'rejected':
      return state.pending === null ? state : fail(state, state.pending, action.message);
    default:
      return state.pending === null ? applyInput(state, action) : state;
  }
}

function applyInput(state: CalculatorState, action: InputAction): CalculatorState {
  switch (action.type) {
    case 'digit':
      return appendDigit(state, action.digit);
    case 'decimal':
      return appendDecimal(state);
    case 'undo':
      return removeLastCharacter(state);
    case 'operator':
      return applyOperator(state, action.operator);
    case 'unary':
      return applyUnary(state, action.operation);
    case 'equals':
      return applyEquals(state);
  }
}

function typedEntry(text: string): Entry {
  return { text, value: Number(text) };
}

function resultEntry(value: number): Entry {
  return { text: formatNumber(value), value };
}

function withTypedEntry(state: CalculatorState, text: string): CalculatorState {
  return {
    ...state,
    entry: typedEntry(text),
    overwriteEntry: false,
    entryIsOperand: true,
    error: null,
  };
}

function appendDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.overwriteEntry || state.entry.text === '0') {
    return withTypedEntry(state, digit);
  }
  if (digitsIn(state.entry.text) >= MAX_ENTRY_DIGITS) {
    return state;
  }
  return withTypedEntry(state, state.entry.text + digit);
}

function digitsIn(text: string): number {
  return [...text].filter((character) => character !== '.').length;
}

function appendDecimal(state: CalculatorState): CalculatorState {
  if (state.overwriteEntry) {
    return withTypedEntry(state, '0.');
  }
  if (state.entry.text.includes('.')) {
    return state;
  }
  return withTypedEntry(state, `${state.entry.text}.`);
}

function removeLastCharacter(state: CalculatorState): CalculatorState {
  if (state.overwriteEntry || state.entry.text === '0') {
    return state;
  }
  const text = state.entry.text.slice(0, -1);
  return withTypedEntry(state, text === '' ? '0' : text);
}

function applyOperator(state: CalculatorState, operator: BinaryOperation): CalculatorState {
  if (state.operator !== null && !state.entryIsOperand) {
    return { ...state, operator, error: null };
  }
  if (state.operator !== null && state.accumulator !== null) {
    return request(state, state.operator, state.accumulator, operator);
  }
  return {
    ...state,
    accumulator: state.entry.value,
    operator,
    overwriteEntry: true,
    entryIsOperand: false,
    error: null,
  };
}

function applyEquals(state: CalculatorState): CalculatorState {
  if (state.operator === null || state.accumulator === null || !state.entryIsOperand) {
    return state;
  }
  return request(state, state.operator, state.accumulator, null);
}

function request(
  state: CalculatorState,
  operation: BinaryOperation,
  left: number,
  nextOperator: BinaryOperation | null,
): CalculatorState {
  const right = state.entry.value;
  const expression = `${formatNumber(left)} ${OPERATOR_SYMBOLS[operation]} ${formatNumber(right)}`;
  return {
    ...state,
    error: null,
    pending: { operation, operands: [left, right], expression, nextOperator },
  };
}

function applyUnary(state: CalculatorState, operation: UnaryOperation): CalculatorState {
  const operand = state.entry.value;
  return {
    ...state,
    error: null,
    pending: {
      operation,
      operands: [operand],
      expression: `${OPERATOR_SYMBOLS[operation]}${formatNumber(operand)}`,
      nextOperator: null,
    },
  };
}

function settle(
  state: CalculatorState,
  pending: PendingOperation,
  result: number,
): CalculatorState {
  const entry = resultEntry(result);
  const recorded: HistoryEntry = {
    id: nextHistoryId(state.history),
    expression: pending.expression,
    result: entry.text,
  };
  const settled: CalculatorState = {
    ...state,
    entry,
    overwriteEntry: true,
    history: [...state.history, recorded].slice(-HISTORY_LIMIT),
    error: null,
    pending: null,
  };
  if (isUnary(pending)) {
    return { ...settled, entryIsOperand: true };
  }
  return {
    ...settled,
    accumulator: pending.nextOperator === null ? null : result,
    operator: pending.nextOperator,
    entryIsOperand: false,
  };
}

function isUnary(pending: PendingOperation): boolean {
  return OPERATION_ARITY[pending.operation] === 1;
}

function nextHistoryId(history: readonly HistoryEntry[]): number {
  return (history.at(-1)?.id ?? 0) + 1;
}

function fail(state: CalculatorState, pending: PendingOperation, message: string): CalculatorState {
  const failed: CalculatorState = { ...state, overwriteEntry: true, error: message, pending: null };
  return isUnary(pending) ? failed : { ...failed, entryIsOperand: false };
}

export function formatExpression(state: CalculatorState): string {
  if (state.operator === null || state.accumulator === null) {
    return state.pending === null ? state.entry.text : state.pending.expression;
  }
  const waiting = `${formatNumber(state.accumulator)} ${OPERATOR_SYMBOLS[state.operator]}`;
  if (state.pending !== null) {
    const { expression } = state.pending;
    return isUnary(state.pending) ? `${waiting} ${expression}` : expression;
  }
  const showsEntry = state.entryIsOperand || state.error !== null;
  return showsEntry ? `${waiting} ${state.entry.text}` : waiting;
}

export interface Calculator {
  readonly state: CalculatorState;
  readonly expression: string;
  readonly dispatch: Dispatch<CalculatorAction>;
}

export function useCalculator(): Calculator {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const { pending } = state;

  useEffect(() => {
    if (pending === null) {
      return;
    }
    let current = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    calculate({ operation: pending.operation, operands: pending.operands }, controller.signal)
      .then((response) => {
        if (current) {
          dispatch({ type: 'resolved', result: response.result });
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          dispatch({ type: 'rejected', message: failureMessage(cause) });
        }
      });
    return () => {
      current = false;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [pending]);

  return { state, expression: formatExpression(state), dispatch };
}

function failureMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : UNEXPECTED_FAILURE_MESSAGE;
}
