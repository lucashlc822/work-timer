import { describe, expect, it } from 'vitest';

import type { TimerStatus } from '@/features/timer';

import { escapeGoesHome, initialPage, inProgress, pageOnStatusChange } from './navigation';

const ACTIVE: TimerStatus[] = [
  'starting',
  'running',
  'finishing',
  'finished',
  'onBreak',
  'breakOver',
  'runSummary',
];

describe('initialPage', () => {
  it('waits while the timer is loading', () => {
    expect(initialPage('loading', false)).toBeNull();
    expect(initialPage('loading', true)).toBeNull();
  });

  it('opens home when nothing is in progress', () => {
    expect(initialPage('idle', false)).toBe('home');
  });

  it.each(ACTIVE)('restores the timer page when %s', (status) => {
    expect(initialPage(status, false)).toBe('timer');
  });

  it('restores the timer page in a focus-together lobby', () => {
    expect(initialPage('idle', true)).toBe('timer');
  });
});

describe('pageOnStatusChange', () => {
  it('brings the timer forward when a session starts from home', () => {
    expect(pageOnStatusChange('home', 'idle', 'starting')).toBe('timer');
  });

  it('brings the timer forward when a session finishes while home', () => {
    expect(pageOnStatusChange('home', 'running', 'finishing')).toBe('timer');
    expect(pageOnStatusChange('home', 'onBreak', 'breakOver')).toBe('timer');
  });

  it('leaves you home while the status holds', () => {
    expect(pageOnStatusChange('home', 'running', 'running')).toBe('home');
  });

  it('never sends you home by itself', () => {
    expect(pageOnStatusChange('timer', 'finished', 'idle')).toBe('timer');
    expect(pageOnStatusChange('home', 'finished', 'idle')).toBe('home');
  });

  it('every in-progress status counts', () => {
    for (const s of ACTIVE) expect(inProgress(s)).toBe(true);
    expect(inProgress('idle')).toBe(false);
    expect(inProgress('loading')).toBe(false);
  });
});

describe('escapeGoesHome', () => {
  it('goes home from the idle timer page', () => {
    expect(escapeGoesHome('timer', 'idle', false)).toBe(true);
  });

  it.each(ACTIVE)('stays on the timer page when %s', (status) => {
    expect(escapeGoesHome('timer', status, false)).toBe(false);
  });

  it('stays in a lobby, and does nothing on home', () => {
    expect(escapeGoesHome('timer', 'idle', true)).toBe(false);
    expect(escapeGoesHome('home', 'idle', false)).toBe(false);
  });
});
