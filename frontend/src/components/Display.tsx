import { useEffect, useRef } from 'react';
import type { HistoryEntry } from '../hooks/useCalculator';

export interface DisplayProps {
  readonly history: readonly HistoryEntry[];
  readonly expression: string;
  readonly error: string | null;
}

/**
 * Display shows the past calculations, the current expression and, directly
 * under it, the inline error message (see DESIGN.md D8).
 */
export function Display({ history, expression, error }: DisplayProps): React.JSX.Element {
  const historyRef = useRef<HTMLOListElement>(null);

  // The history scrolls once it outgrows its box and new entries are appended at the
  // bottom, where the browser does not follow them: without this the newest
  // calculation would sit below the fold from about the fifth one on (DESIGN.md D12).
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
