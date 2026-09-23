import { useEffect, useRef } from 'react';
import type { HistoryEntry } from '../hooks/useCalculator';

export interface DisplayProps {
  readonly history: readonly HistoryEntry[];
  readonly expression: string;
  readonly error: string | null;
}

export function Display({ history, expression, error }: DisplayProps): React.JSX.Element {
  const historyRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = historyRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [history]);

  return (
    <section className="display" aria-label="Calculator display">
      <ol className="display__history" data-testid="history" ref={historyRef}>
        {history.map((entry) => (
          <li className="display__history-entry" key={entry.id}>
            {entry.expression} = {entry.result}
          </li>
        ))}
      </ol>
      <output className="display__expression" data-testid="expression">
        {expression}
      </output>
      {error !== null && (
        <p className="display__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
