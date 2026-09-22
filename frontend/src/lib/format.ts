/** Significant digits kept on screen; enough for a calculator, short enough to hide float noise. */
const SIGNIFICANT_DIGITS = 12;

/**
 * formatNumber renders a number the way a desktop calculator does: rounded to
 * ~12 significant digits with trailing zeros trimmed, so `0.1 + 0.2` reads `0.3`
 * instead of `0.30000000000000004` (see DESIGN.md D6).
 */
export function formatNumber(value: number): string {
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}
