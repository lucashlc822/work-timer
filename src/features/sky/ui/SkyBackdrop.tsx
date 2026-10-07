import { useRef } from 'react';

import { useElementSize } from '../hooks/useElementSize';
import { useSky } from '../hooks/useSky';
import { AmbientCanvas } from './AmbientCanvas';
import { ConstellationLayer, type SkyMode } from './ConstellationLayer';

/**
 * The whole night sky, filling the window behind everything else.
 *
 * In `hero` mode it is pure backdrop and ignores the pointer, so the timer
 * above it stays fully clickable. In `full` mode the earned stars become
 * hoverable and focusable.
 */
export const SkyBackdrop = ({ mode }: { mode: SkyMode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const sky = useSky();

  return (
    <div ref={ref} className={`fixed inset-0 ${mode === 'full' ? '' : 'pointer-events-none'}`}>
      <AmbientCanvas />
      {sky !== undefined && width > 0 && (
        <ConstellationLayer sky={sky} mode={mode} width={width} height={height} />
      )}
    </div>
  );
};
