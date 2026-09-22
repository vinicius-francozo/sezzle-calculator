import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from '../lib/api';
import type { CalculateResult } from '../types/api';
import {
  calculatorReducer,
  formatExpression,
  initialState,
  useCalculator,
  type CalculatorAction,
  type CalculatorState,
} from './useCalculator';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  calculate: vi.fn(),
}));

const calculateMock = vi.mocked(calculate);

/** Replays a sequence of actions through the reducer, like a user pressing keys. */
function run(actions: readonly CalculatorAction[], from: CalculatorState = initialState) {
  return actions.reduce(calculatorReducer, from);
}

/** Turns "12.5" into the digit and decimal actions that type it. */
function type(text: string): CalculatorAction[] {
  return [...text].map((character) =>
    character === '.' ? { type: 'decimal' } : { type: 'digit', digit: character },
  );
}

/** A promise the test settles by hand, to observe the in-flight state. */
function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const add: CalculatorAction = { type: 'operator', operator: 'add' };
const multiply: CalculatorAction = { type: 'operator', operator: 'multiply' };
const divide: CalculatorAction = { type: 'operator', operator: 'divide' };
const equals: CalculatorAction = { type: 'equals' };
const clear: CalculatorAction = { type: 'clear' };

describe('calculatorReducer', () => {
  it('starts on zero', () => {
    expect(initialState.entry.text).toBe('0');
    expect(formatExpression(initialState)).toBe('0');
  });

  it('builds the entry from digits, replacing the leading zero', () => {
    expect(run(type('120')).entry.text).toBe('120');
  });

  it('starts a decimal entry with a leading zero', () => {
    expect(run([{ type: 'decimal' }, ...type('5')]).entry.text).toBe('0.5');
  });

  it('ignores a second decimal point', () => {
    expect(run(type('1.2.3')).entry.text).toBe('1.23');
  });

  it('stores the accumulator when an operator is pressed', () => {
    const state = run([...type('12'), add]);

    expect(state).toMatchObject({ accumulator: 12, operator: 'add', overwriteEntry: true });
    expect(formatExpression(state)).toBe('12 +');
  });

  it('replaces the operator when another one is pressed straight after', () => {
    const state = run([...type('12'), add, multiply]);

    expect(state.operator).toBe('multiply');
    expect(state.pending).toBeNull();
    expect(formatExpression(state)).toBe('12 ×');
  });

  it('resolves the pending operation when a second operator completes an expression', () => {
    const state = run([...type('2'), add, ...type('3'), multiply]);

    expect(state.pending).toEqual({
      operation: 'add',
      operands: [2, 3],
      expression: '2 + 3',
      nextOperator: 'multiply',
    });
  });

  it('requests the operation on equals', () => {
    const state = run([...type('12'), divide, ...type('4'), equals]);

    expect(state.pending).toEqual({
      operation: 'divide',
      operands: [12, 4],
      expression: '12 ÷ 4',
      nextOperator: null,
    });
  });

  it.each([
    ['no operator', [...type('12'), equals]],
    ['no right-hand operand', [...type('12'), add, equals]],
    ['nothing typed at all', [equals]],
  ])('does nothing on equals with %s', (_, actions) => {
    expect(run(actions).pending).toBeNull();
  });

  it('shows the result and records it in the history', () => {
    const state = run([...type('12'), divide, ...type('4'), equals, { type: 'resolved', result: 3 }]);

    expect(state).toMatchObject({
      entry: { text: '3', value: 3 },
      accumulator: null,
      operator: null,
      overwriteEntry: true,
      pending: null,
    });
    expect(state.history).toEqual([{ expression: '12 ÷ 4', result: '3' }]);
    expect(formatExpression(state)).toBe('3');
  });

  it('keeps the running total on screen when chaining operators', () => {
    const state = run([
      ...type('2'),
      add,
      ...type('3'),
      add,
      { type: 'resolved', result: 5 },
      ...type('4'),
    ]);

    expect(state).toMatchObject({ accumulator: 5, operator: 'add', entry: { text: '4', value: 4 } });
    expect(formatExpression(state)).toBe('5 + 4');
  });

  it('starts a fresh entry when a digit follows equals', () => {
    const state = run([...type('2'), add, ...type('3'), equals, { type: 'resolved', result: 5 }, ...type('7')]);

    expect(state).toMatchObject({ entry: { text: '7', value: 7 }, accumulator: null, operator: null });
  });

  it('chains from the result when an operator follows equals', () => {
    const state = run([
      ...type('12'),
      add,
      ...type('3'),
      equals,
      { type: 'resolved', result: 15 },
      multiply,
      ...type('2'),
      equals,
    ]);

    expect(state.pending).toMatchObject({ operation: 'multiply', operands: [15, 2] });
  });

  it('chains from the full-precision result, not from the rounded display text', () => {
    const state = run([
      ...type('1'),
      divide,
      ...type('3'),
      equals,
      { type: 'resolved', result: 1 / 3 },
      multiply,
      ...type('3'),
      equals,
    ]);

    expect(state.pending).toMatchObject({ operation: 'multiply', operands: [1 / 3, 3] });
  });

  it('hides floating point noise in the displayed result', () => {
    const state = run([
      { type: 'decimal' },
      ...type('1'),
      add,
      { type: 'decimal' },
      ...type('2'),
      equals,
      { type: 'resolved', result: 0.30000000000000004 },
    ]);

    expect(state.entry.text).toBe('0.3');
    expect(state.history).toEqual([{ expression: '0.1 + 0.2', result: '0.3' }]);
  });

  it('keeps only the last ten calculations', () => {
    let state = initialState;
    for (let value = 1; value <= 12; value += 1) {
      state = run([...type('1'), add, ...type('1'), equals, { type: 'resolved', result: value }], state);
    }

    expect(state.history).toHaveLength(10);
    expect(state.history.at(0)?.result).toBe('3');
    expect(state.history.at(-1)?.result).toBe('12');
  });

  it('shows a failure inline and keeps the offending expression on screen', () => {
    const state = run([
      ...type('12'),
      divide,
      ...type('0'),
      equals,
      { type: 'rejected', message: 'Division by zero is undefined' },
    ]);

    expect(state.error).toBe('Division by zero is undefined');
    expect(state.pending).toBeNull();
    expect(state.history).toHaveLength(0);
    expect(formatExpression(state)).toBe('12 ÷ 0');
  });

  it('clears the error and replaces the operand on the next digit', () => {
    const state = run([
      ...type('12'),
      divide,
      ...type('0'),
      equals,
      { type: 'rejected', message: 'Division by zero is undefined' },
      ...type('4'),
    ]);

    expect(state.error).toBeNull();
    expect(formatExpression(state)).toBe('12 ÷ 4');
  });

  it('clears everything, history and error included', () => {
    const state = run([
      ...type('2'),
      add,
      ...type('3'),
      equals,
      { type: 'resolved', result: 5 },
      divide,
      ...type('0'),
      equals,
      { type: 'rejected', message: 'Division by zero is undefined' },
      clear,
    ]);

    expect(state).toEqual(initialState);
  });

  it('ignores input while a request is in flight, except clear', () => {
    const inFlight = run([...type('2'), add, ...type('3'), equals]);

    expect(run([...type('9'), multiply, equals], inFlight)).toEqual(inFlight);
    expect(run([clear], inFlight)).toEqual(initialState);
  });

  it('discards a response that arrives after the calculator was cleared', () => {
    const cleared = run([...type('2'), add, ...type('3'), equals, clear]);

    expect(run([{ type: 'resolved', result: 5 }], cleared)).toEqual(initialState);
    expect(run([{ type: 'rejected', message: 'too late' }], cleared)).toEqual(initialState);
  });
});

