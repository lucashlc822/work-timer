# work-timer

## What this is

A focused-work timer app in the spirit of Forest — the user sets a timer to
work, and lets it run instead of picking up other apps. Themed as a soft
pastel night sky: each completed session becomes a star, and accumulated
sessions form constellations. Personal project; more features may get added
as they're decided on.

**Stack:** TypeScript + React + Vite, built as an installable PWA. Local-first
on IndexedDB via Dexie; XState for the timer; Tailwind v4 with design tokens
in `src/styles/tokens.css`. Supabase (Postgres + Auth + RLS) and Cloudflare
Pages hosting arrive in M5 — neither is wired up yet. Constraint: no paid
services, so everything stays on free tiers.

The full architecture, data model, and milestone breakdown live in
`docs/plans/2026-08-30-architecture.md`. Read it before making structural
changes.

## Working on this repo

This is developed from more than one machine. Right now that costs nothing:
the app needs **no environment variables at all**, because it runs entirely
against IndexedDB with no backend. Clone, `npm install`, `npm run dev`.

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
- **iOS PWA storage can be evicted** by Safari after extended non-use. Not yet
  mitigated; cloud sync in M5 is the fix. If test data vanishes from an iPhone
  after a long gap, suspect this before suspecting the app.

## Decisions already made — don't re-open these

Record a decision here once it's actually been made and would otherwise get
re-litigated (a library choice, an architecture call, something explicitly
rejected). Don't pre-populate this with guesses.

- **No paid services.** Language, framework, database, and hosting choices
  must stay on free tiers/free tools. Rule out anything requiring payment
  when suggesting a stack.
- **PWA only — native iOS is rejected.** The App Store requires $99/year and a
  Mac, which the rule above forbids. An installable web app covers iPhone,
  Windows, and browser from one codebase. Don't propose React Native, Expo, or
  Capacitor.
- **Elapsed time is computed from timestamps, never accumulated from
  `setInterval` ticks.** iOS freezes JavaScript when a PWA is backgrounded and
  browsers throttle hidden tabs, so tick counting silently under-reports every
  session. Use `src/shared/lib/clock.ts`.
- **Completed sessions are immutable.** This is what makes sync append-only
  and conflict-free. Same reasoning: currency is an append-only ledger
  (balance = `SUM(delta)`), and streaks are derived by query rather than
  stored as a counter.
- **Stars are stored as seeds, not images.** A session's `seed` field
  regenerates its star deterministically on any device.
- **Feature slices are opaque to each other**, and `shared/` never imports
  from `features/` or `app/`. Enforced by `no-restricted-imports` in
  `eslint.config.js`, not just by convention.
- **Abandonment is strict on mobile, lenient on desktop** — a product
  judgement, not a technical limit. Desktop work legitimately spans windows,
  so enforcing there would produce constant false forfeits.

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
