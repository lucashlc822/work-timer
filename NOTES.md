# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-10-29 (evening) — Idle screen polish, PR open

**Status: branch `feat/idle-screen-polish`, PR open, not merged, not released.**
Plan: `~/.claude/plans/i-feel-like-we-peaceful-hellman.md`. UI only: no server
change, no migration.

### What changed

- Idle screen: the planned length is the hero (`PlannedTime`, same type as the
  running countdown); mode and length are `SegmentedControl`s; everything sits
  on one translucent card; Start has a soft glow; sliders use `.range-soft`.
- Footer: progress (constellation, Stardust) and navigation (View sky, Stats,
  Friends, Account) are separate groups; navigation has no outline.
- "Launch at startup" moved from the footer to Account ("This computer"),
  drawn as a switch over the same native checkbox (desktop only).
- `e2e/desktop/native.spec.ts` now opens Account to reach it.

### Next

- The `ui-ux-reviewer` pass (acceptance case 8) has not been run either.
- `AccountPanel.tsx` hard-codes "Starkeep" for the version line instead of
  `APP_NAME`; its own small PR.

### Things worth not rediscovering

- **A visually hidden (`sr-only`) checkbox can't be clicked by Playwright.** Its
  label sits on top and "intercepts pointer events", so the autostart test hung
  until its 10-minute timeout. The switch's input is now transparent
  (`opacity-0`) and fills the track instead, so it is what a click lands on.
  `e2e:desktop` is 5/5 after that (4 passed in the full run, the autostart test
  alone after the fix).
- Docker Desktop was off; `npx supabase start` says `StatusDbNotReadyError`
  for a minute after the engine comes up. Wait, don't retry in a loop.

---

## 2026-10-29 (R14 verified) — Installed app updated to 0.6.1

**Status: R14 passed, so every 0.6.1 acceptance case (R1–R14) now has an observed
pass.** Lucas ran it on his installed app: fully quit from the tray, relaunched,
saw "Starkeep 0.6.1 is ready", chose "Restart to update", landed signed in on
0.6.1, and a short session showed "Backed up". Reported by Lucas in chat; I did
not observe it myself. This closes the first "Next" item in the entries below.

### Next

- **Tell friends 0.6.1 is out.** Polish only; nobody is blocked.
- Everything else under "Next" in the entry below is unchanged: the dev server on
  5173, the three session worktrees, the two-person checks, the optional UI
  follow-ups.

---

## 2026-10-29 (end of session) — 0.6.1 released and logged; one check still Lucas's

**Status: everything is merged to `master` (#121–#124) and nothing is open.**
0.6.1 is the latest release (web and desktop). Local `master` matches
`origin/master`, with nothing uncommitted.

### Next

- **Lucas's installed app still has to be seen updating to 0.6.1** (R14 in the
  "Released 0.6.1" entry): "Starkeep 0.6.1 is ready" → "Restart to update" →
  signed in on 0.6.1 → a short session shows "Backed up". Not observed yet.
- **Tell friends 0.6.1 is out.** Polish only; nobody is blocked on it.
- **Restart the dev server on 5173 if wanted.** It was stopped on 2026-10-29 to
  free the port for `e2e:desktop`; it was another chat's, not part of any fix.
- **Three session worktrees exist again** under `.claude/worktrees/` (branches
  `claude/…`, made by other chats after the cleanup). Not touched. The ignore
  lines from #121 keep them out of `prettier` and `eslint`; remove them with
  the steps in the "Housekeeping" entry once those chats are done.
- Unchanged and still open: the two-person checks (a real shared constellation,
  focus together) and the optional UI follow-ups listed in the 2026-10-28
  (final) entry.

---

## 2026-10-29 (later) — Released 0.6.1: UI review polish

**Status: 0.6.1 is published (tag `v0.6.1`, Latest; web deployed from the same
commit, `7c7b64b`).** No migration; `min_client_version` is still null. Nothing
else is open (the PR carrying this entry, #124, has merged). Plan:
`~/.claude/plans/please-proceed-with-planning-dazzling-parnas.md`.

### Next

- **Lucas's installed app should offer "Starkeep 0.6.1 is ready"** (quit fully
  from the tray and relaunch to force the check), then "Restart to update"
  should land on 0.6.1 signed in, and a short session should show "Backed up".
  Not yet observed at the time of writing.
