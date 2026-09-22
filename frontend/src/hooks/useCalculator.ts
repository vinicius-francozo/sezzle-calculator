import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from '../lib/api';
import { SIGNIFICANT_DIGITS, formatNumber } from '../lib/format';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import type { Operation } from '../types/api';

/** A calculation that succeeded, kept for the history list (see DESIGN.md D12). */
export interface HistoryEntry {
  /** Identity of the entry, stable while older entries drop off the front of the list. */
  readonly id: number;
  readonly expression: string;
  readonly result: string;
}

/** An operation handed to the API. Its presence means a request is in flight. */
export interface PendingOperation {
  readonly operation: Operation;
  readonly operands: readonly [number, number];
  readonly expression: string;
  /** Operator to chain onto the result, when an operator key triggered the request. */
  readonly nextOperator: Operation | null;
}

/**
 * Entry is the operand on screen: the text shown to the user and the exact value
 * it stands for. They are two fields because the text is rounded for display
 * while the arithmetic must keep full precision (see DESIGN.md D6 and D7).
 */
export interface Entry {
  readonly text: string;
  readonly value: number;
}

export interface CalculatorState {
  /** The operand currently being typed or shown. */
  readonly entry: Entry;
  /** The left-hand operand: the previous result, or the entry when the operator was pressed. */
  readonly accumulator: number | null;
  readonly operator: Operation | null;
  /** Whether the next digit starts a fresh entry instead of appending to it. */
  readonly overwriteEntry: boolean;
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
  readonly pending: PendingOperation | null;
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: Operation }
  | { type: 'equals' }
  | { type: 'clear' }
  | { type: 'resolved'; result: number }
  | { type: 'rejected'; message: string };

type InputAction = Exclude<CalculatorAction, { type: 'clear' | 'resolved' | 'rejected' }>;

const HISTORY_LIMIT = 10;
/**
 * Digits accepted in a single operand. It is the display precision itself: a longer
 * entry would be shown rounded by {@link formatNumber} while the arithmetic used the
 * unrounded value, so `Entry.text` and `Entry.value` would stand for different
 * numbers. At twelve digits every typed operand is an exact double that survives the
 * round trip through the display (see DESIGN.md D6 and D7).
 */
const MAX_ENTRY_DIGITS = SIGNIFICANT_DIGITS;
const UNEXPECTED_FAILURE_MESSAGE = 'The calculation could not be completed';

export const initialState: CalculatorState = {
  entry: { text: '0', value: 0 },
  accumulator: null,
  operator: null,
  overwriteEntry: true,
  history: [],
  error: null,
  pending: null,
};

/**
 * calculatorReducer holds every state transition of the calculator. It is pure:
 * the API call it asks for is started by {@link useCalculator}, which feeds the
 * outcome back as a `resolved` or `rejected` action.
 */
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
      return state.pending === null ? state : fail(state, action.message);
    default:
      // Input is ignored while a request is in flight; `clear` always works, so
      // the calculator can never get stuck waiting.
      return state.pending === null ? applyInput(state, action) : state;
  }
}

function applyInput(state: CalculatorState, action: InputAction): CalculatorState {
  switch (action.type) {
    case 'digit':
      return appendDigit(state, action.digit);
    case 'decimal':
      return appendDecimal(state);
    case 'operator':
      return applyOperator(state, action.operator);
    case 'equals':
      return applyEquals(state);
  }
}

/** typedEntry builds the entry for typed text, whose value is exactly what it reads. */
function typedEntry(text: string): Entry {
  return { text, value: Number(text) };
}

/** resultEntry keeps the full-precision result behind its rounded display text. */
function resultEntry(value: number): Entry {
  return { text: formatNumber(value), value };
}

function appendDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.overwriteEntry || state.entry.text === '0') {
    return { ...state, entry: typedEntry(digit), overwriteEntry: false, error: null };
  }
  // The entry is capped so the text on screen and the value behind it always agree.
  if (digitsIn(state.entry.text) >= MAX_ENTRY_DIGITS) {
    return state;
  }
  const text = state.entry.text + digit;
  return { ...state, entry: typedEntry(text), overwriteEntry: false, error: null };
}

