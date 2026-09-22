import { useEffect, useRef, type Dispatch } from 'react';
import type { CalculatorAction } from '../hooks/useCalculator';
import { OPERATOR_SYMBOLS } from '../lib/operations';
import type { BinaryOperation } from '../types/api';
import { CalcButton, type ButtonVariant } from './CalcButton';

interface KeyDefinition {
  readonly label: string;
  readonly name?: string;
  readonly variant: ButtonVariant;
  /** How much of the grid the key covers: two columns, or the whole bottom row. */
  readonly span?: 'wide' | 'full';
  readonly action: CalculatorAction;
}

function digit(value: string): KeyDefinition {
  return { label: value, variant: 'digit', action: { type: 'digit', digit: value } };
}

/** An operator key, labelled with its expression symbol unless a legend says more. */
function operator(name: BinaryOperation, label = OPERATOR_SYMBOLS[name]): KeyDefinition {
  return { label, name, variant: 'operator', action: { type: 'operator', operator: name } };
}

/**
 * The keypad, in visual order: four columns by six rows, digits on the left and
 * operators down the right. That is 24 cells for 20 keys, and the two spans take
 * up the difference exactly — `0` covers two columns, `=` the whole bottom row —
 * so the grid has no hole in it.
 */
const KEYS: readonly KeyDefinition[] = [
  { label: 'C', name: 'clear', variant: 'action', action: { type: 'clear' } },
  {
    label: OPERATOR_SYMBOLS.sqrt,
    name: 'square root',
    variant: 'operator',
    action: { type: 'unary', operation: 'sqrt' },
  },
  // `x` to the power of `y`, because `^` on a key says nothing on its own.
  operator('power', 'xʸ'),
  operator('percent'),
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
  { label: '0', variant: 'digit', span: 'wide', action: { type: 'digit', digit: '0' } },
  { label: '.', name: 'decimal point', variant: 'digit', action: { type: 'decimal' } },
  operator('add'),
  { label: '=', name: 'equals', variant: 'action', span: 'full', action: { type: 'equals' } },
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
