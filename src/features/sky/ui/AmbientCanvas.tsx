import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { STAR_CORE } from '../../../../design-tokens.mjs';
import { onReducedMotionChange, prefersReducedMotion, rngFromSeed } from '@/shared/lib';

import { ambientField, LAYER_DRIFT } from '../domain/ambient';
import {
  easeToward,
  meteorAt,
  meteorSegment,
  milkyWay,
  PARALLAX_NEBULA_PX,
  PARALLAX_PX,
  pointerOffset,
} from '../domain/livingSky';
import { skyThemeFor } from '../domain/skyThemes';
import { useElementSize } from '../hooks/useElementSize';
import { useFrameLoop } from '../hooks/useFrameLoop';

/** Device pixel ratio, capped at 2: beyond that the cost rises and nobody can see it. */
const pixelRatio = (): number => Math.min(2, window.devicePixelRatio || 1);

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Break up gradient banding. A gradient this faint spans only a few 8-bit
 * steps, which shows as visible rings; a little noise hides the steps. Seeded,
 * because nothing drawn may use `Math.random`.
 */
const dither = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const rng = rngFromSeed('starkeep-dither');
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const n = (rng() - 0.5) * 3;
    data[i] = data[i]! + n;
    data[i + 1] = data[i + 1]! + n;
    data[i + 2] = data[i + 2]! + n;
  }
  ctx.putImageData(image, 0, 0);
};

/**
 * The ambient night sky: drifting, twinkling background stars over pastel
 * nebulae. Canvas 2D, because it is hundreds of particles that need no
 * interaction or accessibility — the earned stars are SVG, above it.
 *
 * The nebula never changes, so it is painted once per resize into an
 * offscreen canvas and blitted each frame. Only the stars are drawn per frame.
 *
 * The Milky Way (View sky upgrade PR 7) is painted into that same offscreen
 * canvas, so it costs nothing per frame and shows behind the timer too. In
 * `living` mode (the full sky only) the layers also shift a few pixels with the
 * pointer and an occasional shooting star crosses; both are off under reduced
 * motion, and `calm` (the backdrop behind a running timer) adds no per-frame
 * work at all.
 */
export type AmbientMotion = 'calm' | 'living';

/** The nebula canvas is this much larger than the sky on every side. */
const NEBULA_PAD = PARALLAX_NEBULA_PX;

