import { useIsPresent } from 'motion/react';

/**
 * Whether this overlay is on screen to stay, as opposed to leaving (premium
 * motion PR 8). Call it in the component an `AnimatePresence` renders directly.
 */
export const useOverlayPresent = useIsPresent;
