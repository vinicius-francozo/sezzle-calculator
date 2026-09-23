export const SIGNIFICANT_DIGITS = 12;

export function formatNumber(value: number): string {
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}
