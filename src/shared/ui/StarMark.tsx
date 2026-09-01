/**
 * The four-pointed star, for use inside the app.
 *
 * Deliberately not the same asset as `favicon.svg`. That one paints an opaque
 * rounded square behind the star, because a launcher icon needs its own
 * ground — but on a page that is already night-coloured, the same square
 * reads as a hard-edged box floating over the background. This draws the star
 * alone.
 *
 * Inline rather than an `<img>` so it reads the design tokens directly and
 * costs no extra request. The silhouette is an astroid, matching the shape
 * `scripts/generate-icons.mjs` produces procedurally for the app icons.
 */
export const StarMark = ({ size = 96, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient id="starmark-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--color-lavender-300)" stopOpacity="0.5" />
        <stop offset="60%" stopColor="var(--color-lavender-400)" stopOpacity="0.12" />
        <stop offset="100%" stopColor="var(--color-lavender-400)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="starmark-core" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--color-star-core)" />
        <stop offset="55%" stopColor="var(--color-star-warm)" />
        <stop offset="100%" stopColor="var(--color-star-warm)" stopOpacity="0.85" />
      </radialGradient>
    </defs>

    <circle cx="32" cy="32" r="30" fill="url(#starmark-halo)" />
    <path
      d="M32 4 C34 24 40 30 60 32 C40 34 34 40 32 60 C30 40 24 34 4 32 C24 30 30 24 32 4 Z"
      fill="url(#starmark-core)"
    />
  </svg>
);
