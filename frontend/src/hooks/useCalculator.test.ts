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
  let fail: (cause: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

const add: CalculatorAction = { type: 'operator', operator: 'add' };
const subtract: CalculatorAction = { type: 'operator', operator: 'subtract' };
const multiply: CalculatorAction = { type: 'operator', operator: 'multiply' };
const divide: CalculatorAction = { type: 'operator', operator: 'divide' };
const power: CalculatorAction = { type: 'operator', operator: 'power' };
const percent: CalculatorAction = { type: 'operator', operator: 'percent' };
const sqrt: CalculatorAction = { type: 'unary', operation: 'sqrt' };
const undo: CalculatorAction = { type: 'undo' };
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

  it('removes the last character the user typed', () => {
    expect(run([...type('123'), undo]).entry).toEqual({ text: '12', value: 12 });
  });

  it('deletes the decimal point like any other character', () => {
    const typed = run(type('1.5'));

    expect(run([undo], typed).entry.text).toBe('1.');
    expect(run([undo, undo], typed).entry.text).toBe('1');
    expect(run([undo, undo, undo], typed).entry.text).toBe('0');
  });

  it('leaves a typed zero once the last character goes, so the next digit replaces it', () => {
    const undone = run([...type('1'), undo]);

    expect(undone.entry).toEqual({ text: '0', value: 0 });
    // The zero is still the user's own text, not a result: `7` reads `7`, never `07`.
    expect(run(type('7'), undone).entry.text).toBe('7');
  });

  it('does not edit a result, so the next operand keeps its full precision', () => {
    const divided = run([...type('1'), divide, ...type('3'), equals, { type: 'resolved', result: 1 / 3 }]);

    // The display reads 0.333333333333 for a number that is not that; undoing into
    // that text would make the rounded string the next operand (DESIGN.md D29).
    expect(run([undo], divided).entry.text).toBe('0.333333333333');

    const state = run([undo, multiply, ...type('3'), equals], divided);

    expect(state.pending).toMatchObject({ operation: 'multiply', operands: [1 / 3, 3] });
  });

  it.each<[string, CalculatorAction[]]>([
    ['a fresh calculator', []],
    ['the result of an operation', [...type('9'), add, ...type('7'), equals, { type: 'resolved', result: 16 }]],
    ['the result of a square root', [...type('9'), sqrt, { type: 'resolved', result: 3 }]],
    // Neither of these is a result, but both are entries the next digit replaces, and
    // an entry the next digit replaces is not one the user is still typing.
    ['an operand the operator turned into the accumulator', [...type('12'), add]],
    [
      'the operand a failed calculation left on screen',
      [...type('12'), divide, ...type('0'), equals, { type: 'rejected', message: 'nope' }],
    ],
  ])('does nothing to %s', (_, actions) => {
    const state = run(actions);

    expect(run([undo], state)).toEqual(state);
  });

  it('edits the entry and nothing else', () => {
    const typed = run([
      ...type('2'),
      add,
      ...type('3'),
      equals,
      { type: 'resolved', result: 5 },
      multiply,
      ...type('47'),
    ]);

    const state = run([undo], typed);

    expect(state).toMatchObject({ accumulator: 5, operator: 'multiply', entry: { text: '4', value: 4 } });
    expect(state.history).toEqual(typed.history);
    expect(formatExpression(state)).toBe('5 × 4');
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

  it.each<[string, CalculatorAction[]]>([
    ['no operator', [...type('12'), equals]],
    ['no right-hand operand', [...type('12'), add, equals]],
    ['nothing typed at all', [equals]],
    ['a square root that stands alone', [...type('9'), sqrt, { type: 'resolved', result: 3 }]],
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
    expect(state.history).toEqual([{ id: 1, expression: '12 ÷ 4', result: '3' }]);
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

  it('chains from the full-precision result when an operator resolved the expression', () => {
    // The other half of the same bug: here the result is settled by an operator press,
    // so the accumulator comes from `settle`, not from `applyOperator`.
    const state = run([
      ...type('1'),
      divide,
      ...type('3'),
      multiply,
      { type: 'resolved', result: 1 / 3 },
      ...type('3'),
      equals,
    ]);

    expect(state.pending?.operands[0]).toBe(1 / 3);
    expect(state.pending).toMatchObject({ operation: 'multiply', operands: [1 / 3, 3] });
  });

  it('caps the entry at a length whose text and value denote the same number', () => {
    const state = run(type('1'.repeat(20)));

    expect(state.entry.text).toBe('1'.repeat(12));
    // A longer entry parses to a different number than it reads as: seventeen ones
    // would be typed as 11111111111111111 and stand for 11111111111111112.
    expect(String(state.entry.value)).toBe(state.entry.text);
  });

  it('shows a capped operand unchanged once it becomes the accumulator', () => {
    const state = run([...type('9'.repeat(20)), add, ...type('1'), equals]);

    // The rounding the display applies must not rewrite the operand that was sent.
    expect(state.pending).toMatchObject({ operands: [999999999999, 1] });
    expect(formatExpression(state)).toBe('999999999999 + 1');
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
    expect(state.history).toEqual([{ id: 1, expression: '0.1 + 0.2', result: '0.3' }]);
  });

  it('keeps only the last ten calculations', () => {
    let state = initialState;
    for (let value = 1; value <= 12; value += 1) {
      state = run([...type('1'), add, ...type('1'), equals, { type: 'resolved', result: value }], state);
    }

    expect(state.history).toHaveLength(10);
    expect(state.history.at(0)?.result).toBe('3');
    expect(state.history.at(-1)?.result).toBe('12');
    // Ids keep growing, so the entries that survived keep the identity they had.
    expect(state.history.map((entry) => entry.id)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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

  it('leaves equals inert after a failed binary operation, rather than re-sending it', () => {
    const failed = run([
      ...type('12'),
      divide,
      ...type('0'),
      equals,
      { type: 'rejected', message: 'Division by zero is undefined' },
    ]);

    // The operand that failed is no longer submittable, so `=` asks for nothing.
    expect(run([equals], failed)).toEqual(failed);
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

  it('requests a power like any other binary operation', () => {
    const state = run([...type('2'), power, ...type('10'), equals]);

    expect(state.pending).toEqual({
      operation: 'power',
      operands: [2, 10],
      expression: '2 ^ 10',
      nextOperator: null,
    });
  });

  it('requests a percentage as "a% of b"', () => {
    const state = run([...type('15'), percent, ...type('200'), equals]);

    expect(state.pending).toEqual({
      operation: 'percent',
      operands: [15, 200],
      expression: '15 % 200',
      nextOperator: null,
    });
  });

  it('sends the square root of the entry at once, with a single operand and no equals', () => {
    const state = run([...type('9'), sqrt]);

    expect(state.pending).toEqual({
      operation: 'sqrt',
      operands: [9],
      expression: '√9',
      nextOperator: null,
    });
  });

  it('replaces the entry with the root and records it in the history', () => {
    const state = run([...type('9'), sqrt, { type: 'resolved', result: 3 }]);

    expect(state).toMatchObject({
      entry: { text: '3', value: 3 },
      accumulator: null,
      operator: null,
      overwriteEntry: true,
      pending: null,
    });
    expect(state.history).toEqual([{ id: 1, expression: '√9', result: '3' }]);
    expect(formatExpression(state)).toBe('3');
  });

  it('starts a fresh entry when a digit follows a square root', () => {
    const state = run([...type('9'), sqrt, { type: 'resolved', result: 3 }, ...type('7')]);

    expect(state.entry).toEqual({ text: '7', value: 7 });
  });

  it('chains square roots, so 81 √ √ is 3', () => {
    const rooted = run([...type('81'), sqrt, { type: 'resolved', result: 9 }, sqrt]);

    expect(rooted.pending).toMatchObject({ operation: 'sqrt', operands: [9] });
    expect(run([{ type: 'resolved', result: 3 }], rooted).entry.text).toBe('3');
  });

  it('leaves a pending operation waiting and replaces its right-hand operand', () => {
    const rooted = run([...type('2'), add, ...type('9'), sqrt, { type: 'resolved', result: 3 }]);

    expect(rooted).toMatchObject({ accumulator: 2, operator: 'add', pending: null });
    expect(formatExpression(rooted)).toBe('2 + 3');
    // The waiting operation now reads 2 + 3, so equals gives 5 rather than 11.
    expect(run([equals], rooted).pending).toMatchObject({ operation: 'add', operands: [2, 3] });
  });

  it('resolves the waiting operation when an operator follows a square root', () => {
    const rooted = run([...type('2'), add, ...type('9'), sqrt, { type: 'resolved', result: 3 }]);

    expect(run([multiply], rooted).pending).toMatchObject({
      operation: 'add',
      operands: [2, 3],
      nextOperator: 'multiply',
    });
  });

  it('roots the number on screen when no right-hand operand was typed', () => {
    const state = run([...type('2'), add, sqrt]);

    expect(state.pending).toMatchObject({ operation: 'sqrt', operands: [2], expression: '√2' });
  });

  it('shows a failed square root inline and leaves the history untouched', () => {
    const negative = run([...type('0'), subtract, ...type('9'), equals, { type: 'resolved', result: -9 }]);
    const message = 'Square root of a negative number is undefined';

    const state = run([sqrt, { type: 'rejected', message }], negative);

    expect(state.error).toBe(message);
    expect(state.pending).toBeNull();
    expect(state.history).toEqual(negative.history);
    expect(formatExpression(state)).toBe('-9');
  });

  it('shows the waiting operation in front of a root in flight, and records only the root', () => {
    const rooted = run([...type('2'), add, ...type('9'), sqrt]);

    expect(formatExpression(rooted)).toBe('2 + √9');

    const settled = run([{ type: 'resolved', result: 3 }], rooted);

    // The history records the calculation that ran, which is the root alone.
    expect(settled.history).toEqual([{ id: 1, expression: '√9', result: '3' }]);
    expect(formatExpression(settled)).toBe('2 + 3');
  });

  it('resolves the expression on equals after a failed square root', () => {
    // A transient failure is enough: `NETWORK_ERROR` and `TIMEOUT` are minted client-side.
    const failed = run([
      ...type('2'),
      add,
      ...type('9'),
      sqrt,
      { type: 'rejected', message: 'The calculation could not be completed' },
    ]);

    // The root failed; the addition underneath was never attempted and still has its
    // right-hand operand, so `=` computes with the operand the user typed, un-rooted.
    expect(formatExpression(failed)).toBe('2 + 9');
    expect(run([equals], failed).pending).toEqual({
      operation: 'add',
      operands: [2, 9],
      expression: '2 + 9',
      nextOperator: null,
    });
  });

  it('ignores input while a request is in flight, except clear', () => {
    const inFlight = run([...type('2'), add, ...type('3'), equals]);

    expect(run([...type('9'), multiply, undo, equals], inFlight)).toEqual(inFlight);
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
    vi.useRealTimers();
  });

  it('sends the pending operation to the API and shows the result', async () => {
    calculateMock.mockResolvedValue({ result: 5 });
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('3'), equals].forEach(result.current.dispatch);
    });

    await waitFor(() => expect(result.current.expression).toBe('5'));
    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'add', operands: [2, 3] },
      expect.any(AbortSignal),
    );
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

    expect(calculateMock).toHaveBeenNthCalledWith(
      2,
      { operation: 'multiply', operands: [1 / 3, 3] },
      expect.any(AbortSignal),
    );
  });

  it('posts one operand for the square root and keeps the operation it interrupted', async () => {
    calculateMock.mockResolvedValue({ result: 3 });
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('9'), sqrt].forEach(result.current.dispatch);
    });

    await waitFor(() => expect(result.current.expression).toBe('2 + 3'));
    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'sqrt', operands: [9] },
      expect.any(AbortSignal),
    );
  });

  it('discards a failure that arrives after the calculator was cleared', async () => {
    const response = deferred<CalculateResult>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('12'), divide, ...type('0'), equals].forEach(result.current.dispatch);
    });
    act(() => {
      result.current.dispatch(clear);
    });
    await act(async () => {
      response.fail(new ApiError('DIVISION_BY_ZERO', 'Division by zero is undefined'));
    });

    expect(result.current.state).toEqual(initialState);
  });

  it('gives up on a request that never answers, so the keypad comes back', async () => {
    vi.useFakeTimers();
    calculateMock.mockImplementation(
      async (_request, signal) =>
        new Promise<CalculateResult>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new ApiError('TIMEOUT', 'The calculator service took too long to respond'));
          });
        }),
    );
    const { result } = renderHook(() => useCalculator());

    act(() => {
      [...type('2'), add, ...type('3'), equals].forEach(result.current.dispatch);
    });
    expect(result.current.state.pending).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.state.error).toBe('The calculator service took too long to respond');
    expect(result.current.state.pending).toBeNull();
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
