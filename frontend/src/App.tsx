import { Display } from './components/Display';
import { Keypad } from './components/Keypad';
import { useCalculator } from './hooks/useCalculator';
import { useKeyboard } from './hooks/useKeyboard';

export function App(): React.JSX.Element {
  const { state, expression, dispatch } = useCalculator();
  useKeyboard(dispatch);

  return (
    <main className="calculator">
      <h1 className="calculator__title">Calculator</h1>
      <Display history={state.history} expression={expression} error={state.error} />
      <Keypad dispatch={dispatch} busy={state.pending !== null} />
    </main>
  );
}
