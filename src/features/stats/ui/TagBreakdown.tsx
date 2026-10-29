import type { TagRow } from '@/shared/db';
import { tagColorVar } from '@/shared/ui';

import type { TagFocus } from '../domain/aggregate';
import { formatFocus, percentOf } from '../domain/format';

/**
 * How the period's focus splits across tags: one labelled bar per tag,
 * biggest first. Each row is named in text, so the tag colour is never the
 * only thing telling two tags apart. Archived tags keep their name here —
 * archiving hides a tag from the picker, not from the past.
 */
export const TagBreakdown = ({ rows, tags }: { rows: TagFocus[]; tags: Map<string, TagRow> }) => {
  const total = rows.reduce((sum, r) => sum + r.focusS, 0);
  const biggest = Math.max(...rows.map((r) => r.focusS), 0);

  return (
    <section className="flex flex-col gap-3" aria-label="Focus by tag">
      <h3 className="text-ink-secondary text-sm">Focus by tag</h3>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const tag = row.tagId === null ? undefined : tags.get(row.tagId);
          const name = row.tagId === null ? 'Untagged' : (tag?.name ?? 'Unknown tag');
          const archived = tag?.archivedAt != null;
          const color = tag === undefined ? 'var(--color-ink-muted)' : tagColorVar(tag.color);
          return (
            <li key={row.tagId ?? 'untagged'} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={row.tagId === null ? 'text-ink-muted' : 'text-ink-primary'}>
                  {name}
                  {archived && <span className="text-ink-muted"> · archived</span>}
                </span>
                <span className="text-ink-secondary text-xs">
                  {formatFocus(row.focusS)} · {percentOf(row.focusS, total)}%
                </span>
              </div>
              <div className="bg-night-700/60 rounded-pill h-2">
                <div
                  className="rounded-pill h-full"
                  style={{
                    width: `${biggest === 0 ? 0 : (row.focusS / biggest) * 100}%`,
                    backgroundColor: color,
                    opacity: row.tagId === null ? 0.5 : 1,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
