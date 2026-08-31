import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a white screen.
 *
 * This matters more than usual here: the app is installed to a home screen, so
 * a crash looks like a broken *app* rather than a broken tab, and there is no
 * visible address bar to reload from. The fallback therefore has to offer its
 * own way out.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately console-only for now. A real reporter lands with accounts
    // in M5; until then there is no backend to send anything to.
    console.error('Unhandled error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <h1 className="text-ink-primary text-xl">Something went out of orbit.</h1>
        <p className="text-ink-secondary max-w-xs text-sm">
          The app hit an unexpected error. Your saved sessions are stored on this device and are
          safe.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-6 py-2.5 transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
