import { describe, expect, it } from 'vitest';

import { friendStatus, friendStatusLine, type Presence } from './presence';

const NOW = new Date(2026, 10, 3, 15, 0).getTime();
const MIN = 60_000;
const online: Presence = { state: 'online', seenAt: NOW - MIN };
const away: Presence = { state: 'away', seenAt: NOW - MIN };
const focusing = { kind: 'focus' as const, startedAt: NOW - 7 * MIN, until: NOW + 18 * MIN };
const onBreak = { kind: 'break' as const, startedAt: NOW, until: NOW + 3 * MIN };

describe('friendStatus', () => {
  it('focus and breaks win over being online', () => {
    expect(friendStatus(focusing, online, NOW)).toBe('focusing');
    expect(friendStatus(onBreak, away, NOW)).toBe('break');
  });
  it('then online, away, and offline for nothing', () => {
    expect(friendStatus(null, online, NOW)).toBe('online');
    expect(friendStatus(null, away, NOW)).toBe('away');
    expect(friendStatus(null, null, NOW)).toBe('offline');
  });
  it('a focus block past its end no longer counts', () => {
    expect(friendStatus({ ...focusing, until: NOW }, online, NOW)).toBe('online');
    expect(friendStatus({ ...focusing, until: NOW }, null, NOW)).toBe('offline');
  });
});

describe('friendStatusLine', () => {
  it('says what they are doing, in words', () => {
    expect(friendStatusLine(focusing, online, null, NOW)).toBe('Focusing now · 18 min left');
    expect(friendStatusLine(onBreak, null, null, NOW)).toBe('On a break · 3 min left');
    expect(friendStatusLine(null, online, null, NOW)).toBe('Online');
    expect(friendStatusLine(null, away, null, NOW)).toBe('Away');
  });
  it('offline adds when they last focused', () => {
    expect(friendStatusLine(null, null, null, NOW)).toBe('Offline · Not focused yet');
    expect(friendStatusLine(null, null, NOW - 2 * 60 * MIN, NOW)).toBe('Offline · Focused today');
  });
});
