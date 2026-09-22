import { useEffect, type Dispatch } from 'react';
import type { CalculatorAction } from './useCalculator';

/**
 * Keys that map onto a keypad button. There is deliberately no key without a
 * button, so keyboard and keypad stay in sync (see DESIGN.md D11).
 */
const KEY_ACTIONS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
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
