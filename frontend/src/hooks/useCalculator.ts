import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from '../lib/api';
import { formatNumber } from '../lib/format';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import type { Operation } from '../types/api';

/** A calculation that succeeded, kept for the history list (see DESIGN.md D12). */
export interface HistoryEntry {
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

export interface CalculatorState {
  /** The operand currently being typed, exactly as typed. */
  readonly entry: string;
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
const UNEXPECTED_FAILURE_MESSAGE = 'The calculation could not be completed';

export const initialState: CalculatorState = {
  entry: '0',
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

function appendDigit(state: CalculatorState, digit: string): CalculatorState {
  const entry = state.overwriteEntry || state.entry === '0' ? digit : state.entry + digit;
  return { ...state, entry, overwriteEntry: false, error: null };
}

function appendDecimal(state: CalculatorState): CalculatorState {
  if (state.overwriteEntry) {
    return { ...state, entry: '0.', overwriteEntry: false, error: null };
  }
  // A second decimal point in the same operand is ignored.
  if (state.entry.includes('.')) {
    return state;
  }
  return { ...state, entry: `${state.entry}.`, error: null };
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
    accumulator: Number(state.entry),
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
  const right = Number(state.entry);
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
  const shown = formatNumber(result);
  const entry: HistoryEntry = { expression: pending.expression, result: shown };
  return {
    ...state,
    entry: shown,
    accumulator: pending.nextOperator === null ? null : Number(shown),
    operator: pending.nextOperator,
    overwriteEntry: true,
    history: [...state.history, entry].slice(-HISTORY_LIMIT),
    error: null,
    pending: null,
  };
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
    return state.entry;
  }
  const left = formatNumber(state.accumulator);
  const symbol = OPERATOR_SYMBOLS[state.operator];
  // The right-hand operand is shown while it is being typed, and kept on screen
  // when it made the calculation fail.
  const showsEntry = !state.overwriteEntry || state.error !== null;
  return showsEntry ? `${left} ${symbol} ${state.entry}` : `${left} ${symbol}`;
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