- **Tell friends 0.6.1 is out.** It is polish only, so no one is blocked on it.
- Still unrun: the two-person checks (a real shared constellation, focus
  together), which need a friend on 0.6.x. The optional UI follow-ups (focus
  the panel heading on open; `ink-secondary` for the Account version line) are
  in the 2026-10-28 (final) entry.

### What was done, in order

1. **Bump PR #123** (`version:set -- 0.6.1`: the five files, `package-lock.json`
   two lines), version tests 22/22, CI green, merged as `7c7b64b`.
2. **Pre-tag checks on that commit:** `e2e:desktop` 5/5 (3.2 min) and
   `e2e:update` 1/1 (2.0 min).
3. **Tagged `v0.6.1`;** `Release` green. The draft had 4 assets (installers
   2,332,431 bytes); `latest.json` said 0.6.1 at `/download/v0.6.1/`, signed with
   key `8E3AF18012526DA8`.
4. **"What's new" line** (Lucas approved the wording): polish and accessibility,
   smoother keyboard use, larger targets, easier-to-read text over the sky,
   clearer sync and offline messages, tidier narrow panels.
5. **Published by id with `tag_name` in the same call** (Lucas said "publish"):
   Latest `v0.6.1`, no `untagged-` tag; `Deploy web` green on `7c7b64b`.
6. **Live checks:** the web bundle (starkeep.vercel.app) reports 0.6.1;
   `Starkeep-setup.exe` served (206 to a one-byte range request);
   `min_client_version` null.

### Acceptance results

R1–R13 pass as run by me. R14 (the installed app updating) is Lucas's own
observation and was not yet made. Not covered: 0.6.1's own HTTPS update check
with the two patched TLS crates (`e2e:update` serves its fake release over
HTTP); a future 0.6.2 is the first real proof.

### Things worth not rediscovering

- **`e2e:desktop` needs port 5173 free.** A dev server left running from another
  chat held it (Vite on the main checkout); stopping it, then the test ran
  clean. Same cause as the `tauri:dev` blank window noted in CLAUDE.md.

---

## 2026-10-29 — Housekeeping: worktree ignores, finished worktrees, NOTES archive

**Status: #121 and #122 merged (see the 2026-10-29 (later) entry above for the
release).** #121 makes
Prettier and ESLint skip `.claude/worktrees`; the PR for this entry moves the
2026-10-22 to 2026-10-26 entries out of `NOTES.md` (1,305 → ~500 lines) into
`docs/notes-archive/2026-Q4.md`, byte for byte. Both close the two
"Housekeeping" items in the entry below. The 0.6.1 release is still Lucas's
call and not started.

### What was done

- The seven finished session worktrees are gone from disk and from git, and
  their seven local branches are deleted (`git branch -d`, so each was merged).
  The branches still exist on `origin`; deleting them is a separate call.
- Removing them needed three of them stopped first: leftover Vite dev servers
  (ports 5181–5183) from those worktrees held `esbuild.exe` and the rollup,
  tailwind-oxide and lightningcss `.node` files open, so `git worktree remove`
  and `rd` both failed with "Invalid argument" and "Access is denied".

### Things worth not rediscovering

