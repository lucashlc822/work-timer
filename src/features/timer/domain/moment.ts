/**
 * The completion moment: what a finished session plays before it settles into
 * its result (session-complete redesign, PR 1).
 *
 * A short, fixed timeline. The star ignites first; at `arrive` it takes its
 * place in the sky behind the timer; at `tally` the rewards appear; at
 * `settled` everything is in its final state. Skipping (Escape, a click)
 * jumps straight to `settled`, and so does reduced motion.
 *
 * `waiting` is before it starts: the moment holds until the result is actually
 * on screen (window visible, timer view showing), so a session that ended in
 * the tray plays its moment when the person comes back, not unseen.
 *
 * Pure: the hook (`useMoment`) only decides when to read it.
 */

/** A countdown result gets the whole moment; a Pomodoro block a lighter one. */
export type MomentKind = 'full' | 'light';

export type MomentStage = 'waiting' | 'ignite' | 'arrive' | 'tally' | 'settled';

export interface MomentStep {
  stage: MomentStage;
  /** From the moment's start. */
  atMs: number;
}

export const MOMENT_TIMELINE: Readonly<Record<MomentKind, readonly MomentStep[]>> = {
  full: [
    { stage: 'ignite', atMs: 0 },
    { stage: 'arrive', atMs: 900 },
    { stage: 'tally', atMs: 1500 },
    { stage: 'settled', atMs: 3000 },
  ],
  light: [
    { stage: 'ignite', atMs: 0 },
    { stage: 'arrive', atMs: 700 },
    { stage: 'settled', atMs: 1600 },
  ],
};

/** The stage `elapsedMs` into a moment of this kind. Negative time is still `ignite`. */
export const stageAt = (kind: MomentKind, elapsedMs: number): MomentStage => {
  let stage: MomentStage = 'ignite';
  for (const step of MOMENT_TIMELINE[kind]) {
    if (elapsedMs >= step.atMs) stage = step.stage;
  }
  return stage;
};

const ORDER: readonly MomentStage[] = ['waiting', 'ignite', 'arrive', 'tally', 'settled'];

/**
 * Whether the moment has got as far as `stage`. A light moment has no `tally`,
 * so it counts as reached once the moment has settled.
 */
export const reached = (current: MomentStage, stage: MomentStage): boolean =>
  ORDER.indexOf(current) >= ORDER.indexOf(stage);

/**
 * How late the moment may start after the session's end and still chime. A
 * session that ended in the tray half an hour ago plays its moment when the
 * window comes back, but a sudden sound then would only startle.
 */
export const CHIME_WINDOW_MS = 10_000;

export const shouldChime = (endedAt: number, momentStartedAt: number): boolean =>
  momentStartedAt - endedAt <= CHIME_WINDOW_MS;
