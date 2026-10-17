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
`src/styles/tokens.css`. Supabase (Postgres + Auth + row-level security) is the
server, from M5: every person signs in, and their history syncs across their
devices. Constraint: no paid services, so everything stays on free
tiers/free tools.

**Audience: Lucas plus invited friends and family**, on Windows (the desktop
app) and in a browser (the web version, which is also the answer for Mac
users). Build for other people's data and other people's older app versions,
not just one person's two machines.

**Windows is the development target**; macOS is kept possible (nothing
Windows-only) but is unverified. Mobile is out of scope entirely.

The full architecture, data model, and milestone breakdown live in
`docs/plans/2026-08-30-architecture.md`. Read it before making structural
changes.

## Working on this repo

This is developed from more than one machine. Each machine runs its own
**local Supabase stack** for development, which needs **Docker Desktop**
running:

```
npm install
npx supabase start   # the local server (first run downloads images)
npm run tauri:dev    # the desktop app
npm run dev          # the browser build
```

Both dev commands read `.env.development.local`, which points at the local
stack; `.env.example` explains every env file. Without it the app shows "This
build isn't connected to a server" — tests and `npm run build` still pass with
no env at all. `supabase/README.md` covers the everyday Supabase commands, the
local test accounts, and setting up the hosted project.

The desktop build additionally needs a Rust toolchain and the MSVC C++ build
tools (`winget install Rustlang.Rustup` and the VS 2022 Build Tools with the
VCTools workload). A machine without them can still run `npm run dev`, the
tests, and the web build — only `tauri:*` needs Rust.

`.gitattributes` forces LF line endings in the repository so the Windows and
non-Windows checkouts agree byte for byte.

Release builds read `.env.production.local`, which points at the **one hosted
Supabase project** everyone shares (superseding the earlier plan of one
project per machine: cross-device sync needs a shared server). Migrations are
generated on one machine only, so the two histories never diverge.

The builds people actually install are made by GitHub Actions on a version tag,
configured from repository variables and secrets rather than that file —
`RELEASING.md` is the checklist, `docs/invite-a-friend.md` the way people get in.

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
  is configuration, not a bug. **The desktop app has none either**, by design
  (see "Decisions already made"): don't test offline or update prompts there.
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
- **Stopping `npm run tauri:dev` from outside doesn't stop its children.**
  Killing the npm process leaves `target\debug\starkeep.exe` and Vite running,
  with Vite still holding 5173. Check `netstat -ano | grep ":5173 "` and stop
  the listed processes before relaunching or switching branches.
- **The desktop app and the browser build have separate IndexedDB stores.** The
  packaged app's origin is `http://tauri.localhost` on Windows; `tauri dev`
  loads `http://localhost:5173` but in its own WebView2 profile. Local data
  written in one never appears in another — since M5 the same account's data
  reaches each of them only through sync. Not a bug.
- **A client-side route would 404 in the packaged desktop app.** Tauri serves
  the frontend over an asset protocol with no `index.html` fallback, so extra
  windows are addressed with a query parameter (`?window=mini`) rather than a
  path. Works identically in dev and production.
- **The first `cargo` build takes several minutes** and downloads a few hundred
  crates. Subsequent builds are incremental. Slowness here is normal, not a
  broken setup.
- **Don't run `git checkout` while `tauri dev` is running.** The watcher sees
  `src-tauri/Cargo.toml` vanish mid-checkout, fails to rebuild, and the dev
  process exits 101 with `could not find Cargo.toml`. Not an app crash — stop
  the dev server before switching branches.
- **WebView2 does not see its own window being hidden or minimised.** Without
  help, `document.visibilityState` stays `'visible'` in the tray and when
  minimised, and no `visibilitychange` fires. `src-tauri/src/lib.rs` fixes this
  by calling the webview's own `hide()`/`show()` (WebView2's `SetIsVisible`)
  alongside the window's. Any new window that needs visibility must do the same.
- **CSS transitions stall in Claude's browser pane while it is hidden.** The
  pane renders no frames when it is not on screen, so a fade can sit at 0.89
  opacity indefinitely; taking a screenshot renders frames and it completes.
  Not an app bug — check the computed style after a screenshot before
  believing a transition is broken.
- **The local Supabase stack needs Docker Desktop running.** `npx supabase start`
  failing with a pipe or engine error means Docker isn't up, not a broken
  config. Every email the local stack "sends" lands in the fake inbox at
  `http://127.0.0.1:54324` (its API: `/api/v1/messages`); Studio is at
  `http://127.0.0.1:54323`.
- **The hosted free tier pauses after ~7 days with no activity.** The app keeps
  working offline and can't sync until the project is restored from the
  dashboard. Not a sync bug.
- **Supabase's built-in email only reaches the project's own team.** The hosted
  project sends through Gmail as custom SMTP (~500 emails/day). A friend not
  getting a code is an SMTP setting first, an app bug second.
