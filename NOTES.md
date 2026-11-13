# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-11-13 — The QA pass on 0.9.0, acted on: seven PRs merged, not released

**Status: merged, not released.** `master` held `dd47f10` after the seven PRs (`package.json` still 0.9.0), with its own CI green on that commit; one follow-up, #193 (the flaky test, below), came after. Lucas asked `qa-lead` (web only) to look over 0.9.0 on 2026-11-12; everything it found was turned into one PR each (#184–#190, `qa-lead` memory in #184 and #191), merged in the order below, and a final `qa-lead` pass (web and desktop) found no regression and nothing Critical. Of the seven, #185, #186 and #188 change the desktop exe and #188 the web build too, so they reach people with the next release.

### What the first pass found, and what became of it

- **Critical, RUSTSEC-2026-0429 (`zip` 4.6.1), fixed in #185.** Not a fourth entry in `src-tauri/.cargo/audit.toml`: `zip` is an optional *default* feature of `tauri-plugin-updater` (`default = [rustls-tls, system-proxy, zip]`). Its source shows Windows takes the zip path only `#[cfg(feature = "zip")]` and otherwise `extract_exe` (our plain NSIS `setup.exe`); macOS unpacks `.app.tar.gz` with tar/flate2, which it always depends on. `Cargo.toml` now has `default-features = false, features = ["rustls-tls", "system-proxy"]`; `zip`, `arbitrary` and `derive_arbitrary` left `Cargo.lock` and the three old ignores are gone (`ignore = []`). CLAUDE.md has the decision. **A real update was installed to prove the path:** two release builds of the branch (0.9.98 and 0.9.99, throwaway signing key, local endpoint), 0.9.98 installed, "Starkeep 0.9.99 is ready" appeared, Restart to update, and the installed exe became 0.9.99 and relaunched; then the published 0.9.0 installer (SHA-256 matched) was put back. The one-off spec was never committed.
- **Rust warnings, #186.** `cargo update -p tokio -p rustix -p async-executor` (1.54.1, 1.1.6, 1.14.1) only, not a full update (that moves 150+ crates including Tauri plugins). Glib, zbus_names, zvariant(_derive) and proc-macro-error stay as warnings: Linux-only, owned by Tauri.
- **Bundle growth, #187 (accepted) and #190.** JS gzipped 247.2 → 281.0 kB since the baseline of 2026-10-21. By release: v0.6.2 262.7, v0.7.0 265.8, v0.8.0 278.3 (**+12.5**, the sky upgrade), v0.9.0 281.0 (**+2.7**, the Stardust redesign). Lucas chose to re-baseline rather than split code. `perf-baseline.json` is now 287,783 / 8,329 / 278,274 bytes.
- **Scrollbar width, #188.** Confirmed first in the installed 0.9.0 at 480 px: Shop and History panels 417 px with a 15 px classic scrollbar, Goal & streak 432 px with none. `scrollbar-gutter-stable` on `PanelLayer`'s scroller (`HomeRoute.tsx`); all three tabs are 417 px in WebView2. Every panel now sits ~7 px left of centre when nothing scrolls (accepted over `both-edges`). `shop.spec.ts` asserts the computed gutter (fails without the class).
- **Supabase CLI 2.120 → 3.1, #189.** v3 makes commands default to the local stack. **A bare `db push` now pushes to the local database and sends the hosted project nothing**, so RELEASING.md step 1 would have "succeeded" without applying a migration. It and `supabase/README.md` now say `--remote` (`--linked` is deprecated, removed in v4), and CLAUDE.md records it. `config.toml` needed only `[auth.email]`/`[auth.sms]` `enable_signup` → `enabled`; it already had `[local_smtp]` and a `project_id`.

### Things learned that aren't in the code

