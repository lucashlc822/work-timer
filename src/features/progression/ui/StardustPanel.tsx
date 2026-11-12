import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { addDays, dayKey, dayStart } from '@/shared/lib';
import { radioKeyTarget } from '@/shared/ui';

import { STARDUST_PER_MINUTE } from '../domain/economy';
import { groupByDay } from '../domain/ledgerDays';
import { useBalance, useRecentLedger } from '../hooks/useStardust';
import { count, signed } from './format';
import { GoalAndStreak } from './GoalAndStreak';
import { Shop, type ShopProps } from './Shop';

const REASONS: Record<string, string> = {
  session: 'Focus session',
  goal: 'Daily goal reached',
  streak: 'Streak milestone',
  constellation: 'Constellation finished',
  together: 'Focus together bonus',
  shared: 'Shared constellation finished',
  purchase: 'Purchase',
};

const TABS = [
  { id: 'shop', label: 'Shop' },
  { id: 'goal', label: 'Goal & streak' },
  { id: 'history', label: 'History' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

/** "Today", "Yesterday", or "Sunday, Nov 8". */
const dayLabel = (at: number, now: number): string => {
  const key = dayKey(at);
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(addDays(dayStart(now), -1).getTime())) return 'Yesterday';
  return dayName.format(at);
};

const History = () => {
  const recent = useRecentLedger(20);
  if (recent === undefined) return null;
  if (recent.length === 0) {
    return (
      <p className="text-ink-secondary py-6 text-center text-sm">
        Nothing here yet. Finish a session and it will show up.
      </p>
    );
  }
  const now = Date.now();
  return (
    <div className="flex flex-col gap-5">
      {groupByDay(recent).map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h3 className="text-ink-secondary text-xs tracking-widest uppercase">
            {dayLabel(group.at, now)}
          </h3>
          <ul className="border-night-600 bg-night-800/70 divide-night-600 rounded-soft w-full divide-y border">
            {group.rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
              >
                <span className="flex flex-col">
                  <span className="text-ink-primary">{REASONS[row.reason] ?? row.reason}</span>
                  <span className="text-ink-muted text-xs">{time.format(row.createdAt)}</span>
                </span>
                <span className={row.delta < 0 ? 'text-rose-300' : 'text-star-warm'}>
                  {signed(row.delta)}
                  <span className="sr-only"> Stardust</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

/**
 * The balance up front, then three views of the rest: the shop (what you came
 * for), your daily goal and streak, and where Stardust came from. Opens on the
 * shop every time.
 */
export const StardustPanel = (shop: ShopProps) => {
  const balance = useBalance();
  const [tab, setTab] = useState<TabId>('shop');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const tabId = (id: TabId) => `${base}-tab-${id}`;
  const panelId = (id: TabId) => `${base}-panel-${id}`;

  const move = (to: number) => {
    const next = TABS[to];
    if (next === undefined) return;
    setTab(next.id);
    tabRefs.current[to]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(TABS.length - 1);
    } else {
      const to = radioKeyTarget(e.key, index, TABS.length);
      if (to === null) return;
      e.preventDefault();
      move(to);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 pt-10 pb-10">
      <header className="flex flex-col items-center gap-3">
        <h2
          tabIndex={-1}
          className="font-atlas tracking-atlas text-lavender-200 text-lg outline-none"
        >
          Stardust
        </h2>
        <p className="text-ink-primary text-4xl">
          <span aria-hidden className="text-star-warm mr-2">
            ✦
          </span>
          {count(balance ?? 0)}
          <span className="sr-only"> Stardust</span>
        </p>
        <details className="text-ink-secondary max-w-sm text-center text-sm">
          <summary className="hover:text-ink-primary cursor-pointer py-1.5 text-xs">
            How Stardust is earned
          </summary>
          <p className="mt-2">
            Every completed session earns {STARDUST_PER_MINUTE} Stardust per focused minute.
            Sessions ended early earn nothing. Bonuses come from the daily goal, streaks and
            finished constellations.
          </p>
        </details>
      </header>

      <div
        role="tablist"
        aria-label="Stardust"
        className="rounded-pill border-night-600 bg-night-800/70 flex gap-1 border p-1"
      >
        {TABS.map((t, i) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={tabId(t.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`rounded-pill min-h-7 border px-4 py-1 text-xs whitespace-nowrap transition-colors ${
                selected
                  ? 'border-lavender-400 bg-lavender-400/15 text-ink-primary'
                  : 'text-ink-secondary hover:text-ink-primary border-transparent'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId('shop')}
        aria-labelledby={tabId('shop')}
        hidden={tab !== 'shop'}
        className="w-full max-w-xl"
      >
        <Shop {...shop} />
      </div>
      <div
        role="tabpanel"
        id={panelId('goal')}
        aria-labelledby={tabId('goal')}
        hidden={tab !== 'goal'}
        className="w-full max-w-xl"
      >
        <GoalAndStreak />
      </div>
      <div
        role="tabpanel"
        id={panelId('history')}
        aria-labelledby={tabId('history')}
        hidden={tab !== 'history'}
        className="w-full max-w-xl"
      >
        <History />
      </div>
    </div>
  );
};
