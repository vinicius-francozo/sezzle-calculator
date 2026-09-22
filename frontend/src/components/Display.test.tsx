import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Display } from './Display';

describe('Display', () => {
  it('lists previous calculations above the current expression', () => {
    render(
      <Display
        history={[
          { id: 1, expression: '2 + 3', result: '5' },
          { id: 2, expression: '5 × 4', result: '20' },
        ]}
        expression="20 ÷"
        error={null}
      />,
    );

    expect(screen.getByTestId('history')).toHaveTextContent('2 + 3 = 5');
    expect(screen.getByTestId('history')).toHaveTextContent('5 × 4 = 20');
    expect(screen.getByTestId('expression')).toHaveTextContent('20 ÷');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the element of an entry that outlives the oldest one', () => {
    const second = { id: 2, expression: '5 × 4', result: '20' };
    const { rerender } = render(
      <Display
        history={[{ id: 1, expression: '2 + 3', result: '5' }, second]}
        expression="20"
        error={null}
      />,
    );
    const survivor = screen.getByText(/5 × 4/);

    rerender(
      <Display
        history={[second, { id: 3, expression: '20 ÷ 2', result: '10' }]}
        expression="10"
        error={null}
      />,
    );

    // An index-based key would remount every entry each time the oldest drops off.
    expect(screen.getByText(/5 × 4/)).toBe(survivor);
  });

  it('renders the error inline, with the failed expression still on screen', () => {
    render(
      <Display history={[]} expression="12 ÷ 0" error="Division by zero is undefined" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Division by zero is undefined');
    expect(screen.getByTestId('expression')).toHaveTextContent('12 ÷ 0');
  });
});
