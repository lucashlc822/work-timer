import { useRef } from 'react';

import type { SharedState } from '../domain/shared';
import type { SkyState } from '../domain/types';
import { useElementSize } from '../hooks/useElementSize';
import { useEquippedTheme } from '../hooks/useEquippedTheme';
import { useSky } from '../hooks/useSky';
import { AmbientCanvas } from './AmbientCanvas';
import { ConstellationLayer, type SkyMode } from './ConstellationLayer';

/**
 * A night sky filling the window: the ambient field in `themeKey`, with the
 * given constellations over it. Pure — it draws whatever sky it is handed, so
 * it can show a friend's sky as readily as your own.
 *
 * In `hero` mode it is pure backdrop and ignores the pointer, so the timer
 * above it stays fully clickable. In `full` mode the earned stars become
 * hoverable and focusable.
 */
export const SkyView = ({
  sky,
  themeKey,
  mode,
  shared,
  focusId,
}: {
  sky: SkyState | undefined;
  themeKey: string | undefined;
  mode: SkyMode;
  /** Shared constellations to draw alongside (M7 phase 5). */
  shared?: readonly SharedState[];
  /** In hero mode, the shared one the next session is for. */
  focusId?: string | null;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);

  return (
    <div ref={ref} className={`fixed inset-0 ${mode === 'full' ? '' : 'pointer-events-none'}`}>
      <AmbientCanvas themeKey={themeKey} />
      {sky !== undefined && width > 0 && (
        <ConstellationLayer
          sky={sky}
          mode={mode}
          width={width}
          height={height}
          {...(shared !== undefined && { shared })}
          {...(focusId !== undefined && { focusId })}
        />
      )}
    </div>
  );
};

/**
 * Your own sky, live from this device's store, behind everything else, with
 * your shared constellations (from the server, through `app/`) beside it.
 */
export const SkyBackdrop = ({
  mode,
  shared,
  focusId,
}: {
  mode: SkyMode;
  shared?: readonly SharedState[];
  focusId?: string | null;
}) => (
  <SkyView
    sky={useSky()}
    themeKey={useEquippedTheme()}
    mode={mode}
    {...(shared !== undefined && { shared })}
    {...(focusId !== undefined && { focusId })}
  />
);
