import { startVerdict } from '../domain/derive';
import { RULES, useSky } from '../hooks/useSky';
import { minimumLabel } from './describe';

/**
 * Where a just-finished session went: into a constellation, or wandering —
 * and if wandering, why. Found by looking the session up in the derived sky,
 * which re-derives the moment the timer writes the completion.
 */
export const NewStarNote = ({ sessionId }: { sessionId: string }) => {
  const sky = useSky();
  if (sky === undefined) return null;

  for (const c of sky.constellations) {
    const index = c.stars.findIndex((s) => s.id === sessionId);
    if (index === -1) continue;
    const total = c.def.shape.points.length;
    return (
      <p className="text-ink-secondary text-sm">
        {c.complete && index === total - 1 ? (
          <>
            <span className="text-mint-300">{c.def.name} is complete.</span> Choose your next
            constellation below.
          </>
        ) : (
          <>
            Added to <span className="text-ink-primary">{c.def.name}</span>: {index + 1} of {total}
          </>
        )}
      </p>
    );
  }

  const wandering = sky.wandering.find((w) => w.session.id === sessionId);
  if (wandering === undefined) return null;
  const target = sky.constellations.find((c) => c.choice.id === wandering.constellationId);

  const why =
    wandering.reason === 'too-short' && target !== undefined
      ? `${target.def.name} needs ${minimumLabel(RULES[target.def.tier].minSessionS)}.`
      : wandering.reason === 'constellation-complete' && target !== undefined
        ? `${target.def.name} was already complete.`
        : 'Choose a constellation to start building one.';

  return <p className="text-ink-secondary text-sm">A wandering star. {why}</p>;
};

/**
 * Before starting: will a session this long count? Warns when it will not,
 * so a wandering star is never a surprise.
 */
export const StartHint = ({ plannedS }: { plannedS: number }) => {
  const sky = useSky();
  if (sky === undefined) return null;

  const verdict = startVerdict(sky, plannedS, RULES);
  switch (verdict.kind) {
    case 'counts': {
      const c = verdict.constellation;
      return (
        <p className="text-ink-secondary text-xs">
          Adds star {c.stars.length + 1} of {c.def.shape.points.length} to {c.def.name}
        </p>
      );
    }
    case 'too-short':
      return (
        <p className="text-xs text-rose-300">
          Won&rsquo;t count toward {verdict.constellation.def.name}: it needs{' '}
          {minimumLabel(verdict.minSessionS)}.
        </p>
      );
    case 'no-constellation':
      return (
        <p className="text-ink-secondary text-xs">
          No constellation chosen: this will be a wandering star.
        </p>
      );
  }
};
