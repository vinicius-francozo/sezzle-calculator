import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { actionForKey, useKeyboard } from './useKeyboard';

/** Presses a key on the window, the way the browser delivers it to the hook. */
function press(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers });
  window.dispatchEvent(event);
  return event;
}

/** Presses a key while a keypad button has focus, so the event starts at the button. */
function pressOnButton(key: string): KeyboardEvent {
  const button = document.body.appendChild(document.createElement('button'));
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
  button.dispatchEvent(event);
  button.remove();
  return event;
}

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

describe('useKeyboard', () => {
  it('dispatches the action of a mapped key and suppresses its default', () => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    const event = press('7');

    expect(dispatch).toHaveBeenCalledWith({ type: 'digit', digit: '7' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('accepts a key that is typed with Shift', () => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    press('+', { shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: 'operator', operator: 'add' });
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Alt', { altKey: true }],
  ])('leaves %s shortcuts to the browser', (_, modifiers) => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    const event = press('-', modifiers);

    expect(dispatch).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Enter to the keypad button the user has focused', () => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    const event = pressOnButton('Enter');

    // Enter activates the focused button; swallowing it would leave that button dead.
    expect(dispatch).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('still accepts another key while a keypad button has focus', () => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    const event = pressOnButton('7');

    expect(dispatch).toHaveBeenCalledWith({ type: 'digit', digit: '7' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores a key that has no button', () => {
    const dispatch = vi.fn();
    renderHook(() => useKeyboard(dispatch));

    const event = press('Backspace');

    expect(dispatch).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
