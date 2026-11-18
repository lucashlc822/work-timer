/**
 * Types for `design-tokens.mjs`.
 *
 * The source stays plain `.mjs` so the icon generator can run under bare Node
 * with no build step, while TypeScript consumers (the Vite config and the
 * drift test) still get real types.
 */
export declare const NIGHT_900: string;
export declare const LAVENDER_300: string;
export declare const STAR_WARM: string;
export declare const STAR_COOL: string;
export declare const STAR_CORE: string;
export declare const STAR_WHITE: string;
export declare const LAVENDER_400: string;
export declare const ROSE_300: string;
export declare const MINT_300: string;

type CubicBezier = readonly [number, number, number, number];
export declare const MOTION: {
  readonly duration: {
    readonly press: number;
    readonly quick: number;
    readonly enter: number;
    readonly exit: number;
    readonly panelIn: number;
    readonly panelOut: number;
    readonly pageIn: number;
    readonly pageOut: number;
    readonly stagger: number;
  };
  readonly ease: {
    readonly standard: CubicBezier;
    readonly enter: CubicBezier;
    readonly exit: CubicBezier;
  };
};
export declare const STAGGER_CAP_MS: number;
