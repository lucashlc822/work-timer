import type { Totals as TotalsData } from '../domain/aggregate';
import { formatAway, formatFocus } from '../domain/format';

const Tile = ({
  label,
  value,
  note,
  className = '',
}: {
  label: string;
  value: string;
  note?: string | undefined;
  className?: string;
}) => (
  <div
    className={`bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-1 border px-4 py-3 ${className}`}
  >
    <dt className="text-ink-muted text-xs">{label}</dt>
    <dd className="text-ink-primary text-xl">{value}</dd>
    {note !== undefined && <dd className="text-ink-muted text-xs">{note}</dd>}
  </div>
);

/** The headline numbers for the period. */
export const Totals = ({ totals }: { totals: TotalsData }) => {
  const sessions = totals.completed + totals.endedEarly;
  return (
    // "Time away" is a fifth tile only when there is some; size the row to fit
    // so it never sits alone on a second line.
    <dl
      className={`grid grid-cols-2 gap-3 ${totals.awayMs > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}
    >
      <Tile label="Focus" value={formatFocus(totals.focusS)} />
      <Tile
        label="Stars"
        value={String(totals.stars)}
        note={sessions === 0 ? undefined : `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`}
      />
      <Tile
        label="Ended early"
        value={String(totals.endedEarly)}
        note={sessions === 0 ? undefined : `of ${sessions}`}
      />
      <Tile label="Average session" value={formatFocus(totals.avgSessionS)} />
      {totals.awayMs > 0 && (
        <Tile
          label="Time away"
          value={formatAway(totals.awayMs)}
          note="window hidden mid-session"
          className="col-span-2 sm:col-span-1"
        />
      )}
    </dl>
  );
};
