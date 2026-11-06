// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FriendSky } from '../domain/friendSky';
import { FriendSkyView } from './FriendSkyView';

const sky: FriendSky = {
  displayName: 'Ada',
  themeKey: null,
  sessions: [],
  choices: [],
};

vi.mock('../hooks/useFriendSky', () => ({
  useFriendSky: () => ({ state: { kind: 'ready', sky }, retry: () => undefined }),
}));

let headerHeight = 0;
beforeEach(() => {
  headerHeight = 0;
  // jsdom lays nothing out: give the header a height to measure.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => headerHeight);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const view = (renderSky: Parameters<typeof FriendSkyView>[0]['renderSky']) =>
  render(
    <FriendSkyView
      friendId="f1"
      name="Ada"
      renderSky={renderSky}
      summarize={() => ({
        focusThisWeek: '0 min',
        starsThisWeek: 0,
        streakDays: 0,
        constellations: 0,
      })}
      status={null}
      now={0}
    />,
  );

describe('FriendSkyView', () => {
  it('tells the sky how much of its top the header covers, before drawing it', () => {
    headerHeight = 187;
    const renderSky = vi.fn(() => <p>the sky</p>);

    view(renderSky);

    expect(screen.getByText('the sky')).not.toBeNull();
    // Never drawn with a guess: every call carries the measured height.
    expect(renderSky).toHaveBeenCalled();
    for (const call of renderSky.mock.calls as unknown as [FriendSky, { reserveTop: number }][]) {
      expect(call[1]).toEqual({ reserveTop: 187 });
    }
    expect(screen.getByRole('heading', { name: "Ada's sky" })).not.toBeNull();
  });
});
