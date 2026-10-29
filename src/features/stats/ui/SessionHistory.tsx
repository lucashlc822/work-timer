import { useState } from 'react';

import type { SessionRow, TagRow } from '@/shared/db';
import { tagColorVar } from '@/shared/ui';

import { formatAway, formatFocus } from '../domain/format';

const PAGE = 50;

const when = (at: number): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);

/**
 * The sessions that began in the period, newest first. A long list (all time)
 * is shown a page at a time.
 */
export const SessionHistory = ({
  sessions,
  tags,
}: {
  sessions: SessionRow[];
  tags: Map<string, TagRow>;
}) => {
  const [shown, setShown] = useState(PAGE);
  const visible = sessions.slice(0, shown);

  return (
    <section className="flex flex-col gap-3" aria-label="Sessions">
      <h3 className="text-ink-secondary text-sm">
        Sessions <span className="text-ink-muted">· {sessions.length}</span>
      </h3>
      <ul className="divide-night-600/60 flex flex-col divide-y">
        {visible.map((s) => {
          const tag = s.tagId === null ? undefined : tags.get(s.tagId);
          const cancelled = s.outcome === 'cancelled';
          return (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
              <span className="text-ink-primary w-44 shrink-0">{when(s.startedAt)}</span>
              <span className="text-ink-secondary w-20 shrink-0">
                {formatFocus(s.actualFocusS)}
              </span>
              <span className="text-ink-secondary flex min-w-0 flex-1 items-center gap-2">
                {tag !== undefined ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill"
                      style={{ backgroundColor: tagColorVar(tag.color) }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </>
                ) : (
                  <span className="text-ink-muted">
                    {s.tagId === null ? 'No tag' : 'Unknown tag'}
                  </span>
                )}
              </span>
              <span className={cancelled ? 'text-faded text-xs' : 'text-success text-xs'}>
                {cancelled ? 'ended early' : 'completed'}
              </span>
              {s.mode === 'pomodoro' && <span className="text-ink-muted text-xs">Pomodoro</span>}
              {s.awayMs > 0 && (
                <span className="text-ink-muted text-xs">away {formatAway(s.awayMs)}</span>
              )}
            </li>
          );
        })}
      </ul>
      {shown < sessions.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="text-ink-muted hover:text-ink-primary self-start text-xs transition-colors"
        >
          Show more
        </button>
      )}
    </section>
  );
};
