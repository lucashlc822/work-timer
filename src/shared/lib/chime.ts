/**
 * The completion chime: a soft, bell-like tone made in code (session-complete
 * redesign, PR 4). No audio file, so there is nothing to download, the offline
 * web build and the desktop app play it the same, and the CSP (`default-src
 * 'self'`) stays closed.
 *
 * Three sine partials, the way a struck bell rings: a fundamental, a fifth
 * above an octave up, and an inharmonic upper one (about 2.76x, a bell's
 * "hum-to-tierce" colour) that dies away fastest. A 5 ms attack so it never
 * clicks, then an exponential fade over about 2.5 s at a low peak: gentle, not
 * a beep.
 *
 * The `AudioContext` is made when the chime plays and closed shortly after,
 * never kept open: an open context keeps an audio stream alive, and on Windows
 * that can stop the machine from sleeping through a 25-minute session. It
 * needs no "unlock" on Start, because a browser lets audio play once the page
 * has had any user activation, and `navigator.userActivation.hasBeenActive`
 * says so; where it doesn't, or after a relaunch that hasn't been clicked yet,
 * the chime is silently skipped, as the autoplay policy would mute it anyway.
 */

/** The partials: [frequency Hz, relative level, fade seconds]. */
const PARTIALS = [
  [880, 1, 2.6],
  [1320, 0.45, 1.9],
  [2430, 0.16, 1.1],
] as const;

const PEAK = 0.12;
const ATTACK_S = 0.005;
/** Longest fade plus a margin, then the context is closed. */
const CLOSE_AFTER_MS = 3_000;

type AudioContextCtor = new () => AudioContext;

const contextConstructor = (): AudioContextCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
};

/** Whether the page has had a click or key press: without one, browsers mute audio. */
const hasUserActivation = (): boolean => {
  const activation = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  // Where the API is missing (older engines) assume yes: the context just stays muted if not.
  return activation === undefined || activation.hasBeenActive;
};

/**
 * Plays the chime once. Returns whether it started: false with no Web Audio,
 * no user activation yet, or a failure. Never throws.
 */
export const playChime = (): boolean => {
  const Ctor = contextConstructor();
  if (Ctor === undefined || !hasUserActivation()) return false;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = PEAK;
    master.connect(ctx.destination);
    for (const [frequency, level, fade] of PARTIALS) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level, now + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + fade + 0.05);
    }
    void ctx.resume?.();
    setTimeout(() => void ctx.close?.(), CLOSE_AFTER_MS);
    return true;
  } catch {
    return false;
  }
};
