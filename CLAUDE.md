# work-timer (product name: Starkeep)

## What this is

A focused-work timer app in the spirit of Forest — the user sets a timer to
work, and lets it run instead of picking up other apps. Themed as a soft
pastel night sky: each completed session becomes a star, and accumulated
sessions form constellations. Personal project; more features may get added
as they're decided on.

**The product name is provisional.** It lives in `brand.mjs` and is read from
there by the PWA manifest, `index.html`, and the React app — so rename by
editing that file alone, and never hard-code the name anywhere else. The
repository stays `work-timer` regardless.

**Stack:** TypeScript + React + Vite, shipped as a **Tauri desktop app** and
also as a browser build from the same codebase. Local-first on IndexedDB via
Dexie; XState for the timer; Tailwind v4 with design tokens in
`src/styles/tokens.css`. Supabase (Postgres + Auth + RLS) arrives in M5 and is
not wired up yet. Constraint: no paid services, so everything stays on free
tiers/free tools.

**Windows is the development target**; macOS is kept possible (nothing
Windows-only) but is unverified. Mobile is out of scope entirely.

The full architecture, data model, and milestone breakdown live in
`docs/plans/2026-08-30-architecture.md`. Read it before making structural
changes.

## Working on this repo

This is developed from more than one machine. Right now that costs nothing:
the app needs **no environment variables at all**, because it runs entirely
against IndexedDB with no backend.

```
npm install
npm run tauri:dev    # the desktop app
npm run dev          # the browser build
```

The desktop build additionally needs a Rust toolchain and the MSVC C++ build
tools (`winget install Rustlang.Rustup` and the VS 2022 Build Tools with the
VCTools workload). A machine without them can still run `npm run dev`, the
tests, and the web build — only `tauri:*` needs Rust.

`.gitattributes` forces LF line endings in the repository so the Windows and
non-Windows checkouts agree byte for byte.

When Supabase lands in M5, each machine gets its own `.env` pointing at its
own Supabase project, and migrations get generated on one machine only so
they don't diverge. Update this paragraph then.

Read `NOTES.md` (newest entries first) plus `git log` at the start of a
session. My general planning and collaboration norms live in
`~/.claude/CLAUDE.md` and apply here too; this file only holds what's
specific to this project.

## Environment — check here before believing a bug

Standing facts about the tooling, not news. As investigations turn up things
that look like app bugs but aren't (a stale cache, a quirk of some tool, an
environment gap), record the short version here and the full investigation
in `NOTES.md`.

- **The service worker is disabled in `npm run dev`.** Anything involving
  install, offline, or update prompts must be tested with
  `npm run build && npm run preview`. A missing service worker in development
  is configuration, not a bug.
- **Vitest defaults to the `node` environment, not jsdom.** Deliberate — jsdom
  cost ~50s of setup per run for tests that never touch a DOM. A test that
  needs `window` must declare `// @vitest-environment jsdom` at the top of the
  file, or it will fail with `window is not defined`.
- **`import.meta.url` is not a `file://` URL under Vitest.** Vitest serves
  modules over http, so `fileURLToPath(import.meta.url)` throws
  `The URL must be of scheme file`. Resolve from `process.cwd()` instead.
- **Markdown is in `.prettierignore`.** Prettier rewrites `*emphasis*` to
  `_emphasis_`, which churns `NOTES.md` on every commit. If a `.md` file looks
  unformatted, that is intentional.
- **npm 11 leaves esbuild's postinstall unapproved** (`npm approve-scripts`
  warning on every install). Vite builds fine regardless — the warning is
  noise, not a broken install.
- **`npm run tauri:dev` needs port 5173 free.** Vite is set to `strictPort`, so
  a stray dev server elsewhere makes the app window come up blank rather than
  silently moving to 5174.
- **The desktop app and the browser build have separate IndexedDB stores.**
  Different origins — `tauri://localhost` versus `http://localhost:5173`. Data
  written in one will not appear in the other. Not a bug.
- **A client-side route would 404 in the packaged desktop app.** Tauri serves
  the frontend over an asset protocol with no `index.html` fallback, so extra
  windows are addressed with a query parameter (`?window=mini`) rather than a
  path. Works identically in dev and production.
- **The first `cargo` build takes several minutes** and downloads a few hundred
  crates. Subsequent builds are incremental. Slowness here is normal, not a
  broken setup.

## Decisions already made — don't re-open these

Record a decision here once it's actually been made and would otherwise get
re-litigated (a library choice, an architecture call, something explicitly
rejected). Don't pre-populate this with guesses.

- **No paid services.** Language, framework, database, and hosting choices
  must stay on free tiers/free tools. Rule out anything requiring payment
  when suggesting a stack.
- **Desktop only, via Tauri — mobile is out of scope.** Superseded the original
  "PWA for iPhone" decision on 2026-08-31. Tauri was chosen over Electron for
  bundle size (~10MB vs ~150MB) and idle memory (~40MB vs ~250MB), which
  matters for something meant to sit running for hours. Don't propose React
  Native, Expo, Capacitor, or Electron.
- **The browser build stays alive alongside the desktop app.** The consequence
  is permanent: every native capability needs a browser fallback. That seam
  lives in `src/shared/runtime/` and nowhere else — feature code takes a
  `Runtime` and never asks which host it is in.
- **Unsupported capabilities are silent no-ops, not throws.** `isSupported` is
  for hiding UI that would do nothing; calling an unsupported port is always
  safe. This is what keeps `if (isDesktop)` out of feature code.
- **Elapsed time is computed from timestamps, never accumulated from
  `setInterval` ticks.** Browsers throttle hidden tabs, so tick counting
  under-reports. It also makes background continuation free: there is no clock
  to keep alive. Use `src/shared/lib/clock.ts`.
- **Completed sessions are immutable.** This is what makes sync append-only
  and conflict-free. Same reasoning: currency is an append-only ledger
  (balance = `SUM(delta)`), and streaks are derived by query rather than
  stored as a counter.
- **Stars are stored as seeds, not images.** A session's `seed` field
  regenerates its star deterministically on any device.
- **Feature slices are opaque to each other**, and `shared/` never imports
  from `features/` or `app/`. Enforced by `no-restricted-imports` in
  `eslint.config.js`, not just by convention.
- **Leaving the app never forfeits a session.** Superseded the original
  strict-on-mobile abandonment rule on 2026-08-31. Backgrounding, closing the
  window, or locking the machine does not stop or fail a session — the timer
  runs on wall-clock time regardless. **The only way to fail is to cancel
  deliberately.** There is therefore no `abandoned` outcome, no grace period,
  and no abandonment policy; don't reintroduce them.
- **Time spent away is still recorded, but only as a stat.** `SessionRow.awayMs`
  is informational and must never affect whether a session succeeds.

## Plans include acceptance tests

Every implementation plan states the outcomes the change must deliver, then
derives a numbered acceptance test from each — setup, action, and the
condition that counts as a pass. Write them as part of the plan, before
building, so the tests check what was promised rather than whatever turns
out to be convenient to verify afterward.

Run the acceptance pass as its own step once the work is done, and report
every case with its observed result, passes included. A failing case blocks
the merge. A pre-existing bug found during the pass does not — confirm it
against the main branch first, then report it separately rather than folding
it into the change.
