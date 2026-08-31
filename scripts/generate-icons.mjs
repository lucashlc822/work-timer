/**
 * Procedural app-icon generator.
 *
 * Draws the app icon — a soft four-pointed star over a pastel nebula — and
 * encodes it straight to PNG with zero dependencies. Same philosophy as the
 * in-app sky: the art is code, so it is reproducible, licence-free, and
 * regenerates at any size instead of being a binary blob nobody can edit.
 *
 * Run with `npm run icons`. Outputs are committed, so a normal build and CI
 * never need to run this.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LAVENDER_300, NIGHT_900, STAR_WARM } from '../design-tokens.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// --- tiny colour helpers ----------------------------------------------------

/** @param {string} hex @returns {[number, number, number]} */
const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Blend `src` over `dst` with alpha `a` (0..1), in sRGB. */
const over = (dst, src, a) => [
  dst[0] + (src[0] - dst[0]) * a,
  dst[1] + (src[1] - dst[1]) * a,
  dst[2] + (src[2] - dst[2]) * a,
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth 0..1 ramp between edges, used for soft-edged shapes. */
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG, so the sprinkled background stars never move between runs. */
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** @param {Uint8Array} rgba Raw RGBA, `size * size * 4` bytes. */
const encodePng = (rgba, size) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12 stay zero: deflate compression, adaptive filtering, no interlace

  // Each scanline is prefixed with its filter byte. Filter 0 (None) keeps the
  // encoder trivial; these images are small and deflate handles them well.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// --- the icon itself --------------------------------------------------------

const NIGHT = rgb(NIGHT_900);
const LAVENDER = rgb(LAVENDER_300);
const WARM = rgb(STAR_WARM);
const ROSE = rgb('#f3b8d4');
const CORE = rgb('#fffdf8');

/**
 * @param {number} size
 * @param {number} inset Fraction of the canvas kept clear around the star.
 *   Maskable icons need a generous margin because launchers crop to a circle.
 */
const drawIcon = (size, inset) => {
  const px = new Uint8Array(size * size * 4);
  const c = size / 2;
  const rand = mulberry32(0x5eed);

  // Pre-roll the background sparkles so they are independent of pixel order.
  const sparkles = Array.from({ length: 28 }, () => ({
    x: rand() * size,
    y: rand() * size,
    r: 0.004 * size + rand() * 0.009 * size,
    a: 0.25 + rand() * 0.5,
    warm: rand(),
  }));

  const starRadius = c * (1 - inset);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy) / c;

      let colour = NIGHT;

      // Two offset nebula blobs. Low alpha, wide falloff — this is what stops
      // the background reading as flat black.
      const nebA = Math.exp(
        -(((x - size * 0.32) ** 2 + (y - size * 0.3) ** 2) / (0.16 * size * size)),
      );
      const nebB = Math.exp(
        -(((x - size * 0.72) ** 2 + (y - size * 0.74) ** 2) / (0.13 * size * size)),
      );
      colour = over(colour, LAVENDER, nebA * 0.3);
      colour = over(colour, ROSE, nebB * 0.22);

      // Background sparkles, behind the main star.
      for (const s of sparkles) {
        const d = Math.hypot(x - s.x, y - s.y);
        const glow = Math.exp(-((d / s.r) ** 2));
        if (glow > 0.004) {
          colour = over(colour, s.warm > 0.5 ? WARM : rgb('#d6e8ff'), glow * s.a);
        }
      }

      // Halo around the hero star.
      colour = over(colour, LAVENDER, Math.exp(-((dist / 0.42) ** 2)) * 0.55);

      // Four-pointed star. An astroid (|u|^p + |v|^p = 1 with p < 1) is
      // naturally concave, which is exactly the classic sparkle silhouette —
      // no path data or asset needed.
      const p = 0.5;
      const u = Math.abs(dx) / starRadius;
      const v = Math.abs(dy) / starRadius;
      const f = (Math.abs(u) ** p + Math.abs(v) ** p) ** (1 / p);
      const body = smoothstep(1.0, 0.55, f);
      colour = over(colour, WARM, body * 0.95);

      // Hot core, so the centre reads as light rather than paint.
      colour = over(colour, CORE, Math.exp(-((dist / 0.1) ** 2)) * 0.95);

      const i = (y * size + x) * 4;
      px[i] = Math.round(clamp01(colour[0] / 255) * 255);
      px[i + 1] = Math.round(clamp01(colour[1] / 255) * 255);
      px[i + 2] = Math.round(clamp01(colour[2] / 255) * 255);
      px[i + 3] = 255; // fully opaque: iOS and maskable icons must not be transparent
    }
  }

  return encodePng(px, size);
};

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, 0.28],
  ['icon-512.png', 512, 0.28],
  // Maskable icons get cropped to a circle/squircle by the launcher, so the
  // star has to sit well inside the 80% safe zone.
  ['icon-maskable-512.png', 512, 0.42],
  // iOS applies its own corner rounding to the apple-touch-icon.
  ['apple-touch-icon.png', 180, 0.3],
];

for (const [name, size, inset] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, inset));
  console.log(`wrote public/${name} (${size}x${size})`);
}
