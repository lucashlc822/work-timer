/**
 * How visible a constellation's engraved figure is. With no stars it is barely
 * there; each star makes it clearer, the first ones most; once the
 * constellation is complete it is fully drawn. A figure with no hand-drawn art
 * gets a fainter dotted outline on the same curve.
 */

export const ART_MIN = 0.04;
export const ART_RANGE = 0.18;
export const ART_COMPLETE = 0.3;
export const OUTLINE_MIN = 0.03;
export const OUTLINE_RANGE = 0.09;
export const OUTLINE_COMPLETE = 0.16;

/** Quick at first, easing off: the first stars change it most. */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 2;

export const artOpacity = (fill: number, complete: boolean): number =>
  complete ? ART_COMPLETE : ART_MIN + ART_RANGE * easeOut(fill);

export const outlineOpacity = (fill: number, complete: boolean): number =>
  complete ? OUTLINE_COMPLETE : OUTLINE_MIN + OUTLINE_RANGE * easeOut(fill);
