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
repository stays `work-timer` regardless. **One exception the frontend can't
read:** the native shell states the name itself (`productName` and window title
in `src-tauri/tauri.conf.json`, tray and menu text in `src-tauri/src/lib.rs`),
and the desktop e2e specs assert those strings — so a rename also touches
those.

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
npm run e2e:web      # end-to-end tests (needs the local stack running)
npm run e2e:desktop  # the same against the desktop app (Windows, local only)
```

For a full QA pass, ask Claude Code to use the **`qa-lead`** agent
(`.claude/agents/qa-lead.md`): it runs every check above plus the database
tests, accessibility, size, Lighthouse, dependency audits and a security
review, and reports Critical / Should fix / Minor. It never edits the project.

For a design and accessibility review, ask for the **`ui-ux-reviewer`** agent
(`.claude/agents/ui-ux-reviewer.md`): it drives the app in Edge through the
Playwright MCP server (`.mcp.json`) at desktop, tablet and narrow sizes, walks
every timer state plus loading, empty, error and offline, runs axe against
WCAG 2.2 AA, checks keyboard use and focus, flags colour or spacing that isn't
from `src/styles/tokens.css`, and reports Blocker / High / Medium / Low with
screenshots in `.ui-review/`. It changes nothing until you approve. It never
handles a password: you sign the local `ui-review@test.local` account in once in
its Edge profile (`.ui-review/profile`, ignored, kept between runs), and it asks
you to again if that sign-in is ever lost. Setup is in `supabase/README.md`,
"Local test accounts".

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
- **The Supabase CLI is v3 (2026-11-12): commands default to the local stack.**
  A hosted target needs `--remote` (it replaced `--linked`) and asks to confirm
  (`--yes` is for CI). A bare `db push` therefore "succeeds" against the local
  database and sends the hosted project nothing: read the `Target:` line it
  prints first.
- **The hosted free tier pauses after ~7 days with no activity.** The app keeps
  working offline and can't sync until the project is restored from the
  dashboard. Not a sync bug. `.github/workflows/keep-alive.yml` reads the
  server every ~3 days to prevent it; a red "Keep server awake" run (GitHub
  emails it) is the first sign of a pause or a changed URL/key. GitHub switches
  scheduled workflows off after 60 days with no repository activity —
  re-enable it in the Actions tab, or push any commit.
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
- **End-to-end tests only ever talk to the local stack.** `npm run e2e:web`
  builds the app in mode `e2e` (never reads `.env.production.local`), serves it
  on port 4174, and reads addresses and keys from `npx supabase status`;
  `e2e/support/localStack.ts` refuses any non-local URL and
  `e2e/check-build.mjs` refuses a build containing a hosted address. A run that
  stops with "Refusing to run" is the fence working, not a broken test. Each
  test makes its own `e2e-…@test.local` users, so they pile up in the local
  database until `npx supabase db reset`: harmless. A change to
  `supabase/config.toml` needs `npx supabase stop && npx supabase start`.
- **End-to-end tests start the page's clock in the past.** A fast-forwarded
  25-minute session must still end before the server's own "now": the server
  refuses a session ending more than five minutes in its future
  (`session_not_from_the_future`). `e2e/support/clock.ts` does it; a test that
  fast-forwards without it sees the session sit unuploaded, which is the check
  working, not a sync bug.
- **The accessibility scan fails on serious and critical findings.**
  `e2e/web/a11y.spec.ts` (axe) scans every screen; `ENFORCE` in
  `e2e/support/a11y.ts` is true and nothing is acknowledged. `--color-ink-muted`
  is for text on night-900/800 only (not night-700). Bundle size
  (`npm run perf:size`, against `e2e/perf-baseline.json`, re-set at 0.9.0 =
  281 kB of JS gzipped; **it only means something for a build that has a
  server address** (`.env.production.local` locally; CI's size step sets
  placeholders): with none, Vite drops the sync and sign-in code, ~20%
  smaller) and Lighthouse
  (`npm run perf:lighthouse`, needs an installed Chrome or Edge) are report-only
  by design; Lighthouse scores on localhost are optimistic, so read them as a
  trend.
- **A day-based view read with a shifted test clock can fail near midnight.**
  Between midnight and about 03:00 a clock set hours back is on yesterday while
  real time is today. Give both devices in a test the same offset.
- **Desktop end-to-end tests run in a throwaway WebView2 profile.** The dev
  build has the installed app's identifier, so by default they'd share one
  profile (sign-in, IndexedDB). `e2e/desktop/launch.ts` sets
  `WEBVIEW2_USER_DATA_FOLDER` to a fresh temp folder per launch and refuses to
  start while any `starkeep.exe` runs (single-instance would hand over to it).
  Quit the installed app from the tray first. The autostart test skips itself
  if a Starkeep startup entry already exists.
- **With Playwright attached, a WebView2 page always reports itself
  visible.** Hidden-to-tray checks detach Playwright and read
  `document.visibilityState` over a plain DevTools socket (`rawEvaluate`). With
  nothing attached the app's visibility fix works. Not an app bug.
- **`debug_native_log` exists in debug builds only.** It records the tray
  tooltip and notifications the app asked for, since Windows lets no test read
  them back. A release build has no such command (the update test checks).
- **The `ui-ux-reviewer` agent and the Playwright tools appear only in sessions
  started after they were added**, and Claude Code asks you to approve a
  project's `.mcp.json` server once per machine. The review needs the local
  Supabase stack up and the test account signed in in its profile; without them
  it stops and says so. Its screenshots and Edge profile live in `.ui-review/`
  (ignored); deleting `.ui-review/profile` resets the sign-in. Only one browser
  can use that profile at a time, so two reviews at once fail to launch Edge.
- **Git Bash rewrites `reg` switches like `/v` into paths** ("ERROR: Invalid
  syntax"). Use PowerShell (`Get-ItemProperty`, `Remove-ItemProperty`) or
  Node's `execSync`, which goes through cmd.
- **`qa-lead` only appears in sessions started after it was added**, and a
  headless run (`claude -p --agent qa-lead …`) needs the CLI signed in. A guard
  hook (`.claude/hooks/qa-lead-guard.mjs`) refuses its Edit/Write outside
  `.claude/agent-memory/qa-lead/` and fails closed; Bash isn't hookable, so the
  agent ends every run with a `git status` comparison instead.
- **Claude's browser pane doesn't keep site data across a reboot.** Its
  IndexedDB and `localStorage` come back empty, so local test accounts have to
  sign in again. Not data loss in the app.
- **CSS custom properties inside SVG gradient stops fail silently to black**
  if they don't resolve. `shared/ui/StarMark` relies on them working; if a
  gradient ever renders black, check that the token is defined on an ancestor
  rather than suspecting the path data.
- **Realtime "SUBSCRIBED" isn't "listening."** A change made before the
  channel's `system` message `{extension: 'postgres_changes', status: 'ok'}`
  arrives is never delivered. A test must wait for both
  (`e2e/api/realtime-isolation.spec.ts` does); the app copes because a
  re-subscribe triggers a full sync.
- **Apply a new migration locally with `npx supabase migration up`, not
  `db reset`.** A reset re-runs everything and wipes the hand-seeded
  `a@`/`b@`/`c@test.local` accounts (the browser pane then still holds a
  session for a deleted user: sign out and back in after re-seeding).
- **pgTAP fixtures:** dated in the past (the `sessions` table refuses an end in
  its future, `session_not_from_the_future`), with each suite's own users
  (`fr-*`, `fs-*`, …), and counting only those users' rows, never a whole
  table: the e2e runs leave their own rows in the local database.
- **A paused Docker container makes requests hang, not fail.** To simulate
  "server unreachable", `docker stop supabase_kong_work-timer` (then
  `docker start`), not `docker pause`, or sync sits on "Syncing…".
- **Vite hot-swaps non-component modules without reloading**, so after editing
  a hook or the sync engine the running app can be a mix of old and new code.
  Reload (`location.reload()`) before re-testing. Likewise, raw IndexedDB
  writes (from DevTools or a script) don't notify Dexie live queries: reload.
- **"Online" can linger up to three minutes after a friend quits or signs
  out.** The app clears its presence on `pagehide`, best effort; a clear that
  never arrives (signed out first, network gone, a crash) is covered by the
  server's three-minute staleness, not by a bug.
- **Harmless noise, not bugs:**
  - `Failed to unregister class Chrome_WidgetWin_0. Error = 1412` on a tray
    Quit (routine WebView2 shutdown).
  - Tauri IPC to `http://ipc.localhost` violating the CSP and falling back to
    `postMessage` (console noise on every IPC call; it works).
  - `indexedDB.open` reporting Dexie's version times ten (`30` for schema v3).
  - `sb_secret_` and `*.supabase.co` strings in the web bundle: supabase-js
    itself checking key types and hosts, not a leaked key.
