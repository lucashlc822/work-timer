import { RouterProvider } from 'react-router-dom';

import { readLastUserId } from '@/shared/backend';
import { bindAccountDb } from '@/shared/db';

import { AuthGate } from './AuthGate';
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

/**
 * The mini window shows the signed-in account's running session and nothing
 * else. It never talks to the server: it opens the same local store as the
 * main window, named by the account the main window signed in.
 */
let miniAccount: string | null | undefined;

const MiniSurface = () => {
  // Bound once per window load, like the main window's gate.
  if (miniAccount === undefined) {
    miniAccount = readLastUserId();
    if (miniAccount !== null) bindAccountDb(miniAccount);
  }
  return miniAccount === null ? null : <MiniWindow />;
};

export const App = () =>
  isMiniWindow() ? (
    <ErrorBoundary>
      <MiniSurface />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
      <UpdatePrompt />
    </ErrorBoundary>
  );
