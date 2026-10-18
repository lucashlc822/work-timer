import { STARDUST_PER_MINUTE } from '../domain/economy';
import { useBalance, useRecentLedger } from '../hooks/useStardust';
import { signed, stardust } from './format';
import { GoalAndStreak } from './GoalAndStreak';
import { Shop, type ShopProps } from './Shop';

const REASONS: Record<string, string> = {
  session: 'Focus session',
  goal: 'Daily goal reached',
  streak: 'Streak milestone',
  constellation: 'Constellation finished',
  purchase: 'Purchase',
};

const when = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * The balance, the daily goal and streak, the shop, and where Stardust came
 * from.
 */
export const StardustPanel = (shop: ShopProps) => {
  const balance = useBalance();
  const recent = useRecentLedger(20);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-6 pt-10 pb-28">
      <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Stardust</h2>

      <p className="text-ink-primary text-3xl">
        <span aria-hidden className="text-star-warm mr-2">
          ✦
        </span>
        {stardust(balance ?? 0)}
      </p>

      <p className="text-ink-secondary max-w-sm text-center text-sm">
        Every completed session earns {STARDUST_PER_MINUTE} Stardust per focused minute. Sessions
        ended early earn nothing. Bonuses come from the daily goal, streaks and finished
        constellations.
      </p>

      <GoalAndStreak />

      <Shop {...shop} />

      {recent !== undefined && recent.length > 0 && (
        <ul className="border-night-600 bg-night-800/70 divide-night-600 w-full divide-y rounded-xl border">
          {recent.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span className="flex flex-col">
                <span className="text-ink-primary">{REASONS[row.reason] ?? row.reason}</span>
                <span className="text-ink-muted text-xs">{when.format(row.createdAt)}</span>
              </span>
              <span className={row.delta < 0 ? 'text-rose-300' : 'text-star-warm'}>
                {signed(row.delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
