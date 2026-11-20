/** Room to leave between the popover and the window's edge. */
export const EDGE_GAP = 12;
/** The gap between the pill and the popover (Tailwind `mt-2`). */
export const TRIGGER_GAP = 8;

export interface Placement {
  side: 'below' | 'above';
  /** Tallest the popover may be on that side; it scrolls inside beyond it. */
  maxHeight: number;
}

/**
 * Which side of its pill the tag popover opens on (UI review M3). It prefers
 * below, and goes above only when it doesn't fit below and there is more room
 * above; either way its height is capped to the room on that side so it never
 * runs off the window (it scrolls inside instead).
 */
export const placePopover = ({
  triggerTop,
  triggerBottom,
  windowHeight,
  contentHeight,
}: {
  triggerTop: number;
  triggerBottom: number;
  windowHeight: number;
  contentHeight: number;
}): Placement => {
  const below = windowHeight - triggerBottom - TRIGGER_GAP - EDGE_GAP;
  const above = triggerTop - TRIGGER_GAP - EDGE_GAP;
  const side = contentHeight <= below || below >= above ? 'below' : 'above';
  const room = Math.max(0, Math.floor(side === 'below' ? below : above));
  return { side, maxHeight: room };
};
