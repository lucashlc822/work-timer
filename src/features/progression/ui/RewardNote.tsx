import { sessionEarning } from '../domain/economy';
import { stardust } from './format';

/**
 * "+25 Stardust" under a finished session's result. Computed from the session
 * itself with the same rule the reconciler uses, so it shows immediately
 * rather than waiting for the ledger row to be written.
 */
export const RewardNote = ({
  outcome,
  actualFocusS,
}: {
  outcome: 'completed' | 'cancelled';
  actualFocusS: number;
}) => {
  const earned = sessionEarning({ outcome, actualFocusS });
  if (earned <= 0) return null;
  return (
    <p className="text-sm">
      <span aria-hidden className="text-star-warm mr-1.5">
        ✦
      </span>
      <span className="text-ink-primary">+{stardust(earned)}</span>
    </p>
  );
};