export const AmbientCanvas = ({
  themeKey,
  motion = 'calm',
}: {
  themeKey: string | undefined;
  motion?: AmbientMotion;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nebulaRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useElementSize(canvasRef);
  const field = useMemo(() => ambientField(themeKey), [themeKey]);
  const band = useMemo(() => milkyWay(themeKey), [themeKey]);
  const theme = skyThemeFor(themeKey);

  // Whether the person asked for less motion, kept live: it switches the extras off at once.
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => onReducedMotionChange(() => setReduced(prefersReducedMotion())), []);
  const living = motion === 'living' && !reduced;

  // Where the pointer is, and where the layers currently are on their way to it.
  const pointer = useRef({ tx: 0, ty: 0, x: 0, y: 0 });
  // When this sky started being lived in: shooting stars are timed from here.
  const livingSince = useRef<number | null>(null);

  useEffect(() => {
    if (!living) {
      pointer.current = { tx: 0, ty: 0, x: 0, y: 0 };
      livingSince.current = null;
      return;
    }
    const move = (e: PointerEvent) => {
      pointer.current.tx = pointerOffset(e.clientX, window.innerWidth);
      pointer.current.ty = pointerOffset(e.clientY, window.innerHeight);
    };
    const leave = () => {
      pointer.current.tx = 0;
      pointer.current.ty = 0;
    };
    window.addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [living]);

  // Size the backing store and repaint the nebula whenever the viewport changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width === 0 || height === 0) return;
    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    // A pixel larger each way than the sky, so the depth shift can move it a
    // whole pixel without showing an edge, and it is always copied unscaled.
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const nebula = document.createElement('canvas');
    nebula.width = w + 2 * NEBULA_PAD;
    nebula.height = h + 2 * NEBULA_PAD;
    const ctx = nebula.getContext('2d');
    if (ctx !== null) {
      // Everything below is placed as if the canvas were the sky itself.
      ctx.translate(NEBULA_PAD, NEBULA_PAD);
      // A themed ground sits under the clouds; `night` has none and shows the app's own.
      if (theme.ground !== null) {
        const ground = ctx.createLinearGradient(0, 0, 0, h);
        ground.addColorStop(0, theme.ground[0]);
        ground.addColorStop(1, theme.ground[1]);
        ctx.fillStyle = ground;
        ctx.fillRect(-NEBULA_PAD, -NEBULA_PAD, nebula.width, nebula.height);
      }
      ctx.globalCompositeOperation = 'lighter';
      const scale = Math.max(w, h);
      for (const puff of field.nebula) {
        const x = puff.x * w;
        const y = puff.y * h;
        const r = puff.radius * scale;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, rgba(puff.color, puff.alpha));
        gradient.addColorStop(0.5, rgba(puff.color, puff.alpha * 0.45));
        gradient.addColorStop(1, rgba(puff.color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // The Milky Way: soft clouds along a band, then fine grains of starlight in it.
      for (const puff of band.puffs) {
        const x = puff.x * w;
        const y = puff.y * h;
        const r = puff.radius * scale;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, rgba(puff.color, puff.alpha));
        gradient.addColorStop(0.5, rgba(puff.color, puff.alpha * 0.45));
        gradient.addColorStop(1, rgba(puff.color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (const g of band.grain) {
        ctx.fillStyle = rgba(g.color, g.alpha);
        ctx.beginPath();
        ctx.arc(g.x * w, g.y * h, g.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      dither(ctx, nebula.width, nebula.height);
    }
    nebulaRef.current = nebula;
  }, [width, height, field, band, theme]);

  const draw = useCallback(
    (elapsedMs: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas == null || ctx == null || width === 0) return;

      const ratio = pixelRatio();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The layers glide toward where the pointer is, the far ones barely moving.
      const p = pointer.current;
      if (living) {
        p.x = easeToward(p.x, p.tx);
        p.y = easeToward(p.y, p.ty);
      }
      if (nebulaRef.current !== null) {
        // An unscaled copy: resampling a full-screen image 24 times a second is
        // what the first version of this paid for. The shift is a whole pixel at
        // most, which is all that the farthest layer ever moved.
        const dx = living ? Math.round(-p.x * PARALLAX_NEBULA_PX) : 0;
        const dy = living ? Math.round(-p.y * PARALLAX_NEBULA_PX) : 0;
        ctx.drawImage(nebulaRef.current, dx - NEBULA_PAD, dy - NEBULA_PAD);
      }

      const minutes = elapsedMs / 60_000;
      for (const star of field.stars) {
        const x = (((star.x - minutes * LAYER_DRIFT[star.layer]) % 1) + 1) % 1;
        const twinkle =
          0.7 +
          0.3 * Math.sin((elapsedMs / star.twinklePeriodMs) * Math.PI * 2 + star.twinklePhase);
        const px = x * width - (living ? p.x * PARALLAX_PX[star.layer] : 0);
        const py = star.y * height - (living ? p.y * PARALLAX_PX[star.layer] : 0);

        ctx.globalAlpha = star.alpha * twinkle;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(px, py, star.radius, 0, Math.PI * 2);
        ctx.fill();

        // A faint halo on the nearest layer only: the cheapest bloom there is.
        if (star.layer === 2) {
          ctx.globalAlpha = star.alpha * twinkle * 0.18;
          ctx.beginPath();
          ctx.arc(px, py, star.radius * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // An occasional shooting star, timed from when this sky was opened, so one
      // never appears the moment it is, and hiding the window cannot bunch them up.
      if (living) {
        livingSince.current ??= elapsedMs;
        const meteor = meteorAt(elapsedMs - livingSince.current);
        if (meteor !== null) {
          const { head, tail } = meteorSegment(meteor, width, height);
          const color = theme.starPalette?.core ?? STAR_CORE;
          const trail = ctx.createLinearGradient(tail[0], tail[1], head[0], head[1]);
          trail.addColorStop(0, rgba(color, 0));
          trail.addColorStop(1, rgba(color, 0.9 * meteor.alpha));
          ctx.strokeStyle = trail;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tail[0], tail[1]);
          ctx.lineTo(head[0], head[1]);
          ctx.stroke();
          ctx.globalAlpha = 0.6 * meteor.alpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(head[0], head[1], 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    },
    [width, height, field, living, theme],
  );

  useFrameLoop(draw, width > 0);

  // The loop draws only once under reduced motion, so repaint on resize.
  useEffect(() => {
    if (prefersReducedMotion()) draw(0);
  }, [draw]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
};
