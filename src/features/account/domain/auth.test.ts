import { describe, expect, it } from 'vitest';

import {
  classifyAuthError,
  isCompleteCode,
  isLongEnoughPassword,
  isPlausibleEmail,
  normalizeCode,
  normalizeEmail,
} from './auth';

describe('input checks', () => {
  it('normalises and loosely checks emails', () => {
    expect(normalizeEmail('  Friend@Example.COM ')).toBe('friend@example.com');
    expect(isPlausibleEmail('friend@example.com')).toBe(true);
    expect(isPlausibleEmail('friend@example')).toBe(false);
    expect(isPlausibleEmail('not an email')).toBe(false);
  });

  // Case 2: a 7-character password is refused before anything is sent.
  it('requires at least 8 characters of password', () => {
    expect(isLongEnoughPassword('1234567')).toBe(false);
    expect(isLongEnoughPassword('12345678')).toBe(true);
  });

  it('accepts a pasted code with spaces or dashes', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('123-4567')).toBe('123456');
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode(' 123456 ')).toBe(true);
  });
});

describe('classifyAuthError', () => {
  it.each([
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'unreachable'],
    [
      { name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' },
      'unreachable',
    ],
    // Exactly what supabase-js returned for an uninvited sign-up on the local stack.
    [
      { name: 'AuthRetryableFetchError', status: 500, message: 'Database error saving new user' },
      'notInvited',
    ],
    [{ name: 'AuthRetryableFetchError', status: 500, message: 'Internal error' }, 'unknown'],
    [
      { status: 500, code: 'unexpected_failure', message: 'Database error saving new user' },
      'notInvited',
    ],
    [
      { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
      'wrongCredentials',
    ],
    [
      { status: 400, code: 'email_not_confirmed', message: 'Email not confirmed' },
      'emailNotConfirmed',
    ],
    [{ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }, 'badCode'],
    [
      { status: 422, code: 'weak_password', message: 'Password should be at least 8 characters' },
      'weakPassword',
    ],
    [{ status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' }, 'rateLimited'],
    [{ status: 500, message: 'something new' }, 'unknown'],
  ])('%o -> %s (device online)', (error, kind) => {
    expect(classifyAuthError(error, true)).toBe(kind);
  });

  it('says offline, not unreachable, when the device has no connection', () => {
    const noAnswer = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
    expect(classifyAuthError(noAnswer, false)).toBe('offline');
    expect(classifyAuthError({ ...noAnswer, status: 503 }, false)).toBe('offline');
  });

  it('keeps answers that did arrive as they are when the device reports offline', () => {
    const wrong = {
      status: 400,
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    };
    expect(classifyAuthError(wrong, false)).toBe('wrongCredentials');
  });
});
