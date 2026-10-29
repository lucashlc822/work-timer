# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

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

## 2026-10-26 — Session wrap-up: 0.5.0 released, phase 5 merged

**Status: everything is merged to `master` (#83–#89) and CI is green; no PR is
open.** Local `master` matches `origin/master`, with nothing uncommitted. The
entries below have the detail: "Released 0.5.0" and "M7 phase 5 merged". Phase
5 is **not** released: the hosted project lacks `20261026040305_m7_shared.sql`.

### Next

*(Superseded 2026-10-27: 0.6.0 is released, see "Released 0.6.0" above. Still open: tell friends, R12 ×2 and R14, `cargo-audit`, the other machine.)*

- **Release 0.6.0**, as in the phase 5 entry's Next (migration first, then
  probes, the installed-0.5.0 check, bump, `e2e:desktop`, tag, review, publish).
- The rest of the open list (the "together" label fix, tell friends, R12 ×2 and
  R14, `cargo-audit`, the other machine) is in that entry.

### Found along the way (not in the entries below)

- **An e2e test failed once, on a PR that changed only `NOTES.md`** (#89): the
  25-minute timer test in `e2e/web/timer.spec.ts` waited 20 s for its session
  to reach the server and didn't see it. It passed on re-run, in #88's CI and
  locally. Not reproduced, so the cause is unknown; treat a second occurrence as
  a real flake worth its own look (the poll window or the sync trigger).
- **`master` went red once from CI itself, with no test run:** the e2e job
  couldn't start the local database ("port 54322 already in use" on the runner).
  Re-running the failed job fixed it. Not a repo problem.
- **Check a PR's CI result before merging, even for a docs-only change.**

### Things worth not rediscovering

- **Docker Desktop and the local stack don't survive a restart.** Start Docker
  Desktop, then `npx supabase start` (it can say "not ready" the first time
  while the database boots; run it again).

---

## 2026-10-26 — M7 phase 5 merged: shared constellations

**Status: phase 5 is on `master` in three PRs (#86–#88); nothing is released.**
The hosted project does **not** have `20261026040305_m7_shared.sql`. Local
`master` matches `origin/master`, with nothing uncommitted. Plan:
`~/.claude/plans/let-s-proceed-with-planning-compiled-barto.md` (reused again;
it now holds the phase 5 plan).

### Next

*(Superseded 2026-10-27: 0.6.0 is released and the "together" label fix shipped in it, see "Released 0.6.0" above.)*

- **Release as 0.6.0**, the same routine as 0.5.0 (`RELEASING.md`):
  1. Push `20261026040305_m7_shared.sql` first. 0.6.0 sends `shared_id` with
     every session, and a server without that column refuses the upload.
  2. Probe `sessions?select=shared_id` (400 → 401), `rpc/my_shared` with `{}`
     and `rpc/stop_shared` with `{"shared":"00000000-0000-0000-0000-000000000000"}`
     (404 → 401), with `sessions` as the control.
  3. Installed 0.5.0 after the push: a session backs up, Friends and focus
     together still work (S7.2).
  4. Bump, `e2e:desktop` (quit the installed app first), tag, review, publish.
- **Small fix of its own:** the Stardust list shows the phase 4 bonus as the raw
  word "together" (`REASONS` in `progression/ui/StardustPanel.tsx` has no
  entry for it; `shared` got one in #88). Pre-existing, not part of phase 5.
- Still open: tell friends (0.3.0–0.6.0), R12 ×2 and R14 plus a real shared
  constellation (all need a friend on the new version), `cargo install
  cargo-audit`, the other machine.

### Decisions (with Lucas, 2026-10-25)

| Question | Answer |
|---|---|
| Where a session's star goes | **Only to what it was run for**: your own constellation, or the shared one with a friend, picked before Start ("Working on"). Never both. |
| How many per pair | One open per friendship (a proposal, or accepted and unfinished) |
| Bonus | The solo tier bonus each (25 / 75 / 200), `shared:<id>` |
| Unfriending | Freezes it in both skies; a proposal is withdrawn |

This supersedes the design doc's "every session either of you completes adds
a star". Recorded in CLAUDE.md ("A shared constellation fills only from
sessions run for it") and in the design doc. Defaults chosen in the plan, not
objected to: the target is fixed once a session starts; either member can
Stop; tiers on offer are the proposer's unlocked ones; nothing is cached
offline.

### What was built

| PR | What |
|---|---|
| #86 (5a) | `shared_constellations` (no grants), `sessions.shared_id`, `propose_shared` / `respond_shared` / `stop_shared` / `my_shared`, `shared_done` helper; `remove_friend` freezes; `friend_sky` returns `shared_id` |
| #87 (5b) | `sharedId` on sessions and Pomodoro runs (wire `shared_id`); `deriveSky` skips those sessions; `deriveShared` |
| #88 (5c) | Picker `onPick`, Requests, friend-page slot, "Working on", shared in both skies, the bonus, `SharedSkyProvider` in `app/`, docs |

- **"Finished" is judged by `stars_needed` and `min_focus_s` stored with the
  constellation**, on the server and on every device, so they agree.
- **Two derivations in `app/sharedInputs.ts`:** what is drawn adds this
  device's own sessions (a new star shows at once); what is paid uses only the
  server's sessions (no payout for an unsynced star).
- Fetched, never stored on the device: offline, shared constellations simply
  aren't drawn.

### Acceptance results

All cases that can run locally pass:
- pgTAP: 284 checks (`m7_shared` 36)
- unit: 579
- e2e: 37, including three shared tests (S2.2, S3.3, S4.1, S1.2; S5.2; S6.2,
  S8.2) and the a11y scan of the new screens (S8.1)
- CI green on every PR
- Not run: S7.2 (installed 0.5.0 against the migration, at release),
  `e2e:desktop` (at release), a real two-person shared constellation.

### Things worth not rediscovering

- **A Playwright page with a clock two hours back needs the acceptance
  backdated too:** a session "ending" before `accepted_at` rightly doesn't
  count. `e2e/web/shared.spec.ts` backdates it through the admin client.
- **A device only learns a friend's new star on its next look** (2 min, or
  15 s with a Friends screen open, or a reload). Its own uploads trigger an
  immediate look, so the bonus for your own last star isn't delayed.
- **The friend page's header has a backdrop blur**, which makes it the
  containing block for `fixed` children: the picker is portalled to `body`.
- **The visual check left an active shared Kite between the local `a@` and
  `b@` accounts.** Harmless; a `db reset` clears it (and the accounts).
- Docker Desktop and the local stack were down after a restart and were
  started by me (`npx supabase start` can report "not ready" on the first try
  while the database boots; a second run is fine).

---

## 2026-10-24 — Released 0.5.0: Focus together

**Status: 0.5.0 is published (tag `v0.5.0`, Latest; web deployed from the same
commit, `6536c8a`). The together migration is on the hosted project.**
Lucas's desktop app runs 0.5.0. Nothing in flight. `min_client_version` is
still null. Plan: `~/.claude/plans/let-s-proceed-with-planning-compiled-barto.md`.

### Next

*(Superseded 2026-10-26: phase 5 is merged, see "M7 phase 5 merged" above. The rest of this list is carried forward there.)*

- **Phase 5: shared constellations**, per `docs/plans/2026-10-22-m7-friends.md`.
- **Tell friends 0.5.0 is out.** Focus together only reaches a friend who has
  updated: a 0.4.0 friend never sees the invitation banner, so the lobby lapses
  after 10 minutes.
- **R14 and both older R12s are still unrun** (a real focus-together session
  with a friend; a friend seeing Lucas "Focusing now"; two real people
  befriending). All need a friend on 0.5.0.
- Still open: `cargo install cargo-audit`, the other machine.

### What was done, in order

1. **Hosted state read first:** `migration list --linked` showed the together
   migration local only; `db push --dry-run` listed only
   `20261024044635_m7_together.sql`. Probes: `sessions` 401 (control),
   `sessions?select=together_id` 400, `together_members`, `rpc/my_rooms` and
   `rpc/together_wins` 404.
2. **Pushed** (Lucas said "push"): histories matched; all five probes 401.
3. **Installed 0.4.0 after the push:** a session ended, "Backed up", Friends
   listed (Lucas).
4. **Bump PR #83**, merged as `6536c8a`. Version tests run on their own, 22/22,
   exit code 0; CI green (db, desktop, web, e2e).
5. `e2e:desktop` 5/5 (installed app quit first) -> tag `v0.5.0` -> `Release`
   green.
   - The draft had 4 assets (installers 2,326,019 bytes).
   - `latest.json` said 0.5.0 at `/download/v0.5.0/`, signed with key
     `8E3AF18012526DA8`.
   - A "What's new" line was added while it was a draft.
6. **Published by id with `tag_name` in the same call:** Latest `v0.5.0`, no
   `untagged-` tag. `Deploy web` ran green on `6536c8a`.
7. **Live checks:**
   - The web bundle reports 0.5.0 and contains `my_rooms`.
   - `Starkeep-setup.exe` returns 200.
   - `min_client_version` is null.
   - **R11/R12:** Lucas's desktop app updated to 0.5.0; a solo session ended
     and showed "Backed up". The newest hosted `sessions` row (started 17:03
     UTC, after the publish) has `together_id` null, so the new column path
     works against the real server.

### Acceptance results

R1-R13 pass. R14 (a real focus-together session with a friend) not run.

### Things worth not rediscovering

- **A draft release shows an `untagged-...` tag after its description is
  edited**, though the git tag `v0.5.0` was fine all along. Publishing by id
  with `tag_name` in the same call fixed it, as RELEASING.md says.
- **Plan mode can still be on after "Plan accepted".** Approval has to go
  through the plan-approval prompt itself; this session bumped the version on a
  branch before noticing, and stopped to ask. Nothing had been committed.

---

## 2026-10-24 — Session wrap-up: archive, standing facts, and focus together built

**Status: everything is merged to `master` (#74–#81) and CI is green; no PR is
open.** Nothing from this stretch is released: 0.4.0 is still the latest, and
the hosted project does **not** have `20261024044635_m7_together.sql`. Local
`master` matches `origin/master`, with nothing uncommitted. This is the entry
to read first; the 2026-10-24 phase 4 entry below has the detail.

### Where things stand

- **Phase 4 (focus together) is built, not released.** Up to four friends share
  one countdown; anyone's deliberate end-early ends it for everyone; +10
  Stardust each when the server sees every member completed. PRs #77–#80.
- **The released version is 0.4.0** (Friends, Focusing now). The hosted
  project has four migrations (m5, m6, m7_friends, m7_focus_status).
  `min_client_version` is null.
- **`NOTES.md` is ~570 lines.** Entries from 2026-10-03 to 2026-10-21 are in
  `docs/notes-archive/2026-Q4.md` (#74).
- **CLAUDE.md now holds twelve standing tooling facts** promoted from the
  archive (#75), and **`RELEASING.md` explains how to probe the hosted API
  (401 / 400 / 404) and read a release's signing key id** (#76).

### Next

*(Superseded 2026-10-24: 0.5.0 is released, see "Released 0.5.0" above. Still open from this list: phase 5, tell friends, R12 and R14 (need a friend on 0.5.0), `cargo install cargo-audit`, the other machine. All of these are repeated in that entry's Next.)*

- **Release 0.5.0**, the same routine as 0.4.0:
  1. `db push --dry-run`, then push the together migration when Lucas says
     "push". 0.5.0 sends `together_id` with every session, and a server without
     the column refuses the upload.
  2. Check that the installed 0.4.0 app still syncs and lists friends.
  3. Bump PR, then `e2e:desktop` (quit the installed app first), then tag,
     review the draft, and publish when Lucas says "publish".
- **Phase 5: shared constellations**, per `docs/plans/2026-10-22-m7-friends.md`.
- **R12, still unrun, three times now:** a friend on 0.4.0 seeing Lucas
  "Focusing now", two real people befriending, and (after 0.5.0) a real
  focus-together session with a friend. All need a friend on the new
  version.
- **Tell friends** about 0.3.0 and 0.4.0 (and 0.5.0 later). Friends needs a
  name before it does anything.
- `cargo install cargo-audit` once (started and interrupted, never run), and
  set up the other machine.

### Closed since the 2026-10-23 wrap-up

- The `NOTES.md` archive (#74), the CLAUDE.md promotion (#75), the RELEASING
  additions (#76), and phase 4 (#77–#80), with its log (#81).

### State of this machine

- Docker Desktop and the local Supabase stack are running (started by me; they
  don't survive a restart).
- The hand-made `a@`/`b@`/`c@test.local` accounts exist on the local stack
  (Ada, Bea, Cy) and will disappear on a `db reset`.

### Things worth not rediscovering

- **Editing tools refuse a file that isn't valid UTF-8.** `reconcile.ts` held a
  Windows-1252 dash, and three files had U+FFFD where an em dash was meant (all
  from the M6 PRs). Fixed in #77. Decoding a mixed file wholesale garbles the
  good bytes: replace only the damaged ones.
- Everything else from phase 4 (the desktop notification permission gap,
  Playwright's offline switch leaving WebSockets open, ambiguous button names)
  is in the entry below.

---

## 2026-10-24 — M7 phase 4 merged: focus together

**Status: phase 4 is on `master` in five PRs; nothing is released.** The
hosted project does **not** have `20261024044635_m7_together.sql` yet. Local
`master` matches `origin/master`, with nothing uncommitted. Plan:
`~/.claude/plans/please-proceed-with-planning-smooth-clarke.md` (phase 4
section; the file was reused for later plans).

### Next

*(Superseded 2026-10-24: 0.5.0 is released, see "Released 0.5.0" above. Phase 5 and the other open items are carried forward there.)*

- **Release as 0.5.0**, the same routine as 0.4.0 (`RELEASING.md`):
  1. Push `20261024044635_m7_together.sql` first. 0.5.0 sends `together_id`
     with every session, and a server without that column refuses the upload.
  2. Probe `together_members` and `rpc/my_rooms` before and after (401 = there).
  3. Then bump, tag, review, publish.
- **Phase 5: shared constellations**, per the design doc.
- Still open from the 2026-10-23 wrap-up below: R12 twice (needs a real
  friend on the new version), tell friends, `cargo install cargo-audit`, the
  other machine.

### Decisions (with Lucas)

| Question | Answer |
|---|---|
| Who cancels for everyone | Any member's deliberate end-early ends everyone's session (Forest-style) |
| Group size | Up to 4 (host + 3 friends) |
| Invitations | Banner on the timer + desktop notification; a lobby lapses after 10 min |
| Bonus | +10 Stardust each, only when every member completed |
| Who is in | Host starts once ≥1 friend joined; un-joined are dropped; nobody joins after |

Recorded in CLAUDE.md ("Focus together: anyone's deliberate cancel ends it for
everyone", cross-referenced from "Leaving the app never forfeits a session"),
along with "Live updates for friends go through each person's own rows".

### What was built

| PR | What |
|---|---|
| #77 | Six em dashes in comments restored. `reconcile.ts` wasn't valid UTF-8, so editing tools refused it. |
| #78 (4a) | `together_rooms` (no grants), `together_members` (owner-only select, in Realtime), `sessions.together_id`, and seven definer functions |
| #79 (4b) | `TimerProvider` with `onEnded`; a together draft (`startedAt` = the room's start); `confirmCancel({ at, endedBy })`; `running`/`cancelNote` slots; `together_id` in `wire.ts` |
| #80 (4c) | The together panel, invitation banner and notes; `useTogether` (live) and `useTogetherWins`; app glue `useTogetherTimer`; the +10 bonus (`together:<roomId>`); the desktop notification fix |

- **How a cancel reaches everyone:** every room change touches every member's
  row, and each device listens on its own filtered channel. There are 15 s
  polls and visibility/online re-reads behind it.
- **A device back after the end** never starts the room's countdown, and earns
  nothing for time it didn't run.
- **Your own end-early** is sent to the room from `onEnded`, and retried until
  it lands.

### Acceptance results

All plan cases pass:
- pgTAP: 247 checks (`m7_together` 46)
- unit: 545
- e2e: 34, including five together tests: invite → live banner → join → start
  → same "ends at"; a friend's cancel ending the other session; a full
  1-minute room paying +10 once each; an offline device ending at the
  cancel's moment (within 2 s); lapse; dropping un-joined; and the a11y scan
  of the panel, banner and lobby
- `e2e:desktop`: 5/5, including the invite notification
- CI green on every PR
- Not run: 4.3 against a real 0.4.0 build (additive by design); web
  notifications (need prior permission).

### Things worth not rediscovering

- **The Tauri notification plugin's page-side `Notification` reports "denied"
  until permission is requested in that run**, even when Rust says it's
  granted. Before M7, every desktop notice came from Rust (the session
  deadline), so nothing hit it. `desktop.ts` `notify` now asks first. The new
  desktop test failed on exactly this.
- **`debug_native_log` doesn't see page-side notifications** (only Rust's). The
  invite test watches `window.Notification` being constructed instead.
- **Playwright's `context.setOffline(true)` leaves an already-open WebSocket
  working**, so a "device offline" test can still get Realtime events. Route
  the socket to nothing first (`page.routeWebSocket(/\/realtime\//, () => {})`,
  then reload), then go offline.
- **`getByRole('button', { name: 'Start' })` also matches "Start 25 min"**, and
  the timer's radios sit behind overlay panels: use `exact: true`, or scope to
  the panel's group.
- **Long heredocs still break the Bash tool here.** Write a script file and run
  it (as CLAUDE.md now says for a nested `claude` too).

---

## 2026-10-23 — Session wrap-up: Friends (M7) shipped in three releases

**Status: everything from this session is merged to `master` (#60–#72) and CI is
green; no PR is open. 0.4.0 is live on the web and desktop.** Local `master`
matches `origin/master`, with nothing uncommitted. This is the entry to read
first; the per-release entries below have the detail.

### Where things stand

- **M7 Friends, phases 1–3, is released** (design: `docs/plans/2026-10-22-m7-friends.md`):
  - 0.3.0: display name, friend code, requests, a friend's sky and weekly numbers.
  - 0.4.0: "Focusing now" / "On a break" on the Friends list.
- **The hosted project has all four migrations** (m5, m6, m7_friends,
  m7_focus_status). `min_client_version` is null: no one is forced to update.
- **Rule that holds for every later phase:** no existing table gets a new
  policy. A friend's data leaves the server only through security definer
  functions that check an accepted friendship (sync pulls with RLS alone, so a
  friend-read policy would copy friends' rows into your own store).
- **Releases now go:** read hosted state → dry run → push (Lucas says "push") →
  confirm the installed app still works → bump PR → desktop tests → tag →
  review draft → publish by id with `tag_name` (Lucas says "publish") →
  verify live. Both migrations went through this with no surprises.

### Next

*(Superseded 2026-10-24: the archive, the CLAUDE.md promotion and phase 4 are done; see the 2026-10-24 wrap-up above.)*

*(Superseded 2026-10-24: phase 4 is merged (#77–#80), not yet released; see
the entry above.)*

- **Phase 4: focus together** (rooms, lobby, same end time, a member's cancel
  ends everyone's session). **Plan it on Opus**, and record the amendment to
  "Leaving the app never forfeits a session" in CLAUDE.md as part of it: only a
  deliberate cancel fails a session, and now a friend's counts too.
- **Phase 5: shared constellations** after that.
- **Still unrun: R12 twice.** A friend on 0.4.0 seeing Lucas "Focusing now",
  and two real people befriending each other. Both need a friend on the new
  version.
- **Tell friends** 0.3.0 and 0.4.0 are out (they need a name before Friends
  does anything).
- `cargo install cargo-audit` once, so qa-lead's Rust audit stops reading "not
  run". It was started once and interrupted.
- Carried over: set up the other machine.
- **`NOTES.md` is ~2,500 lines, over the ~1,000 guideline.** Archive the
  older entries to `docs/notes-archive/YYYY-QN.md` in a PR of their own.
  **(Done 2026-10-23 — entries from 2026-10-03 to 2026-10-21 are now in
  `docs/notes-archive/2026-Q4.md`.)**

### Closed this session

- **Keep-alive case 9 is confirmed:** a green `schedule` run on 2026-10-22
  (11:59 UTC) after the manual one on 10-20.

### Things worth not rediscovering

- **Don't pipe a test run into `grep` inside an `&&` chain.** The chain goes
  on when `grep` succeeds, which hid a failing version test in the 0.3.0 bump
  PR (the PR text had to be corrected). Run the tests alone and check the exit
  code.
- **A new test that hard-codes "a different version" breaks when the repo
  reaches it.** `setVersion.test.ts` now uses `99.0.0`.
- **The installed app relaunches itself after updating**, so it is usually
  running again when `e2e:desktop` is due, and the tests refuse to start then.
  Check `tasklist`, and ask Lucas to quit it from the tray.
- **A `db reset` wipes the hand-seeded `a@`/`b@`/`c@test.local` accounts**,
  and the browser pane then still holds a session for a deleted user.
- **The local database collects the e2e runs' rows**, so a pgTAP test must
  count only its own fixture users' rows, never a whole table.
- **The Docker Desktop daemon must be running** for any local Supabase command.
- Phase-by-phase details: see the entries below, newest first.

---

## 2026-10-23 — Released 0.4.0: Focusing now

**Status: 0.4.0 is published (tag `v0.4.0`, Latest; web deployed from the same
commit, `82bf36a`). The focus-status migration is on the hosted project.**
Lucas's desktop app runs 0.4.0 and shares his status. Nothing in flight.
`min_client_version` is still null.

### Next

- **Phase 4: focus together**, per `docs/plans/2026-10-22-m7-friends.md`. It
  changes the CLAUDE.md rule "leaving never forfeits a session" (a friend's
  cancel ends yours), so plan it on Opus and record the decision then.
- **Tell friends 0.4.0 is out.** R12 (a friend on 0.4.0 seeing Lucas "Focusing
  now") and R12 from 0.3.0 (two real people befriending) are still unrun.
- Still open: keep-alive case 9, `cargo install cargo-audit`, the other
  machine.

### What was done, in order

1. **Hosted state read first:** `migration list --linked` showed the focus
   migration not applied; `focus_status` and `rpc/friends_focus` 404;
   `profiles` 401 (the control). `db push --dry-run` listed only
   `20261023045510_m7_focus_status.sql`.
2. **Pushed** (Lucas said "push"): history matched local;
   `focus_status`/`friends_focus` turned 404 → 401.
3. **Installed 0.3.0 after the push:** a session ended, "Backed up", Friends
   unchanged (Lucas).
4. **Bump PR #71**, merged as `82bf36a`. This time the version tests were run
   on their own and checked by exit code (0; 26/26), not piped into `grep`.
5. `e2e:desktop` 4/4 → tag `v0.4.0` → `Release` green.
   - The draft had 4 assets (installers 2,321,995 bytes).
   - `latest.json` said 0.4.0 at `/download/v0.4.0/`, signed with key
     `8E3AF18012526DA8`.
   - A "What's new" line was added while it was a draft.
6. **Published by id with `tag_name` in the same call:** Latest `v0.4.0`, no
   `untagged-` tag. `Deploy web` ran green on `82bf36a`.
7. **Live checks:**
   - The web bundle reports 0.4.0 and contains `friends_focus`.
   - `Starkeep-setup.exe` returns 200.
   - `min_client_version` is null.
   - **R10:** Lucas's updated desktop app, during a session, wrote exactly one
     `focus_status` row (focus, 06:24:42 → 06:49:42 UTC: the planned 25
     minutes, 0.16 s after the start). After he ended the session, the table
     was empty. Both read once, read-only, with the `.env.admin.local` key.

### Acceptance results

R1–R11 pass. R12 (a friend on 0.4.0 seeing Lucas focusing) not run.

### Things worth not rediscovering

- **The installed app restarts itself after updating**, so it's usually
  running again by the time `e2e:desktop` is due. Check `tasklist` first, as
  the tests refuse to start otherwise.
- **Checking a test run by its exit code works** (`vitest ...; echo $?`).
  Piping it into `grep` inside an `&&` chain is what hid the 0.3.0 failure.

---

## 2026-10-23 — M7 phase 3 merged: "Focusing now" and "On a break"

**Status: phase 3 is on `master` (#69). Not released, and
`20261023045510_m7_focus_status.sql` is not on the hosted project.** Local
`master` matches `origin/master`.

### Next

*(Superseded 2026-10-23: 0.4.0 is released, see "Released 0.4.0" above. What is still open is in the 2026-10-23 wrap-up above.)*

- **Release as 0.4.0**, the same way as 0.3.0: `db push` the focus-status
  migration first (dry run, then push), then bump, tag, review, publish. It's
  additive; 0.2.x and 0.3.0 apps never touch it. Note that a 0.3.0 friend
  never *shares* a status, so they never show as focusing until they update.
- Then phase 4 (focus together) per `docs/plans/2026-10-22-m7-friends.md`. It
  will change the "leaving never forfeits" decision in CLAUDE.md, so plan it
  on Opus.
- Still open: keep-alive case 9, `cargo install cargo-audit`, the other
  machine, R12 from 0.3.0 (two real people).

### Decisions (with Lucas)

- **Within ~15 s is fresh enough.** No Realtime channel: the app sets a server
  status on each change, and an open Friends panel (or a friend's sky)
  re-reads every 15 s. That replaces the design doc's "presence" idea, and the
  doc now says so.
- **Pomodoro breaks show "On a break · N min left"** until the break ends;
  after that, nothing until the next block starts.

### What was built (#69)

- `focus_status` table: one row per person, focus/break, `started_at`,
  `until`. No grants, no policies. Three security definer functions:
  - `set_focus_status` (refuses an unknown kind, an end before the start, a
    status already over, or one more than 25 h ahead)
  - `clear_focus_status`
  - `friends_focus()`: accepted friends only, and only while `until` is in
    the future
- **A quit or crashed app stops showing as focusing at its session's planned
  end**, because expiry is by `until`. That matches wall-clock sessions.
- `useShareFocusStatus` (`src/features/friends/hooks/`) watches `shared/db`
  with a flat live query and sends only real changes.
  - It's silent and best effort, retried on `online` and when the window is
    visible again.
  - An idle start sends nothing, so opening one device can't wipe what
    another device is sharing.
  - A session past its planned end counts as idle.
- `useFriends({ watching })` polls every 15 s while a Friends screen is open.
  If `friends_focus` alone fails, the list still shows.

### Acceptance results

All cases pass:
- pgTAP: 200 checks across 5 files, 22 of them new
- unit: 524
- e2e: 27, including a two-device test (focusing → ended → on a break, each
  within 20 s) and the a11y scan with a focusing friend
- `e2e:desktop`: 4/4
- CI green

4.4 (friend status kept in memory only) and 4.5 (sharing errors stay silent)
are true by how the code is built, not separately exercised.

### Things worth not rediscovering

- **The e2e run leaves rows in the local database** (its users' statuses,
  profiles, friendships), and nothing cleans them up. A pgTAP test must count
  only its own fixture users' rows, never a whole table. The new suite failed
  once on exactly this.
- **A `db reset` wipes the hand-seeded `a@`/`b@`/`c@test.local` accounts.** The
  browser pane then still holds a session for the deleted user: sign out (a
  403 in the console is that) and back in after re-seeding.
- **`e2e:desktop` refuses to start while the installed Starkeep runs.** It
  restarts itself after an update, so check `tasklist` before a desktop run.

---

## 2026-10-23 — Released 0.3.0: Friends

**Status: 0.3.0 is published (tag `v0.3.0`, Latest; web deployed from the same
commit, `7c0cca7`). The friends migration is on the hosted project.** Lucas's
web and desktop apps both run 0.3.0 with a name set. Nothing in flight.
`min_client_version` is still null. Plan:
`~/.claude/plans/please-proceed-with-planning-smooth-clarke.md`.

### Next

*(Superseded 2026-10-23: phase 3 is released in 0.4.0. What is still open is in the 2026-10-23 wrap-up above.)*

- **Tell friends 0.3.0 is out.** Friends needs a name before it does anything.
  R12 (two real people adding each other) hasn't been run; the first friend to
  try it is that test.
- M7 phase 3 ("focusing now", presence) per `docs/plans/2026-10-22-m7-friends.md`.
- Still open: keep-alive case 9, `cargo install cargo-audit`, the other machine.

### What was done, in order

1. **Hosted state read first.**
   - `migration list --linked` showed m7 not applied.
   - Publishable-key probes: `profiles` 404, `rpc/friend_sky` 404, `sessions`
     401 (the control).
   - `db push --dry-run` listed only `20261023030027_m7_friends.sql`.
2. **Pushed** (Lucas said "push"). No database password needed, as for 0.2.0.
   - The history then matched local.
   - `profiles`, `friendships` and `rpc/friend_sky` turned 404 → 401.
   - 2 users and 2 profiles (backfill), none named yet; read once with the
     `.env.admin.local` key.
3. **Installed 0.2.1 after the push:** a session ended, "Backed up" (Lucas).
4. **Bump PR #67**, merged as `7c0cca7`. It also fixed `setVersion.test.ts`
   (see below).
5. `e2e:desktop` 4/4 → tag `v0.3.0` → `Release` green.
   - The draft had 4 assets (installers 2,321,149 bytes).
   - `latest.json` said 0.3.0 at `/download/v0.3.0/`, signed with key
     `8E3AF18012526DA8`, which matches `tauri.conf.json`.
   - A "What's new: Friends" line was added while it was still a draft.
6. **Published by id with `tag_name` in the same call:** Latest `v0.3.0`, no
   `untagged-` tag. `Deploy web` ran green on `7c0cca7`.
7. **Live checks:**
   - The web bundle reports 0.3.0 and contains `friend_sky`.
   - `Starkeep-setup.exe` returns 200.
   - Lucas set a name on the web; the updated desktop app shows the same name
     and code.

### Acceptance results

R1–R11 pass. R12 (optional; two real accounts befriending) not run.

### Found along the way

- **`setVersion.test.ts` hard-coded `0.3.0` as "a different version"**, so it
  failed the moment the repo reached 0.3.0. It now uses `99.0.0`. The bump PR
  first claimed the version tests passed because my command piped vitest into
  `grep`, which hid the failure. The PR text was corrected. **Don't pipe a test
  run into `grep` inside an `&&` chain:** the chain continues on grep's success.

---

## 2026-10-23 — M7 phase 2 merged: the Friends panel and a friend's sky

**Status: phase 2 is on `master` (#65). Nothing is released, and the phase 1
migration is still not on the hosted project.** Friends see nothing until both
happen. Local `master` matches `origin/master`.

### Next

*(Superseded 2026-10-23: 0.3.0 is released, see "Released 0.3.0" above. What is still open is in the 2026-10-23 wrap-up above.)*

- **Release the friends feature as 0.3.0** (a new feature, not a fix). Order
  matters:
  1. `npx supabase db push` to the hosted project (`RELEASING.md` step 1). The
     migration is additive, so 0.2.1 apps keep working against it.
  2. Then bump, tag, review the draft, publish, as usual.

  Plan it first. It's the first release with a migration since M6.
- Then phase 3 ("focusing now", presence) per `docs/plans/2026-10-22-m7-friends.md`.
- Still open from earlier entries: keep-alive case 9, `cargo install
  cargo-audit`, tell friends about releases, the other machine.

### Decisions (with Lucas)

- A friend's sky is shown **full screen** in their theme, with four numbers on
  a strip: focus this week, stars this week, streak, finished constellations.
- A waiting request shows as **"Friends · N" on the pill**, with no
  notifications. It refreshes on start, on window refocus, on coming back
  online, and after every action.

### What was built (#65)

- `src/features/friends` (new slice, imports no other feature):
  - panel (name, code with Copy and a select-and-Ctrl+C fallback, add by
    code, requests, friends with a confirmed Remove)
  - `FriendSkyView`, `FriendsPill`
  - its own `friend_sky` decoder: `shared/sync/wire.ts` refuses rows without
    tag, device or away time
  - friend data is **in memory only**, never Dexie
- `src/app/friendSlots.tsx` draws the friend's sky and computes the numbers
  from the sky, stats and progression features, the same way `timerSlots` does.
- Pure changes elsewhere:
  - `SkyBackdrop` = pure `SkyView` + the Dexie wrapper; `AmbientCanvas` takes
    the theme as a prop
  - `deriveOtherSky` always uses the released tier rules, never the dev ones
  - `totals` accepts rows without `awayMs`
- Local accounts `a@`, `b@`, `c@test.local` (Ada, Bea friends; Cy with a
  pending request to Ada) were seeded by hand for the browser and desktop
  checks. A `db reset` removes them.

### Acceptance results

All cases pass:
- 1.1–5.3: unit and e2e
- 6.1: `e2e:desktop` 4/4
- 6.2: by hand in `tauri:dev` (Lucas)

Totals: 516 unit (sky golden tests unchanged), 26 e2e incl. the a11y scan of
the Friends panel and a friend's sky, 174 pgTAP. CI green.

### Things worth not rediscovering

- **Node's `navigator` has no `onLine`**, so `!navigator.onLine` is true under
  Vitest. Check `navigator.onLine === false` (a unit test caught it).
- **PostgREST errors arrive with no HTTP status on the error object.** Read
  `status` from the response and pass it along. A failed fetch comes back as
  `TypeError: Failed to fetch` with status 0, which counts as "offline".
- **The e2e friend-sky test's session ends 5 minutes before "now"**, so a run
  in roughly the first half hour after midnight on a Monday could see 0 focus
  this week. Accepted; the midnight trap below applies.

---

## 2026-10-22 — M7 Friends: design agreed, phase 1 (server) merged

**Status: M7 is the next milestone. Its design is `docs/plans/2026-10-22-m7-friends.md`
(#62) and phase 1 is merged (#63): profiles, friend codes, friend requests and
`friend_sky`, server only.** Nothing reaches anyone yet: no app screen, and the
migration is **not** on the hosted project. Local `master` matches `origin/master`.

### Next

*(Superseded 2026-10-23: phases 2 and 3 are released and the hosted `db push` is done. What is still open is in the 2026-10-23 wrap-up above.)*

- **Phase 2, the Friends panel** (Sonnet is fine): display name + code,
  add/accept/decline/remove, friend list, a friend's sky and summary stats. Plan
  it first, in plan mode, from the design doc's phase 2 and outcomes 2–3.
- **Before releasing phase 2:** `npx supabase db push` to the hosted project
  (`RELEASING.md` step 1). The app will call functions that only exist after
  `20261023030027_m7_friends.sql` is applied there. Older apps are unaffected
  by the migration, so it can go up any time before.
- Still open from the 0.2.1 entry below: keep-alive case 9, `cargo install
  cargo-audit` (started, interrupted, never run), tell friends 0.2.1 is out,
  the other machine.

### Decisions (with Lucas)

| Question | Choice |
|---|---|
| A together session, someone cancels | **Everyone's session fails** (Forest-style). Amends "leaving never forfeits": only deliberate cancels fail, now a friend's too. Record in CLAUDE.md in phase 4, when built. |
| Shared constellation stars | Either friend's completed session, any time |
| What a friend sees | Sky + summary stats; no tag names, no session list |
| Adding friends | Friend code + display name; request → accept |

Phase 1 defaults (in the PR, unchallenged): a crossing request accepts both;
decline and remove delete the row; 20 outgoing pending requests at most;
`friend_sky` includes ended-early sessions (with outcome) so a friend's "focus
this week" matches their own Stats; nothing new in Realtime yet.

### What was built (#63)

- `profiles` (6-character code from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, display
  name ≤24) made by a trigger after sign-up, backfilled. Owner reads; no direct
  writes.
- `friendships`: no grants, no policies. Seven security definer functions are
  the only way in: `set_display_name`, `request_friend`, `respond_friend`,
  `remove_friend`, `my_friends`, `friend_sky`, plus the `create_profile`
  trigger. Errors are P0001 with stable codes (`friend_code_not_found`,
  `not_friends`, ...), for the app to match on the message.
- **No existing table got a new policy.** Sync pulls with RLS alone and no
  `user_id` filter, so a friend-read policy would copy friends' rows into your
  own store. Keep it that way in later phases.

### Acceptance results

All plan cases pass: `m7_friends.test.sql` 53/53; isolation 56 (guard sets
updated on purpose: `friendships` without `user_id`, `profiles:SELECT`, the new
security definer functions; `profiles` added to the attack matrix); M5, M6
unchanged; 174 checks total. `e2e:web` 23/23 (incl. sign-up through the new
trigger, uninvited refusal, and `e2e/api/friends.spec.ts`). CI green. Case 7.3
checks the queries sync makes, not the sync engine itself.

### Things worth not rediscovering

- **The isolation guards fail on any new table, grant or security definer
  function, by design.** A new phase updates the expected sets in
  `isolation.test.sql` in the same PR and says why.
- **Supabase grants new tables and functions to `anon` and `authenticated` by
  default.** Every new table needs `revoke all ... from anon, authenticated`,
  and every function `revoke execute ... from public, anon`, or the guards fail.
- pgTAP can't hand values from a superuser step to an `authenticated` step
  through a temp table (no access); `set_config('t.x', ..., true)` and
  `current_setting('t.x')` work.
- `npx supabase start` failing with a pipe error means Docker Desktop is down;
  it had to be started this session.

---

## 2026-10-22 — Released 0.2.1

**Status: 0.2.1 is published (tag `v0.2.1`, Latest) and the web version is
deployed from the same commit (`aa05bce`).** Friends get it on their next
update check. It ships the late-upload sync fix (#53) and the accessibility
fixes (#55). No migration, no `min_client_version` change. Nothing in flight.

### Next

*(Superseded 2026-10-23: keep-alive case 9 passed on 2026-10-22; the rest is carried into the 2026-10-23 wrap-up above.)*

- **Keep-alive case 9:** after 2026-10-22 06:17 UTC, `gh run list --workflow
  keep-alive.yml` should show a green `schedule` run. Record it here.
- `cargo install cargo-audit` once, so qa-lead's Rust audit stops reading "not run".
- Carried over: tell friends 0.2.1 is out, set up the other machine. No next
  milestone has been chosen.
- **Vercel token expires 2027-10-16**; renew it before then (new token into the
  `VERCEL_TOKEN` GitHub secret, delete the old one), or web deploys fail.

### What was done

Version bump PR #60 (five files, one line each), merged; tag `v0.2.1` on
`master`; CI built the draft; published by id with `tag_name` named, per
`RELEASING.md` step 5.

### Acceptance results

| # | Case | Result |
|---|---|---|
| A1 | Bump touches exactly the five version files; version tests pass; CI green | Pass: 6 lines in 5 files; `setVersion` and `brand` tests pass; db, desktop, e2e, web all green |
| A2 | `npm run e2e:desktop` passes, nothing left running | Pass on the second run (4 passed, 2.7 min); no `starkeep.exe`, nothing listening on 5173/9222. **The first run failed**, see below |
| A3 | Desktop checklist walked by hand | Pass (Lucas, tray, notification, window); startup and update items not walked before release |
| A4 | Release run green; draft holds the four files; `latest.json` points at `/download/v0.2.1/` | Pass; both installers 2,317,601 bytes; version 0.2.1, signed |
| A5 | Published under `v0.2.1`; Deploy web green on the tagged commit | Pass: Latest is `v0.2.1`, no `untagged-` tag; deploy built `aa05bce` |
| A6 | Web address loads, sign-in works | Pass: 200 and a built page (me); sign-in checked by Lucas |
| A7 | `Starkeep-setup.exe` download link resolves | Pass: 200 after redirects |
| A8 | Installed app shows "Starkeep 0.2.1 is ready" and restarts onto it | Pass (Lucas, by eye) |

### Things worth not rediscovering

- **One unexplained desktop-test hang.** On the first run, the sign-up test in
  `desktop.spec.ts` waited 10 minutes for "New here? Create an account" to become
  clickable ("visible, enabled and stable"), then timed out (the run took 11.9
  min; the fourth test did not run). The immediate re-run passed 4/4 in 2.7 min.
  Not reproduced, so the cause is unknown: a window that wasn't drawing is the
  guess. The release changed no desktop code. If it recurs, look at that
  `click` first.
- CI's `desktop` job does not run the WebView2 tests; they are local only.

---

Older entries are in `docs/notes-archive/`:

- `2026-Q3.md`: M0, the naming, the Tauri pivot, M0.5.
- `2026-Q4.md`: 2026-10-03 to 2026-10-21 — M1 through M6, the first releases
  (0.1.0 to 0.2.0), the Supabase pause guard, and the QA plan (PRs A–F).