- **supabase-js reports every HTTP 500 as `AuthRetryableFetchError`**, the same
  class it uses for "no network". A refused sign-up (the invite trigger)
  arrives that way, so the error's message, not its name, decides what to tell
  the person (`features/account/domain/auth.ts`).
- **A database function with `set search_path = ''` can't see citext's `=`.**
  Comparing citext values there silently falls back to case-sensitive text
  comparison. Compare `lower(...)` explicitly (the pgTAP suite caught this).
- **Sync waits on purpose.** An upload runs about 2 s after a change, and a
  pull runs on start, when the window becomes visible, when the connection
  returns, every 5 minutes, and ~0.5 s after Supabase Realtime announces a
  change to the account's rows. Realtime is best effort: if its websocket is
  down, another device's change waits for one of the other triggers. A
  device's own uploads echo back as one extra, harmless round. "Sync now" in
  the Account panel runs a round immediately.
- **A Dexie live query can silently stop updating** if its body awaits a
  chain of nested plain-`async` helpers: it emits once and never re-runs. Keep
  live-query bodies flat — await Dexie calls directly, or read several `meta`
  keys with one `bulkGet` (see `countPending`). Test new live queries with a
  `liveQuery(...).subscribe` unit test; the M5 one failed on the bad version.
- **"Please update the app to keep syncing" is the server's
  `app_config.min_client_version`**, not a sync failure. While it is above the
  app's `package.json` version, sync sends and applies nothing; clearing it
  resumes sync on the next retry (≤5 min) or "Sync now".
- **The desktop app only looks for updates in a production build.** `tauri dev`
  never shows "Starkeep X.Y.Z is ready"; to see the notice, build a release exe
  and point a test at a published release. A check that finds nothing (no
  release yet, offline, GitHub down) is silent by design: it logs
  "Update check failed" to the console and shows nothing.
- **Local builds don't make update files, and don't need the signing key.**
  `bundle.createUpdaterArtifacts` is deliberately off in `tauri.conf.json`;
  CI turns it on with `src-tauri/tauri.release.conf.json`. Turning it on in the
  main config makes every local `tauri build` fail without the private key.
- **A first install shows "Windows protected your PC".** The installer isn't
  code-signed (that costs money), so SmartScreen warns once: More info → Run
  anyway. Updates installed by the app don't warn. Not a broken release.
- **The installer is per-user, so it can't install into `Program Files`.**
  Choosing a folder there fails with "Error opening file for writing …
  starkeep.exe" (no admin rights, by design, so updates never prompt). Keep the
  suggested folder under `AppData\Local`. Not a broken installer.
- **Scripted `focus()`/`blur()` don't fire in a background window.** When
  driving the app from DevTools (browser pane or WebView2 remote debugging),
  a rename field's save-on-blur never runs unless the page has focus. Use real
  input in the browser pane, or `Emulation.setFocusEmulationEnabled` over the
  DevTools protocol. A rename that "didn't save" in a script is this first.
- **Claude's browser pane doesn't keep site data across a reboot.** Its
  IndexedDB and `localStorage` come back empty, so local test accounts have to
  sign in again. Not data loss in the app.
- **CSS custom properties inside SVG gradient stops fail silently to black**
  if they don't resolve. `shared/ui/StarMark` relies on them working; if a
  gradient ever renders black, check that the token is defined on an ancestor
  rather than suspecting the path data.

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
- **Pomodoro focus blocks are ordinary sessions** (M3, 2026-10-07). One
  completed block = one star; each block is a `SessionRow` with
  `mode: 'pomodoro'`, `runId` and `runIndex`. Breaks are not stored as history
  and there is no `session_phases` table — the only break state is the
  in-flight run in `meta`, deleted when the run ends. Ending a block early
  cancels that block and ends the run; earlier blocks keep their stars.
- **The next Pomodoro block never starts without a click.** Focus → break is
  automatic; break → focus is not, so no star can be earned while away.
- **A session's tag can change while it runs, and freezes when it ends** (M4,
  2026-10-08). Tags are the one mutable table — rename, recolour, archive —
  but a finished session's `tagId` is never rewritten. Tags are archived,
  never deleted, so history keeps its labels. A run's tag lives on the run
  (`PomodoroRunRow.tagId`) as well as on the block, so the next block has it
  after a reload.
- **Time with the app fully quit is not "away".** `awayMs` means running but
  hidden or minimised (M4, 2026-10-08). Don't guess at quit time on relaunch.
- **An account is required; there are no guests** (M5, 2026-10-08). Supersedes
  the architecture doc's guest-first design. Sign-up is **invite-only**
  (`public.invites`, managed with `npm run invite`), by email and password,
  with the address confirmed — and a forgotten password reset — by a 6-digit
  code typed into the app. No links or browser redirects.
- **Each account has its own local store** (`work-timer-account-<userId>`).
  Sign-out hides it behind the sign-in screen and reloads; two people on one
  computer never share data. History from before M5 (`work-timer`) was
  deliberately not carried over and is never opened.
