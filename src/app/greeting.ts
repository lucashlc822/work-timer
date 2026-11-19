/**
 * The home page's greeting, by the hour (0-23) of the person's own clock.
 * "Good morning" from 5, "Good afternoon" from 12, "Good evening" from 18
 * through the small hours: the app is a night sky, and "Good night" would read
 * as goodbye to someone just sitting down to work.
 */
export const greetingFor = (hour: number): string =>
  hour >= 5 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 18
      ? 'Good afternoon'
      : 'Good evening';

/** "Good evening, Lucas", or just "Good evening" with no name (offline, or none set). */
export const greeting = (hour: number, name: string | null | undefined): string => {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? greetingFor(hour) : `${greetingFor(hour)}, ${trimmed}`;
};
