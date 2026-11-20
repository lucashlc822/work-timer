import { m, useIsPresent, useReducedMotion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';

import { TRANSITIONS } from './transitions';

/**
 * The dimmed backdrop of a modal dialog: fades in and out. No backdrop blur: a
 * blur over a moving sky recomposited every frame, and fading one is slow. The
 * one leaving is inert and hidden from assistive technology.
 */
export const ModalBackdrop = ({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) => {
  const present = useIsPresent();
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: TRANSITIONS.enter }}
      exit={{ opacity: 0, transition: TRANSITIONS.exit }}
      inert={!present}
      aria-hidden={present ? undefined : true}
      className={className}
    >
      {children}
    </m.div>
  );
};

/** The dialog itself: rises from 0.96, and leaves a touch faster. */
export const ModalPanel = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className: string;
    role: 'dialog' | 'alertdialog';
    labelledBy: string;
    describedBy?: string;
  }
>(({ children, className, role, labelledBy, describedBy }, ref) => {
  // Reduced motion: a fade, never a scale. Decided here, not left to the
  // library's own switch, so it holds from the very first frame.
  const reduced = useReducedMotion() === true;
  return (
    <m.div
      ref={ref}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      initial={{ opacity: 0, ...(!reduced && { scale: 0.96 }) }}
      animate={{ opacity: 1, ...(!reduced && { scale: 1 }), transition: TRANSITIONS.enter }}
      exit={{ opacity: 0, ...(!reduced && { scale: 0.96 }), transition: TRANSITIONS.exit }}
      className={className}
    >
      {children}
    </m.div>
  );
});
ModalPanel.displayName = 'ModalPanel';

/**
 * A popover opening from its trigger: scales from 0.95 about its top edge
 * (where the trigger is), leaves faster. `className` positions it.
 */
export const PopoverPanel = ({
  children,
  className,
  id,
  label,
  origin = 'top center',
  maxHeight,
}: {
  children: ReactNode;
  className: string;
  id: string;
  label: string;
  /** Where it grows from: the edge that touches its trigger. */
  origin?: 'top center' | 'bottom center';
  /** Tallest it may be, in px; it scrolls inside beyond that. */
  maxHeight?: number;
}) => {
  const present = useIsPresent();
  const reduced = useReducedMotion() === true;
  return (
    <m.div
      id={id}
      role="dialog"
      aria-label={label}
      inert={!present}
      aria-hidden={present ? undefined : true}
      initial={{ opacity: 0, ...(!reduced && { scale: 0.95 }) }}
      animate={{ opacity: 1, ...(!reduced && { scale: 1 }), transition: TRANSITIONS.enter }}
      exit={{ opacity: 0, ...(!reduced && { scale: 0.95 }), transition: TRANSITIONS.exit }}
      style={
        maxHeight === undefined
          ? { transformOrigin: origin }
          : { transformOrigin: origin, maxHeight }
      }
      className={className}
    >
      {children}
    </m.div>
  );
};

/** A notice along the bottom of the window: rises 8 px as it fades in, and settles out. */
export const ToastPanel = ({ children, className }: { children: ReactNode; className: string }) => {
  const present = useIsPresent();
  const reduced = useReducedMotion() === true;
  return (
    <m.div
      role="status"
      inert={!present}
      initial={{ opacity: 0, ...(!reduced && { y: 8 }) }}
      animate={{ opacity: 1, ...(!reduced && { y: 0 }), transition: TRANSITIONS.enter }}
      exit={{ opacity: 0, ...(!reduced && { y: 8 }), transition: TRANSITIONS.exit }}
      className={className}
    >
      {children}
    </m.div>
  );
};
