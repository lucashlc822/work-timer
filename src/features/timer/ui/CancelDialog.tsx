import { useEffect, useRef, type ReactNode } from 'react';

import { useDialogFocus } from '@/shared/ui';
import { ModalBackdrop, ModalPanel, useOverlayPresent } from '@/shared/ui/motion';

interface Props {
  /** e.g. "12 minutes" — what will be credited if the user confirms. */
  focusedSoFar: string;
  /** For a Pomodoro block: stars the run has already earned, which it keeps. Null otherwise. */
  runStarsKept?: number | null;
  /** Extra words from the app (M7: "This ends it for Ada and Bea too."). */
  note?: ReactNode;
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
export const CancelDialog = ({
  focusedSoFar,
  runStarsKept = null,
  note,
  onKeepGoing,
  onConfirm,
}: Props) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepGoingRef = useRef<HTMLButtonElement>(null);
  const present = useOverlayPresent();
  useDialogFocus(dialogRef, keepGoingRef, present);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && present) onKeepGoing();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeepGoing, present]);

  return (
    <ModalBackdrop className="bg-night-950/80 fixed inset-0 z-40 flex items-center justify-center p-4">
      <ModalPanel
        ref={dialogRef}
        role="alertdialog"
        labelledBy="cancel-title"
        describedBy="cancel-body"
        className="rounded-soft border-night-600 bg-night-800 w-full max-w-xs space-y-4 border p-5 text-center"
      >
        <h2 id="cancel-title" className="text-ink-primary text-lg">
          End this session early?
        </h2>
        <p id="cancel-body" className="text-ink-secondary text-sm">
          It will be saved as ended early, with the {focusedSoFar} you have focused so far. It
          won&rsquo;t become a star.
          {runStarsKept !== null &&
            ` This also ends the Pomodoro run; its ${runStarsKept} ${runStarsKept === 1 ? 'star stays' : 'stars stay'}.`}
        </p>
        {note}
        <div className="flex flex-col gap-2">
          <button
            ref={keepGoingRef}
            type="button"
            onClick={onKeepGoing}
            className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 pressable px-5 py-2 text-sm"
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-pill text-ink-muted hover:text-faded pressable px-5 py-2 text-sm"
          >
            End session
          </button>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
};
