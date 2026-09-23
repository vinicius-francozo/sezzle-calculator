export type ButtonVariant = 'digit' | 'operator' | 'action';

export interface CalcButtonProps {
  readonly label: React.ReactNode;
  readonly name: string;
  readonly variant: ButtonVariant;
  readonly full?: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

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
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
