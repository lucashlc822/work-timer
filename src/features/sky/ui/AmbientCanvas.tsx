import { useCallback, useEffect, useMemo, useRef } from 'react';

import { prefersReducedMotion, rngFromSeed } from '@/shared/lib';

import { ambientField, LAYER_DRIFT } from '../domain/ambient';
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
 */
export const AmbientCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nebulaRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useElementSize(canvasRef);
  const field = useMemo(ambientField, []);

  // Size the backing store and repaint the nebula whenever the viewport changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width === 0 || height === 0) return;
    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const nebula = document.createElement('canvas');
    nebula.width = Math.max(1, Math.round(width));
    nebula.height = Math.max(1, Math.round(height));
    const ctx = nebula.getContext('2d');
    if (ctx !== null) {
      ctx.globalCompositeOperation = 'lighter';
      const scale = Math.max(nebula.width, nebula.height);
      for (const puff of field.nebula) {
        const x = puff.x * nebula.width;
        const y = puff.y * nebula.height;
        const r = puff.radius * scale;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, rgba(puff.color, puff.alpha));
        gradient.addColorStop(0.5, rgba(puff.color, puff.alpha * 0.45));
        gradient.addColorStop(1, rgba(puff.color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      dither(ctx, nebula.width, nebula.height);
    }
    nebulaRef.current = nebula;
  }, [width, height, field]);

  const draw = useCallback(
    (elapsedMs: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas == null || ctx == null || width === 0) return;

      const ratio = pixelRatio();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (nebulaRef.current !== null) ctx.drawImage(nebulaRef.current, 0, 0, width, height);

      const minutes = elapsedMs / 60_000;
      for (const star of field.stars) {
        const x = (((star.x - minutes * LAYER_DRIFT[star.layer]) % 1) + 1) % 1;
        const twinkle =
          0.7 +
          0.3 * Math.sin((elapsedMs / star.twinklePeriodMs) * Math.PI * 2 + star.twinklePhase);
        const px = x * width;
        const py = star.y * height;

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
    },
    [width, height, field],
  );

  useFrameLoop(draw, width > 0);

  // The loop draws only once under reduced motion, so repaint on resize.
  useEffect(() => {
    if (prefersReducedMotion()) draw(0);
  }, [draw]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
};
