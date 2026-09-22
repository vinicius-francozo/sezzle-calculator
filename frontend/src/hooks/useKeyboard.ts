import { useEffect, type Dispatch } from 'react';
import type { CalculatorAction } from './useCalculator';

/**
 * Keys that map onto a keypad button. There is deliberately no key without a
 * button, so keyboard and keypad stay in sync (see DESIGN.md D11).
 */
const KEY_ACTIONS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  // The numpad separator of the ABNT2, German and French layouts, where `.` is
  // unreachable without leaving the numpad (see CLAUDE.md 2.2).
  ',': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'operator', operator: 'percent' },
  // No keyboard has a square root key. `@` is what the Windows calculator uses for
  // it, which is the closest thing to a convention there is.
  '@': { type: 'unary', operation: 'sqrt' },
  '=': { type: 'equals' },
  Enter: { type: 'equals' },
  Escape: { type: 'clear' },
};

/** actionForKey translates a `KeyboardEvent.key` into the action a button would dispatch. */
export function actionForKey(key: string): CalculatorAction | null {
  if (key.length === 1 && key >= '0' && key <= '9') {
    return { type: 'digit', digit: key };
  }
  return KEY_ACTIONS[key] ?? null;
}

/** useKeyboard dispatches the very same actions as the keypad buttons. */
export function useKeyboard(dispatch: Dispatch<CalculatorAction>): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl, Meta and Alt belong to browser and OS shortcuts (zoom, tab switching),
      // which the calculator must never swallow. Shift is part of typing `+` or `*`.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      // Enter is also how a keyboard user activates the keypad button they tabbed to.
      // Handling it here would dispatch `equals` and cancel that activation, leaving a
      // visibly focused button that does nothing. Only Tab can leave a button focused:
      // `CalcButton` keeps a click from focusing one, so this never swallows the Enter
      // of a user who reached for the keypad with the mouse.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) {
        return;
      }
      const action = actionForKey(event.key);
      if (action === null) {
        return;
      }
      event.preventDefault();
      dispatch(action);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
}
