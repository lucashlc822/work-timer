import type { FocusBucket } from '../domain/aggregate';
import { formatFocus } from '../domain/format';
import type { PeriodKind } from '../domain/period';

/*
 * Chart geometry is computed (bar heights from data, gaps from bar density),
 * so it is set inline in px rather than from the Tailwind scale, and bars use
 * a small 4px top radius (`rounded-t-sm`) because `--radius-soft` would round
 * a thin bar into a pill. A deliberate exception to "spacing and radius from
 * tokens".
 */
const CHART_HEIGHT = 140;

/** A round number at or above `max`, so the top gridline is a value someone would say. */
const niceCeiling = (maxS: number): number => {
  const steps = [900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200, 57600, 86400];
  const hourSteps = (h: number) => h * 3600;
  for (const step of steps) if (maxS <= step) return step;
  return hourSteps(Math.ceil(maxS / 3600 / 10) * 10);
};

const fullLabel = (kind: PeriodKind, start: number): string =>
  new Intl.DateTimeFormat(
    undefined,
    kind === 'all'
      ? { month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' },
  ).format(start);

/**
 * Focus time per day (or per month for "all time") as one row of thin bars.
 *
 * One series in one hue, so there is no legend; the chart title names it.
 * Bars sit on the baseline with a rounded top, the grid is two faint lines,
 * and every bar has a hover tooltip. Up to 14 bars are buttons with an
 * accessible name and a focus tooltip; more are too thin for a 24px target, so
 * they are hover-only and hidden from assistive tech. A table view below
 * carries the same numbers for anyone who prefers or needs them.
 */
export const FocusBars = ({ kind, buckets }: { kind: PeriodKind; buckets: FocusBucket[] }) => {
  const top = niceCeiling(Math.max(...buckets.map((b) => b.focusS), 0));
  // Month view has up to 31 bars, so label every few; the rest keep their tooltips.
  const labelEvery = buckets.length > 14 ? Math.ceil(buckets.length / 8) : 1;
  // Month view (and a long "all time"): bars too thin to click or tab through.
  const dense = buckets.length > 14;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-ink-secondary text-sm">
        Focus time {kind === 'all' ? 'per month' : 'per day'}
      </figcaption>

      <div className="flex gap-2">
        <div
          className="text-ink-muted text-2xs flex flex-col justify-between pb-5 text-right"
          style={{ height: CHART_HEIGHT + 20 }}
          aria-hidden="true"
        >
          <span>{formatFocus(top)}</span>
          <span>{formatFocus(top / 2)}</span>
          <span>0</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ height: CHART_HEIGHT }}
            aria-hidden="true"
          >
            <div className="border-night-600/60 absolute inset-x-0 top-0 border-t" />
            <div className="border-night-600/60 absolute inset-x-0 top-1/2 border-t" />
          </div>

          <ul
            className="relative flex items-end"
            style={{ height: CHART_HEIGHT, gap: dense ? 2 : 8 }}
            aria-hidden={dense ? true : undefined}
          >
            {buckets.map((b) => {
              const ratio = top === 0 ? 0 : b.focusS / top;
              const label = `${fullLabel(kind, b.start)}: ${formatFocus(b.focusS)}`;
              const bar = (
                <span
                  className="bg-lavender-400 group-hover:bg-lavender-300 block w-full rounded-t-sm transition-colors"
                  // A focused day always shows a sliver, so it is never mistaken for an empty one.
                  style={{ height: b.focusS > 0 ? `max(${ratio * 100}%, 3px)` : 0 }}
                />
              );
              return (
                <li key={b.start} className="group relative flex h-full flex-1 items-end">
                  {dense ? (
                    // Too narrow to be a 24px target (WCAG 2.5.8): hover-only here,
                    // and the table below is the keyboard and screen-reader route.
                    <span className="flex h-full w-full items-end">{bar}</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={label}
                      className="focus-visible:outline-lavender-300 flex h-full w-full items-end outline-offset-2"
                    >
                      {bar}
                    </button>
                  )}
                  <span
                    role="presentation"
                    className="bg-night-700 border-night-600 text-ink-primary rounded-soft pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 border px-2 py-1 text-xs whitespace-nowrap group-focus-within:block group-hover:block"
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>

          <ul
            className="border-night-600 text-ink-muted text-2xs flex border-t pt-1"
            aria-hidden="true"
          >
            {buckets.map((b, i) => (
              <li
                key={b.start}
                className="flex-1 text-center"
                style={{ marginLeft: i === 0 ? 0 : dense ? 2 : 8 }}
              >
                {i % labelEvery === 0 ? b.label : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="text-ink-muted text-xs">
        <summary className="hover:text-ink-secondary cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr>
              <th className="py-1 font-normal">{kind === 'all' ? 'Month' : 'Day'}</th>
              <th className="py-1 font-normal">Focus</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.start}>
                <td className="text-ink-secondary py-0.5">{fullLabel(kind, b.start)}</td>
                <td className="text-ink-secondary py-0.5">{formatFocus(b.focusS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
};
