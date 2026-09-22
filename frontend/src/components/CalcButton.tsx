export type ButtonVariant = 'digit' | 'operator' | 'action';

export interface CalcButtonProps {
  readonly label: string;
  /** Accessible name, for buttons whose label is a symbol. */
  readonly name?: string;
  readonly variant: ButtonVariant;
  readonly span?: 'columns' | 'rows';
  readonly disabled: boolean;
  readonly onPress: () => void;
}

/** CalcButton is the single keypad button: a plain button, styled by variant. */
export function CalcButton({
  label,
  name,
  variant,
  span,
  disabled,
  onPress,
}: CalcButtonProps): React.JSX.Element {
  const spanClass = span === undefined ? '' : ` key--span-${span}`;
  return (
    <button
      type="button"
      className={`key key--${variant}${spanClass}`}
      aria-label={name}
      disabled={disabled}
      // Every major browser focuses a button when it is clicked, and that residual
      // focus is indistinguishable from focus reached with Tab: the global Enter
      // handler would bow out and the browser would re-activate this button instead
      // of computing the result (see DESIGN.md D11). Suppressing the mousedown default
      // leaves focus where it was, while Tab still focuses the button as usual.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
