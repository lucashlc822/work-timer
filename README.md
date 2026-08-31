# work-timer

A focus timer in the spirit of Forest, themed as a soft pastel night sky:
commit to a block of focused time, and every session you finish becomes a
star. Personal project.

Built as an **installable PWA** — one codebase that runs as an app on an
iPhone home screen, as a windowed app on Windows, and in any browser. That is
also the only route to all three targets without paying: native iOS requires a
$99/year developer account and a Mac.

## Running it locally

```bash
npm install
npm run dev
```

No environment variables are needed. The app is local-first — it runs entirely
against IndexedDB with no backend and no account, so there is nothing to
configure. (Accounts and cloud sync arrive in M5; see `.env.example`.)

### Other commands

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run build`        | Typecheck, then build the PWA (service worker included) |
| `npm run preview`      | Serve the built app — needed to exercise the service worker, which is disabled in dev |
| `npm test`             | Run the unit suite                                  |
| `npm run lint`         | ESLint, including the architectural boundary rules  |
| `npm run icons`        | Regenerate the app icons from `scripts/generate-icons.mjs` |

### Testing on a phone

`npm run dev -- --host` exposes the dev server on the LAN. Service worker
behaviour (install, offline) needs `npm run build && npm run preview --host`
instead, since the worker is off in development.

## How the code is organised

Feature-sliced, and enforced by lint rather than convention:

```
src/
  app/        providers, router, error boundary
  features/   one directory per feature, each with a public index.ts
  shared/     db, sync, ui primitives, pure utilities
  styles/     design tokens
```

Two rules do the structural work, both enforced by `no-restricted-imports` in
`eslint.config.js`:

1. Features are opaque to each other — import `@/features/<name>`, never a file
   inside it.
2. `shared/` never imports from `features/` or `app/`.

Domain logic (the timer machine, the sky generator, streak and currency math)
is pure TypeScript with no React imports, so it is testable without a DOM.

## Things worth knowing before you debug

- **Elapsed time is always computed from timestamps, never from counting
  `setInterval` ticks.** Browsers throttle intervals in background tabs and iOS
  freezes JavaScript entirely when an installed PWA is backgrounded. See
  `src/shared/lib/clock.ts`.
- **The app icons are generated, not drawn.** `scripts/generate-icons.mjs`
  encodes PNGs directly with zero dependencies. CI fails if the committed
  output drifts from the generator.
- **Tests default to the `node` environment.** Add a
  `// @vitest-environment jsdom` docblock to files that need a DOM; running
  everything under jsdom cost ~50s of setup for tests that never touch it.

## Where the real documentation lives

- **`CLAUDE.md`** — conventions and environment traps.
- **`NOTES.md`** — the running session log. Authority on current state.
- **`docs/plans/`** — plans copied here when worth keeping as a record (not
  every plan needs to be — most live and die in a single session).