- **A finished worktree can still have a dev server running.** Before deleting
  one, look for processes whose command line contains `.claude\worktrees\`
  (`Get-CimInstance Win32_Process`), and stop those first.
- **`git worktree remove` can fail partway:** it deregisters the worktree but
  leaves the folder. Finish with the `rd /s /q "\\?\…"` fallback, spelling the
  full path out (a shell variable inside it is refused), then
  `git worktree prune`.

---

## 2026-10-28 (end of session) — Everything merged, nothing released yet

**Status: merged to `master`, not published.** All of the UI/UX review work
(#99–#119) is on `master`, but the latest published release is still **v0.6.0**
(published 2026-10-27, tagged 2026-10-26 at `282e9a1`). So the web app (Vercel)
and friends' desktop apps have none of it. `master` is 59 commits ahead of the
tag, and `package.json` still says 0.6.0, so a release needs a version bump first.

Merging reaches nobody (`RELEASING.md`): only publishing a draft GitHub Release
ships the web version and the desktop update together. What would ride in the
next release is everything in the three 2026-10-28 entries and the two
2026-10-27 entries below them (keyboard focus, 24px targets, the honest sync
line, the Back button's footer, readable text over the sky, the Stats tabs, and
the rest).

Nothing on the server changed since v0.6.0 (only a note in `supabase/README.md`),
so there is no migration, `app_config.min_client_version` stays empty, and older
app versions keep working. 0.6.1 fits: fixes and polish, no new features.

### Next

- **(Done 2026-10-29, see the "(later)" entry above.)** **Release 0.6.1:
  Lucas's call, not started.** Per `RELEASING.md`: open the
  version-bump PR (`npm run version:set -- 0.6.1`), merge it, tag `v0.6.1`, let CI
  build the draft, then Lucas reviews the draft and clicks Publish.
- **(Done 2026-10-29, see the entry above.)** **Housekeeping, each its own
  change:** `NOTES.md` is past the ~1,000-line archive threshold (1,259 lines before this entry), so older entries should move
  to `docs/notes-archive/`. Seven finished session worktrees are still under
  `.claude/worktrees/` (their branches are merged); a local
  `npx prettier --check .` trips on them, CI doesn't.

### Things worth not rediscovering

- **To see what has actually shipped,** run `gh release list` and
  `git log --oneline <latest tag>..master`; `package.json`'s version only moves
  when a bump PR merges.
- **The local test accounts collect real sessions from scripted runs**
  (`a@test.local` has about 19). Harmless; `npx supabase db reset` clears them,
  after which the `a@`/`b@`/`c@` accounts need re-seeding and the reviewer's
  `ui-review@test.local` needs signing in again by hand.

---

## 2026-10-28 (final) — Medium and Low findings fixed; third review clean

**Status: #112–#118 merged; `master` passes lint, typecheck, 620 unit tests,
build and `e2e:web` 41/41, and the final `ui-ux-reviewer` pass found no
Blocker or High.** Every item from the confirmation review is fixed or closed
(see below); the review system has done its job for this round.

### Next

Optional, none started (each its own PR if wanted):

- **Focus on opening a panel lands on "Back to timer"**, the last control, so a
  keyboard user presses Shift+Tab to reach the content and a screen reader
  reads the button before the panel's title. It comes from `autoFocus` in
  `BackButton` (`HomeRoute.tsx`), which predates this work and was kept
  deliberately in #110 (the timer screen is `inert`, so focus has to go
  somewhere inside the panel). Better: focus the panel's heading
  (`tabIndex={-1}`) on open. `focus.spec.ts` asserts the current behaviour and
  would change with it.
- **Account's "Starkeep 0.6.0" line is `ink-muted`** and fails axe's contrast
  only if scanned within ~1 s of the panel fading in (3.93:1 over `#231f39`,
  the panel mid-transition); settled it passes. `ink-secondary` would make it
  immune. The same early-scan false alarm was behind the "Delete account…"
  hit at 375 wide, which never reproduced in scripted runs.
- **Known and still deferred:** the mini window's signed-out blank state.
- **Never covered by any review:** real "Time away" data (a headless pane never
  reports hidden), the focus-together lobby and a friend's sky (need a second
  account), the "starting"/"completing" states (too brief), confirming
  "Delete account", the desktop (WebView2) app, and screen-reader output.

### What was done

1. #112 sliders keep up with fast keys; #113 24px targets in the tag manager
   and sky; #114 `rounded-pill` token; #115 "Back to timer" in a footer bar
   (`PanelLayer` in `HomeRoute.tsx`); #116 `ink-secondary` for text on the sky;
   #117 Friends says offline vs server-down; #118 history rows at 375 wide.
   #112–#114 were built in their own sessions; #115–#118 here.
2. #114 first failed `format:check`: the repo's prettier sorts Tailwind
   classes, and `rounded-pill` sorts differently from `rounded-full`. Run
   `npx prettier --write` after any class rename.