- **The desktop app checks for updates 10 s after launch, then every 6 hours**
  (`DesktopUpdatePrompt.tsx`). To re-test an update, quit fully from the tray
  and relaunch.
- **Docker Desktop on a fresh Windows machine needs WSL first:**
  `wsl --install --no-distribution` in an admin PowerShell, then a reboot.
- **A `claude` CLI started from inside a desktop-app session inherits that
  session's `CLAUDE_*` and `ANTHROPIC_*` variables** and can't sign in (this
  matters for headless `qa-lead` runs). Run it with those removed, after its
  own `claude auth login`.
- **Starkeep is single-instance.** A launch that exits with code 0 at once
  means another instance is already running and was handed the focus. Look for
  `starkeep*`: a renamed copy (`starkeep-master.exe`) escapes
  `Get-Process starkeep`.
- **Dev builds have test helpers on `window.__starkeep`:** `seed(n, minutes)`
  (completed sessions), `seedHistory(days)` and `clearSeeded()` (weeks of
  history, removed exactly), `seedSky({ shapes, generated, complete, styles })`
  (one finished constellation per catalogue shape, the same stars every run;
  local-only, so sync, Stardust and `clearSeeded()` all know it), and `frames()`
  (the sky's frame counter). The object appears a moment after load; wait for
  it. None of it ships.
- **Running an older release locally (compatibility checks):**
  `git worktree add --detach <dir> vX.Y.Z`, copy `.env.development.local`,
  `npm ci`, `npm run dev`. It needs port 5173 and shares the browser store
  with the current version; an older Dexie can't open a store a newer one has
  upgraded, so clear that account's `work-timer-account-<id>` database first.
  Removing the worktree fails with "Filename too long": delete it with
  `cmd /c 'rd /s /q "\\?\<full path>"'`, then `git worktree prune`.

## UI standards

- **`src/styles/tokens.css` is the only source** of colour, radius and motion.
  Use the generated utilities (`bg-night-800`, `text-ink-primary`,
  `rounded-soft`); never a hex, rgb or hsl literal, and no arbitrary Tailwind
  value like `bg-[#…]` or `p-[13px]`. Canvas and build-time code that can't
  read CSS use the mirror in `design-tokens.mjs` (a test keeps the two in step).
- **Spacing comes from Tailwind's default scale**; tokens.css defines none of
  its own. If a spacing need keeps recurring, add a token there rather than a
  one-off value.
- **Text colours:** `--color-ink-muted` only on night-900/800, never night-700.
- **Accessibility target is WCAG 2.2 AA**; the axe scan in
  `e2e/web/a11y.spec.ts` must stay enforcing.
- **Tone is gentle**: nothing urgent-looking, and an early ending is a soft
  "aw", not an error. The frontend-design plugin is installed for this project;
  where its taste conflicts with the tokens, the tokens win.
- Ask for the `ui-ux-reviewer` agent to check a change against all of this.

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
  and no abandonment policy; don't reintroduce them. In a focus-together session a
  friend's deliberate cancel counts too (see the M7 bullet below).
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
- **The updater is built without its `zip` feature** (2026-11-12, from the
  qa-lead pass). `tauri-plugin-updater` turns it on by default, but it only
  unpacks `.zip` (Windows) and compressed-AppImage (Linux) updates. Ours is a
  plain NSIS `.exe` on Windows, and macOS unpacks `.app.tar.gz` with tar/flate2,
  which the plugin always uses there. The feature only ever brought `zip`
  advisories (four by then), so `src-tauri/.cargo/audit.toml` ignores nothing.
  Don't re-enable default features; if updates ever ship as a `.zip`, that is
  the moment to reconsider.
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
- **Bonuses are reconciler rows too** (M6 PR 2, 2026-10-17): `goal:<day>`,
  `streak:<run start>:<days>` and `constellation:<choice id>`, each prefixed
  with the user id like the rest. The goal bonus looks only at today and
  yesterday, so lowering the goal never pays out old days. A day counts toward
  a streak by the *start* of a completed session; focus toward the goal is the
  part of each ended session inside the day (same rule as the stats). Streaks
  and goal progress are derived on every read, never stored; the day math
  lives in `shared/lib/days.ts`. Known, accepted: a session syncing in days
  late that extends a run backwards moves its start day and re-pays that run's
  milestones once.
- **What's owned is derived from purchase rows** (M6): a purchase is a ledger
  row with a negative `delta` and id `purchase:<itemKey>`. No unlocks table.
  Item keys (`style.ember`, `tier.medium`) are permanent, and like every
  ledger id the purchase id is prefixed with the user id, so the same item
  bought on two offline devices is one deduction. The default `style.classic`
  is free and owned by everyone.
- **A star's style is stamped when its session completes** (M6 PR 3,
  2026-10-18): `finishSession` copies the equipped `META_KEYS.starStyle` onto
  the row, in the same transaction, and never again. Early endings get none.
  An absent or unknown style key draws as `classic`, which must always equal
  the pre-M6 look (golden test). A style recolours the temperature axis and
  scales the glow only; size, brightness and twinkle still say how long the
  session was. A tier bought early opens it in the picker (`unlockedTiers`
  takes the bought set) without touching the earned path.
