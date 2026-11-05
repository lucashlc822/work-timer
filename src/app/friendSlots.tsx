import type { FriendSky, FriendSummary } from '@/features/friends';
import { streakAt, styleName } from '@/features/progression';
import { completedConstellations, deriveOtherSky, SkyView } from '@/features/sky';
import { formatFocus, periodContaining, totals } from '@/features/stats';

/**
 * A friend's sky and numbers (M7), built from the sky, stats and progression
 * features — the friends feature never imports them; this is where they meet,
 * like `timerSlots` in HomeRoute.
 *
 * The numbers use the same rules as your own Stats and streak: focus counts
 * the part of each session inside this week (ended-early ones included), stars
 * and the streak count completed sessions only.
 */

export const renderFriendSky = (sky: FriendSky) => (
  <SkyView
    sky={deriveOtherSky(sky.sessions, sky.choices)}
    themeKey={sky.themeKey ?? undefined}
    mode="full"
    styleName={styleName}
    // The friend's header, of varying height, sits over the top of their sky.
    cardSide="below"
  />
);

export const summarizeFriend = (sky: FriendSky, now: number): FriendSummary => {
  const week = totals(sky.sessions, periodContaining('week', now));
  return {
    focusThisWeek: formatFocus(week.focusS),
    starsThisWeek: week.stars,
    streakDays: streakAt(sky.sessions, now),
    constellations: completedConstellations(deriveOtherSky(sky.sessions, sky.choices)),
  };
};
