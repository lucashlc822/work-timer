import { useEffect, useRef } from 'react';

interface Props {
  /** e.g. "12 minutes" — what will be credited if the user confirms. */
  focusedSoFar: string;
  onKeepGoing: () => void;
  onConfirm: () => void;
}

/**
 * The one way a session can fail, so it asks first.
 *
 * "Keep going" is the default focus and Escape means keep going: the safe
 * choice must be the easy one, and ending a session should take a deliberate
 * second click.
 */
export const CancelDialog = ({ focusedSoFar, onKeepGoing, onConfirm }: Props) => {
  const keepGoingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepGoingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onKeepGoing();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeepGoing]);

  return (
    <div className="bg-night-950/70 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-body"
        className="rounded-soft border-night-600 bg-night-800 w-full max-w-xs space-y-4 border p-5 text-center"
      >
        <h2 id="cancel-title" className="text-ink-primary text-lg">
          End this session early?
        </h2>
        <p id="cancel-body" className="text-ink-secondary text-sm">
          It will be saved as ended early, with the {focusedSoFar} you have focused so far. It
          won&rsquo;t become a star.
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={keepGoingRef}
            type="button"
            onClick={onKeepGoing}
            className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-5 py-2 text-sm transition-colors"
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-pill text-ink-muted hover:text-faded px-5 py-2 text-sm transition-colors"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
};