describe('useCalculator', () => {
  beforeEach(() => {
    calculateMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the pending operation to the API and shows the result', async () => {
    calculateMock.mockResolvedValue({ result: 5 });
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('3'), equals].forEach(result.current.dispatch);
    });

    await waitFor(() => expect(result.current.expression).toBe('5'));
    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', operands: [2, 3] });
    expect(result.current.state.pending).toBeNull();
  });

  it('renders the message of a failed request and stops waiting', async () => {
    calculateMock.mockRejectedValue(new ApiError('DIVISION_BY_ZERO', 'Division by zero is undefined'));
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('12'), divide, ...type('0'), equals].forEach(result.current.dispatch);
    });

    await waitFor(() => expect(result.current.state.error).toBe('Division by zero is undefined'));
    expect(result.current.state.pending).toBeNull();
    expect(result.current.expression).toBe('12 ÷ 0');
  });

  it('discards a response that arrives after the calculator was cleared', async () => {
    const response = deferred<CalculateResult>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('3'), equals].forEach(result.current.dispatch);
    });
    expect(result.current.state.pending).not.toBeNull();

    act(() => {
      result.current.dispatch(clear);
    });
    await act(async () => {
      response.settle({ result: 5 });
    });

    expect(result.current.state).toEqual(initialState);
  });

  it('posts the full-precision result as the operand of the chained operation', async () => {
    calculateMock.mockResolvedValueOnce({ result: 1 / 3 }).mockResolvedValueOnce({ result: 1 });
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('1'), divide, ...type('3'), equals].forEach(result.current.dispatch);
    });
    await waitFor(() => expect(result.current.expression).toBe('0.333333333333'));

    act(() => {
      [multiply, ...type('3'), equals].forEach(result.current.dispatch);
    });
    await waitFor(() => expect(result.current.expression).toBe('1'));

    expect(calculateMock).toHaveBeenNthCalledWith(2, {
      operation: 'multiply',
      operands: [1 / 3, 3],
    });
  });

  it('falls back to a readable message when the failure is not an ApiError', async () => {
    calculateMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('3'), equals].forEach(result.current.dispatch);
    });

    await waitFor(() =>
      expect(result.current.state.error).toBe('The calculation could not be completed'),
    );
  });
});
