import { useEffect, useRef, type Dispatch } from 'react';
import type { CalculatorAction } from '../hooks/useCalculator';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import { CalcButton, type ButtonVariant } from './CalcButton';

interface KeyDefinition {
  readonly label: string;
  readonly name?: string;
  readonly variant: ButtonVariant;
  readonly span?: 'columns' | 'rows';
  readonly action: CalculatorAction;
}

function digit(value: string): KeyDefinition {
  return { label: value, variant: 'digit', action: { type: 'digit', digit: value } };
}

/** The keypad, in visual order: four columns, operators on the right. */
const KEYS: readonly KeyDefinition[] = [
  { label: 'C', name: 'clear', variant: 'action', action: { type: 'clear' } },
  {
    label: OPERATOR_SYMBOLS.divide,
    name: 'divide',
    variant: 'operator',
    action: { type: 'operator', operator: 'divide' },
  },
  {
    label: OPERATOR_SYMBOLS.multiply,
    name: 'multiply',
    variant: 'operator',
    action: { type: 'operator', operator: 'multiply' },
  },
  {
    label: OPERATOR_SYMBOLS.subtract,
    name: 'subtract',
    variant: 'operator',
    action: { type: 'operator', operator: 'subtract' },
  },
  digit('7'),
  digit('8'),
  digit('9'),
  {
    label: OPERATOR_SYMBOLS.add,
    name: 'add',
    variant: 'operator',
    action: { type: 'operator', operator: 'add' },
  },
  digit('4'),
  digit('5'),
  digit('6'),
  { label: '=', name: 'equals', variant: 'action', span: 'rows', action: { type: 'equals' } },
  digit('1'),
  digit('2'),
  digit('3'),
  { label: '0', variant: 'digit', span: 'columns', action: { type: 'digit', digit: '0' } },
  { label: '.', name: 'decimal point', variant: 'digit', action: { type: 'decimal' } },
];

export interface KeypadProps {
  readonly dispatch: Dispatch<CalculatorAction>;
  /** While a request is in flight only `C` stays live, so the UI cannot get stuck. */
  readonly busy: boolean;
}

export function Keypad({ dispatch, busy }: KeypadProps): React.JSX.Element {
  const keypadRef = useRef<HTMLDivElement>(null);

  // A request disables the button that was just pressed, and a disabled element cannot
  // keep focus: the browser drops it to <body>, stranding a keyboard user at the top of
  // the document. The keypad takes that focus instead, so Tab resumes here and the
  // `aria-busy` state is the one a screen reader announces. It is not a button, so Enter
  // still means equals while the request is in flight.
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
          key={key.name ?? key.label}
          label={key.label}
          name={key.name}
          variant={key.variant}
          span={key.span}
          disabled={busy && key.action.type !== 'clear'}
          onPress={() => dispatch(key.action)}
        />
      ))}
    </div>
  );
}

/** Whether focus sits on a button the keypad just disabled, or was already dropped by one. */
function holdsStrandedFocus(keypad: HTMLDivElement): boolean {
  const active = document.activeElement;
  return active === document.body || keypad.contains(active);
}
