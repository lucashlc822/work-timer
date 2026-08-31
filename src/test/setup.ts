import '@testing-library/jest-dom/vitest';
// jsdom has no IndexedDB, so the real Dexie code paths are exercised against an
// in-memory implementation rather than being mocked out.
import 'fake-indexeddb/auto';

// jsdom does not implement matchMedia. `shared/lib/platform` already guards
// against its absence, but tests that render components need a real object to
// override, so provide a stub that reports "no, this does not match" by default.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
