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
  return (
    <section className="display" aria-label="Calculator display">
      <ol className="display__history" data-testid="history">
        {history.map((entry, index) => (
          <li className="display__history-entry" key={`${index}-${entry.expression}`}>
            {entry.expression} = {entry.result}
          </li>
        ))}
      </ol>
      <output className="display__expression" data-testid="expression" aria-live="polite">
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
