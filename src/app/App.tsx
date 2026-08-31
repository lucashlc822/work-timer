import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';
import { UpdatePrompt } from './UpdatePrompt';
import { router } from './router';

export const App = () => (
  <ErrorBoundary>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </ErrorBoundary>
);
