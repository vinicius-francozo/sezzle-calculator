import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from '../lib/api';
import { SIGNIFICANT_DIGITS, formatNumber } from '../lib/format';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import type { BinaryOperation, Operation, UnaryOperation } from '../types/api';

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
  /** One operand or two, as the operation's arity demands (see docs/api.md). */
  readonly operands: readonly [number] | readonly [number, number];
  readonly expression: string;
  /** Operator to chain onto the result, when an operator key triggered the request. */
  readonly nextOperator: BinaryOperation | null;
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
  readonly operator: BinaryOperation | null;
  /** Whether the next digit starts a fresh entry instead of appending to it. */
  readonly overwriteEntry: boolean;
  /**
   * Whether the entry is an operand an operator or `=` may act on. It is the opposite
   * of {@link CalculatorState.overwriteEntry} everywhere but after a unary operation,
   * which settles a complete operand that the next digit still replaces (DESIGN.md D24).
   */
  readonly entryIsOperand: boolean;
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
  readonly pending: PendingOperation | null;
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: BinaryOperation }
  | { type: 'unary'; operation: UnaryOperation }
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
/**
 * How long a request may take before the client gives up. A service that accepts the
 * connection and never answers would otherwise keep the keypad disabled forever
 * (see CLAUDE.md 4.1: the UI never gets stuck in a loading state).
 */
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
    case 'unary':
      return applyUnary(state, action.operation);
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

/**
 * withTypedEntry puts text the user is typing on screen: further digits append to it,
 * it counts as an operand, and it clears whatever error the previous attempt left.
 */
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
  // The entry is capped so the text on screen and the value behind it always agree.
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
  // A second decimal point in the same operand is ignored.
  if (state.entry.text.includes('.')) {
    return state;
  }
  return withTypedEntry(state, `${state.entry.text}.`);
}

function applyOperator(state: CalculatorState, operator: BinaryOperation): CalculatorState {
  // An operator pressed twice in a row replaces the pending one.
  if (state.operator !== null && !state.entryIsOperand) {
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
    entryIsOperand: false,
    error: null,
  };
}

function applyEquals(state: CalculatorState): CalculatorState {
  // Incomplete expression: no operator, or no right-hand operand yet.
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

/**
 * applyUnary sends the number on screen away on its own. It is the only key that
 * asks for a result without `=`, because a unary operation has no second operand
 * to wait for (see DESIGN.md D24).
 */
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
  // A unary operation replaces the entry and nothing else: a binary operation that was
  // already waiting keeps waiting, with this result as its right-hand operand.
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

/** Whether the pending operation is unary — arity is a property of the operation (docs/api.md). */
function isUnary(pending: PendingOperation): boolean {
  return pending.operands.length === 1;
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
  return { ...state, overwriteEntry: true, entryIsOperand: false, error: message, pending: null };
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
  // The right-hand operand is shown once it exists — typed, or settled by a unary
  // operation — and is kept on screen when it made the calculation fail.
  const showsEntry = state.entryIsOperand || state.error !== null;
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
      // The answer is no longer wanted, so the request is dropped rather than left running.
      controller.abort();
    };
  }, [pending]);

  return { state, expression: formatExpression(state), dispatch };
}

function failureMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : UNEXPECTED_FAILURE_MESSAGE;
}
