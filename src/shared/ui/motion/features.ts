// The animation features Motion loads on demand. Kept in its own module so the
// bundler splits it into a chunk that arrives after first paint (MotionRoot).
// `domAnimation` (animate, exit, gestures) rather than `domMax`: domMax adds
// layout animation for another ~16 kB gzipped, which only the shared-element
// page transition needs. Switch to `domMax` in that change, not before.
export { domAnimation as default } from 'motion/react';
