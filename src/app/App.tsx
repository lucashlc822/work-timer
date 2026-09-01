import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';
import { MiniWindow } from './MiniWindow';
import { UpdatePrompt } from './UpdatePrompt';
import { router } from './router';

/**
 * Which surface this window is showing.
 *
 * Read once at module load rather than reactively: an OS window never changes
 * what it is, and treating it as state would invite re-render bugs for no gain.
 */
const isMiniWindow = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('window') === 'mini';

export const App = () =>
  isMiniWindow() ? (
    <ErrorBoundary>
      <MiniWindow />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </ErrorBoundary>
  );
