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

/** How many cells of the keypad grid a key covers, per the span classes in styles.css. */
function cellsOf(key: HTMLElement): number {
  if (key.classList.contains('key--full')) {
    return 4;
  }
  return key.classList.contains('key--wide') ? 2 : 1;
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

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'add', operands: [12, 3] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('15');
    expect(screen.getByTestId('history')).toHaveTextContent('12 + 3 = 15');
  });

  it('accepts the same expression from the keyboard', async () => {
    calculateMock.mockResolvedValue({ result: 42 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('7*6{Enter}');

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'multiply', operands: [7, 6] },
      expect.any(AbortSignal),
    );
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

  it('computes with Enter after the expression was entered with the mouse', async () => {
    calculateMock.mockResolvedValue({ result: 4 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: 'add' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByTestId('expression')).toHaveTextContent('1 + 3');

    // A clicked button must not keep focus, or the browser would re-activate it here
    // and the display would read `1 + 33` instead of computing (DESIGN.md D11).
    expect(screen.getByRole('button', { name: '3' })).not.toHaveFocus();
    await user.keyboard('{Enter}');

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'add', operands: [1, 3] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('4');
  });

  it('accepts the comma of a numpad as the decimal separator', async () => {
    calculateMock.mockResolvedValue({ result: 3 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('1,5+1,5{Enter}');

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'add', operands: [1.5, 1.5] },
      expect.any(AbortSignal),
    );
  });

  it('marks the keypad busy and keeps focus inside it while a request is in flight', async () => {
    const response = deferred<CalculateResult>();
    calculateMock.mockReturnValue(response.promise);
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('2+2');
    const keypad = screen.getByRole('group', { name: 'Keypad' });
    expect(keypad).toHaveAttribute('aria-busy', 'false');

    screen.getByRole('button', { name: 'equals' }).focus();
    await user.keyboard('{Enter}');

    // The button that was pressed is disabled now, so its focus would fall to <body>.
    expect(keypad).toHaveAttribute('aria-busy', 'true');
    expect(keypad).toHaveFocus();

    await act(async () => {
      response.settle({ result: 4 });
    });

    expect(keypad).toHaveAttribute('aria-busy', 'false');
  });

  it('activates the keypad button reached by tabbing when Enter is pressed', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('12');
    screen.getByRole('button', { name: 'add' }).focus();
    await user.keyboard('{Enter}');

    // The global Enter handler must not cancel the focused button's own activation.
    expect(screen.getByTestId('expression')).toHaveTextContent('12 +');
    expect(calculateMock).not.toHaveBeenCalled();
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

  it('disables every key but clear while a request is in flight', async () => {
    const response = deferred<CalculateResult>();
    calculateMock.mockReturnValue(response.promise);
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('2+2{Enter}');
    expect(screen.getByRole('button', { name: 'equals' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '7' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'decimal point' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'clear' })).toBeEnabled();

    await act(async () => {
      response.settle({ result: 4 });
    });

    expect(screen.getByRole('button', { name: 'equals' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '7' })).toBeEnabled();
    expect(screen.getByTestId('expression')).toHaveTextContent('4');
  });

  it('raises a number to a power', async () => {
    calculateMock.mockResolvedValue({ result: 1024 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'power' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'equals' }));

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'power', operands: [2, 10] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('1024');
  });

  it('takes a percentage of a number', async () => {
    calculateMock.mockResolvedValue({ result: 30 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'percent' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'equals' }));

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'percent', operands: [15, 200] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('30');
  });

  it('roots the number on screen as soon as the key is pressed, with no equals', async () => {
    calculateMock.mockResolvedValue({ result: 9 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('81');
    await user.click(screen.getByRole('button', { name: 'square root' }));

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'sqrt', operands: [81] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('9');
    expect(screen.getByTestId('history')).toHaveTextContent('√81 = 9');
  });

  it('roots the right-hand operand and leaves the operation waiting for equals', async () => {
    calculateMock.mockResolvedValueOnce({ result: 3 }).mockResolvedValueOnce({ result: 5 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('2+9');
    await user.click(screen.getByRole('button', { name: 'square root' }));
    expect(await screen.findByTestId('expression')).toHaveTextContent('2 + 3');

    await user.keyboard('{Enter}');

    expect(calculateMock).toHaveBeenNthCalledWith(
      2,
      { operation: 'add', operands: [2, 3] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('5');
  });

  it('shows the API message for a root that is undefined and keeps the operand', async () => {
    calculateMock
      .mockResolvedValueOnce({ result: -9 })
      .mockRejectedValueOnce(
        new ApiError('UNDEFINED_RESULT', 'Square root of a negative number is undefined'),
      );
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('0-9{Enter}');
    expect(await screen.findByTestId('expression')).toHaveTextContent('-9');

    await user.click(screen.getByRole('button', { name: 'square root' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Square root of a negative number is undefined',
    );
    expect(screen.getByTestId('expression')).toHaveTextContent('-9');
    // Only the subtraction that succeeded is recorded; the failure stays inline.
    expect(screen.getByTestId('history')).toHaveTextContent('0 − 9 = -9');
  });

  it('accepts the new operations from the keyboard too', async () => {
    calculateMock.mockResolvedValueOnce({ result: 3 }).mockResolvedValueOnce({ result: 27 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('9@');
    expect(await screen.findByTestId('expression')).toHaveTextContent('3');

    await user.keyboard('^3{Enter}');

    expect(calculateMock).toHaveBeenNthCalledWith(
      2,
      { operation: 'power', operands: [3, 3] },
      expect.any(AbortSignal),
    );
    expect(await screen.findByTestId('expression')).toHaveTextContent('27');
  });

  it('takes a percentage from the keyboard', async () => {
    calculateMock.mockResolvedValue({ result: 30 });
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.keyboard('15%200{Enter}');

    expect(calculateMock).toHaveBeenCalledWith(
      { operation: 'percent', operands: [15, 200] },
      expect.any(AbortSignal),
    );
  });

  it('fills its four-by-six grid exactly, leaving no empty cell', () => {
    render(<App />);

    const keys = screen.getAllByRole('button');

    expect(keys).toHaveLength(20);
    expect(keys.reduce((cells, key) => cells + cellsOf(key), 0)).toBe(24);
  });

  it('offers no free-text input anywhere, on desktop or mobile', () => {
    const { container } = render(<App />);

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });
});
