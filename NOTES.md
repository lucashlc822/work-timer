# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-11-10 (later) — Stardust shop redesign merged (#170–#173); not released

**Status: merged, not released.** `master` (`eaf2e16`) holds a three-part redesign of the Stardust panel, a reviewer-polish PR, and the reviewer's memory update (#174). `package.json` is still 0.8.0, so the redesign reaches nobody until the next release. Each code PR had all five CI jobs green before it was merged (master's own runs after the merges were not looked at).

### Why

Lucas: the shop felt like features stacked in the order they were built. Looked at live, that was true: one long column (balance, earning explainer, goal and streak settings, four shop lists, then an untitled 20-row ledger), every item the same row with a 40 px preview, price only inside a faded "Needs 1,200 Stardust" pill, and Buy spending on one click with no feedback on success.

### What landed

- **#170, structure.** Balance up front under an atlas-face title; the explainer in a closed disclosure; three tabs (Shop opens first every time, Goal & streak, History). History is now headed and grouped by day (`domain/ledgerDays.ts`). Tabs follow the ARIA tabs pattern with arrows, Home and End, and one Tab stop (reuses `radioKeyTarget`). Panels stay mounted and `hidden`, so `aria-controls` always resolves.
- **#171, cards.** Styles, themes and packs are cards (`ShopCard.tsx`). Previews are bigger and drawn by the sky through optional props (`StylePreview size`, `ThemeSwatch size='card'`, `PackPreview labelled`); with no props each renders exactly as before. One state per card from a pure function (`domain/shopState.ts`): Equipped (ring), Owned + Equip, Owned/Unlocked, price + Buy, or price + "N more to go". Each collection says "N of M owned". Tier unlocks are a quiet "Shortcuts" list.
- **#172, deliberate buying.** Buy opens an in-card question ("Buy Ember for 300? You'll have 142 left.") with Buy and Not now. Focus goes to the confirm button, back to Buy after Not now, Escape or a refusal, and onto Equip (or the Owned status) after a purchase. A polite live region says "Ember is yours." and the picture flares once (no animation under reduced motion). New `e2e/web/shop.spec.ts`; `seedStardust` moved into `e2e/support/users.ts`.
- **#173, reviewer polish.** Taller disclosure toggle, History amounts read "+25 Stardust" to a screen reader, no duplicate "History" heading or "Shop" landmark.
- **#174.** The reviewer's own memory line for this review.

### Reviewer result (`ui-ux-reviewer`, master `b659745`)

No Blocker, High or Medium. axe 0 violations on all three tabs at 1280, 768 and 375, and with a question open (12 scans). Text contrast measured over the real background; `ink-muted` is the thin one at 4.55–4.72:1 (passes AA, little margin). No colour or spacing outside the tokens.

### Things learned that aren't in the code

- **The Escape handling depends on React's event order.** The card's `onKeyDown` calls `stopPropagation`, which stops the native event before it reaches the panel's `document` keydown listener in `HomeRoute.tsx`. If that listener ever moves to the capture phase or to `window`, an Escape would close the panel as well as the question. `Shop.test.tsx` and `shop.spec.ts` both pin this, in both directions.
- **A purchase writes a permanent ledger row**, so the live checks stopped at the question and the real purchase is covered only by the e2e tests, on fresh accounts.
- **`exactOptionalPropertyTypes` is on**, so passing an optional prop through needs `| undefined` in the target's prop type.
- **jsdom drops a multi-gradient `background`**, so the `style` attribute is absent there; don't assert on it.
- **Reduced motion:** the global rule zeroes durations but keeps `animation-name`; `.shop-flare` and `.shop-pulse` have their own `animation: none` so the computed name is `none`.
- **Huge Bash heredocs with mixed quoting can fail to parse and run nothing.** For big files use the Write tool, and a small Python script for edits.
- **Docker Desktop was off again** after the app restarted, so `npx supabase start` failed until it was started (the "db not ready: starting" message once is the known blip).
- **The reviewer's run leaves its memory file modified** on whatever branch is checked out. Stage only your own files, and land it as its own docs PR, as #174 did.
- **Browser pane screenshots can show a stale frame.** Read the DOM state before believing one.