function digitsIn(text: string): number {
  return [...text].filter((character) => character !== '.').length;
}

function appendDecimal(state: CalculatorState): CalculatorState {
  if (state.overwriteEntry) {
    return { ...state, entry: typedEntry('0.'), overwriteEntry: false, error: null };
  }
  // A second decimal point in the same operand is ignored.
  if (state.entry.text.includes('.')) {
    return state;
  }
  return { ...state, entry: typedEntry(`${state.entry.text}.`), error: null };
}

function applyOperator(state: CalculatorState, operator: Operation): CalculatorState {
  // An operator pressed twice in a row replaces the pending one.
  if (state.operator !== null && state.overwriteEntry) {
    return { ...state, operator, error: null };
  }
  // A complete expression is resolved first, so the running total stays on screen.
  if (state.operator !== null && state.accumulator !== null) {
    return request(state, state.operator, state.accumulator, operator);
  }
  return {
    ...state,
    accumulator: state.entry.value,
    operator,
    overwriteEntry: true,
    error: null,
  };
}

function applyEquals(state: CalculatorState): CalculatorState {
  // Incomplete expression: no operator, or no right-hand operand typed yet.
  if (state.operator === null || state.accumulator === null || state.overwriteEntry) {
    return state;
  }
  return request(state, state.operator, state.accumulator, null);
}

function request(
  state: CalculatorState,
  operation: Operation,
  left: number,
  nextOperator: Operation | null,
): CalculatorState {
  const right = state.entry.value;
  const expression = `${formatNumber(left)} ${OPERATOR_SYMBOLS[operation]} ${formatNumber(right)}`;
  return {
    ...state,
    error: null,
    pending: { operation, operands: [left, right], expression, nextOperator },
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
  return {
    ...state,
    entry,
    accumulator: pending.nextOperator === null ? null : result,
    operator: pending.nextOperator,
    overwriteEntry: true,
    history: [...state.history, recorded].slice(-HISTORY_LIMIT),
    error: null,
    pending: null,
  };
}

/**
 * History ids only ever grow, so an entry keeps its identity when {@link HISTORY_LIMIT}
 * drops older ones and every index shifts. They restart with a fresh calculator.
 */
function nextHistoryId(history: readonly HistoryEntry[]): number {
  return (history.at(-1)?.id ?? 0) + 1;
}

function fail(state: CalculatorState, message: string): CalculatorState {
  // The failed expression stays on screen; the next digit replaces the offending operand.
  return { ...state, overwriteEntry: true, error: message, pending: null };
}

/** formatExpression renders the line the user is currently working on. */
export function formatExpression(state: CalculatorState): string {
  if (state.pending !== null) {
    return state.pending.expression;
  }
  if (state.operator === null || state.accumulator === null) {
    return state.entry.text;
  }
  const left = formatNumber(state.accumulator);
  const symbol = OPERATOR_SYMBOLS[state.operator];
  // The right-hand operand is shown while it is being typed, and kept on screen
  // when it made the calculation fail.
  const showsEntry = !state.overwriteEntry || state.error !== null;
  return showsEntry ? `${left} ${symbol} ${state.entry.text}` : `${left} ${symbol}`;
}

export interface Calculator {
  readonly state: CalculatorState;
  readonly expression: string;
  readonly dispatch: Dispatch<CalculatorAction>;
}

/**
 * useCalculator owns the calculator state and turns a pending operation into an
 * API call. Responses that arrive after the state moved on are discarded.
 */
export function useCalculator(): Calculator {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const { pending } = state;

  useEffect(() => {
    if (pending === null) {
      return;
    }
    let current = true;
    calculate({ operation: pending.operation, operands: pending.operands })
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
    };
  }, [pending]);

  return { state, expression: formatExpression(state), dispatch };
}

function failureMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : UNEXPECTED_FAILURE_MESSAGE;
}
