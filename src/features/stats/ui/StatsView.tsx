import { useMemo, useState } from 'react';

import { systemClock } from '@/shared/lib';

import { focusBuckets, focusByTag, historyFor, totals } from '../domain/aggregate';
import { isCurrent, periodContaining, shiftPeriod, type PeriodKind } from '../domain/period';
import { useEarliestStart, useStats } from '../hooks/useStats';
import { FocusBars } from './FocusBars';
import { SessionHistory } from './SessionHistory';
import { TagBreakdown } from './TagBreakdown';
import { Totals } from './Totals';

const KINDS: ReadonlyArray<{ kind: PeriodKind; label: string }> = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'all', label: 'All time' },
];

const EMPTY_TEXT: Record<PeriodKind, string> = {
  week: 'No focus sessions this week.',
  month: 'No focus sessions this month.',
  all: 'No focus sessions yet.',
};

const arrow =
  'rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary h-8 w-8 border transition-colors disabled:pointer-events-none disabled:opacity-30';

/**
 * Where focus time went: totals, a bar per day, a split by tag, and the
 * sessions themselves, for a calendar week or month you can page through, or
 * for all time. Everything is derived from the sessions on each read.
 */
export const StatsView = () => {
  const [kind, setKind] = useState<PeriodKind>('week');
  // Any moment inside the period being shown; paging moves it.
  const [anchor, setAnchor] = useState(() => systemClock.now());
  const earliest = useEarliestStart();

  const now = systemClock.now();
  const period = useMemo(
    () => periodContaining(kind, anchor, earliest ?? null),
    [kind, anchor, earliest],
  );
  const data = useStats(period);

  const view = useMemo(() => {
    if (data === undefined) return undefined;
    const t = totals(data.sessions, period);
    return {
      totals: t,
      buckets: focusBuckets(data.sessions, period),
      byTag: focusByTag(data.sessions, period),
      history: historyFor(data.sessions, period),
      empty: t.focusS === 0 && t.completed + t.endedEarly === 0,
    };
  }, [data, period]);

  const pick = (next: PeriodKind) => {
    setKind(next);
    setAnchor(systemClock.now());
  };
  const page = (by: -1 | 1) => setAnchor(shiftPeriod(period, by).start);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-10 pb-28">
      <header className="flex flex-col items-center gap-4">
        <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Stats</h2>

        <div role="tablist" aria-label="Period" className="flex gap-2">
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => pick(k)}
              className={`rounded-pill border px-4 py-1.5 text-xs transition-colors ${
                k === kind
                  ? 'border-lavender-400 text-ink-primary'
                  : 'border-night-600 text-ink-secondary hover:border-lavender-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {kind !== 'all' && (
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => page(-1)}
              className={arrow}
            >
              ‹
            </button>
          )}
          <p className="text-ink-primary min-w-48 text-center text-sm" aria-live="polite">
            {period.label}
          </p>
          {kind !== 'all' && (
            <button
              type="button"
              aria-label="Next period"
              disabled={isCurrent(period, now)}
              onClick={() => page(1)}
              className={arrow}
            >
              ›
            </button>
          )}
        </div>
      </header>

      {view === undefined ? (
        <p className="text-ink-muted text-center text-sm">Opening…</p>
      ) : view.empty ? (
        <p className="text-ink-muted py-12 text-center text-sm">{EMPTY_TEXT[kind]}</p>
      ) : (
        <>
          <Totals totals={view.totals} />
          <FocusBars kind={kind} buckets={view.buckets} />
          <TagBreakdown rows={view.byTag} tags={data!.tags} />
          <SessionHistory sessions={view.history} tags={data!.tags} />
        </>
      )}
    </div>
  );
};
