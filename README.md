# Starkeep

A focus timer in the spirit of Forest, themed as a soft pastel night sky:
commit to a block of focused time, and every session you finish becomes a
star. Personal project.

A **Tauri desktop app** for Windows (macOS kept possible), with a browser
build from the same codebase. The timer keeps running whatever you do with the
window — the only way to fail a session is to cancel it yourself.

> The repository is still named `work-timer`. The product name is **not
> final** — it lives in `brand.mjs` and nowhere else, so renaming the app is a
> one-line edit.

## Running it locally

```bash
npm install
npm run tauri:dev
```

For the browser build, `npm run dev` — no Rust needed.

No environment variables are required. The app is local-first: it runs
entirely against IndexedDB with no backend and no account. (Accounts and cloud
sync arrive in M5; see `.env.example`.)

### Desktop prerequisites

`tauri:dev` and `tauri:build` need a Rust toolchain and the MSVC C++ build
tools. Everything else — the browser build, the tests, lint — works without
them.

```bash
winget install --id Rustlang.Rustup -e
```

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

The first `cargo` build downloads a few hundred crates and takes several
minutes. After that, builds are incremental.

### Commands

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm run tauri:dev`  | The desktop app, with hot reload                                  |
| `npm run tauri:build`| Produce a Windows installer                                       |
| `npm run dev`        | The browser build                                                 |
| `npm run build`      | Typecheck, then build the web bundle (service worker included)    |
| `npm run preview`    | Serve the built web app — needed to exercise the service worker, which is off in dev |
| `npm test`           | Unit suite                                                        |
| `npm run lint`       | ESLint, including the architectural boundary rules                |
| `npm run icons`      | Regenerate all app icons from `scripts/generate-icons.mjs`        |

## How the code is organised

Feature-sliced, enforced by lint rather than convention:

```
src/
  app/        providers, router, error boundary, window surfaces
  features/   one directory per feature, each with a public index.ts
  shared/
    runtime/  the desktop/browser capability seam
    db/       Dexie schema and helpers
    lib/      clock, ids, browser feature detection
    config/   product identity
  styles/     design tokens
src-tauri/    the Rust shell: tray, windows, single instance
```

Three rules do the structural work:

1. Features are opaque to each other — import `@/features/<name>`, never a file
   inside it. Enforced by `no-restricted-imports`.
2. `shared/` never imports from `features/` or `app/`. Also enforced.
3. **Nothing outside `shared/runtime/` asks which host it is running in.**
   Feature code takes a `Runtime` and calls its ports; capabilities the
   browser lacks are silent no-ops rather than errors.

Domain logic (the timer machine, the sky generator, streak and currency math)
is pure TypeScript with no React imports, so it is testable without a DOM.

## Things worth knowing before you debug

- **Elapsed time is always computed from timestamps, never from counting
  `setInterval` ticks.** Browsers throttle intervals in hidden tabs, so tick
  counting under-reports. It is also what makes the timer survive the window
  being closed: there is no clock to keep alive. See `src/shared/lib/clock.ts`.
- **The desktop app and browser build have separate IndexedDB stores.**
  Different origins. Data does not cross between them.
- **Extra windows use `?window=mini`, not a route.** A packaged Tauri app
  serves the frontend over an asset protocol with no `index.html` fallback, so
  a client-side path would 404 in production while working fine in dev.
- **All app icons are generated, not drawn.** `scripts/generate-icons.mjs`
  encodes PNGs and the Windows `.ico` directly, with zero dependencies. CI
  fails if committed output drifts from the generator.
- **Tests default to the `node` environment.** Add a
  `// @vitest-environment jsdom` docblock only when a test genuinely needs a
  DOM — running everything under jsdom costs ~50s of setup per run.

## Where the real documentation lives

- **`CLAUDE.md`** — conventions, environment traps, and settled decisions.
- **`NOTES.md`** — the running session log. Authority on current state.
- **`docs/plans/`** — kept plans. Note the 2026-08-30 architecture plan is
  partly superseded; it carries a banner saying which parts.
