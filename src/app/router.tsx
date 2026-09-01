import { createBrowserRouter } from 'react-router-dom';

import { HomeRoute } from './routes/HomeRoute';
import { NotFoundRoute } from './routes/NotFoundRoute';

/**
 * Routes are declared centrally rather than co-located with features, so the
 * navigable surface of the app can be read in one place. Feature modules
 * export screens; this file decides where they live.
 */
export const router = createBrowserRouter([
  { path: '/', element: <HomeRoute /> },
  { path: '*', element: <NotFoundRoute /> },
]);
