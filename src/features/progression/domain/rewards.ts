import type { SessionRow } from '@/shared/db';
import { isSeeded, isSeededConstellation } from '@/shared/lib';

import { DEFAULT_DAILY_GOAL_MIN } from './economy';
import { expectedRows, type ConstellationCompletion } from './reconcile';

/**
 * What a just-finished session (or a Pomodoro run's sessions) earned, line by
 * line, for the result's tally (session-complete redesign, PR 2).
 *
 * Read-only: Stardust is still written only by the reconciler. The tally asks
 * the reconciler's own rules a question instead of restating them: the rows
 * that `expectedRows` wants *with* these sessions and not *without* them are
 * exactly what they earned. So a session that tips the day over its goal shows
 * the goal bonus, the first session of a third day in a row shows the streak
 * bonus, and a second session the same day shows neither, by construction.
 *
 * Two kinds of bonus aren't in the sessions alone:
 * - a finished constellation comes from the sky (`finished`, through `app/`),
 *   only the one these sessions completed;
 * - focus together and shared constellations are server facts, said by their
 *   own notes, so they are not lines here.
 *
 * And one guard: a goal reached earlier and then *raised* is no longer reached
 * "without" the new session, so the diff would offer its bonus again. The
 * ledger already holds that row from before the session started, so a line is
 * kept only if its row isn't in the ledger yet or was written for this session
 * (dated at or after its start; bonus rows are dated at the fact).
 */

export type RewardLine =
  | { kind: 'session'; delta: number; minutes: number }
  | { kind: 'goal'; delta: number }
  | { kind: 'streak'; delta: number; days: number }
  | { kind: 'constellation'; delta: number; name: string };

export interface Rewards {
  lines: RewardLine[];
  total: number;
}

/** A constellation these sessions finished, with the name the sky gives it. */
export interface FinishedConstellation extends ConstellationCompletion {
  name: string;
}

/**
 * Sessions the economy counts: ended, and not dev-seeded. The reconciler and
 * the tally both use this one filter, so the two can never disagree.
 */
export const rewardableSessions = <T extends Pick<SessionRow, 'outcome' | 'device'>>(
  rows: readonly T[],
): T[] => rows.filter((s) => s.outcome !== null && !isSeeded(s));

/** Line order: the session first, then the bonuses from the most everyday to the rarest. */
const ORDER: Record<RewardLine['kind'], number> = {
  session: 0,
  goal: 1,
  streak: 2,
  constellation: 3,
};

export const sessionRewards = ({
  userId,
  sessions,
  sessionIds,
  goalMin = DEFAULT_DAILY_GOAL_MIN,
  now,
  finished = [],
  ledger,
}: {
  userId: string;
  /** Every session on the device; filtered here with `rewardableSessions`. */
  sessions: readonly SessionRow[];
  /** The sessions whose rewards to show. */
  sessionIds: ReadonlySet<string>;
  goalMin?: number;
  now: number;
  finished?: readonly FinishedConstellation[];
  /** Ledger row id -> `createdAt`, for the guard above. */
  ledger: ReadonlyMap<string, number>;
}): Rewards => {
  const counted = rewardableSessions(sessions);
  const mine = counted.filter((s) => sessionIds.has(s.id));
  if (mine.length === 0) return { lines: [], total: 0 };
  const since = Math.min(...mine.map((s) => s.startedAt));

  const completions = finished.filter((c) => !isSeededConstellation(c.choiceId));
  const names = new Map(completions.map((c) => [c.choiceId, c.name]));
  const withThem = expectedRows({ userId, sessions: counted, completions, goalMin, now });
  const without = new Set(
    expectedRows({
      userId,
      sessions: counted.filter((s) => !sessionIds.has(s.id)),
      goalMin,
      now,
    }).map((r) => r.id),
  );

  const lines: RewardLine[] = [];
  for (const row of withThem) {
    if (without.has(row.id)) continue;
    const paidAt = ledger.get(row.id);
    if (paidAt !== undefined && paidAt < since) continue;
    switch (row.reason) {
      case 'session': {
        const session = mine.find((s) => s.id === row.ref);
        lines.push({
          kind: 'session',
          delta: row.delta,
          minutes: Math.floor((session?.actualFocusS ?? 0) / 60),
        });
        break;
      }
      case 'goal':
        lines.push({ kind: 'goal', delta: row.delta });
        break;
      case 'streak':
        // ref is `<run start day>:<days>`.
        lines.push({
          kind: 'streak',
          delta: row.delta,
          days: Number((row.ref ?? '').split(':').at(-1)),
        });
        break;
      case 'constellation':
        lines.push({
          kind: 'constellation',
          delta: row.delta,
          name: names.get(row.ref ?? '') ?? '',
        });
        break;
    }
  }

  // Several sessions (a Pomodoro run) are one session line.
  const sessionLines = lines.filter((l) => l.kind === 'session');
  const merged: RewardLine[] =
    sessionLines.length > 1
      ? [
          {
            kind: 'session',
            delta: sessionLines.reduce((n, l) => n + l.delta, 0),
            minutes: sessionLines.reduce((n, l) => n + l.minutes, 0),
          },
          ...lines.filter((l) => l.kind !== 'session'),
        ]
      : lines;
  merged.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return { lines: merged, total: merged.reduce((n, l) => n + l.delta, 0) };
};

/** What each line says, after its "+N". Shared by the tally and its summary sentence. */
export const lineLabel = (line: RewardLine): string => {
  switch (line.kind) {
    case 'session':
      return `Focus · ${line.minutes} min`;
    case 'goal':
      return 'Daily goal reached';
    case 'streak':
      return `${line.days}-day streak`;
    case 'constellation':
      return line.name === '' ? 'Constellation complete' : `${line.name} complete`;
  }
};

/**
 * One sentence for screen readers, read with the result's status:
 * "Earned 45 Stardust: 25 for focus, 20 for reaching today's goal."
 */
export const rewardSummary = ({ lines, total }: Rewards): string => {
  if (lines.length === 0) return '';
  const parts = lines.map((l) => {
    switch (l.kind) {
      case 'session':
        return `${l.delta} for focus`;
      case 'goal':
        return `${l.delta} for reaching today's goal`;
      case 'streak':
        return `${l.delta} for a ${l.days}-day streak`;
      case 'constellation':
        return `${l.delta} for completing ${l.name === '' ? 'a constellation' : l.name}`;
    }
  });
  return lines.length === 1
    ? `Earned ${total} Stardust.`
    : `Earned ${total} Stardust: ${parts.join(', ')}.`;
};