### Things worth not rediscovering

- **Contrast over the sky can only be measured from pixels** (axe reports
  "incomplete"). Screenshot, then take the lightest background pixel from the
  empty rows above and below each line against the text's computed colour;
  sampling the glyph box itself mixes in anti-aliased text edges and reads far
  too low.
- **A/B a layout change on the same page** by swapping the old classes back in
  with `className` and measuring both, instead of stashing and reloading; it
  avoids any doubt about what the dev server is serving.
- **`:focus-visible` after script-moved focus** follows the browser's rule, so
  a mouse-only session shows no ring and one after keyboard use does.

---

## 2026-10-28 (later) — Keyboard focus no longer falls to the page (#110)

**Status: #110 merged; `master` passes lint, typecheck, 615 unit tests, build
and `e2e:web` 41/41.** This fixes the confirmation review's High (below).

### Next

- The confirmation review's **Medium** and **Low** items in the entry below
  are still open, none started: tag-manager targets under 24px, `ink-muted`
  over the sky on the running/result/break lines, the floating "Back to timer"
  covering content mid-scroll, Pomodoro sliders dropping fast key repeats,
  then the Lows. "Delete account…" contrast at 375 wide is still pre-existing.
  **(Superseded 2026-10-28 — the Medium and Low items were fixed in #112–#118;
  the "(final)" entry above lists what remains.)**

### What was done

- Panels hand focus back to the timer-screen control that opened them
  (`openView` in `HomeRoute.tsx` records it; `useFocusIfLost` restores it once
  the timer screen stops being `inert`). Done on a result or run summary lands
  on Start (a flag set by that click, so launching the app focuses nothing).
  Picking a tag, or Escape inside the popover, keeps focus on the tag pill.
  The delete box takes focus on open and returns it on Cancel (only after it
  has been opened).
- `e2e/web/focus.spec.ts` locks all four in; it and the new unit tests fail on
  the old code.

### Things worth not rediscovering

- **`:focus-visible` on script-moved focus follows the browser's own rule:** in
  a mouse-only session the restored focus shows no ring, but after keyboard use
  earlier in the same page it does. Not a bug.
- **Docker Desktop and the dev server don't survive an overnight restart here**:
  "The local Supabase stack isn't running" from `e2e:web` is Docker, not the
  tests.
- Out of scope, still: "Back to friends" lands on the panel's Back button, not
  the friend's row (the list re-renders).

---

## 2026-10-28 — The other fifteen findings fixed; confirmation review

**Status: #102–#108 merged; `master` passes lint, typecheck, 610 unit tests,
build and `e2e:web` 37/37.** The "Remaining findings" list in the entry below
is done (M1–M8, L1–L3, L5, L6; L4 and L7 needed no change). The confirmation
review found the earlier fixes held, plus the new items under Next.

### Next

