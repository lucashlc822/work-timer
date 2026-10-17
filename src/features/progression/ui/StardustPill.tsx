import { useBalance } from '../hooks/useStardust';
import { stardust } from './format';

/** The balance, in the footer; opens the Stardust panel. */
export const StardustPill = ({ onOpen }: { onOpen: () => void }) => {
  const balance = useBalance();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
    >
      <span aria-hidden className="text-star-warm mr-1.5">
        ✦
      </span>
      {stardust(balance ?? 0)}
    </button>
  );
};