- **A sky theme only recolours; `night` is the pre-M6 sky** (M6 PR 4,
  2026-10-18). `ambientField(themeKey)` makes every random draw in the same
  order whatever the theme, so star and cloud positions are identical and only
  colours change; `night` (default, and the fallback for an unknown key) is
  pinned by a golden fingerprint of the old field. Themes are tinted ground +
  cloud hues + background-star palette, all in `sky/domain/skyThemes.ts`.
- **Constellation packs add shapes, they never gate existing ones** (M6 PR 4).
  A pack's shapes carry `pack` in the sky catalogue and show in the picker only
  when `pack.<key>` is owned; a choice already made resolves whatever is owned,
  so nothing breaks if ownership changes. Pack shape keys are permanent like the
  rest. An older app doesn't know them and draws a generated shape of the same
  tier (`resolveDef`'s fallback).
- **Focus together: anyone's deliberate cancel ends it for everyone** (M7
  phase 4, 2026-10-24). Up to four accepted friends share one countdown: the
  same start (the server's), the same end. If any member deliberately ends
  early, every member's session ends early at that moment, with no star, and
  the result says who. Leaving, closing, sleeping or going offline still never
  forfeits. A cancel that reaches a device after its session already
  completed changes nothing, including on a device that was quit or offline
  through the end: completed sessions stay immutable. Nobody joins after the
  start, and a lobby lapses after 10 minutes. +10 Stardust each
  (`together:<roomId>`) only when the server sees every member's completed
  session for the room (`together_wins()`).
- **Live updates for friends go through each person's own rows** (M7). A
  table that must reach several people (`together_members`) gives each person
  a row readable only by them, and every change touches every member's row;
  each device listens on its own filtered channel. No policy ever lets one
  person read another's row, so the isolation guard's rule stands.
- **A shared constellation fills only from sessions run for it** (M7 phase 5,
  2026-10-25). Before Start you pick what a session is for — your own
  constellation or the shared one with a friend (`sessions.shared_id`) — and
  its star goes there alone, never to both; the pick is fixed for the session
  and a Pomodoro run keeps it for every block. One open per friendship
  (a proposal, or accepted and unfinished). "Finished" is judged from the
  server's sessions by the `stars_needed` and `min_focus_s` stored with it, on
  the server (`shared_done`) and on every device alike, and pays each member
  the solo tier bonus once (`shared:<id>`) — only from server-confirmed
  sessions, never an unsynced local star. Stopping (either member) or
  unfriending freezes it in both skies; a proposal is withdrawn. Shared
  constellations are fetched, never stored on the device, so offline they
  simply aren't drawn. Supersedes the design doc's "every session either of
  you completes adds a star".
- **Presence is opt-out, friends-only, and never touches a session** (M7,
  2026-11-03). Friends see Online / Away / Focusing / On a break / Offline;
  focusing and breaks (`focus_status`) always win. Online and Away come from
  `presence`, refreshed every minute by each open app (`useSharePresence`) and
  shown only while fresher than three minutes, by the server's clock. Away is
  hidden, minimised, in the tray, or ten minutes without input. "Show when I'm
  online" (`profiles.share_online`, on by default) is enforced by the server:
  off deletes the row and `set_presence` writes nothing. There is no opt-out
  for focusing, as before.
- **Star style, sky theme and daily goal are their own `user_settings`
  columns, not keys inside `pomodoro`** (M6). A 0.1.x app rewrites that jsonb
  wholesale, while PostgREST's upsert leaves columns it isn't sent alone. A
  settings row at the same version as this device's still hands over its M6
  columns (a pre-M6 app may have written that version), and the Dexie v4
  upgrade forgets the settings cursor once so they are re-read.
- **Type is bundled, never fetched; the sky's captions are Alegreya SC**
  (View sky upgrade PR 1, 2026-11-04). Fonts come from `@fontsource/*` (OFL, so
  free), imported in `src/styles/index.css`, so the desktop app and the offline
  web build need no network and the CSP (`default-src 'self'`) stays closed. A
  font file under 4 KB is inlined by Vite as a `data:` URL, which that CSP
  blocks. The face is the `--font-atlas` token, spacing `--tracking-atlas`.
  Cormorant SC was compared and rejected: its hairlines go faint at the 11 px
  captions use, and it has no italic for the hard tier's names. A caption is
  measured once drawn and nudged back 8 px inside the window's edges
  (`Caption` in `ConstellationLayer.tsx`), because small capitals run wider
  than the figure's cell.
- **A star is drawn as an astrophoto, and a style may shape its glow** (View
  sky upgrade PR 2, 2026-11-04; widens the M6 rule that a style "recolours and
  scales the glow only"). `starForm` (pure, `sky/domain/starForm.ts`) turns
  what `starAppearance` decided into a corona, diffraction spikes, a body and
  a core, and `AstroStar` draws it. A style (`STAR_FORMS`, same keys as
  `STAR_STYLES`) may now choose the spike count, angle and tint and the
  corona's form; every star of one style points the same way, as in a real
  image. Size, brightness, twinkle and **spike length** still say only how long
  the session was: within any style, length is a function of focus time alone
  (ember's are shorter overall, but grow by the same factor). `starAppearance`
  is untouched and its golden stands; `starForm` has its own golden for the
  same four seeds. **No blur filter on a star:** a crowded sky was hundreds of
  blur passes per repaint, so the corona is a radial gradient and a glowing
  figure blurs its edges once, not once per line. A test fails if a star
  carries a `filter`.
- **A star's card replaces the browser tooltip, and Escape closes it first**
  (View sky upgrade PR 3, 2026-11-04). Hovering or focusing a star in the full
  sky shows a card: date and start–end time, length, tag, a context line
  ("Pomodoro block 2 of 3", "Focused with mia", "Bea’s star") and the star in
  its style. The card is `aria-hidden`; the same words are the star's `<desc>`,
  so a screen reader never depends on the card being mounted in time, and the
  star's accessible name stays the short `starLabel`. It stays 250 ms after
  the pointer leaves and while the pointer is on it (WCAG 1.4.13). While a card
  is open, `SkyView` listens for Escape on the window in the capture phase and
  stops it: one press closes the card, the next leaves the sky (HomeRoute's
  document listener). A friend's sky shows only time, length and style — never
  their tags, runs or companions — and prefers cards below the star, clear of
  its header. "Block N of M" counts the blocks the run *completed*; an open run
  says "block N". Who you focused with is remembered per device in
  `META_KEYS.togetherNames` (written by `app/togetherNames.ts` from rooms you
  ran in, capped at 500, never synced); a device that wasn't there says
  "Focused together". Style names come from the shop (`styleName` in
  progression), passed in by `app/`.
- **A constellation has a card too, and its caption is its keyboard stop**
  (View sky upgrade PR 4, 2026-11-04). Hovering anywhere in a figure's box, or
  focusing its caption, shows its name, progress, start date and total focus,
  and the other figures fade to `DIMMED` (0.35); one alone never dims. A star's
  card wins over its constellation's, and the constellation stays bright while
  one of its stars is hovered or focused. The caption is the figure's first
  stop (before its stars), at least 24 px tall, with its own focus ring and
  `<desc>`; it becomes focusable only when the sky is interactive. Escape
  closes both cards and undims in one press. A shared constellation's start
  date is when it was accepted.
- **A constellation has an engraved figure behind it, keyed by catalogue key**
  (View sky upgrade PR 5, 2026-11-06). Hand-drawn line art in
  `sky/domain/atlasArt.ts`, one entry per catalogue shape, in the unit square,
  written in the tiny path language `atlasPath.ts` reads (absolute M, L, C, Q,
  Z only; scaled to pixels by number, not by a transform, so strokes stay one
  width). It fades in with the stars (`atlasFade.ts`: 0.04 at no stars, up to
  0.3 once complete) and is decorative: `aria-hidden`, no role or name. Art is
  keyed by the permanent catalogue key, so a drawing may be redrawn but never
  removed. **Every catalogue shape must have a drawing**: `ATLAS_ART` is
  `satisfies Record<CatalogueKey, …>`, so a new shape fails to compile until
  its art is drawn. Only a generated ("wild") shape has none, and gets
  `figureOutline`: a fainter dotted outline, the convex hull of its stars
  padded and smoothed. A pack shape draws its art whether or not the pack is
  owned (art is not gated, like the shapes themselves). Tests check every drawing
  parses, stays inside the square, covers its stars' extent and leaves no star
  more than 0.12 from a line, so a drawing of the wrong thing, mirrored, or
  misplaced fails.

- **A finished constellation gets its moment once per device** (View sky
  upgrade PR 6, 2026-11-06). When the full sky shows a constellation this
  device has not yet celebrated, its lines draw themselves in, its engraving
  traces itself, a bloom swells and fades and its stars flare; a polite live
  region says "The Kite is complete." The record is
  `META_KEYS.celebratedConstellations` (own and shared ids, per device, never
  synced), decided by `pendingCelebrations` (`sky/domain/celebrate.ts`) and
  written **when a moment starts**, so closing the sky part-way never brings it
  back. **First run** (no record): nothing plays and everything already
  finished is recorded. That record is made as soon as the sky has been read,
  **even behind the timer** (`useCelebrations` with `enabled` false), otherwise
  a constellation finished before the sky is first opened would be swallowed
  into it. At most three play at once, newest first, 1.2 s apart; the rest are
  recorded silently. Only your own full sky celebrates: never behind the timer,
  never a friend's sky. Reduced motion shows the end state at once (the
  reduced-motion rule zeroes these animations' delays). Known, accepted: a
  shared constellation finished before the update whose data arrives after the
  first-run record may play once.

- **The ambient sky lives, in layers that cost nothing behind a timer** (View
  sky upgrade PR 7, 2026-11-06). A faint Milky Way is painted into the same
  offscreen nebula canvas as the clouds (`sky/domain/livingSky.ts`, own seed
  `starkeep-milkyway-v1`): once per resize, so it shows behind the timer too and
  adds no work to a frame. Its geometry is the same in every theme and only the
  colour follows the theme, like the field. Never add a draw to
  `ambientField`'s stream: its golden fingerprint pins the starfield. In the
  **full sky only** (`motion: 'living'`) a shooting star crosses now and then
  (`meteorAt`, own seed, the first no sooner than 20 s after the sky opened,
  then 45–120 s apart, falling 20–40 degrees, under a second) and the layers
  glide a few pixels against the pointer (1.5, 4 and 8 px for the three star
  layers; the nebula at most one whole pixel). Behind a running timer
  (`calm`) there are no meteors, no pointer listener and no per-frame work
  beyond the stars. Reduced motion switches the extras off (no listener).
  Meteors are timed from when the sky opened, not from page load, and a hidden
  window stops the loop, so none can pile up. **The nebula canvas is a pixel
  larger each way and is copied unscaled at a whole-pixel offset:** the first
  version stretched it each frame and cost about 5 points of CPU in the full
  sky. Measure before and after any change to what a frame draws.

- **The shop previews a style with the sky's own star** (View sky upgrade PR 8,
  2026-11-06). `StylePreview` (`sky/ui`) runs `starAppearance` -> `starForm` ->
  `AstroStar` at the `glow` tier with one fixed seed and a 25-minute session,
  so two rows differ only by style. Static, decorative, no filter.

- **A finished session plays a moment, and its star is the sky's star**
  (session-complete redesign PR 1, 2026-11-13; supersedes "the result screen
  keeps `StarGlyph`", which is gone). `ResultStar` (`sky/ui`) draws the session's
  own seed, length and stamped style through `starAppearance` -> `starForm` ->
  `AstroStar` at the `glow` tier, like the shop. `useMoment` plays a fixed
  timeline (`timer/domain/moment.ts`: ignite, arrive, tally, settled): the star
  ignites (`moment-ignite`), then the text, notes and buttons fade in by stage
  (`moment-part`/`moment-pending`). Every part is in the DOM and Done has focus
  from the first frame; only the look waits. It plays **once per finished result
  in memory** (a reload never replays it), and waits while the window is hidden or
  another view covers the timer (`present`); going away part-way skips to the end.
  **Escape or a pointer click skips it, and a click that skips presses nothing**
  (`detail > 0`); Enter/Space on the focused Done always work. Reduced motion
  starts at `settled`. An early ending has no moment. In e2e, `dismissResult`
  (`e2e/support/app.ts`) skips before pressing Done.

- **The result's tally asks the reconciler, it never restates it** (session-complete
  redesign PR 2, 2026-11-13). `sessionRewards` (`progression/domain/rewards.ts`)
  lists what a session earned as the ledger ids `expectedRows` wants *with* it and
  not *without* it, so the goal, streak and session lines can't drift from what is
  paid. The constellation line comes from the sky (`useStarPlacement`'s
  `completes`, joined in `app/resultRewards.tsx`); focus-together and shared
  bonuses are server facts and stay in their own notes. A line whose row is
  already in the ledger from **before** the session started is dropped (a goal
  paid, then raised). Reconciler and tally share `rewardableSessions`. Read-only:
  Stardust is still written only by the reconciler. The tally is `aria-hidden`;
  `RewardSummary` says it as one sentence inside the result's status. Lines come
  in `TALLY_STAGGER_MS` apart, only the total counts up, and "show the end at
  once" is a real skip or reduced motion, never the moment simply running out.

- **A constellation's caption keeps its own opacity and wraps to its cell** (View
  sky upgrade follow-up, 2026-11-06, from the `ui-ux-reviewer`). An unfinished or
  dimmed figure fades its lines and stars (`data-figure-body`), never its name:
  the caption sits outside that group at `CAPTION_ALPHA` (0.75, 6.4:1 on night-900;
  0.9 on the figure looked at) with a dark halo so it holds over a glow. A caption
  wider than its cell is measured once drawn and set on more lines (at " · ", then
  at spaces, up to three, `captionCandidates`), smaller only as a last resort
  (floor 10 px); nothing is ever cut off. A friend's sky is named "Ada's sky",
  yours "Your sky" (`label`).
- **A friend's sky is laid out below its header** (View sky upgrade follow-up,
  2026-11-06). The header's height varies (status line, shared constellation,
  wrapping), so `FriendSkyView` measures it before paint and on resize and tells
  `renderSky` as `{ reserveTop }`; the sky is not drawn until it has. `SkyView`
  passes it to `ConstellationLayer`, which lays figures out (`gridPlacements`
  `insets.top`) and wandering stars (`wanderingPosition`'s `area`) below it and
  keeps cards clear of it. Unset or 0, a sky lays out exactly as before: your own
  sky never passes it.
- **The sky is one Tab stop per constellation; arrows move between its stars**
  (View sky upgrade follow-up, 2026-11-06; refines PR 4's "caption is the
  figure's first stop"). A roving Tab stop: each figure's caption is its only
  stop (or its first star, where captions aren't focusable), and the wandering
  stars are one more, the first of them. Every star stays focusable
  (`tabindex=-1`): Right/Down move on, Left/Up back (from the first star back
  to the caption), Home/End to the unit's ends, no wrap; focus moving fires the
  usual focus/blur, so cards follow. The unit is `data-nav-unit`, handled once on
  the svg (`moveAlongUnit`). A caption's `<desc>` ends with how to reach its
  stars. A crowded sky went from one stop per star (~150) to ~20.

- **In the full sky, wandering stars keep clear of every figure** (2026-11-07).
  A figure's transparent hit rect and its caption sit over anything drawn before
  them, so a wandering star under one couldn't be hovered. `figureFootprint`
  (`sky/domain/layout.ts`) is the box and caption area plus a star's hit radius;
  `wanderingPosition` takes it as `avoid` and, if its first place falls inside,
  redraws from the same seed (up to 32 tries, else it stays put). A star that was
  already clear never moves, hero mode avoids nothing, and DOM, Tab and paint
  order are unchanged. Caption geometry (`captionTop`, `captionFontSize`) is
  shared with the footprint so the two can't drift. Known, accepted: two
  wandering stars can still land within a hit radius of each other.

- **The Stardust panel is three tabs, a card shows one state, and Buy asks
  first** (Stardust shop redesign, #170–#173, 2026-11-10). The balance sits on
  top and the earning explainer is a closed disclosure. Then three tabs: Shop
  (opens first, every time), Goal & streak, and History (grouped by day,
  `domain/ledgerDays.ts`). They follow the ARIA tabs pattern: one Tab stop,
  arrows/Home/End (`radioKeyTarget`, `shared/ui/radioKeys.ts`), and every panel
  stays mounted and `hidden` so `aria-controls` always resolves. Styles,
  themes and packs are cards (`ShopCard.tsx`); each shows exactly one state,
  decided by the pure `shopState` (`domain/shopState.ts`): equipped, equip,
  owned, unlocked, buy, or short by N. A new state goes there, never as a second
  footer. Tier unlocks are a quiet "Shortcuts" list, not cards. **Buy never
  spends on one click:** it opens an in-card question naming the price and the
  balance left, with Buy and Not now, in place of the card's face at the card's
  own size (the usual face stays laid out but `inert`, so no row grows). The cards sit in a wrapping, centred list (a transparent `li` cell per card carries half the gap as padding), so a short last row is centred, not left with an empty slot. Focus goes to the confirm button, back to
  Buy on Not now, Escape or a refusal, and onto Equip (or the Owned status)
  after a purchase. A polite live region says "Ember is yours." and the picture
  flares once (not under reduced motion). **Escape closes the question only:**
  the card's `onKeyDown` stops propagation before the event reaches the
  `document` keydown listener in `app/routes/HomeRoute.tsx`, so that listener
  must stay a bubble-phase `document` one; in capture or on `window` one Escape
  would close the panel too. `Shop.test.tsx` and `e2e/web/shop.spec.ts` pin both
  directions.

- **A panel opens on its title; a view with no title opens on its Back button**
  (2026-11-11, the reviewer's L1). Stats, Stardust, Account, Friends and Focus
  together are `PanelLayer`s in `app/routes/HomeRoute.tsx`, which calls
  `useFocusHeading` (`shared/ui/focus.ts`): it focuses the panel's first `h2`
  (`tabIndex={-1}`, `outline-none` because it is not a control), else the Back
  button, so focus never falls to the page behind the inert timer. The first Tab
  reaches the first control and Back is the last stop. Only the floating Back
  (View sky, a friend's sky) keeps `autoFocus`. A new panel needs an `h2` as its
  title and nothing else; closing still hands focus back to the opener
  (`useFocusIfLost`).

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
