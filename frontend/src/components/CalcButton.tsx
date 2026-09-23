export type ButtonVariant = 'digit' | 'operator' | 'action';

export interface CalcButtonProps {
  /** The face of the key: its text, or an icon for a key no character stands for. */
  readonly label: React.ReactNode;
  /** Accessible name — the label itself for a key whose face is already a word. */
  readonly name: string;
  readonly variant: ButtonVariant;
  /** Whether the key covers the whole bottom row, as `=` does. */
  readonly full?: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

/** CalcButton is the single keypad button: a plain button, styled by variant. */
export function CalcButton({
  label,
  name,
  variant,
  full = false,
  disabled,
  onPress,
}: CalcButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`key key--${variant}${full ? ' key--full' : ''}`}
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
