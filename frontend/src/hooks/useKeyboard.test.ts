import { describe, expect, it } from 'vitest';
import { actionForKey } from './useKeyboard';

describe('actionForKey', () => {
  it.each(['0', '5', '9'])('maps the digit %s to a digit action', (key) => {
    expect(actionForKey(key)).toEqual({ type: 'digit', digit: key });
  });

  it.each([
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['.', { type: 'decimal' }],
    ['=', { type: 'equals' }],
    ['Enter', { type: 'equals' }],
    ['Escape', { type: 'clear' }],
  ])('maps %s to the action its button dispatches', (key, action) => {
    expect(actionForKey(key)).toEqual(action);
  });

  it.each(['a', 'Backspace', 'ArrowLeft', ' ', '('])('ignores the unmapped key %p', (key) => {
    expect(actionForKey(key)).toBeNull();
  });
});