- **Server migrations stay backward compatible once the app is released.**
  Never drop or rename a column an older app reads or writes, give new
  columns a default or allow null, and never add a check that rejects what an
  older app sends. Friends won't all update on the same day.
- **The server enforces the rules, not the app.** Row-level security limits
  every row to its owner; sessions and constellation choices are insert-only;
  tags and settings are last-write-wins on `updated_at`; `server_updated_at` is
  stamped by the server. All of it is covered by `supabase/tests` (pgTAP).
- **Stats are derived on every read, never stored.** A session's focus counts
  toward the days its interval overlaps; counts, stars and the history list
  belong to the period the session *started* in. Unfinished sessions are
  excluded everywhere. Week starts Monday.
- **The desktop app has no service worker** (2026-10-13). Its frontend comes
  from the exe, so an offline cache buys it nothing, and a worker registered
  by one exe kept serving that exe's cached files to the next, with no update
  prompt. Offline support and the "new version" prompt are browser-only
  (`App.tsx` mounts `UpdatePrompt` only when `!isDesktop()`); desktop updates
  arrive with the exe. `src-tauri/src/no_service_worker.rs` injects a script
  into every webview that unregisters any worker an older exe left and clears
  its caches (never IndexedDB or localStorage), reloading once if the page was
  served by one. A pinned install runs the *old* frontend, so only the exe can
  rescue it — don't try to move this into the frontend.
- **`package.json` is the app's version** (M5, 2026-10-13). Vite exposes it as
  `APP_VERSION`. Five files state it (`package.json`, `package-lock.json`,
  `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`) and a test fails if they
  disagree: move them together with `npm run version:set -- X.Y.Z`, never by
  hand. `app_config.min_client_version` is compared against it, so only raise
  that minimum after the matching release is out.
- **The repository is public** (Release, 2026-10-13). GitHub serves a release's
  files without a login only from a public repo, and the desktop updater and
  the download link need exactly that. The history was checked first: no
  secret was ever committed (only `sb_secret_...` placeholders). Keep it that
  way — secrets live in GitHub's secrets, `.env.*.local`, or a password
  manager, never in a commit.
- **Releases are built only by CI, on a version tag, as a draft; publishing the
  draft is the one deliberate "go"** (Release, 2026-10-13). It ships the
  desktop update and the web version together at the same version. A merge to
  `master` reaches nobody. `RELEASING.md` has the steps.
- **The web version is hosted on Vercel and deploys only from a published
  release** (Release, 2026-10-13; supersedes Cloudflare Pages). The Vercel
  project is deliberately not connected to the Git repo, so no merge or pull
  request can deploy, and no preview can talk to the real server. Free Hobby
  plan: personal, non-commercial use, 100 GB/month.
- **Desktop updates are a notice and one click, never mid-session** (Release,
  2026-10-13). `DesktopUpdatePrompt` offers "Restart to update" only when no
  session or Pomodoro run is in progress. Don't make it install silently: an
  update that relaunches the app mid-session destroys what the app protects.
- **There is no Windows code signing** (no paid services). First installs show a
  SmartScreen warning; the invitation message says so.
- **The update-signing key is Lucas's, and is never regenerated casually.**
  Installed apps trust only the public key in `tauri.conf.json`; the private
  key and password live in a password manager and the GitHub secrets. Changing
  the public key, or losing the private one, strands every installed app until
  its person reinstalls (`RELEASING.md`, "If the signing key is lost").
- **Synced settings are mode + Pomodoro lengths; the last-picked tag is per
  device** (M5 PR 3). Newest edit wins by `settingsUpdatedAt` in `meta`. A run
  in progress keeps its own copy of the lengths and is never changed by sync.
- **Stardust is written only by the reconciler** (M6, 2026-10-17). From
  facts every device sees (completed sessions; later goals, streaks,
  constellations, purchases) it computes the ledger rows that should exist and
  inserts the missing ones. Each row's id is `stableId('<userId>:<kind>:<ref>')`
  — the **user id is part of the key** because the server's primary key is
  global. That is what makes it safe on any device, any number of times, and
  what credits sessions from apps that predate the ledger. A changed earning
  rule gets a new key namespace (`session.v2:`); never re-price existing ids.
- **What's owned is derived from purchase rows** (M6): a purchase is a ledger
  row with a negative `delta` and id `purchase:<itemKey>`. No unlocks table.
- **Star style, sky theme and daily goal are their own `user_settings`
  columns, not keys inside `pomodoro`** (M6). A 0.1.x app rewrites that jsonb
  wholesale, while PostgREST's upsert leaves columns it isn't sent alone. A
  settings row at the same version as this device's still hands over its M6
  columns (a pre-M6 app may have written that version), and the Dexie v4
  upgrade forgets the settings cursor once so they are re-read.

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
