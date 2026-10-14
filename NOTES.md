# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-10-13 — M5 finished: live updates, settings sync, delete account, version check

**Status: merged (PR #23 as `a6568ec`); cases 23–28 passed, 29 still Lucas's.**
Planned and built from `docs/plans/2026-10-08-m5-accounts-sync.md`; per-case
results are in the PR #23 description and the plan has an "As built — PR 3"
section. No server migration — PR 1's schema already had everything.

### Decisions made while building

- **`package.json` is the app version** (now 0.1.0, matching
  `tauri.conf.json`; a test fails if they drift). `app_config.min_client_version`
  is compared against it, so raise that minimum only after the matching
  release is out. A malformed minimum is ignored, never blocks sync.
- **Synced settings live in `meta`, not a table**: `timerMode` +
  `pomodoroSettings`, stamped by `settingsUpdatedAt`, confirmed by
  `settingsSyncedAt`. The server's `pomodoro` jsonb uses snake_case keys. A
  device that never edited settings adopts the account's and uploads nothing.
- **Delete is only offered once a sync attempt has reached the server**, and
  never mid-session. Confirmation is typing the account's email.

### Things worth not rediscovering

- **A Dexie live query can freeze silently.** `countPending` awaited nested
  async helpers inside its live query and Dexie stopped re-running it after
  the first result: the "changes waiting" count stuck at 0, the 2 s upload
  never fired, and a finished desktop session sat unsynced while the status
  said "Backed up". Unit tests passed; only the desktop acceptance run caught
  it. Fix: one `meta.bulkGet`. Any new live query gets a
  `liveQuery(...).subscribe` unit test (now in CLAUDE.md).
- **Vite hot-swaps non-component modules without reloading the page**, so
  after editing `engine.ts` the running app was a mix of old and new code and
  behaved inconsistently. Reload the window (`location.reload()`) before
  re-testing a sync change.
- **The packaged app keeps an old frontend if a service worker from an older
  exe is registered** at `http://tauri.localhost`. The new release binary
  loaded the previous build's `index-*.js` with no update prompt until the
  worker was unregistered by hand. Pre-existing; a task was flagged for it.
  When testing a release binary, check `document.scripts` matches `dist/`.
- **A paused Docker container makes requests hang, not fail** — sync sat on
  "Syncing…" indefinitely. To simulate "server unreachable", `docker stop
  supabase_kong_work-timer` (then `docker start`), not `docker pause`.
- **Realtime on a just-started local stack** took over 1.5 s to accept a
  subscription; the integration test now retries until it hears an event.
- **A release build can point at the local stack without an env file**:
  `VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… npx tauri build --no-bundle`
  (Vite reads `VITE_` variables from the process environment).
- **Desktop + browser pane on one dev server:** start the `dev` preview, then
  run `tauri dev` with `--config` overriding `build.beforeDevCommand` to `""`
  so it reuses port 5173 instead of failing on `strictPort`.
- Tauri's IPC to `http://ipc.localhost` violates the CSP from PR 1 and falls
  back to `postMessage` — console noise on every IPC call, works. Pre-existing.

### Test data on the local stack

`a@test.local` gained a few sessions (devices `desktop/app`,
`case-28-script`, `integration-test`), a tag renamed to "Live rename", and
settings 25/5/15/4 countdown. `b@test.local` was deleted in case 25 and
**re-created empty** (new user id). The release test install's service worker
was unregistered by hand.

### Next

- **Case 29, by hand, Lucas:** the hosted Supabase project, as in
  `supabase/README.md` ("Setting up the hosted project"). Leave
  `min_client_version` null there.
- **The service worker in the desktop app** (flagged as a task): make a new
  exe always load its own frontend before the Release milestone's
  auto-updates.
- **Release milestone** after that: Windows installer on GitHub Releases,
  Tauri auto-updates, web hosting.
- The other machine still needs Docker Desktop (with WSL).
- Autostart's reboot check, still carried over.

---

## 2026-10-08 — M5 two-thirds done: invite-only accounts and sync

**Status: PRs #19 (accounts) and #20 (sync) merged; PR 3 not started.**
Planned and built from `docs/plans/2026-10-08-m5-accounts-sync.md`; per-case
results are in the PR #19 and #20 descriptions, and both PRs' as-built notes
are at the bottom of the plan. #21 (lint ignores `src-tauri/target`) also merged.

### Product decisions, made with Lucas while planning

The app is for **Lucas plus invited friends and family**, not one person's
two machines (Lucas's correction mid-planning — design for other people's
data and other people's older app versions). From that:

- **An account is required; no guests.** Supersedes the architecture doc's
  guest-first design. Email + password; email confirmation and password
  reset by a **6-digit code typed into the app** (no links or redirects).
- **Invite-only sign-up** (`npm run invite -- add <email>`).
- **One local store per account** (`work-timer-account-<userId>`); sign-out
  keeps it. **History from before M5 was not carried over** — the old
  `work-timer` store is never opened.
- **Sending email:** Lucas's Gmail as custom SMTP on the hosted project
  (Supabase's built-in email only reaches the project team).
- **Mac users get the web version**, installed as a web app. No macOS build.
- **Release (installer, auto-update, web hosting) is its own milestone** after M5.
- **Development runs on a local Supabase stack** (Docker); release builds
  talk to **one shared hosted project**.

### Things worth not rediscovering

- **Docker Desktop is now required for development** (`npx supabase start`).
  Setting it up on this machine needed `wsl --install --no-distribution` in an
  admin PowerShell and a reboot; firmware virtualization was already on. The
  other machine will need the same.
- **Bugs the acceptance passes caught, all fixed before merge:**
  - The invite check compared citext with `=` inside a function whose
    `search_path` is empty, so it silently became case-sensitive.
  - supabase-js labels every HTTP 500 `AuthRetryableFetchError` (same class as
    "no network"), so an uninvited sign-up said "Couldn't reach the server".
  - A batch refused as "not valid yet" (a fast device clock) stopped the whole
    sync; now rows retry one at a time and only that one waits.
  - pgTAP fixtures reused the test-account emails and broke once those
    accounts existed locally; they now use `rls-a@` / `rls-b@`.
- **Driving the app from scripts:** scripted `focus()`/`blur()` don't fire in a
  background window, so a rename that "didn't save" in a script is the script.
  Use real input in the browser pane, or `Emulation.setFocusEmulationEnabled`
  over the DevTools protocol (added to the scratch `cdp.mjs`).
  `Network.emulateNetworkConditions` gives a true offline test.
- **The packaged app's origin is `http://tauri.localhost`**, not
  `tauri://localhost` (CLAUDE.md corrected). It has its own storage.
- **Claude's browser pane lost its site data across the reboot**; the M4
  browser test data is gone. Not app data loss.
- **The real adapter has an integration test** against the local stack, off
  by default — command in `supabase/README.md`.

### Test data on the local stack

Two local test accounts (`a@test.local`, `b@test.local`; password in
`supabase/README.md`) with a handful of sessions, two "Newer" tags left by the
integration test, and the tag "Focus". `npx supabase db reset` wipes it all.
The desktop app's and the browser pane's account stores mirror it.

### Next

- **M5 PR 3:** live updates (Supabase Realtime triggering a pull), settings
  sync (mode + Pomodoro lengths, last-write-wins), delete-account (typed
  confirmation), and the `app_config.min_client_version` "Please update" check.
  Acceptance cases 23–26. Stay on Opus.
  **(Done 2026-10-13 — merged as PR #23; see the entry above.)**
- **Case 29, by hand, Lucas:** create the free hosted Supabase project and run
  the steps in `supabase/README.md` ("Setting up the hosted project"),
  including the Gmail app password, which needs 2-step verification. I can't
  do this one.
- **The other machine** needs Docker Desktop (with WSL) before it can run the app in development.
- Autostart's reboot check, still carried over.

---

## 2026-10-08 — M4 merged: archivable tags and a stats view

**Status: merged (PR #17 as `ccc10f4`); all 29 acceptance cases passed.**
Built from `docs/plans/2026-10-08-m4-tags-stats.md`. 27 of 29 cases passed
(unit tests or the browser build) before the merge, with per-case results in
the PR #17 description. Cases 28 and 29, the desktop ones, were not run
before the merge; they were run afterwards, the same day, against
`npm run tauri:dev` and passed (see "The desktop pass" below).

### Product decisions, made with Lucas while planning

- **A tag can change while a session runs, and freezes when it ends.** That
  keeps finished sessions immutable, which M5 sync relies on.
- **Calendar week or month, pageable, plus All time.** Weeks start Monday.
- **Time with the app fully quit is not "away".** This closes the open
  question from 2026-10-06. No code changed.
- **No `runId` index.** No stat queries by run. This closes the M3 plan's
  question.

### Things worth not rediscovering

- **A latent M3 bug, fixed here.** `startNextBlock` used to take the tag from
  the machine's in-memory `result`, which is gone after a reload during a
  break, so block 2 would have lost its tag. It was invisible while every tag
  was null. The run now carries `PomodoroRunRow.tagId`, written in the same
  transaction as the block's own `tagId` (`setInFlightTag` in
  `sessionRepository.ts`; `setRunTag` for breaks). Acceptance case 8 reloads
  during a break to guard it.
- **The tag palette was changed mid-build, after the dataviz validator
  failed it.** The first draft was six pale existing tokens (blush vs cool,
  ΔE 6.5 for normal vision). The shipped set is lavender, mint, rose plus
  three new tokens (`--color-tag-gold`, `-sky`, `-peach`). It passes colour-blind
  and normal-vision separation, but still fails the validator's lightness-band
  and chroma-floor checks because the app is deliberately pastel. A tag's
  name is always printed next to its colour, so colour is never the only cue.
  If the colours ever look wrong on the real screen, that is the known
  trade-off, not an oversight.
- **Tags are the one mutable table.** They carry `updatedAt` so M5 can sync
  them last-write-wins; sessions stay append-only, and a finished session's
  `tagId` is never rewritten.
- **Dexie reports its version times ten.** `indexedDB.open('work-timer')`
  shows `version: 30` for schema v3. Not a bad upgrade.
- **Recent weeks showing "Ended early: 0" was chance.** In the seeded data
  the last cancelled session happened to be on 25 Sep. Checked against the raw
  rows before assuming the stats were wrong.
- **The browser tool's `javascript_exec` times out at 45 s.** A script that
  polls longer keeps running in the page but its result is lost. Poll the
  database in short calls. Poll for the *outcome* in the database, not for
  text in the page: a regex for "star" matched the app name "STARKEEP" and
  returned instantly.
- **Dev helpers now share one object.** The sky's `installDevTools` used to
  replace `window.__starkeep`, which would have wiped the stats helpers
  depending on load order. Both now merge. `__starkeep.seedHistory(days)`
  writes sessions marked `device: 'dev/seed'`, and `clearSeeded()` removes
  exactly those. Seeded sessions are ordinary completed sessions, so they
  also appear as stars in the sky.

### The desktop pass (cases 28 and 29)

Run by Claude, not by hand, by driving the real desktop window over
WebView2's remote-debugging port. Observed results:

- **28 passed.** A 1-minute countdown tagged "Desktop check", started through
  the picker, completed with that tag. Stats showed it in the week's bars
  (Thu 8 Oct), in the tag breakdown ("Desktop check · 1 min") and as the top
  history row. The older M2/M3 desktop test sessions appear there too.
- **29 passed.** A 2-minute tagged countdown with the mini window popped out.
  The main window was closed (hides to the tray): its `visibilityState` went
  `hidden` and its countdown froze, while the mini window kept counting
  (01:15 to 01:09 over 6 s). After restoring, the main countdown caught up to
  match the mini window, 23,242 ms of away time had been recorded, and
  changing the tag to "Second tag" mid-session left the mini window
  unaffected. The finished row was `completed` with "Second tag" frozen on it
  and `awayMs` 23242.
- **What this does not cover.** It was scripted DOM interaction, not mouse
  clicks, and nobody looked at the screen, so layout and look on the desktop
  window are unchecked. "Hidden to the tray" was done by posting `WM_CLOSE`
  (what the close button does) and "restore" by launching the exe a second
  time (the single-instance handler calls the same `show_main_window` as the
  tray menu). Clicking the real tray icon, and minimising, were not tried.
  The tag was changed after restoring, not while the window was hidden.
- **Cosmetic, not filed:** one minute against five hours shows "0%" in the tag
  breakdown, because `percentOf` rounds to a whole percent.

### How to drive the desktop app from a script

- Set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  before `npm run tauri:dev`. `http://127.0.0.1:9222/json` then lists the main
  window and, once popped out, the mini window (`?window=mini`) as separate
  pages. Node 24's built-in `WebSocket` is enough to send the Chrome DevTools
  Protocol `Runtime.evaluate` and run JavaScript in them.
- Under `tauri dev` the window's origin is `http://localhost:5173`, not
  `tauri://localhost` (that is the packaged app). It is still a different
  WebView2 profile from Claude's browser pane, so the two stores stay apart.
- Stop everything afterwards with the process list, as CLAUDE.md says:
  killing the npm process alone leaves `starkeep.exe` and Vite running.

### Test data left behind

The **browser build's** store (`http://localhost:5173` in Claude's browser
pane) has four tags (Writing, Reading, Admin, Focus) and a handful of
sessions from the browser acceptance pass. The 82 seeded sessions were
removed.

The **desktop** store gained two tags ("Desktop check", "Second tag") and two
sessions from the desktop pass. It still holds the M2 and M3 test sessions
noted in the 2026-10-08 entry below. The unfinished Pomodoro run left over
from the M3 desktop pass (it was sitting on "Break's over, Start block 2") was
ended with "End run" to get a clean idle screen; that wrote no session.
**(Superseded 2026-10-08 — since M5 both stores are the legacy `work-timer`
database, which is never opened again; the test data no longer shows
anywhere.)**

### Next

- Autostart's reboot check, still carried over.
- **M5 (accounts and sync).** Note for its plan: tags are mutable, so they
  need last-write-wins on `updatedAt`, unlike sessions.
  **(Superseded 2026-10-08 — built in PR #20: tags sync last-write-wins on
  `updated_at`.)**

---

## 2026-10-08 — M3 desktop pass done and merged; two dev-loop gotchas

**Status: merged (PR #13 as `b4af186`; notes in PRs #14 and #15).** Lucas
ran the six desktop-only M3 cases by hand with `npm run tauri:dev`; all
passed, results are on PR #13. The 2026-10-07 entry below has the design.

### The desktop database now holds Pomodoro test runs

The hand run wrote real rows to the desktop app's IndexedDB: several
`mode: 'pomodoro'` sessions with 1-minute blocks (dev lengths), one cancelled
block, and the saved Pomodoro settings (1 / 1 / 2 min, long break every 2)
in `meta`. Together with the M2 seed data noted on 2026-10-07, that sky is
not a real history. If a clean desktop sky matters before real use, clear
them — still not done.
**(Superseded 2026-10-08 — moot: M5 never opens the pre-account store.)**

### Things worth not rediscovering

- **Stopping a background `npm run tauri:dev` does not stop its children.**
  Killing the npm process left `target\debug\starkeep.exe` and Vite
  (`node …\vite\bin\vite.js`) running, with Vite still holding port 5173 —
  which would blank the next `tauri:dev` window (CLAUDE.md: strictPort).
  Check with `netstat -ano | grep ":5173 "` and stop the listed processes
  before relaunching or switching branches. Now also in CLAUDE.md.
- **Claude's Terminal panel can't run commands on this machine yet.** The
  pwsh shell comes up, but Claude's shell integration fails to load
  (`claude-desktop.ps1` not found under
  `AppData\Roaming\Claude\terminal-shell-integration\pwsh\`), so
  `run_in_terminal` never sees a prompt and gives up after 60 s. Long-running
  commands were run as background processes instead. Likely an app install
  issue, not a repo one.
- **A tray Quit shows up as a clean exit** (code 0) plus a WebView2 line,
  `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`. That line
  is routine shutdown noise, not a crash.

### Next

- **M4, tags and stats.** Questions for its plan, carried from earlier
  entries: should time with the app fully quit count as away (2026-10-06),
  and should `runId` get an index once stats query by run (M3 plan)?
  **(Superseded 2026-10-08 — M4 merged as PR #17; both questions are answered
  in the entry above.)**
- Autostart's reboot check, still carried over.
- Optionally, clear the test data from the desktop store (see above).
  **(Superseded 2026-10-08 — moot: M5 never opens the pre-account store.)**

---

## 2026-10-07 — M3 Pomodoro built; desktop acceptance still to run

**Status: open PR #13 (`feat/m3-pomodoro`).** Planned and built in one
session from `docs/plans/2026-10-07-m3-pomodoro.md`. 18 of the 24 acceptance
cases pass, either in the browser build or as unit tests. Six need the desktop
app and have not been run, and by the norms they block the merge. Per-case
results are in the PR #13 description. **(Superseded 2026-10-08 — the six
desktop cases passed, observed by hand by Lucas with `npm run tauri:dev`;
PR #13 merged as `b4af186`, all 24 cases passed. Next milestone: M4, tags and
stats.)**

### Product decisions, made with Lucas while planning

- **One star per completed focus block.** This settles the question the M2
  entry left open.
- **The next block waits for a click.** Focus → break is automatic, but
  break → focus never is. That way no star can be earned while away.
- **Fully custom lengths**: focus, short break, long break, and blocks per
  long break, remembered in `meta`. One-minute lengths exist only in dev
  builds and are labelled "(dev)".

### The design choice that matters most: a block is just a session

A focus block is an ordinary `SessionRow` with `mode: 'pomodoro'` plus two
optional, unindexed fields, `runId` and `runIndex`. That means no Dexie
version bump and no rewrite of any completed row. Breaks are not history. The
only break state is the in-flight run in `meta.activeRun`, deleted when the
run ends. Whether a break is over is derived from `break.startedAt +
durationS`, never stored. Skip break works by shortening `durationS` to
"now", which keeps it derived.

The architecture doc's `session_phases` table is therefore **not built**.
CLAUDE.md's decisions section and the architecture doc both say so now. The
sky needed zero changes: blocks are sessions, so they fill constellations,
and the "won't count toward…" hint works per block.

### Things worth not rediscovering

- **A block's break starts at the block's planned end**, in the same
  transaction that completes it (`finishSession` in
  `src/features/timer/data/sessionRepository.ts`). Quitting through a block
  and its break therefore resumes straight to "Break's over".
- **The host deadline chains the break.** `CompletionPort.arm` takes an
  optional `then` notice, and the Rust thread (`src-tauri/src/deadline.rs`)
  runs it as a second stage. The break's tray countdown and notice then need
  nothing from a possibly throttled webview.
- **A race caught while building:** the webview re-arms the break when it
  sees a block complete. If it got there before the Rust thread fired the
  block's own "Focus block done" notice, the generation bump would have
  silently dropped that notice. Fix: **re-arming a notice the host already
  holds is a no-op**, in Rust (`Armed::already_holds`) and in the web port.
  Keep that rule if the port changes.
- **The tray label** is `Break · N min left` during a break, from the new
  optional `label` on the notice. Focus time stays plain `N min left`.
- **Claude's browser pane counts as hidden** while it is not on screen, so
  blocks run there record large `awayMs` values. That is the app reading
  visibility correctly, not a bug.
- **Vite's dev server reloads the page when source files change mid-test.**
  It wiped a page-side helper once during the acceptance run. Harmless, and
  it doubled as a free resume test.

### Test data in the browser build

To check the "too short" warning (case 5), the M2 helper
`window.__starkeep.seed` added fake completed sessions to the **browser
build's** IndexedDB, at origin `http://localhost:5173`, to unlock a Hard
constellation. The desktop store is a different origin and was not touched.

### Next

- **Run cases 15, 18, 19, 20, 22 and the desktop half of 21 by hand** with
  `npm run tauri:dev`:
  - 15: quit through a block and its break, then relaunch.
  - 18: a break spent in the tray adds no away time.
  - 19 and 20: block-end and break-end notifications, and the tray text.
  - 21: no notice fires after skipping a break or ending the run.
  - 22: the mini window shows the break.
  Record the results on PR #13, then merge if they pass. **(Done
  2026-10-08 — all six passed and were recorded on PR #13, which merged as
  `b4af186`. Not covered: a packaged `tauri build`, and End run during an
  armed break on desktop, which shares Skip break's disarm path.)**
- Autostart's reboot check, still carried over.

---

## 2026-10-07 — M2 merged: the sky, with chosen and tiered constellations

**Status: merged (PR #11, `0d1ab46`).** Built from
`docs/plans/2026-10-06-m2-sky.md`, which was written in this session because
the architecture doc only had a one-line row for M2. All 21 acceptance cases
passed. The desktop ones were observed by hand on Windows, and per-case
results are in the PR #11 description.

### Product decisions, made with Lucas while planning

The plan's tables hold the full reasoning. In short:

- **The sky lives behind the timer.** "View sky" fades the timer out
  (it stays mounted, so a running session is untouched). There is no new
  route; a path would 404 on reload in the packaged app.
- **The user picks the next constellation from a catalogue** of
  hand-designed shapes *and* generated "wild" ones, side by side.
- **Difficulty combines all three levers Lucas asked for.** Star count and a
  minimum session length per star are the gates; total focus time is shown
  and makes longer sessions' stars brighter. That split is **my
  interpretation**, flagged for review in the plan, because three
  independent gates would mostly duplicate each other.
- **A simple unlock gate now** (medium after one easy, hard after one
  medium). **M6 must fold this into its unlock system** rather than add a
  second one.

### The design choice that matters most: the sky is derived

The only new stored fact is "at time T, the user chose constellation C":
schema v2 adds an append-only `constellations` table. Which star sits in
which slot, completion, wandering stars and unlocks are all recomputed by
`deriveSky()` in `src/features/sky/domain/derive.ts`. Finishing a session
writes nothing new, so completed sessions stay immutable and M5 sync stays
append-only.

The rule that makes it work: a session belongs to the choice whose window
(its `chosenAt` up to the next choice) contains the session's **`endedAt`**.
So a constellation chosen mid-session gets that session.

### Things worth not rediscovering

- **Points are stored in growth order.** Every star after the first
  connects to an earlier one, so a half-built constellation is always one
  connected figure. Tests enforce it for the catalogue and 200 generated
  seeds per tier. **Catalogue keys are persisted, so never rename or remove
  one.**
- **The canvas and SVG use hex colours from `design-tokens.mjs`, never
  `var(...)`.** The mirror grew to cover star and nebula colours; its drift
  test was extended to match.
- **Mixing nebula hues in one place turns them grey.** The first render
  looked muddy until each cloud got a single hue. Faint gradients also band
  visibly, so the nebula is dithered with seeded noise.
- **Behind a running timer the SVG is static.** Twinkle and shimmer run only
  in View sky, so an hours-long session doesn't pay for a repainting layer.
  The canvas loop is capped at 24 fps and stops when hidden. Measured on
  desktop: under 3% CPU visible; frame counter frozen in the tray.
- **Claude's browser pane stalls CSS transitions while it is hidden**, which
  briefly looked like View sky's fade was broken. Recorded in CLAUDE.md.
- **Dev builds have `window.__starkeep.seed(n, minutes)` and `.frames()`**
  for testing tiers and the frame loop. None of it reaches production; the
  bundle was checked.

### The desktop database contains test data

The acceptance run seeded completed sessions (`device: 'dev/seed'`) and chose
The Kite, The Lantern and The Great Heron. They are real rows in that
machine's IndexedDB, so that sky is not a true history. If a clean sky
matters before real use, clear them — not done yet.

### Next

- **M3, Pomodoro.** Open question for its plan: does a Pomodoro session make
  one star, or one per work phase? It changes how stars fill constellations. **(Done 2026-10-07 — one star per
  block; built as open PR #13, see the entry above.)**
- Autostart's reboot check, still carried over.
- Optionally, a dev helper to clear `dev/seed` sessions and test choices
  from the desktop sky.

---

## 2026-10-06 — M1 merged after a desktop acceptance pass that caught one bug

**Status: merged (PR #8, `91a3ce6`).** All 17 acceptance cases from
`docs/plans/2026-10-03-m1-timer.md` passed, the desktop ones observed by hand
on Windows. The per-case results are in the PR #8 description.

### The bug: WebView2 never knew its window was hidden

The first desktop run of the away-time case (O6.17) recorded `awayMs: 0` for
a 5-minute session spent almost entirely in the tray. A `visibilitychange`
listener pasted into the webview console logged nothing across close-to-tray
*or* minimise. That confirmed `document.visibilityState` stays `'visible'`
whenever the Tauri *window* is hidden or minimised: neither action reaches
WebView2's controller.

The fix (`adb2694`) is in `src-tauri/src/lib.rs`. Alongside every window
hide or show, and on every `Resized` event (which is how minimise and restore
arrive), it also calls the *webview's* own `hide()`/`show()`. That goes down
to WebView2's `SetIsVisible`, which is what fires `visibilitychange`. It is
deduplicated with an `AtomicBool`, since `Resized` fires continuously during
a drag. Two details worth not rediscovering:

- `Manager::get_webview` is gated behind Tauri's `unstable` feature, but
  `WebviewWindow` implements `AsRef<Webview>`, which gives the same access
  without the feature.
- Hiding the webview also lets WebView2 throttle the page, which is what
  Microsoft recommends for minimised apps. It is safe here only because the
  session deadline lives in the Rust thread (`deadline.rs`), not in JS timers.

After the fix, the listener logged hidden/visible for both tray and
minimise, and the re-run recorded `awayMs: 297319` for a session spent ~4m57s
of 5m in the tray. Now recorded in CLAUDE.md's environment section.

The JS side needed no change. The original design was right; it had just
never been given a real visibility signal on desktop. One consequence: before
the fix, the 4×/second repaint loop kept running in the tray for nothing.

### How reloads were verified

A correct resume after F5 looks exactly like F5 doing nothing. The countdown
just carries on. So "it didn't go back to 1:00" proves nothing on its own.
The check that settled it, pasted into the webview console right after F5:

    [performance.getEntriesByType('navigation')[0].type, Math.round(performance.now() / 1000) + 's ago']

`'reload'` with a small number proves a real reload happened. Use it for any
future resume test.

### Open question for M4: should time with the app quit count as away?

The quit-through-deadline run (O1.2) recorded `awayMs: 0` despite the app
being closed for over two minutes. Away time is only measured while the app
is running and hidden, so time fully quit is invisible. The plan never said
which is right. It is a stat only and cannot affect success, so this is a
stats-design question for M4, not a bug.
**(Superseded 2026-10-08 — decided: quit time is not away. See the M4 entry.)**

The 2026-10-03 entry's "unconfirmed finding" (`awayMs: 51999` in the browser
pane) remains unconfirmed. Plausibly the pane was hidden from view, but it
was never isolated.

### Next

- **M2.** Nothing blocks it. **(Done 2026-10-07 — merged as PR #11; see the entry above.)**
- Autostart's reboot check, carried over again. The 2026-10-06 restart could
  not test it: "Launch at startup" was unticked on that machine. Tick it,
  restart, and see whether the app opens on its own.

---

## 2026-10-03 — M1 timer built; desktop acceptance still to run

**Status: open PR #8 (`feat/m1-timer`).** Built from
`docs/plans/2026-10-03-m1-timer.md`. Everything automatable passes, but the
desktop-only acceptance cases haven't been run yet, so the PR is **not ready
to merge**. **(Superseded 2026-10-06 — all 17 cases passed after
one fix; merged as PR #8. See the entry above.)**

### Where verification stands

All automated checks pass: lint, typecheck, format, web build, 85 Vitest
tests (54 new), `cargo clippy --all-targets -D warnings`, and 4 Rust unit
tests. The browser build was exercised in the preview pane: resume after a
reload, a 1-minute completion, cancel and cancel-dismiss, permission denied,
and a second tab at `?window=mini` following a session started in the first.
The PR body has the per-case table.

**Not yet observed, all needing a person at `npm run tauri:dev`:** quit
through the deadline (O1.2), minimise to tray and restore (O2.5), tray reset
after cancel (O2.6), reload twice after completing hidden (O3.9), tray
tooltip countdown (O4.12), notification within seconds of the deadline
(O4.13), mini window always-on-top (O4.14), and a deliberate ~30s hide for
`awayMs` (O6.17). Use the "1 min (dev)" preset.

### Decisions made while building

- **The autostart toggle survived** as a footer checkbox on the timer screen.
  The plan said to remove the M0.5 diagnostics, but that screen was the only
  place autostart could be changed.
- **The Rust deadline commands are `async` on purpose.** Synchronous Tauri
  commands run on the main thread, and tray updates are dispatched *to* the
  main thread. A sync command waiting on the deadline lock while the worker
  thread holds it and waits on the main thread would deadlock. Rationale is
  in the module comment of `src-tauri/src/deadline.rs`.
- **The deadline thread sleeps at most 5s at a time.** On Windows,
  `thread::sleep` doesn't count time the machine spent suspended, so one long
  sleep across a lid-close would wake late.
- **Completion never disarms the host deadline; only cancel does.** On
  desktop, a disarm sent when JS notices completion could race the Rust
  thread and swallow the notification.
- **The mini window shows `--:--` once the deadline passes**, even before the
  main window records the completion. A hidden main window's timers are
  throttled, so that write can lag by up to a minute.

### Unconfirmed finding

The completed browser run recorded `awayMs: 51999`, which equals the time
from the reload to the deadline. The likely cause is that the preview pane
was hidden from the user's view and the page therefore loaded as `hidden`. A
cancelled run with no visibility changes recorded 0, so nothing suggests a
bug, but this explanation hasn't been proven. Don't treat it as an
environment fact until O6.17 is run deliberately.

### Next

- Run the desktop acceptance cases above and record the results on PR #8.
  Merge only after they pass. **(Done 2026-10-06.)**
- Autostart's reboot check, carried over from 2026-09-01.

---

## 2026-09-01 — M0.5 landed, and the desktop shell is verified on screen

**Status: merged (PRs #3 and #4).** The Tauri pivot from the entry below is in,
and the OS-level behaviour it could not check in-session has now been confirmed
by hand.

### The unverified list from below is closed

M0.5 shipped with five acceptance items that needed eyes on a screen, since
nothing in this setup can observe an OS window. All five were checked and pass:
the window itself, the tray icon and its menu, close-to-tray (X hides rather
than exits), a real notification firing, and the autostart toggle.

One genuine gap remains: **autostart has not survived an actual reboot.** The
toggle flips and reports `on`, but the reboot test was deferred.

### Two visual defects, found by looking at a screenshot

Both were invisible to every automated check, because both are about *context*
rather than correctness:

- **The title bar rendered light** against a deep-indigo app. Windows themes it
  from the system setting unless told otherwise; the window now declares
  `"theme": "Dark"`.
- **The in-app logo had a box around it.** It reused `favicon.svg`, which paints
  an opaque rounded square behind the star. That is *correct* for a launcher
  icon — it needs its own ground against arbitrary wallpaper — and wrong on a
  page that is already night-coloured. Added `shared/ui/StarMark`, the star
  alone, reading its colours from the design tokens.

Worth knowing for any future SVG work: **CSS custom properties inside SVG
gradient stops fail silently to black** when they don't resolve. Verified all
six stops compute to real token values rather than assuming they would.

### Environment fact worth not rediscovering

**Running `git checkout` while `tauri dev` is up kills it.** The watcher saw
`src-tauri/Cargo.toml` disappear mid-checkout and exited 101:

    error: could not find `Cargo.toml` in ...\src-tauri or any parent directory

Not an app bug — a dev watcher cannot survive its own source tree being swapped
underneath it. Stop the dev process before switching branches. Now recorded in
CLAUDE.md.

Also confirmed: the CI Rust cache works. The desktop job went 6m40s cold to
1m33s warm.

### Housekeeping

All four merged branches deleted from the remote; `master` is now the only
branch, locally and remotely. Working tree clean, lint/build/27 tests green.

### Next

- **M1, the timer.** Nothing blocks it. Design is settled in the entry below:
  countdown only, elapsed from timestamps, `endedAt` records the *planned* end
  rather than when the app was reopened. **(Added 2026-10-03 — the full plan,
  with contracts and acceptance tests, is now `docs/plans/2026-10-03-m1-timer.md`.
  Start there.)**
- Two decisions deferred into M1: whether to render remaining minutes *into*
  the tray icon image (Windows has no persistent tray label, only a tooltip),
  and what the mini window actually displays. **(Superseded 2026-10-03 — both
  decided in the M1 plan: tooltip only, and a read-only countdown.)**
- Autostart's reboot check, whenever the machine next restarts.

---

## 2026-08-31 — Pivot: desktop-only Tauri app, and leaving no longer forfeits

**Status: open PR (M0.5).** **(Superseded 2026-09-01 — merged as PR #3; see the
entry above.)** Two decisions reversed on the same day, both while
planning M1. They are related: one of them is what made the other obvious.

### Decision 1 — leaving the app never forfeits a session

Planning M1's abandonment mechanic turned up a perverse edge. On a phone,
**locking the screen and switching apps are indistinguishable to a web app** —
both just report `hidden`. So strict abandonment would punish locking your
phone and putting it in your pocket, which is the single best focus behaviour
there is.

The resolution was to drop the mechanic entirely: the timer runs on wall-clock
time regardless of window state, and **the only way to fail is to cancel
deliberately**. Honour system, closer to how Forest frames the commitment
anyway.

This turned out to be *less* work, not more, because elapsed time was already
computed from timestamps. There is no clock to keep alive — on reopening, the
app compares `startedAt` to now and knows where the session stands, including
that it finished an hour ago. Background continuation came for free.

Consequences: no grace period, no wake lock, no strict/lenient policy, no
`abandoned` outcome, and `SessionRow.policy` deleted. `awayMs` survives as a
pure statistic that must never affect success.

### Decision 2 — desktop-only, via Tauri

Mobile dropped completely. That removed the constraint the whole architecture
was bent around — the PWA choice existed solely to reach an iPhone for free.

**Tauri over Electron:** ~10MB bundle and ~40MB idle versus ~150MB and
~250MB. For something meant to sit running for hours, that gap matters more
than Electron's gentler setup.

**The browser build stays**, which is the consequential half of the decision:
every native capability now needs a browser fallback forever. That seam is
`src/shared/runtime/` — four ports (notifications, tray, mini window,
autostart) with a Tauri implementation and a web one, chosen once by
`getRuntime()`. The rule that makes it pay: **unsupported is a silent no-op,
not a throw**, so feature code calls `tray.setStatus(...)` unconditionally and
simply has nothing happen on the web. `isSupported` exists only for hiding UI.

Almost all of M0 survived — React app, tokens, Dexie, clock, ids, icon
generator, lint boundaries, CI. Roughly 40 lines were genuinely wasted (touch
detection, iOS meta tags and CSS, two icon sizes). One known limit disappeared
outright: **iOS PWA storage eviction no longer applies**, since Tauri keeps
IndexedDB in the app data directory.

### Things worth remembering

- **A client-side route would 404 in the packaged app.** Tauri serves the
  frontend over an asset protocol with no `index.html` fallback, so `/mini`
  works in dev and breaks in production. Extra windows are addressed with
  `?window=mini` instead, and the mini timer is rendered as a *surface* rather
  than a route — which is arguably the more honest model anyway.
- **jsdom crept back in and cost 60s.** The first runtime test used
  `// @vitest-environment jsdom` and took the suite from 1.7s to 62s, 56s of
  it jsdom setup. Rewritten to stub `window` by hand in the `node`
  environment: three lines, and the suite went back to 2.9s.
- **The Windows tray has no persistent label**, only a tooltip — so a
  glanceable countdown is macOS-only unless the remaining minutes are rendered
  *into* the tray icon image. The procedural PNG generator could do that.
  Deferred to M1.
- Toolchain installed this session: Rust 1.98 via `winget Rustlang.Rustup`,
  and VS 2022 Build Tools with the VCTools workload (MSVC 14.44, Windows SDK
  10.0.26100). Neither was present.

### Next

- M1 is the timer, now considerably simpler than originally planned. Its
  design is settled: countdown only, timestamps only, `endedAt` records the
  *planned* end rather than when the app was reopened.
- Tray countdown, mini-window contents, and the completion notification are
  M1 work — the M0.5 shell only proves the seam.
- Cloudflare Pages and iOS install verification from the M0 entry below are
  **no longer relevant** — there is no iPhone target, and the desktop app
  needs no hosting. Web hosting is only worth setting up if the browser build
  is ever actually wanted somewhere.

---

## 2026-08-31 — Named the app Starkeep (provisionally)

**Status: added to the open M0 PR.** The M0 entry below flagged that the app
had no name. It has one now, though it is explicitly not locked in.

### Why Starkeep, and what was ruled out

Checked three candidates by web search — not an authoritative trademark
clearance, but enough to spot obvious collisions:

- **Astra** — ruled out hard. `astra.app` is Topaz Labs' AI video upscaler,
  there are several live USPTO software-class marks, and the Astra WordPress
  theme is one of the most-installed themes on the web.
- **Glimmer** — ruled out on findability. An App Store app is named exactly
  that, plus a dating app, an Australian sustainability app, a creator
  platform at glimmer.io, and an AI PDF tool. `glimmer.app` is parked on
  GoDaddy with a for-sale page.
- **Starbloom** — workable but compromised. `starbloom.app` is a live AI
  hiring/ATS product, `starbloom.com` is broker-parked as a premium domain,
  and STARBLOOM LTD is a registered UK company.
- **Starjar** (bonus check) — dead on arrival, six-plus children's chore-chart
  apps. Would miscategorise the app entirely.
- **Starkeep** — returned nothing at all. Also the better name on merit:
  "keep" means both to retain (you keep the stars you earn) and a stronghold,
  which suits an app about defending your attention.

**The bar here is lower than commercial trademark clearance**, and that was
deliberate: the no-paid-services rule means no domain purchase, so the app
will live on a free `*.pages.dev` subdomain. What actually matters is not
being buried in search and not colliding with something famous.

### How the rename was made cheap

The name now lives in `brand.mjs` (with `brand.d.mts` for types), mirroring
the `design-tokens.mjs` pattern. It is read by the PWA manifest and the HTML
title/description (via a small `inject-brand` Vite plugin that substitutes
`%APP_NAME%` into `index.html`) and by the React app through
`src/shared/config/brand.ts`. Changing the name is a one-line edit to
`brand.mjs`; nothing else hard-codes it.

The repository stays `work-timer` — renaming a GitHub repo is a separate
decision and nothing in the code depends on it.

### Next

- Name is provisional. If it changes, edit `brand.mjs` and nothing else.

---

## 2026-08-30 — M0 foundation: installable PWA shell

**Status: open PR.** First real code in the repo. Brainstormed the app from
scratch, wrote the architecture plan, then built the M0 foundation milestone
from it.

### What the app is

A Forest-style focus timer themed as a pastel night sky — finish a session,
earn a star; accumulate stars into constellations. The full plan (stack, data
model, milestones M0–M6, acceptance tests) is at
`docs/plans/2026-08-30-architecture.md`.

### The constraint that decided the platform

Wanting it on **iPhone + Windows + browser** while paying **nothing** has
exactly one answer: a PWA. Native iOS needs a $99/year Apple Developer account
*and* a Mac to build on, so the App Store is off the table entirely. An
installable web app covers all three targets from one codebase.

A useful thing fell out of that: the Page Visibility API works on installed
iOS PWAs, so the "you left the app, your session dies" mechanic is genuinely
enforceable on a phone. That was the part most at risk of not being possible,
and it is not a compromise.

### Decisions worth not re-litigating

- **Timestamps, never tick counting.** iOS freezes JavaScript outright when a
  PWA is backgrounded and browsers throttle `setInterval` in hidden tabs, so
  any timer that accumulates elapsed time by counting ticks silently
  under-reports. `src/shared/lib/clock.ts` exists to make the correct approach
  the easy one, and exposes a monotonic source alongside wall-clock so device
  clock changes are detectable.
- **Completed sessions are immutable**, which makes sync append-only and
  therefore conflict-free. Same reasoning drives an append-only currency
  ledger (balance = `SUM(delta)`) and deriving streaks by query rather than
  storing a counter.
- **Stars are seeds, not images.** A session stores a 16-char seed; the
  generator turns it into a star deterministically. Syncing a few bytes
  reproduces the identical sky on another device.
- **Sync is sequenced at M5, not M0**, despite "cloud sync from day one" being
  a stated want. Syncing a schema that is still moving means writing every
  migration twice. Nothing in M0–M4 needs redoing to add it later — records
  already carry client-generated UUIDs and are already immutable.

### Surprises during the build

- **Vitest defaulted to jsdom and it cost ~50 seconds per run** of pure
  environment setup, for tests that never touch a DOM. Switched the default to
  `node`; the suite went 39s → 1.7s. Component tests opt back in with a
  `// @vitest-environment jsdom` docblock.
- **`import.meta.url` is not a `file://` URL under Vitest** — it serves modules
  over http, so `fileURLToPath` throws. `src/styles/tokens.test.ts` resolves
  from `process.cwd()` instead.
- **Prettier rewrites `*emphasis*` to `_emphasis_` in markdown**, which would
  churn this file on every session. Markdown is now in `.prettierignore`. It
  had also mangled the `{{PROMPT}}` placeholders in the CI template into
  `{ { PROMPT } }`, though that file was being replaced anyway.
- **npm 11 blocks esbuild's postinstall** behind `npm approve-scripts`. It
  turned out not to matter — Vite builds fine without it — so it was left
  unapproved rather than granting a script it does not appear to need.

### Verified by hand, not just by CI

Ran the built app under `npm run preview`, then **stopped the server and
reloaded**: the app still rendered fully and IndexedDB still reported ready,
which is offline serving from the service worker confirmed for real rather
than inferred from the build output. Also confirmed the abandonment-policy
default flips `lenient` → `strict` under mobile emulation.

### Next

- **The app still has no name.** `work-timer` is the repo; "Work Timer" is a
  placeholder sitting in the manifest, `index.html`, and the icon generator.
  **(Superseded 2026-08-31 — named Starkeep, provisionally; the name now lives
  in `brand.mjs` alone. See the entry above.)**
- **Cloudflare Pages is not connected yet** — it needs an account and a repo
  authorisation that has to be done by hand. The build output in `dist/` is
  ready for it.
- **iOS install is unverified.** No iPhone was available in this session, so
  acceptance test 15 (home-screen install, standalone launch, offline) is
  outstanding. Everything it depends on — manifest `display: standalone`,
  apple-touch-icon, service worker — is confirmed present and serving.
- M1 is the timer itself. Plan recommends staying on the stronger-reasoning
  model for it (suspension and clock-skew edge cases).
