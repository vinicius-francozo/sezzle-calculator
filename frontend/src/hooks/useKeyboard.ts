import { useEffect, type Dispatch } from 'react';
import type { CalculatorAction } from './useCalculator';

const KEY_ACTIONS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  ',': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'operator', operator: 'percent' },
  '@': { type: 'unary', operation: 'sqrt' },
  Backspace: { type: 'undo' },
  '=': { type: 'equals' },
  Enter: { type: 'equals' },
  Escape: { type: 'clear' },
};

export function actionForKey(key: string): CalculatorAction | null {
  if (key.length === 1 && key >= '0' && key <= '9') {
    return { type: 'digit', digit: key };
  }
  return KEY_ACTIONS[key] ?? null;
}

export function useKeyboard(dispatch: Dispatch<CalculatorAction>): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
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
