import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Display } from './Display';

describe('Display', () => {
  it('lists previous calculations above the current expression', () => {
    render(
      <Display
        history={[
          { expression: '2 + 3', result: '5' },
          { expression: '5 × 4', result: '20' },
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

  it('renders the error inline, with the failed expression still on screen', () => {
    render(
      <Display history={[]} expression="12 ÷ 0" error="Division by zero is undefined" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Division by zero is undefined');
    expect(screen.getByTestId('expression')).toHaveTextContent('12 ÷ 0');
  });
});
