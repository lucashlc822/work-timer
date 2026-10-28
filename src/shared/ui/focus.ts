import { useEffect, useState, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The dialogs using this render no hidden controls, so no visibility check.
const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

/** Nothing has focus: it fell to the page when the focused element went away. */
const focusIsLost = () =>
  document.activeElement === null || document.activeElement === document.body;

/**
 * Modal focus for a dialog: moves focus to `initial` on open, keeps Tab and
 * Shift+Tab cycling inside `container`, and on close hands focus back to
 * whatever had it before (the button that opened the dialog) — but only if
 * focus was lost with the dialog, and the opener is still on the page.
 *
 * The opener is captured during the first render, before any effect moves
 * focus, so StrictMode's double effect run can't mistake `initial` for it.
 */
export const useDialogFocus = (
  container: RefObject<HTMLElement | null>,
  initial: RefObject<HTMLElement | null>,
) => {
  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    initial.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = container.current;
      if (e.key !== 'Tab' || root === null) return;
      const items = focusables(root);
      const first = items[0];
      const last = items.at(-1);
      if (first === undefined || last === undefined) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const inside = active !== null && root.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected === true && focusIsLost()) opener.focus();
    };
  }, [container, initial, opener]);
};

/**
 * Focuses `target` when it appears (or `when` turns true) if nothing else has
 * focus — typically because the button just pressed was replaced by the next
 * screen (Start → the countdown, End early → the result). Never takes focus
 * from an element that still has it.
 */
export const useFocusIfLost = (target: RefObject<HTMLElement | null>, when = true) => {
  useEffect(() => {
    if (when && focusIsLost()) target.current?.focus();
  }, [target, when]);
};
