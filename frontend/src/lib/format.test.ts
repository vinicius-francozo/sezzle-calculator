import { describe, expect, it } from 'vitest';
import { formatNumber } from './format';

describe('formatNumber', () => {
  it.each([
    [5, '5'],
    [-3, '-3'],
    [0, '0'],
    [-0, '0'],
    [3.5, '3.5'],
    [0.30000000000000004, '0.3'],
    [1 / 3, '0.333333333333'],
    [2 / 3, '0.666666666667'],
    [1.5000000000000002, '1.5'],
    [1e21, '1e+21'],
  ])('formats %p as %p', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('keeps at most twelve significant digits', () => {
    expect(formatNumber(1.23456789012345)).toBe('1.23456789012');
  });
});
