import { Link } from 'react-router-dom';

export const NotFoundRoute = () => (
  <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 className="text-ink-primary text-xl">Nothing out here.</h1>
    <p className="text-ink-secondary max-w-xs text-sm">That page is not part of this sky.</p>
    <Link
      to="/"
      className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-6 py-2.5 text-sm transition-colors"
    >
      Back to the timer
    </Link>
  </main>
);