- **CI measured the wrong app.** `npm run build` with no `VITE_SUPABASE_*` makes Vite drop the sync and sign-in code, so CI's size step read 224.1 kB while 281.0 kB ships, and could never have flagged any of the growth. A worktree build of an older tag without `.env.production.local` shows the same thing, which made my first per-release table wrong until I copied the file in. #190 gives only the size step placeholder values (`.invalid` host). Locally, a size figure needs `.env.production.local`.
- **A bare `db push` can no longer be trusted to have reached the hosted project** (above): it exits 0 against the local database. Read the `Target:` line the CLI prints. `migration list --remote` and `db push --remote --dry-run` are read-only, need no password and no prompt (checked).
- **Opening the installed app for a measurement can show a result screen the user hasn't seen.** The installed 0.9.0 opened on "Session complete" for a focus-together session that ended while it was closed. It was left undismissed on purpose.
- **A PR's green CI predates whatever merged after it.** Before merging a PR that shares a file with one just merged, trial-merge it (`git merge-tree --write-tree origin/master origin/<branch>`), and for `Cargo.lock` also run `cargo audit` on the combination. Master's CI after the last merge was the final check.
- **GitHub reports `UNKNOWN` mergeability for ~20–30 s after a merge**; wait rather than treating it as a conflict.
- **The flaky web test was a real race in the app, fixed in #193.** `e2e/web/friends.spec.ts:328` ("a friend sees you focusing, then on a break, within about 15 seconds") timed out once in the final `qa-lead` pass, then passed alone in 49.4 s. It was pre-existing (none of the seven PRs touched it) and not just slow: `useShareFocusStatus` started an upload per status change and let them overlap, so "focus" and "break" (the test fast-forwards a 25-minute block, so they leave ~0.1 s apart) could land in either order and the older overwrote the newer. Reproduced first: the real test failed 1 run in 6 under 6-way load, and a temporary probe logging the uploads showed the break response arriving before the focus one in the failing runs (3 of 40). Real use is far narrower (a start and an end within a second on a slow connection leaves friends seeing "Focusing now" for up to 25 min). #193 adds `serialQueue` (`friends/domain`), sends uploads through it, and also gives that test its own 120 s limit (it waits on four presence updates and a passing run took ~52 s of 60). After: probe 0 of 40 failing, the real test 12 of 12, full web+API e2e 72/72. The probe was never committed.

### Checked, with what was seen

