import { useEffect, useRef, type Dispatch } from 'react';
import type { CalculatorAction } from '../hooks/useCalculator';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import type { BinaryOperation } from '../types/api';
import { CalcButton, type ButtonVariant } from './CalcButton';

interface KeyDefinition {
  readonly label: React.ReactNode;
  readonly name: string;
  readonly variant: ButtonVariant;
  readonly full?: boolean;
  readonly action: CalculatorAction;
}

function digit(value: string): KeyDefinition {
  return { label: value, name: value, variant: 'digit', action: { type: 'digit', digit: value } };
}

function operator(name: BinaryOperation, label = OPERATOR_SYMBOLS[name]): KeyDefinition {
  return { label, name, variant: 'operator', action: { type: 'operator', operator: name } };
}

const UNDO_ICON = (
  <svg className="key__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
  </svg>
);

const KEYS: readonly KeyDefinition[] = [
  { label: UNDO_ICON, name: 'undo', variant: 'action', action: { type: 'undo' } },
  { label: 'C', name: 'clear', variant: 'action', action: { type: 'clear' } },
  {
    label: OPERATOR_SYMBOLS.sqrt,
    name: 'square root',
    variant: 'operator',
    action: { type: 'unary', operation: 'sqrt' },
  },
  operator('power', 'xʸ'),
  digit('7'),
  digit('8'),
  digit('9'),
  operator('divide'),
  digit('4'),
  digit('5'),
  digit('6'),
  operator('multiply'),
  digit('1'),
  digit('2'),
  digit('3'),
  operator('subtract'),
  digit('0'),
  { label: '.', name: 'decimal point', variant: 'digit', action: { type: 'decimal' } },
  operator('percent'),
  operator('add'),
  { label: '=', name: 'equals', variant: 'action', full: true, action: { type: 'equals' } },
];

export interface KeypadProps {
  readonly dispatch: Dispatch<CalculatorAction>;
  readonly busy: boolean;
}

export function Keypad({ dispatch, busy }: KeypadProps): React.JSX.Element {
  const keypadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keypad = keypadRef.current;
    if (busy && keypad !== null && holdsStrandedFocus(keypad)) {
      keypad.focus();
    }
  }, [busy]);

  return (
    <div
      className="keypad"
      role="group"
      aria-label="Keypad"
      aria-busy={busy}
      tabIndex={-1}
      ref={keypadRef}
    >
      {KEYS.map((key) => (
        <CalcButton
          key={key.name}
          label={key.label}
          name={key.name}
          variant={key.variant}
          full={key.full}
          disabled={busy && key.action.type !== 'clear'}
          onPress={() => dispatch(key.action)}
        />
      ))}
    </div>
  );
}

function holdsStrandedFocus(keypad: HTMLDivElement): boolean {
  const active = document.activeElement;
  return active === document.body || keypad.contains(active);
}