Found by the confirmation `ui-ux-reviewer` run, none started (each its own PR):
**(Superseded 2026-10-28 — the High was fixed in #110 and the Medium and Low
items in #112–#118; the "(final)" entry above lists what remains.)**

- **High (done in #110, see the entry above): focus drops to `<body>` after common actions.** Closing a panel
  (Esc, Back to timer) should return focus to its opener; "Done" on the result
  should land on Start; picking a tag should land on the tag button; opening
  "Delete account…" should move to the email field, and Cancel back to the
  button. `useFocusIfLost` and `useDialogFocus` in `shared/ui/focus.ts` are the
  tools (panels aren't dialogs, so they may need their own opener memory).
- **Medium:** "Manage tags" and "Done" in the tag manager are 16px high, and
  the rename fields 20px (WCAG 2.5.8); `ink-muted` on the running line
  ("N minutes · ends at …"), "Finished at …" and the break line is 4.3–4.7:1
  over the sky, so use `ink-secondary` like the idle screen; the floating
  "Back to timer" still covers content mid-scroll and half-covers the
  "Delete my account" button (a backdrop or an in-flow button); the Pomodoro
  sliders drop fast key repeats because each press works from a stale stored
  value (keep a local value, persist on change).
- **Low:** `rounded-full` on dots and bars instead of the pill token (7 files);
  star targets are 12px (maybe fine under the 2.5.8 spacing exception, unproven);
  history rows wrap awkwardly at 375; Friends keeps the last list with no
  stale-data hint when the server drops without a reload.
- **Still deferred or known:** "Delete account…" contrast at 375 wide (3.93:1,
  pre-existing), the mini window's signed-out blank state.
- **Not covered by the review:** real "Time away" data (a headless pane never
  reports hidden; the five-tile row was checked by simulation), the focus-
  together lobby, the "starting"/"completing" states (too brief).

### What was done

1. Seven PRs, one idea each: #102 result announced (M6), #103 tokens, night
   first paint, legible muted text (M4, L2, L6), #104 reduced motion live (L5),
   #105 24px targets and layout (M1, M3, L1, L3), #106 dev seed data stays
   local (M8), #107 honest sync line (M5, M7), #108 Stats tabs (M2). #102–#104
   and #106 were built in their own sessions; #105, #107, #108 here.
2. Merge order was #102–#105, #107, #108, then #106: it conflicted with #104 in
   `src/shared/lib/index.ts` (adjacent export lines, kept both) and needed a
   fresh CI run.

### Things worth not rediscovering

- **Sessions share ports and one local stack.** `npm run dev` (5173) serves
  whichever checkout started it, and `npm run e2e:web` (4174) is fixed in the
  config and five spec files, so two runs collide ("already used" / "not able
  to start"). Wait for the port rather than killing the other run; heavy
  parallel load also makes Realtime-based friends tests time out, and they
  pass alone. Simulate offline or server-down per page (Playwright's context
  offline / route abort) instead of stopping Docker containers when anything
  else is using the stack.
- **A headless pane never reports `hidden`**, so away time can't be produced
  there.
- **Prettier checks every folder, including `.claude/worktrees/`**, so a local
  `npm run format:check` can fail on another session's checkout; CI has no such
  folder. Use `npx prettier --check src`.
- Session worktrees live in `.claude/worktrees/` inside this repo.

---

## 2026-10-27 (later) — First full UI review, its fixes, and three merges

**Status: #99 (reviewer), #100 (first-run findings) and #101 (the three High
findings) merged in that order.** The entry below is superseded where it
says "not merged" or "test 5 not done".

### Next

- **Remaining findings from the full review, not started** (superseded: done in
  #102–#108; report in the #101
  session; IDs as the reviewer gave them), each worth its own PR:
  - M1: the floating "Back to timer" covers panel bottoms.
  - M2: the Stats tabs have no arrow keys and no tabpanel.
  - M3: five controls are under 24px (picker Close, swatches, Sync now,
    Delete account…, mini ×).
  - M4: `ink-muted` over the nebula is unmeasured.
  - M5: offline shows "Syncing…" for 15–30 s first.
  - M6: there are no `role=status` live regions.
  - M7: the server-down status flickers, and Friends can't tell empty from
    failed.
  - M8: the dev helpers' seeded rows upload and can't be cleared.
  - Lows L1–L7.
- The mini window's signed-out blank state is still deferred.

### What was done

1. **Test 5 passed** (full signed-in run, 68 screenshots, `git status` clean
   apart from its memory). Lucas signed `ui-review@test.local` in by hand in
   `.ui-review/profile`; the agent never touched the password.
2. Opening that Edge profile crashed `npm run dev`: Vite's watcher hit a file
   Edge keeps locked (EBUSY). `vite.config.ts` now ignores `**/.ui-review/**`.
3. #101: `shared/ui/focus.ts` (`useDialogFocus`, `useFocusIfLost`) for the cancel
   dialog, the picker, and focus after Start or a session's end; a focus ring
   on sky stars; Month bars above 14 are hover-only (table carries the data).
   The `FocusBars.tsx` conflict with #100 was resolved by keeping both changes.

### Things worth not rediscovering

- **Docker Desktop doesn't survive a session restart here.** "Couldn't reach
  the server" on sign-in was Docker down, not the account.
- The `ui-review` account carries seeded history on the local server
  (~2,160 Stardust); `clearSeeded()` only clears the local copy (M8). A
  `db reset` removes it, along with the account.
- GitHub auto-merge is disabled on this repo; merge by hand once CI is green.

---

## 2026-10-27 — UI/UX review system (`ui-ux-reviewer`)

**Status (superseded, see the entry above): PR open on
`chore/ui-ux-reviewer`, not merged; acceptance test 5 (a real review run) not
yet done.** It needs a session started after this branch exists, because
agents and MCP servers load at session start.

### Next

- **Create the test account** (steps in `supabase/README.md`, "Local test
  accounts"): invite `ui-review@test.local --local`, write `UI_REVIEW_EMAIL` and
  `UI_REVIEW_PASSWORD` into a root `.env`, sign up, enter the code from
  `http://127.0.0.1:54324`.
- **In a new session, approve the `playwright` server** when asked, then ask for
  the `ui-ux-reviewer` agent. Check its first report against the plan's test 5
  (every size, state, axe with `wcag22aa`, keyboard, token drift, screenshots
  exist in `.ui-review/`, `git status` unchanged).
- If the agent refuses the browser tools, `mcp__playwright` in its `tools:` line
  didn't match; list the individual `mcp__playwright__browser_*` names instead.
- **First run of test 5 was partial:** the agent's `grep '^UI_REVIEW_' .env` was
  refused by the permission system ("Credential Materialization"), so it saw
  only signed-out screens. Fixed by design, not by a permission rule: the agent
  never reads `.env`; Playwright now keeps a persistent Edge profile in
  `.ui-review/profile` (was `--isolated`), Lucas signs in there once, and the
  agent asks him to if it finds the sign-in screen. A relative
  `--user-data-dir` resolves against the server's start folder (checked: it
  landed in `work-timer/.ui-review/`). Screenshots must be passed as
  `.ui-review/<name>.png`; a bare filename lands in the repo root.
- The partial run's four app findings are fixed on a separate branch/PR.

### What was done

1. `.claude/settings.json` enables `frontend-design@claude-plugins-official`
   (installed with `claude plugin install … --scope project`).
2. `.mcp.json` adds Playwright MCP 0.0.83 on Edge (`--browser msedge`,
   `--isolated`, output to `.ui-review/`, ignored). `cmd /c` because Windows
   can't spawn `npx` directly.
3. `@axe-core/playwright` 4.14.0 was already a dev dependency; no change.
4. `.claude/agents/ui-ux-reviewer.md` plus its own guard hook (a copy of
   qa-lead's, writes allowed only under `.claude/agent-memory/ui-ux-reviewer/`).
5. CLAUDE.md "UI standards", `.env.example`, `supabase/README.md`.

### Things worth not rediscovering

- **tokens.css has no spacing tokens.** "Spacing from tokens" therefore means
  Tailwind's default scale; the reviewer flags arbitrary values.
- **Acceptance pass:** tests 1 (settings format, plugin install), 2 (the pinned
  server runs `--help`), 3, 4 (guard: 5 cases), 6, 7 passed in the authoring
  session. Not verified: that Edge actually opens and the agent runs (test 5).

---

## 2026-10-27 — QA pass on 0.6.0, and the Rust dependency audit

**Status: merged (#96, #97); nothing is released since 0.6.0.** Local `master`
matches `origin/master`; no PR is open. The TLS patch in #96 reaches people
only with the next release.

### Next

- **Next feature: undecided.** M7 was the last planned milestone, and Lucas has
  no next one written down yet. Plan it (outcomes, acceptance tests) before code.
- **On hold, by Lucas's choice: the two-person M7 checks** (R12 ×2, R14, a real
  shared constellation). There is nobody to test with for now; M7 is shipped
  but not signed off.
- **Tell friends 0.3.0–0.6.0 are out**, whenever there are friends to tell.
- **Set up the other machine**, including `cargo install cargo-audit` there.

### What was done

1. **`qa-lead` full pass on `ff34c9b` (0.6.0): no Critical, Should fix or
   Minor findings.** Lint, format, types, 579 unit tests, build, clippy/fmt,
   284 pgTAP, 37/37 `e2e:web` with the a11y scan, Lighthouse 100/100,
   `npm audit` 0. A hand review of `20261026040305_m7_shared.sql` found RLS on,
   no table grants, `security definer` + empty `search_path`, execute revoked
   from `anon` (checked live). `e2e:desktop` was skipped (it had passed 5/5 on
   that commit before tagging).
2. **Installed `cargo-audit` 0.22.2 on this machine.** The first audit found 5
   vulnerabilities in 3 crates plus 6 warnings.
3. **#96:** `rustls-webpki` 0.103.15 → 0.103.16 and `webpki-root-certs` 1.0.9 →
   1.0.11 (`Cargo.lock` only; distrusted-certificate advisories). New
   `src-tauri/.cargo/audit.toml` ignores the three `zip` 4.6.1 advisories, with
   the reason in the file. `cargo audit` now exits 0 with 6 allowed warnings;
   clippy clean; `e2e:desktop` 5/5; CI green.
4. **#97:** qa-lead's notes from the run, and its tooling note corrected
   (cargo-audit is installed).

### Things worth not rediscovering

- **Why the zip advisories are ignored:** `zip` comes only through
  `tauri-plugin-updater` 2.x (newest 2.14.0; zip ≥ 9 is only in the 3.0
  alpha). The updater unzips only when the download *is* a zip, and ours is a
  plain NSIS `.exe`; it checks the signature before installing; the flaws are
  about Unix permissions and symlinks. Drop the ignores once `cargo tree -i zip`
  shows ≥ 9.0.0.
- **The 6 allowed warnings** (unmaintained `proc-macro-error`, `zbus_names`,
  `zvariant`, `zvariant_derive`; unsound `glib`, `tokio`) are informational,
  not vulnerabilities. Their dependency chains weren't traced.
- **CI doesn't run `cargo audit`**; `audit.toml` only affects runs by hand,
  from `src-tauri/`.
- **The JS bundle is +5.2% over `e2e/perf-baseline.json`** (260.2 kB gzip vs
  247.2). That's under the 10% line, but it is the number to watch as features land.
- **The patched TLS crates can only be exercised for real by the next
  release's update check.** Nothing local runs that path.

---

## 2026-10-27 — Released 0.6.0: Shared constellations

**Status: 0.6.0 is published (tag `v0.6.0`, Latest; web deployed from the same
commit, `282e9a1`). The shared migration is on the hosted project.** Lucas's
desktop app runs 0.6.0. No PR is open; local `master` matches `origin/master`.
`min_client_version` is still null. Plan:
`~/.claude/plans/please-proceed-with-planning-polymorphic-quasar.md`.

### Next

- **Tell friends 0.3.0–0.6.0 are out.** Shared constellations, like focus
  together, only reach a friend who has updated.
- **R12 ×2 and R14 are still unrun**, plus a real shared constellation between
  two people (propose, accept, run sessions for it, finish, both get the bonus).
  All need a friend on 0.6.0.
- Still open: `cargo install cargo-audit`, the other machine.

*(Updated 2026-10-27: cargo-audit is installed on this machine and the audit is clean, see "QA pass on 0.6.0" above. The two-person checks are on hold.)*

### What was done, in order

1. **Label fix first (#93):** `together: 'Focus together bonus'` in `REASONS`
   (`StardustPanel.tsx`), so the phase 4 bonus no longer shows as the raw word.
   Key checked against the reconciler (`reconcile.ts`, `reconcile.test.ts`).
   Lint, types and Prettier clean; CI green. No render test exists for the panel
   and the label was not looked at in the running app.
2. **Hosted state read first:** `migration list --linked` showed the shared
   migration local only; `db push --dry-run` listed only
   `20261026040305_m7_shared.sql`. Probes: `sessions` 401 (control),
   `sessions?select=shared_id` 400, `rpc/my_shared` and `rpc/stop_shared` 404.
3. **Pushed** (Lucas said "push"): histories matched; all four probes 401.
4. **Installed 0.5.0 after the push:** a session backed up and Friends listed
   (reported by Lucas).
5. **Bump PR #94**, merged as `282e9a1`. Version tests 26/26, exit 0; CI green.
6. `e2e:desktop` 5/5 -> tag `v0.6.0` -> `Release` green.
   - The draft had 4 assets (installers 2,329,058 bytes).
   - `latest.json` said 0.6.0 at `/download/v0.6.0/`, signed with key
     `8E3AF18012526DA8`.
   - A "What's new" line was added to the description (Lucas approved the wording).
7. **Published by id with `tag_name` in the same call** (Lucas said "publish"):
   Latest `v0.6.0`, no `untagged-` tag. `Deploy web` ran green on `282e9a1`.
8. **Live checks:**
   - The web bundle (starkeep.vercel.app) reports 0.6.0 and contains `my_shared`.
   - `Starkeep-setup.exe` is served (206 to a one-byte range request).
   - `min_client_version` is null.
   - Lucas's desktop app updated to 0.6.0, signed in, and a solo session showed
     "Backed up" (reported by Lucas; the hosted `sessions` row was not read).

### Acceptance results

A1-A9 pass as run by me; A3 and A10 are Lucas's own observations on his installed
app. Not run: a real two-person shared constellation, R12 ×2, R14 (need a friend
on 0.6.0).

### Things worth not rediscovering

- **Docker Desktop and the local stack were down again** when `e2e:desktop` was
  due. `Start-Process` on Docker Desktop, then `npx supabase start` twice (the
  first answers "not ready" while the database boots).
- **The `Stopped services:` list `supabase start` prints** (storage, imgproxy,
  edge runtime, analytics, vector, pooler) is the optional services this project
  excludes, not a failure.
- **`gh pr checks` right after `gh pr create` says "no checks reported"**; the
  runs appear a few seconds later.

---

## 2026-10-27 — CI skips the test jobs for Markdown-only changes

**Status: merged (#91). Nothing is released; no PR is open.** Local `master`
matches `origin/master`. This entry was itself the first docs-only PR since the
change, and the test of it: see "Observed" below.

### What changed

- `.github/workflows/ci.yml` has a new first job, `changes`. It lists the files
  a push or pull request touched (`git diff --name-only --no-renames`, base to
  head) and says `code=false` only when the list is non-empty and every path
  ends in `.md`. Then `web`, `desktop`, `db` and `e2e` run only when `code` is
  true; otherwise they show as **skipped** (not absent), so a docs-only PR is
  still visibly checked.
- **When unsure it runs everything:** a mixed change, a code file renamed to
  `.md`, an empty list, a missing or all-zeros base (a new branch), a failed
  diff. A change to `ci.yml` itself is not `.md`, so it runs everything.
- All four jobs are skipped, not just e2e: nothing they check can be affected
  by a `.md` file (`.prettierignore` already excludes `*.md`).
- No third-party action; a few lines of shell. `master` has no branch
  protection, so no required check can be left pending by a skipped job.

### Observed (on #92, the PR that added this entry)

- `changes` passed in 6 s and `web`, `desktop`, `db` and `e2e` showed as
  skipped; the whole run took 9 s, against about 5 minutes before. Its log listed
  `NOTES.md` and said "Docs only: test jobs skipped."
- The push to `master` after #91 (a code change) still ran all four jobs, all
  green.

### Next

*(Superseded 2026-10-27: 0.6.0 is released, see "Released 0.6.0" above.)*

- Nothing from this change. The open list is in the "M7 phase 5 merged"
  entry: release 0.6.0 first.

### Things worth not rediscovering

- **A docs-only PR's checks show `changes` passing and the other four
  "skipping"**: that is intended, not a stuck run. Merge it as usual.
- **A change that includes any non-Markdown file, even `.mdx` or `.MD`, runs
  everything.** The match is a lowercase `.md` suffix, on purpose.
- **To see why a run did or didn't skip,** read the `changes` job log: it
  lists the changed files and the decision.

---

Older entries are in `docs/notes-archive/`:

- `2026-Q3.md`: M0, the naming, the Tauri pivot, M0.5.
- `2026-Q4.md`: 2026-10-03 to 2026-10-26 — M1 through M7 (Friends, focus
  together, shared constellations), the releases 0.1.0 to 0.5.0, the Supabase
  pause guard, and the QA plan (PRs A–F).