`cargo audit` exit 0 with `ignore = []` and 5 warnings; `cargo tree -i zip` finds no package; lint, format, types clean; 984 unit tests pass; database 312/312; web e2e 71/72 (the flake above, since fixed: 72/72 on #193), accessibility scan clean; desktop e2e 6/6; Lighthouse 100 and 100; `npm audit --omit=dev` 0; `perf:size` "Within 10%" (281.1 vs 281.0 kB). Master's own CI green.

### Not verified

macOS, as always. Installed 0.9.0 apps being offered a later update (they keep the zip-enabled updater until the next release is installed). A real `db push --remote` (no migration was pending; the first release that has one is the first real run, and its confirmation prompt has not been seen). The v3 CLI's behaviour on the hosted project beyond the read-only commands above. For #193: a genuinely slow network (the bad upload order was reproduced by load on one machine, not by network delay).

### Next

- At the next release, the first `db push --remote` and the first update installed by a zip-less build are the two live checks; RELEASING.md already says to read the `Target:` line.

---

## 2026-11-11 — Released 0.9.0 (the Stardust panel redesign)

**Status: published.** v0.9.0 is the Latest release (tag `v0.9.0`, commit `6b6c03d`, version bump #182). It went out at 03:44 UTC on 2026-11-12 (22:44 local on the 11th). The desktop update and the web version both came from it. Nothing in flight except the docs PR that adds this entry.

### What shipped

The Stardust panel redesign (#170–#173: three tabs, cards, ask-first Buy) and the reviewer's leftovers after it: #178 panels open on their title (L1), #179 the Buy question takes the card's face in place (L4), #180 the three tabs share one 576 px width, #181 a short last row of cards is centred. That clears every item on the reviewer's "left on purpose" list. Frontend only: nothing under `supabase/`, `src/shared/db`, `src/shared/sync` or `src-tauri/` changed since v0.8.0, so no migration, no Dexie change, `min_client_version` left empty.

### Checked, with what was seen

- Hosted database already had all 7 migrations (`migration list --linked`), and `db push --dry-run` said up to date. Nothing was pushed.
- Bump PR #182 had all five CI jobs green. The `Release` run built the draft; `version` and `desktop` jobs passed.
- Draft: four files, `tag_name` `v0.9.0` (re-read after the description PATCH, which named the tag), `latest.json` says 0.9.0 under `/download/v0.9.0/`, signature key id `8E3AF18012526DA8`. Installer 2,467,192 bytes, starts `MZ`, SHA-256 matched GitHub's digest.
- **Packaged desktop app**: ran the draft's installer silently (`/S`, exit 0) over 0.8.0 and launched it with `--remote-debugging-port=9222`. It came up signed in with existing data, no service worker, the Stardust panel opened with focus on its "Stardust" heading, three tabs with Shop first, star styles in rows of 2 + 2 + 1 with each row centred on the list. Console: only the known `ipc.localhost` fallback warning.
- After publishing: release list shows v0.9.0 Latest (not `untagged-…`); `Deploy web` succeeded on the tagged commit `6b6c03d`; https://starkeep.vercel.app returns 200 and serves a bundle containing 0.9.0 and the new panel's strings; `Starkeep-setup.exe` answers 206; `latest.json` at `/releases/latest/download/` says 0.9.0.

### Not verified

- **An installed 0.8.0 app being offered the update.** This machine's only install was upgraded by the check above, so "Starkeep 0.9.0 is ready" / "Restart to update" was not seen. The same check from the 0.8.0 release is also still unconfirmed.
- Signing in on the live site (production accounts, not touched), a real screen reader, a non-Night theme equipped, the shop's purchase flow by eye on the packaged app.

### Things learned that aren't in the code

- **CI's Supabase-stack setup flakes on the runner**: a job ("e2e" on #180, "db" on master after the #182 merge) failed at "Start the local Supabase stack" with "failed to bind host port … address already in use" or "error from registry: Rate exceeded". No test ran. `gh run rerun <id> --failed` fixed it each time; the same code had passed on the PR.
- **A rebase of two PRs that each append a test to the end of a spec file conflicts** and git interleaves the two tests. Take master's file and re-append the branch's test from its own commit rather than editing markers.
- **Python isn't installed on this machine** (the Microsoft Store stub answers), so `RELEASING.md`'s key-id one-liner doesn't run here; the same decode works in Node (`Buffer.from(sig[1],'base64').subarray(2,10).reverse().toString('hex')`).
- **(Resolved 2026-11-12, `fix/panel-scrollbar-gutter`: confirmed as the classic scrollbar, 15 px on the two tabs that scroll and 0 on the short one; the panel scroller now has `scrollbar-gutter: stable`, all three tabs are 417 px.)** **Open quirk, measured not fixed:** in the packaged app's 480 px window the Goal & streak panel is 432 px wide while Shop and History are 417 px. Most likely the classic scrollbar the two taller tabs show and the short one doesn't (unconfirmed). It is invisible in the e2e (headless Chromium uses overlay scrollbars). `scrollbar-gutter: stable` on the panel's scroller would be the first thing to try.

### Next

- Confirm the update on a second installed 0.8.0 (or 0.7.0) app within the updater's ~6-hour cycle.
- Optional, its own PR: the scrollbar width quirk above. **(Superseded 2026-11-13: fixed in #188.)**

---

## 2026-11-10 (later) — Stardust shop redesign merged (#170–#173); not released

**Status: merged, not released.** **(Superseded 2026-11-11 — released as 0.9.0 together with the four reviewer fixes #178–#181; see the entry above.)** `master` (`eaf2e16`) holds a three-part redesign of the Stardust panel, a reviewer-polish PR, and the reviewer's memory update (#174). `package.json` is still 0.8.0, so the redesign reaches nobody until the next release. Each code PR had all five CI jobs green before it was merged (master's own runs after the merges were not looked at).

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
- **Reviewer Lows left on purpose:** ~~L1, focus lands on "Back to timer" when any panel opens~~ (fixed 2026-11-11: a panel now opens on its title, see the PR for `fix/panel-focus-heading`); ~~L4, a card row grows when a question opens~~ (fixed 2026-11-11: the question takes the card's face in place, `fix/shop-question-in-place`); ~~the Shop tab is wider than the other two~~ (fixed 2026-11-11: all three tabs share `max-w-xl`, `fix/stardust-tab-width`); ~~five styles in three columns leave one empty cell~~ (fixed 2026-11-11: a short last row is centred, `fix/shop-last-row-centred`).
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