### Not verified

The purchase flow by eye (focus after a purchase, the flare; only computed style and tests), a non-Night theme equipped, the History "Today"/"Yesterday" and empty states, the packaged desktop app with the new panel, and a real screen reader. The reviewer did cover 768 px.

### Next

- **Release** when Lucas decides (`RELEASING.md`; this would be 0.9.0, as a minor bump with no migration).
- **Still open from the 0.8.0 release:** confirm an installed 0.7.0 app is offered the update (not checkable on the machine that upgraded itself).
- **Reviewer Lows left on purpose:** ~~L1, focus lands on "Back to timer" when any panel opens~~ (fixed 2026-11-11: a panel now opens on its title, see the PR for `fix/panel-focus-heading`); ~~L4, a card row grows when a question opens~~ (fixed 2026-11-11: the question takes the card's face in place, `fix/shop-question-in-place`); the Shop tab is wider than the other two; five styles in three columns leave one empty cell.
- **CLAUDE.md "Decisions already made"** ~~doesn't yet record the shop's structure~~ — done 2026-11-10: the bullet "The Stardust panel is three tabs, a card shows one state, and Buy asks first" (tabs, one state per card from `shopState`, ask-first Buy, Escape closes the question only), #177.

---

## 2026-11-10 — Released 0.8.0 (the View sky upgrade)

**Status: published.** v0.8.0 is the Latest release (tag `v0.8.0`, commit
`ea57f08`, version bump #168). The desktop update and the web version both went
out at 05:15 UTC. Nothing in flight.

### What was done

Followed `RELEASING.md`. No migration (`supabase/migrations` is identical to
v0.7.0; `migration list --linked` showed all 7 applied and `db push --dry-run`
said up to date), and `min_client_version` was left empty: no wire or store
change, only two per-device `meta` keys and a sync filter that skips dev-seeded
constellations. Bump PR #168 had all five CI jobs green before the merge; the
`Release` run built the draft in about 8 minutes; `Deploy web` succeeded on the
tagged commit.

### Checked, with what was seen

- Production web build against the local stack: full sky opens, Alegreya SC
  loaded and used by captions, no console errors. The font ships as `.woff2`
  files (none inlined as `data:`).
- Draft: four files, `tag_name` `v0.8.0`, `latest.json` says 0.8.0 under
  `/download/v0.8.0/`, signature key id `8E3AF18012526DA8` (the one in
  `RELEASING.md`). Installer SHA-256 matched GitHub's recorded digest.
- **Packaged desktop app** (installed the draft's installer over 0.7.0, silent
  `/S`): launched signed in with existing data, the font loads under the real
  CSP, captions in Alegreya SC, constellation and star cards render on hover (read
  from screenshots), no service worker. The only console errors were the
  known `ipc.localhost` CSP noise.
- After publishing: release list shows v0.8.0 Latest and not `untagged-…`; the
  live site returns 200 and serves the 0.8.0 bundle and the font;
  `Starkeep-setup.exe` answers 206.

### Not verified

- **An installed 0.7.0 app being offered the update.** This machine's only
  install was upgraded by the check above, so "Starkeep 0.8.0 is ready" /
  "Restart to update" was not seen. Worth a look on the other machine or a
  friend's, within the updater's ~6-hour cycle.
- Signing in on the live web site (production accounts, not touched).
- Other themes, the shop's "Owned" state, a real screen reader, a crowded
  (~20-figure) sky: as before, not blockers.

### Things learned that aren't in the code

- **PowerShell eats the double quotes in a native command's argument**, so a
  `gh api --jq '… == "name" …'` from PowerShell failed to parse and the
  download saved a 111-byte error body as the "installer". Run `gh` with jq
  expressions from Bash. Checking the file size and `MZ` header caught it.
- **A silent install (`/S`) of the per-user NSIS installer upgrades in place**
  and exits 0; the launch needed `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  to read the real app's page over DevTools.

### Next

- Optionally confirm the update on a second 0.7.0 install (above).

---

## 2026-11-09 (end of session) — Reviewer findings fixed (#156–#159), re-checked, and the re-check's four findings fixed (#160–#164); not released

**Status: merged, not released.** *(Superseded: released as 0.8.0 on 2026-11-10;
see above.)* `package.json` was still 0.7.0 at the time, so friends and
the web version still had the old sky. Releasing is Lucas's call
(`RELEASING.md`). Master's CI is green after #164 (all five jobs).

### What landed

First pass, from the 2026-11-06 `ui-ux-reviewer` report: #156 caption legibility
(captions keep their own opacity, wrap to their cell, "Ada's sky" naming) · #157
a friend's sky is laid out below its header (`reserveTop`) · #158 small polish
(star-card line, shop "Equipped" as a status, "Focus with friends" 24 px) · #159
one Tab stop per constellation with arrow keys between its stars. A re-check
confirmed all nine fixed and axe at 0 violations.

Second pass, from the re-check's four new findings: #160 a friend's sky is
opaque (`bg-night-900`) so your own timer constellation doesn't show through ·
#161 wandering stars keep clear of every figure's box and caption
(`figureFootprint`), which also fixes "can't hover a wandering star under a
figure" · #162 the "·" in the star card leads the second line · #163 a unit test
that captions are at least 4.5:1 over every theme's ground (lowest 5.58) · #164
a lint fix for #162. Decisions are in CLAUDE.md; PR bodies hold the acceptance
results.

### Things learned that aren't in the code

- **I merged #160 and #162 with CI still pending, and #162 was red.** Lint
  failed on `sky.spec.ts` because I changed a spread to `Array.from` after my
  last local lint run. The lesson is to run lint and `tsc -b` after the *last*
  edit, not before it. The same master run's `e2e` job died in "Start the local
  Supabase stack" with `0.0.0.0:54324 address already in use`: a runner
  problem, fixed by a re-run, not by code.
- **`docker info` printing a Client section does not mean the engine is up.**
  Docker Desktop had been off for days; `npx supabase start` and
  `npm run e2e:web` fail until `docker version --format '{{.Server.Version}}'`
  answers. `supabase start` can also report "db not ready: starting" once and
  then be fine.
- **A DOM `getClientRects()` count is the wrong way to ask "did this wrap".** A
  nowrap span with two text nodes reported 2 boxes; a `Range` over the
  characters and a comparison of their `top` is what answers it.
- **The friend-sky e2e hit-test now demands each star's centre belong to that
  same element.** It still ignores a floating card and a wandering star landing
  on another wandering star (seeds are random per run, so two can sit within a
  hit radius of each other). That second case is known and accepted.
- **Sensitivity checks matter.** A first attempt to disable `avoid` with
  `[] && x` did nothing (an empty array is truthy); only `full ? [] : undefined`
  made the tests fail the way they should.

### Not verified

Non-Night themes rendered live (they cost Stardust and a purchase writes to the
synced ledger), the shop's "Owned" state, the packaged desktop app and a real
screen reader.

A narrow `ui-ux-reviewer` re-check on `9e2d40d` then covered #160–#162 live: a
friend's sky is opaque at 1280/768/375 (nothing from the viewer's own sky on top
at 399–520 sample points per size); every wandering star in the viewer's own sky
hovers to its own card (15/15 at each size) and none sits on a caption; the
star-card dot leads the second line at 375; axe is clean on a friend's sky at
1280/768/375 and the viewer's own at 768. In a friend's sky with 40 wandering
stars, 39/40 hover at 1280/768 and 33/40 at 375: every miss is a star within
~12 px of another, the accepted case. Still uncovered: other themes, the shop's
"Owned" state, the desktop app, a sky with more than 8 figures (Tab stops were
checked at 9, not the ~20 of a crowded one), and a wrapped card that also has a
tag line.

### Next

- Release when Lucas decides (on 2026-11-09 he chose to leave it for now).

---

## 2026-11-06 (end of session) — View sky upgrade fully merged (PRs 0–8); not released; reviewer findings open

**Status: merged, nothing in flight, not released.** `master` (`8c78057`) holds the
whole "premium View sky" plan from the 2026-11-05/06 sessions. `package.json` is
still 0.7.0, so friends and the web version still have the old sky. A
`ui-ux-reviewer` pass was run afterwards and found two High and three Medium
issues; none are fixed yet. **(Superseded 2026-11-09 — all nine were fixed in
#156–#159 and confirmed by a re-check; see the 2026-11-09 entry.)**

### What landed (all merged by Lucas's "merge PR N", CI green each time)

#144 dev fixture (`__starkeep.seedSky`, local-only so it never syncs, earns
Stardust or survives `clearSeeded()`) · #145 atlas captions in Alegreya SC ·
#146 astrophoto stars (`starForm` + `AstroStar`, no per-star filters) · #147 star
card on hover/focus · #148 side fix, wandering-star label · #149 constellation
card + dimming · #150 and #151 engraved figures for all 15 catalogue shapes ·
#152 once-per-device completion moment · #153 living sky (Milky Way, shooting
stars, parallax) · #154 shop previews use the sky's own star (`StylePreview`;
the result screen deliberately keeps `StarGlyph`).

Each decision is recorded in CLAUDE.md "Decisions already made"; each PR body has
its acceptance table and what was not verified. Not repeated here.

### Things learned that aren't in the code

- **A scaled full-screen blit costs real CPU.** The first parallax stretched the
  nebula each frame (~5 CPU points more than `master`); the fix is a canvas one
  pixel larger each way, copied unscaled at a whole-pixel offset. Measure before
  and after any change to what a frame draws (headless Chromium, CDP CPU deltas).
- **The completion record must exist even behind the timer**, or a constellation
  finished before the sky is first opened gets swallowed into the first-run
  baseline. Found by writing the e2e, not by review.
- **CI e2e can fail on a runner port clash (54324) before any test runs.**
  Re-running the failed job passed; it is not a test failure.
- **Browser pane can't verify animation** (no frames while hidden); animation
  numbers came from headless Chromium via Playwright scripts, not the pane.

### Reviewer findings (2026-11-06, `ui-ux-reviewer`, Night theme only)

No Blockers. Passed: both cards, Escape order, no card over Back at 480×720 across
154 stars, all styles/figures, completion moment, reduced motion, shop previews,
friend's sky leaks no tags, axe 0 violations on 8 scans.

- **High:** unfinished-figure captions ~2.2–2.7:1 contrast (needs 4.5:1): keep the
  caption near full opacity, dim only lines and stars (`ConstellationLayer.tsx`
  caption `fillOpacity` and the figure-level opacity).
- **High:** a friend's sky is laid out for the full window and its own header
  covers the top (4 of 9 stars unreachable by mouse, still keyboard stops; fails
  2.4.11). Seen with one figure only; likely worse with several.
- **Medium:** friend's sky announced as "Your sky" (`ConstellationLayer.tsx:157`);
  captions overlap at 375 px with 18 figures; "The Great Heron" caption
  borderline on its own glow.
- **Low:** "25 / minutes" wraps in the card; "Equipped" label faint; "Focus with
  friends" is 16 px tall (predates the upgrade); 154 tab stops in a crowded sky.
- **Not covered:** meteors and parallax by eye, timer states, mini window, themes
  other than Night, a friend with several figures, the packaged desktop app, a
  screen reader, a true two-device run.

### Next

1. **Decide which reviewer fixes go before a release.** Suggested split: one PR for
   caption contrast, "Ada's sky" label and the Heron halo; a separate PR for the
   friend-sky layout; narrow-width caption overlap with either.
2. **Release** (Lucas's call; `RELEASING.md`) once the above is decided. Desktop
   app check and a two-device run of the completion moment are still unverified.

---

## 2026-11-04 (end of session) — 0.7.0 is out and in use; repo is clean

**Status: nothing in flight.** No open PRs. `master` (`aa62357`) is the only
branch, locally and on GitHub. 0.7.0 is published, Lucas and mia are both on it,
and the lobby came up on the real server. What's left is checks only people can
do, plus a few optional items.

### What happened after the release entry

- **Lucas updated to 0.7.0** and reviewed the lobby with mia: the host view showed
  "You · Host", "mia · In", "25 min together" and Start together. That covers R14
  in effect (his report, not checked step by step) and the lobby half of R16. Not
  seen: what Start together did on both screens, the Friends-list statuses on the
  real server, and the Account switch (R15's in-app half).
- **Decision (Lucas, 2026-11-04): the lobby's length stays fixed once invited.**
  `create_room` stores `planned_duration_s` and no server function edits it; mia
  has already joined *that* length. To change it: Cancel invite, then invite again.
  Editing in the lobby would need a new server function plus resetting joined
  friends to "invited"; not wanted now.
- **Housekeeping done.** The footer session's worktree removed; 119 local and 125
  GitHub branches deleted (all fully merged; Lucas ran the GitHub deletes himself).
  All 11 version tags and the releases are intact.
- **Lucas ran `/auto-mode-setup`.** It appended an environment description and
  three `soft_deny` rules to `~/.claude/settings.json` (user-level, not in this
  repo): `npx supabase db push`, `npx supabase config push`, and force-push to
  `master`.

### Next

1. **Tell friends 0.7.0 is out** (Lucas).
2. **Finish R16 with mia:** Start together gives the same end time on both
   screens; each sees the other's status in Friends; a friend with the app hidden
   shows "Away" in the lobby.
3. **A `ui-ux-reviewer` pass on the presence screens** (status dots, the "Show
   when I'm online" switch). Never run.
4. **Issue #7** (five dev-dependency npm audit findings, open since 2026-10-03):
   its own PR, from one machine.
5. **Still open from before:** the unexplained desktop-window stall (it passed
   first time for 0.7.0); optionally focusing a panel's heading on open.

### Things worth not rediscovering

- **Lucas's terminal is PowerShell.** A bash one-liner (`grep`, `sed`, `xargs`)
  failed there with "not recognized"; give PowerShell versions.
- **Auto mode refused** `supabase db push` and the bulk `git push origin --delete`,
  but allowed the tag push, the `gh api` publish and the PR merges.
- **Known small issues, left on purpose:** Pomodoro mode scrolls at 480×720 (it
  did before these changes); a dismissed "lobby ended" note returns after a
  reload for its remaining 5 minutes; a guest can see a closed lobby for 6–10 s;
  "Online" can linger up to 3 minutes after someone quits.

---

## 2026-11-04 — Released 0.7.0: focus together, premium pass

**Status: 0.7.0 is published (tag `v0.7.0`, Latest, commit `a66f24a`; web deployed
from the same commit).** It ships #137 (a lobby locks the timer), #138 (the lobby as
a place on the timer screen), #139 (friend presence) and #140 (the idle screen fits
480×720 with a banner). The presence migration `20261103055914_m7_presence.sql` was
applied to the hosted project first (`db push`, run by Lucas: auto mode refuses a
write to the live server); `min_client_version` is still null. Plan:
`~/.claude/plans/pasted-content-id-3e93-i-m-currently-merry-turtle.md`.

### Acceptance pass

| Case | Result |
|---|---|
| R1 five version files | Pass: five files, six lines, 0.6.2 → 0.7.0. |
| R2 unit tests + CI | Pass: 656 passed, 10 skipped; CI on #141 green. |
| R3 `e2e:desktop` | Pass: 6/6 on the first run, including the cross-device test that has stalled before. |
| R4 `e2e:update` | Pass: 1/1, on the second try (see below). |
| R5 `Release` workflow | Pass, including its `version` job. |
| R6 draft assets | Pass: the four expected, nothing else. |
| R7 `latest.json` | Pass: 0.7.0, URLs under `/download/v0.7.0/`, key id `8E3AF18012526DA8`. |
| R8 "What's new" line | Wording approved by Lucas as written; saved with `tag_name` in the same call; re-read showed `v0.7.0`. |
| R9 published on the right tag | Pass: `v0.7.0` Latest, no `untagged-…` refs. |
| R10 `Deploy web` | Pass, on `a66f24a`. |
| R11 live bundle | Pass: contains `"0.7.0"`, not `"0.6.2"`. |
| R12 downloads | Pass: `Starkeep-setup.exe` 206 to a one-byte range; served `latest.json` says 0.7.0; the update file it names answers 206. |
| R13 `min_client_version` | Pass: null on the hosted project. |
| R14 installed app | **Not yet done: Lucas's 0.6.2 app updating to 0.7.0.** **(Superseded 2026-11-04 — Lucas updated and is using 0.7.0; reported by him, not checked step by step. See the end-of-session entry.)** |
| R15 server side | Pass: hosted `presence` table and `profiles.share_online` answer 401 (`sessions` 401, a made-up table 404). The in-app switch on 0.7.0 is not yet seen. |
| R16 two-person check | **Not yet done: needs mia on 0.7.0.** Not a blocker. |

Not covered: a first-time install of 0.7.0, the update on anyone's machine but
Lucas's, and the `ui-ux-reviewer` pass on the presence screens (never run).

### Next

1. **R14:** Lucas's installed app updates 0.6.2 → 0.7.0; check Account shows
   "Show when I'm online" (R15's in-app half).
2. **Tell friends 0.7.0 is out** (after R14).
3. **R16:** the two-person check with mia: invite, lobby on both screens, neither
   can start alone, statuses visible.
4. A `ui-ux-reviewer` pass on the presence statuses and the online switch.
5. Still open from before: the desktop-window stall (see the 2026-11-02 entry),
   and optionally focusing a panel's heading on open.
6. Housekeeping: the footer session's worktree
   (`.claude/worktrees/determined-golick-b1de8d`) and its branch can go.
   **(Superseded 2026-11-04 — done: worktree, local and GitHub branches all removed.)**

### Things worth not rediscovering

- **`e2e:update` fails on an uncommitted version bump.** It ends by asking git
  whether `src-tauri/tauri.conf.json` is untouched, so run it after committing
  the bump, not before. First run failed with `git diff --quiet`; after the commit
  it passed.
- **Piping a Playwright run into `tail` hides its exit status.** The first desktop
  run "completed" with exit 0 because the pipe's last command succeeded; the run
  itself had stopped at start-up (Docker was down, so no local Supabase). Redirect
  to a log and print `$?`.
- **Docker Desktop was stopped between steps.** `npx supabase start` can answer
  "container is not ready: starting" for a moment after Docker comes up; wait and
  check `supabase status`.
- **Auto mode refuses writes to the live server** (`supabase db push`, and it may
  refuse the publish call too; this time `gh api … draft=false` went through).

---

## 2026-11-03 (later) — #137 to #140 all merged; next is the release

**Status: #137, #138, #139 and #140 are merged into `master`, in that order.**
The two entries below describe them as open; that is how they stood when written.
#139 needed a longer timeout on the signed-in a11y walk (it ran past 60 s on
CI); #140 was brought up to date with `master` after #139 (only this file
conflicted).

### Next

1. **Apply `20261103055914_m7_presence.sql` to the hosted project, then
   release** (`RELEASING.md`). A release without it breaks the Friends list.
2. A real two-person check with mia on the new release.
3. A `ui-ux-reviewer` pass on the presence statuses and the online switch.

---

## 2026-11-03 — The idle screen fits 480×720 with an invitation or lobby note (PR open)

**Status: `fix/idle-fits-with-banner` is open as a PR against
`feat/together-lobby-screen` (#138), not merged.** It fixes the ui-ux review's M2
on #138. Retarget it to `master` once #138 merges. **(Superseded 2026-11-04 —
merged as #140 and released in 0.7.0.)**

While an invitation (`InviteBanner`) or the lobby-ended note (`LobbyEndedNote`)
shows, `HomeRoute` passes `compact` to `TimerScreen` and tightens its own
spacing: page gap 24→16, page padding 32/24→24/16, footer gap 12→8; idle card
gap 24→16, padding 24→16, top offset 16→0 (all below the `sm` breakpoint only).
The banner's own padding went 12→8. Without either, nothing changes.

Measured natural page heights at 480×720 (with a friend, so "Focus with
friends" shows):

| Screen | Before | After |
| --- | --- | --- |
| Plain idle | 706 | 706 |
| Invitation | 838 | 710 |
| Lobby-ended note | 786 | 670 |

### Things worth not rediscovering

- **The invitation has only ~10px to spare at 480×720 now.** Anything else added
  above the timer (or a longer banner line) will scroll again; the
  `layout.spec.ts` tests will catch it.
- **Pomodoro mode already scrolls at 480×720 with no banner** (872px natural;
  876 with the invitation). Pre-existing, not from this PR: the fix only changes
  classes while a banner shows. Worth its own PR if the desktop window is to fit
  Pomodoro too.

---
## 2026-11-03 — Focus together, premium pass: three stacked PRs open

**Status: three PRs open, none merged; merge in order.** **(Superseded
2026-11-04 — all merged (#137 to #139, plus #140) and released in 0.7.0.)**
Prompted by Lucas testing focus together with mia on 0.6.2 (she could start a
solo session while in his lobby). Plan: `~/.claude/plans/pasted-content-id-3e93-i-m-currently-merry-turtle.md`.

1. #137 `fix/together-lobby-locks-timer`: a lobby replaces the timer's Start;
   Start while invited asks first ("Start on your own?").
2. #138 `feat/together-lobby-screen` (on #137): the lobby as a card of member
   stars on the timer screen, companions under the clock, a gentle "lobby
   ended" note.
3. `feat/friend-presence` (on #138): Online / Away / Focusing / On a break /
   Offline for friends, "Show when I'm online" in Account. New migration
   `20261103055914_m7_presence.sql` (additive) — applied to the local stack
   with `migration up`; **apply it to the hosted project before releasing.**

After #137 merges, retarget #138 to `master`; likewise the presence PR after #138.

### Next

1. Lucas reviews and merges #137 → #138 → presence, in that order.
2. A separate session works on "keep the footer on screen while a banner shows"
   (branch `fix/idle-fits-with-banner`, its own worktree).
3. Release, then a real two-person check with mia.

### Things worth not rediscovering

- **0.6.2 against the presence migration: its own `e2e:web` passes 45/45**
  (a detached worktree of `v0.6.2` run against the migrated local stack).
- **The desktop e2e serves the web build on 4174 too,** so `e2e:web` can't run
  while it does ("4174 is already used").
- **`page.clock.runFor` over minutes is very slow** (it runs every sky frame);
  `fastForward` jumps and fires each due timer once.

---

Older entries are in `docs/notes-archive/`:

- `2026-Q3.md`: M0, the naming, the Tauri pivot, M0.5.
- `2026-Q4.md`: 2026-10-03 to 2026-11-02 — M1 through M7 (Friends, focus
  together, shared constellations), the releases 0.1.0 to 0.6.2, the Supabase
  pause guard, the QA plan (PRs A–F), the `ui-ux-reviewer` system and its first
  reviews, and the idle-screen redesign.
