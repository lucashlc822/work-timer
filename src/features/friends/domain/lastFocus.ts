import { dayStart } from '@/shared/lib';

/** "Focused today", "Focused yesterday", "Focused 3 days ago", by local calendar day. */
export const lastFocusLabel = (at: number | null, now: number): string => {
  if (at === null) return 'Not focused yet';
  const days = Math.round((dayStart(now).getTime() - dayStart(at).getTime()) / 86_400_000);
  if (days <= 0) return 'Focused today';
  if (days === 1) return 'Focused yesterday';
  return `Focused ${days} days ago`;
};
