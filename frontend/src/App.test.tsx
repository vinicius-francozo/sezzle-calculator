import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiError, calculate } from './lib/api';
import type { CalculateResult } from './types/api';

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/api')>()),
  calculate: vi.fn(),
}));

const calculateMock = vi.mocked(calculate);

function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  calculateMock.mockReset();
});

describe('App', () => {
  it('computes an expression typed on the keypad and records it in the history', async () => {
    calculateMock.mockResolvedValue({ result: 15 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'add' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: 'equals' }));

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', operands: [12, 3] });
    expect(await screen.findByTestId('expression')).toHaveTextContent('15');
    expect(screen.getByTestId('history')).toHaveTextContent('12 + 3 = 15');
  });

  it('accepts the same expression from the keyboard', async () => {
    calculateMock.mockResolvedValue({ result: 42 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('7*6{Enter}');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'multiply', operands: [7, 6] });
    expect(await screen.findByTestId('expression')).toHaveTextContent('42');
  });

  it('clears the calculator with Escape', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('12+3');
    expect(screen.getByTestId('expression')).toHaveTextContent('12 + 3');

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('expression')).toHaveTextContent('0');
  });

  it('ignores keys that have no button', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('4');
    await user.keyboard('a{Backspace}(');

    expect(screen.getByTestId('expression')).toHaveTextContent('4');
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('shows the message returned by the API inline and keeps the expression', async () => {
    calculateMock.mockRejectedValue(
      new ApiError('DIVISION_BY_ZERO', 'Division by zero is undefined'),
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('12/0{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Division by zero is undefined');
    expect(screen.getByTestId('expression')).toHaveTextContent('12 ÷ 0');
    expect(screen.getByTestId('history')).toBeEmptyDOMElement();
  });

  it('degrades gracefully when the service cannot be reached', async () => {
    calculateMock.mockRejectedValue(
      new ApiError('NETWORK_ERROR', 'Could not reach the calculator service'),
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('2+2{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the calculator service',
    );
    expect(screen.getByRole('button', { name: 'equals' })).toBeEnabled();
  });

  it('disables equals while a request is in flight', async () => {
    const response = deferred<CalculateResult>();
    calculateMock.mockReturnValue(response.promise);
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('2+2{Enter}');
    expect(screen.getByRole('button', { name: 'equals' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'clear' })).toBeEnabled();

    await act(async () => {
      response.settle({ result: 4 });
    });

    expect(screen.getByRole('button', { name: 'equals' })).toBeEnabled();
    expect(screen.getByTestId('expression')).toHaveTextContent('4');
  });
});
