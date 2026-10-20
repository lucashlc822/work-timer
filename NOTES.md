# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-10-20 — QA plan approved; PR A (pgTAP isolation) open

**Status: the QA plan is approved, and PR A of six is open, not merged.** Plan
(with Lucas's five changes at approval):
`~/.claude/plans/please-proceed-with-planning-wise-llama.md`. PR A adds
`supabase/tests/isolation.test.sql` (50 checks), which CI's `db` job already
runs. No app or migration change.

### Next

- **Merge PR A when ready**, then **PR B on Opus**: the e2e foundation
  (production fence, fresh test users, Mailpit codes, auth specs,
  realtime-isolation spec, the `e2e` CI job, raised local auth rate limits).
- Then C (sync, timer, offline; Sonnet), D (accessibility plus report-only
  performance; Sonnet), E (desktop, local only; Opus), F (`qa-lead` agent; Opus).
- The keep-alive's first scheduled run (case 9 of that plan) is still to be
  checked: `gh run list --workflow keep-alive.yml`.

### What PR A checks

- **Catalogue guards** (these fail on a future migration, before any row
  exists): RLS on every public table. The only tables without `user_id` are
  `app_config` and `invites`. Exact `anon` and `authenticated` grants (no delete
  anywhere). Every per-user policy is `authenticated` only and matches
  `auth.uid()` to `user_id`. The only security definer functions are
  `delete_my_account` and `enforce_invite`, and neither can be run by `anon`.
  The Realtime publication is exactly the five per-user tables, all with RLS.
- **Matrix**, B against A in `tags`, `constellations`, `sessions`,
  `user_settings`, `ledger`: read, insert as A, update, delete, upsert onto A's
  id (`do update` refused, `do nothing` ignored), moving B's own row to A,
  signed-out reads, and B deleting their account. Afterwards an md5
  fingerprint of all of A's rows is unchanged.

### Acceptance results (plan case 2)

| Check | Result |
|---|---|
| `npx supabase test db` | Pass: 3 files, 115 tests (50 new) |
| Mutation: new table without RLS | Caught (tests 1-4) |
| Mutation: `using (true)` read policy on sessions | Caught (5, 13) |
| Mutation: delete grant + open policy on ledger | Caught (4, 5, 30) |
| Mutation: RLS off on tags | Caught (1, 10, 11, 16, 31, 42, 49) |
| Mutation: extra security definer function | Caught (6, 7) |
| Mutation: `grant select on sessions to anon` | Caught (3, 45) |
| Mutation: `invites` added to Realtime | Caught (9) |

Each mutation was inserted into a throwaway copy of the file, inside its
rolled-back transaction, and the copy was deleted. No migration was written for
it, so this differs slightly from the plan's "scratch branch" wording but
proves the same thing.

**Not covered here (later PRs):** Realtime delivery itself. The publication is
checked, but whether B's websocket receives A's changes is PR B's Node spec.

---

## 2026-10-20 — Supabase pause guard (keep-alive workflow)

**Status: built on `chore/supabase-keep-alive`, PR open, not merged.** A scheduled
GitHub workflow now reads the hosted server every ~3 days so the free tier
doesn't pause it after 7 quiet days. Plan:
`~/.claude/plans/please-proceed-with-planning-wise-llama.md`.

### Next

- **Merge the PR when ready ("merge PR #N"), then run acceptance cases 8 and 9:**
  `gh workflow run "Keep server awake"` and watch it go green; a few days later
  check `gh run list --workflow keep-alive.yml` for a green `schedule` run.
  GitHub only dispatches or schedules workflows that exist on `master`, so
  neither could run before the merge.
- Carried over: tell friends 0.2.0 is out, set up the other machine, renew the
  Vercel token. Next milestone not chosen.

### What was done

- `scripts/keep-alive.mjs`: one `GET /rest/v1/app_config?select=min_client_version`
  with the publishable key; passes only on HTTP 200 and exactly one row with that
  column, so a paused project, bad key or error page all fail. No dependencies.
- `.github/workflows/keep-alive.yml`: cron `17 6 */3 * *` plus manual dispatch,
  using the existing `VITE_SUPABASE_*` repository variables. No new secret, no
  migration, no server change.
- Docs: `CLAUDE.md` Environment bullet and `supabase/README.md`.

### Acceptance results

| # | Case | Result |
|---|---|---|
| 1 | Ping the hosted server | Pass: exit 0, `min_client_version = null` |
| 2 | Missing `SUPABASE_URL` | Pass: exit 1, names the variable, no request |
| 3 | Bad key | Pass: exit 1, HTTP 401 + hint, key not printed |
| 4 | Unreachable server | Pass: exit 1, "fetch failed" + hint |
| 5 | Body check | Pass, but against a throwaway fake HTTP server, not the local stack (Docker was off): good row exits 0; `[]`, an HTML page, and a row without the column each exit 1 |
| 6 | Nothing secret added | Pass: no `secrets.*`; the only `sb_publishable`/`supabase.co` text is placeholders in a comment |
| 7 | CI | ESLint and Prettier clean locally; CI result on the PR |
| 8 | Manual run on GitHub | Not run: needs the merge |
| 9 | Scheduled run happens | Not run: needs the merge and a few days |

**Not verified:** that Supabase counts these reads as activity (it doesn't
publish the rule; a PostgREST read that runs a Postgres query is the commonly
used signal). The proof is the project staying unpaused through a quiet week.
Also, GitHub disables scheduled workflows after 60 days with no repo activity.

---

## 2026-10-18 — v0.2.0 released: M6 is live

**Status: Starkeep v0.2.0 is published and verified, and M6 is done (plan case
18 passed).** The hosted server has the M6 schema, installed apps update to 0.2.0,
and https://starkeep.vercel.app serves 0.2.0. `min_client_version` is still
`null`, so friends still on 0.1.x keep syncing. Release plan, approved before
running: `~/.claude/plans/what-do-you-suggest-mossy-kahn.md`.

### Next

- **Tell friends 0.2.0 is out** (the release notes now say what's new). Their
  installed apps offer the update themselves between sessions.
- The `RELEASING.md` fix for the publish step is merged (#46; see "Found along
  the way").
- **Lucas's balance is confirmed right:** 5 Stardust. His all-time stats list 6
  sessions, and only one is completed (5 min, Sun Oct 18, 11:35 PM); the other
  five ended early, which earns nothing, and no bonus applies yet (1-day streak,
  goal 60 min).
- Carried over: set up the other machine, renew the Vercel token, and nothing
  guards against the 7-day Supabase pause yet. Next milestone not chosen.

### What was done, in order

1. **Migration first.** `npx supabase db push` from the repo root (Lucas asked
   Claude to run it). It needed no database password: the CLI's linked login
   role was enough, the same as `supabase migration list --linked`. A
   `--dry-run` listed exactly `20261017200000_m6_progression.sql`; the push
   applied it, and the hosted history then matched local.
2. **Version bump** #44 (`npm run version:set -- 0.2.0`), CI green, merged as
   `56f0d92`; tag `v0.2.0` pushed on that commit.
3. **Release run** green (version + desktop jobs). The draft had the four
   assets; `latest.json` says `0.2.0`; the `.sig` key id is `8E3AF18012526DA8`,
   matching `tauri.conf.json`. The "what's new" paragraph was added above the
   install text while still a draft.
4. **Published** by id with `gh api -X PATCH .../releases/416871350
   -F draft=false -f make_latest=true` — which came back with tag
   `untagged-742543e7fb81fd80aea6` (see below). Re-tagged to `v0.2.0` within a
   minute, then the stray tag was deleted from GitHub (Lucas asked).

### Found along the way

- **Publishing by id can leave the release without its tag.** The draft had
  been found by `tag_name == "v0.2.0"` minutes earlier, but the publish response
  said `untagged-…`, and GitHub created a git tag of that name on the same
  commit. `latest.json` points at `/download/v0.2.0/…`, so left alone the
  desktop update would have 404'd. Fixed with
  `gh api -X PATCH .../releases/<id> -f tag_name=vX.Y.Z`. Cause not found; the
  same command worked for 0.1.0 and 0.1.1. The one difference this time: the
  description was edited (PATCH `body`) on the draft first. The `RELEASING.md`
  fix publishes with `tag_name` in the same call and checks the tag after.
- **`Deploy web` ran from the published event's tag name**, so it checked out
  `refs/tags/untagged-…`. That tag pointed at `56f0d92`, so it built the right
  code (the live bundle reports `0.2.0` and contains Stardust), but only by luck
  of where GitHub put it.
- **"Permission denied" is the healthy answer** when probing the hosted schema
  with the publishable key: a column that exists returns 401 (42501), one that
  doesn't returns 400 (42703), and a missing table 404 (PGRST205). Anonymous
  callers have never been granted these tables.

### Acceptance results (release plan)

| # | Case | Result |
|---|---|---|
| 1 | Hosted before push | Pass: `ledger` 404, `star_style` columns 400, `min_client_version` null |
| 2 | Hosted after push | Pass: `ledger` and both `star_style` columns exist (401 like `sessions.id`, vs 400 for a made-up column); history matches; `min_client_version` null |
| 3 | Installed v0.1.1 after the migration | Pass (Lucas): a session ended early (Sun Oct 18, 11:14 PM, 0 min; an ended-early session uploads like any other), Account panel "Backed up · synced just now" |
| 4 | Draft release | Pass: 4 assets, `latest.json` 0.2.0, key `8E3AF18012526DA8` |
| 5 | Web after publish | Pass (Lucas's screenshots): 0.2.0, signed in, synced, 5 Stardust |
| 6 | Download links | Pass: `latest.json` 200 (0.2.0); installer and `Starkeep-setup.exe` 200, 2,317,817 bytes |
| 7 | Installed app updates | Pass (Lucas's screenshot): Starkeep 0.2.0, signed in, synced |
| 8 | Desktop + web live | Pass (Lucas): a 5-minute session added +5 on both, balances match |
| 9 | `min_client_version` after publish | Pass: null |

**Not verified:** a friend's machine updating (only Lucas's). Lucas's history
had no completed sessions before the release, so crediting a long real history
on the hosted server is exercised only by the local tests (cases 2, 3, 14).

---

## 2026-10-18 — M6 cases 14 and 15 pass; ready to plan v0.2.0

*(Superseded: v0.2.0 was planned and released; see the entry above.)*

**Status: every plan case for M6 has now been run, and none failed. Nothing is
released and no code changed.** The two cases that needed the desktop app were
run against the local stack with `npm run tauri:dev` builds (debug, not the
packaged installer), driven by script over WebView2's debug port as described
in "How to drive the desktop app from a script" in the 2026-10-08 entry. v0.2.0
has not been started.

### Next

- **Plan v0.2.0 on Opus, following `RELEASING.md`, with acceptance tests first.**
  Push `20261017200000_m6_progression.sql` to the hosted project **before**
  tagging; it is the first migration on a server with real users. Additive only;
  leave `min_client_version` alone.
- **After release, re-check on the real server:** a purchase and an equip
  showing on a second device, and the installed app updating itself.
- **Still not looked at by eye:** the desktop window's layout (only scripted),
  the packaged installer build, and the strengthened Crystal/Prism/Aurora colours
  photographed in the app (compared as swatches only).
- Carried over: invite friends, set up the other machine, renew the Vercel
  token, and nothing guards against the 7-day Supabase pause yet.

### What was run

**Case 14, old app against the M6 server.** Built tag `v0.1.1` in a worktree and
ran it as a desktop window (the running exe's path was the worktree's). It
signed in to `a@test.local`, synced, finished a 1-minute session and changed the
Pomodoro focus length from 34 to 39 min, all with no sync error. On the server
the M6 settings stayed `ember | night | 35`, the Pomodoro `focus_s` became 2340,
and its session was stored with no style. Then the M6 build was started in the
same profile: it upgraded the old store in place, showed the 39 min, "of 35",
Ember and Night equipped, and credited the old session once (server 469 rows /
1,960 to 470 rows / 1,961; a second sync added nothing).

**Case 15, desktop and browser on one account.** The M6 desktop and Claude's
browser pane (separate stores), waited on with no reload:

- A fresh desktop pulled the history: balance 1,959 equal to the server's
  ledger sum (468 rows).
- A session finished on the desktop showed "+1 Stardust" and the browser
  reached 1,960 on its own; the new session was stamped `ember`.
- On `b@test.local`, 150 seeded sessions reconciled on both devices into 151
  server rows summing to 6,020: no double crediting.
- Crystal bought and equipped on the browser appeared on the desktop (5,520).
  Dusk bought on the browser re-skinned the desktop: its sky canvas went from
  transparent (Night) to opaque `(24,14,37)` top and `(42,20,37)` bottom, which
  match Dusk's `#190f26` and `#2b1526`.
- Woodland pack and Medium tier bought on the desktop: the browser's picker then
  listed The Fox and The Owl and had Medium unlocked; both showed 1,520.
- The next star took the equipped style (`crystal`); the 150 seeded sessions
  still have none. Server ledger for `b`: 156 rows summing to 1,521, with
  purchases of -4,500 (500 + 1,200 + 800 + 2,000).

### Things worth not rediscovering

- **The old and new desktop builds share one WebView2 profile** (same app id),
  so IndexedDB and the stored sign-in are shared. v0.1.1 (Dexie v3) cannot open a
  store M6 (Dexie v4) has upgraded. To run an old build: delete that account's
  `work-timer-account-<id>` database from the desktop profile, and sign out
  every account that has a v4 store first. Running the M6 build afterwards is
  the real "device updates from 0.1.x" path.
- **Docker Desktop wasn't running** at the start of this work on this machine;
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` and
  `npx supabase status` brought the stack back within a minute, with the M6
  migration already applied.
- **A fresh `cargo` build in a second worktree took ~50 s** here, not several
  minutes, because dependencies were cached.
- **Removing a worktree under the scratchpad fails with "Filename too long".**
  Delete the folder with `cmd /c 'rd /s /q "\\?\<full path>"'` (a literal path:
  the tool refuses it if it sees an unexpanded variable), then
  `git worktree prune`.
- **A tiny Node script using the built-in `WebSocket` runs JavaScript in the
  desktop window** (`Runtime.evaluate` plus
  `Emulation.setFocusEmulationEnabled`). Pass React-controlled inputs through the
  native value setter and dispatch an `input` event.
- **A 1-minute dev preset gives a real completed session in ~65 s,** and
  `window.__starkeep.seed(n, minutes)` is the quickest way to Stardust; wait
  until `window.__starkeep` exists after a load.
- **Test data on the local stack:** `a@test.local` has ~350 seeded sessions and
  owns every shop item; `b@test.local` has 150 seeded sessions, Crystal, Dusk,
  the Woodland pack and the Medium tier. The browser pane is still signed in as
  `b@test.local`. Use `b@test.local`-style fresh accounts for purchase tests,
  since `a@test.local` can't buy anything.

### Acceptance results

| Case | Result |
|---|---|
| 14 Old app against the M6 server | Pass (details above); v0.1.1 source under `tauri dev`, not the released installer |
| 15 Desktop and browser, one account, live | Pass (details above); scripted, nobody looked at the desktop screen |

**Not verified:** anything on the hosted server, the packaged desktop build,
how long cross-device updates take (waited 5-10 s each, not timed), and
behaviour when Realtime is down.

---

## 2026-10-18 — M6 PR 4 merged: sky themes and constellation packs (#41)

**Status: all four M6 PRs are merged and CI on `master` is green. Nothing is
released.** The shop now sells three sky themes (Dusk, Tide, Bloom at 1,200;
Night is free and is the original sky) and two constellation packs (Woodland and
Harbour at 800, one easy, medium and hard shape each, hidden in the picker until
owned). v0.2.0 is the next step and has not been started.

### Next

*(Superseded: cases 14 and 15 have been run and passed; see the entry above.)*

- **Before v0.2.0, run the two plan cases still open:**
  - **Case 14:** a released v0.1.1 app against the M6 server. Only part of it
    was run in PR 1 (browser build, not the exe).
  - **Case 15:** desktop and browser on one account on the local stack: a
    purchase or equip showing live on the other device, and a theme re-skinning
    the other device. Not run at all, and nothing in M6 has been tried in the
    desktop exe. These need the desktop build.
- **Then release v0.2.0 on Opus, following `RELEASING.md`.** Push
  `20261017200000_m6_progression.sql` to the hosted project **first**; it is the
  first migration on a server with real users. Additive only; leave
  `min_client_version` alone.
- Carried over: invite friends, set up the other machine, renew the Vercel
  token, and nothing guards against the 7-day Supabase pause yet.

### Decisions made along the way

- **A theme only recolours.** `ambientField(themeKey)` makes every random draw
  in the same order for every theme, so positions are identical. `night` is
  pinned by a golden fingerprint of the pre-M6 field and is also the fallback
  for an unknown key.
- **Packs add shapes and never gate existing ones.** The picker filters by
  `pack.<key>` ownership; a choice already made resolves whatever is owned. An
  older app draws an unknown pack shape as a generated shape of the same tier.
- **Style, theme and pack colours live in the sky feature,** not
  `design-tokens.mjs` (which only mirrors values also in `tokens.css`).
- **`app/` has one test that everything on sale can be drawn or offered** (style,
  theme and pack keys), since the two features can't import each other.

### Found in the visual review, and fixed in the PR

Crystal and Prism looked like free Classic on most stars: near-white palettes
meant a mean colour gap of 23 and 39 from classic, with only 27% and 58% of
stars clearly different. Stronger palettes (icy blue to violet; blue to pink to
gold; deeper Aurora mint to pink) now differ on every sampled star, and a test
guards it (mean gap >= 40 and >= 90% of stars >= 25 apart in RGB; it fails on the
old palettes). **The new colours were only compared as swatches from the real
colour code, not photographed in the app.**

### Things worth not rediscovering

- **The browser pane crops screenshots when its size changes,** and a
  `resize_window` doesn't reflow the sky until a reload. Reload after resizing,
  or set the size first.
- **A screenshot straight after changing the DOM can show the old frame.** Take
  a second one (the pane renders on demand, as CLAUDE.md says).
- **To see a constellation shape large,** clone the picker's silhouette SVGs
  into a full-screen overlay from the page console. An unfinished constellation
  is only a faint dotted outline in the sky.
- **To photograph one star per style,** write completed sessions with a
  `starStyle` straight into the account's IndexedDB `sessions` store, then
  reload (raw IndexedDB writes don't notify Dexie's live queries).
- **`window.__starkeep` can be undefined for a moment after load;** wait a
  second before `seed()`.
- **`a@test.local` is full of test data** on the local stack: roughly 350 seeded
  sessions, all themes and packs, all styles, the Hard tier, constellations
  The Fox, The Sailboat and The Stag chosen, and still the made-up `it-style` /
  `it-theme` settings from PR 1.

### Acceptance results (PR 4's cases)

| Case | Result |
|---|---|
| 11 Pack shapes valid; hidden until owned; shown with the originals once owned | Pass (unit), and live in the real picker (Fox chosen) |
| Night is the pre-M6 sky byte for byte; unknown theme = night | Pass (unit, golden) |
| Other themes change colour only, deterministic, valid hex, dark ground | Pass (unit) |
| Buy and equip a theme or pack; equip refused unless owned | Pass (unit) |
| 16 Visual review: themes, pack shapes, star styles | Done with Lucas's screenshots; Crystal and Prism found weak and fixed |
| 17 lint, typecheck, format:check, test (493), build | Pass locally; CI green on `master` |

**Not verified:** cases 14 and 15 above, the desktop exe for anything in M6, a
theme or pack purchase showing live on a second device (fake server only), and
the strengthened palettes photographed in the app.

---

## 2026-10-18 — M6 PR 3 merged: the Stardust shop and star styles (#39)

*(Superseded: PR 4 merged and M6's four PRs are done; see the entry above.)*

**Status: M6 is 3 of 4 PRs done; PR 3 is merged (#39) and CI on `master` is
green.** You can spend Stardust on four star styles (Ember 300, Aurora 400,
Crystal 500, Prism 600; classic is free) and buy medium (2,000) or hard
(6,000) constellations early. Each new star is stamped with the style equipped
when its session completes. Nothing has been released; v0.2.0 still ships at
the end of M6.

Note: #39 was merged while its own CI was still pending (Lucas said merge);
the run on `master` finished green afterwards.

### Next

- **PR 4 `feat/m6-themes-packs`, on Sonnet.** Sky themes (`night` stays the
  free default and must render exactly as today), two constellation packs
  (easy/medium/hard shapes each, growth-order connected, hidden in the picker
  until owned), their catalogue entries and prices (themes ~1,200, packs ~800).
  Extend `ItemKind` in `progression/domain/catalogue.ts`; `META_KEYS.skyTheme`
  and the server column already exist. Plan case 11, then the full pass 14-16.
- **Case 16 is a visual review with Lucas.** Every style, theme and pack shape,
  in the sky and on the result screen. Only Ember has been looked at so far.
- Then v0.2.0 on Opus. **Push `20261017200000_m6_progression.sql` to the
  hosted project first**; leave `min_client_version` alone.
- Carried over: invite friends, set up the other machine, renew the Vercel
  token, and nothing guards against the 7-day Supabase pause yet.

### Decisions made along the way

- **A style recolours and scales the glow only.** Size, brightness and twinkle
  still say how long the session was, so they must read the same in any style.
- **`classic` is pinned to the pre-M6 look** by golden values captured from the
  old `starAppearance` before it was changed. An absent or unknown style key
  draws as classic, so a style from a newer app degrades gracefully on an old one.
- **The style is stamped inside `finishSession`,** in the same transaction, for
  completed sessions only, and never rewritten. The result screen reads the
  stamped value back (`ResultStarGlyph`), so it matches the sky.
- **Purchase id = `stableId('<userId>:purchase:<itemKey>')`.** The same item
  bought on two offline devices is one row and one deduction. Two devices
  buying *different* items offline can push the balance negative; it is shown
  as is and buying waits until it is positive again.
- **Style colours live in `sky/domain/starStyles.ts`, not `design-tokens.mjs`.**
  That file only mirrors values that also exist in `tokens.css`; these are
  sky-only. (A departure from the plan's wording.)
- **`app/` has a test that every style on sale can be drawn** (neither feature
  imports the other).

### Things worth not rediscovering

- **The browser pane lost its sign-in again** (CLAUDE.md warns about this).
  `a@test.local` / the password in `supabase/README.md` signs back in, and
  history syncs down.
- **An equipped key that isn't on sale shows no "Equipped" row.** `a@test.local`
  still carries the made-up `it-style` from PR 1's check, so Classic showed
  "Equip" until Ember was equipped. Harmless.
- **`window.__starkeep.seed(n, minutes)` is the quickest way to get Stardust**
  for testing the shop (12 x 40 min = +480). The 1-minute dev preset gives a
  real completed session in about a minute.
- **`read_page` and screenshots can lag a click in the browser pane.** The Ember
  purchase had worked when a screenshot taken straight after still showed "Buy".
  Take a second screenshot before concluding a click missed.
- **Large heredocs full of code can break the Bash tool** (see the PR 2 entry).
  Use the Write tool for test files.
- **`a@test.local` now has seeded sessions, an Ember purchase (equipped) and
  the Medium tier,** on the local stack only.

### Acceptance results (PR 3's cases)

| Case | Result |
|---|---|
| 7 Buy deducts; same item twice refused (also a double click, and two offline devices through `FakeRemote`); insufficient refused; owned = defaults + purchases | Pass (unit) |
| 8 A bought tier is choosable without finishing an easier one; earned path still works | Pass (unit), and live in the real picker (Medium unlocked, Hard still locked) |
| 9 `starAppearance(..., 'classic')` equals pre-M6 for fixed seeds; unknown style = classic | Pass (unit, golden values) |
| 10 Completed session stamped with the equipped style; later changes leave finished stars alone; early ending unstamped | Pass (unit), and live (1-min session: orange result star, row `starStyle: "ember"`) |
| Live shop: buy Ember (-300 row), equip, buy Medium | Pass, browser build on the local stack |
| 17 lint, typecheck, format:check, test (450), build | Pass locally; CI green on `master` after the merge |

**Not verified:** Aurora, Crystal and Prism by eye (PR 4's review covers them);
a purchase or equip showing live on a second device (fake server only); styled
stars in the full sky view; the desktop exe.

---

## 2026-10-17 — M6 PR 2 open: streaks, daily goal and bonuses (#37)

*(Superseded: #37 merged, and PR 3 followed; see the entry above.)*

**Status: PR 2 of 4 is open as #37, CI green (db, desktop, web), not merged.**
Streaks and a daily goal are derived from sessions; the goal, streak
milestones and finished constellations now pay Stardust through the
reconciler. The idle screen shows "Today 35 of 60 min · 4-day streak", and the
Stardust panel has today's progress, a ±5 min goal stepper and the streak.
Nothing has been released; v0.2.0 still ships at the end of M6.

### Next

- **Merge #37 when Lucas says so**, then branch PR 3 from `master`.
- **PR 3 `feat/m6-shop-styles`, on Sonnet.** Catalogue and prices, `buy` /
  `owned`, star styles end to end (stamped on the session when it completes),
  tier purchases, shop UI in the Stardust panel. Plan cases 7–10.
- Then PR 4 (themes and packs, plus the full pass 14–16), then v0.2.0 on Opus.
- **Before v0.2.0, push `20261017200000_m6_progression.sql` to the hosted
  project** (unchanged from the PR 1 entry; additive only, leave
  `min_client_version` alone).
- Carried over: invite friends, set up the other machine, renew the Vercel
  token, and the 7-day Supabase pause has no guard yet.

### Decisions made along the way

- **A day counts for the streak by the start of a completed session;** focus
  toward the goal is the part of each *ended* session inside the day, so an
  early ending counts toward the goal but earns no Stardust.
- **Goal bonus looks only at today and yesterday,** so lowering the goal never
  pays out old days. Its `createdAt` is the end of the session that tipped the
  day over the goal, so every device mints an identical row.
- **Bonus ids:** `goal:<day>`, `streak:<run start>:<days>`,
  `constellation:<choice id>`, all user-prefixed. Recorded in CLAUDE.md.
- **Day math moved to `shared/lib/days.ts`;** stats re-imports it, with no
  behaviour change.
- **Constellation completions reach the reconciler through `app/`:** sky
  exports `useConstellationCompletions()`, `AuthGate` passes it to
  `useStardustReconciler`. The reconciler waits until it has loaded.

### Known and accepted

A session that syncs in days late and extends a streak backwards moves that
run's start day, so its milestones pay once more. Needs a session to arrive
days late; documented in `reconcile.ts` and CLAUDE.md.

### Things worth not rediscovering

- **The Bash tool choked (unexpected EOF) on long heredocs** containing
  Python or test files here. Writing files with the Write tool avoids it.
- **A Python `open().write()` on Windows converts to CRLF.** Pass
  `newline='\n'`, or run `prettier --write` afterwards (it did).
- **The browser pane's page shifts when the Stardust panel's scrollbar
  appears,** so a second click at the same coordinates can miss a button.
  Re-screenshot between clicks.
- **The local `a@test.local` account now has a goal of 35 min and a
  "Daily goal reached" row** from the live check; harmless test data.

### Acceptance results (PR 2's cases)

| Case | Result |
|---|---|
| 4 Streaks (consecutive days, alive before today's first session, skipped day resets, London 23 h and 25 h days, midnight-spanning session) | Pass (unit) |
| 5 Goal (split at midnight, once a day, today and yesterday only, lowering pays no old days) | Pass (unit) |
| 6 Streak milestones once per run; constellation bonus by tier, once | Pass (unit) |
| 2, extended to bonuses (two devices through `FakeRemote`) | Pass (unit) |
| Live idle line, goal stepper, bonus row and balance (a@test.local, 108 → 128) | Pass, browser build on the local stack |
| 17 lint, typecheck, format:check, test (418), build | Pass locally; CI green on #37 |

**Not verified:** a real 3-day streak or a real finished constellation paying
live (the test account has a 2-day streak), a goal change reaching a second
live device, and the desktop exe. "+N Stardust" with bonuses on the result
screen was not built (the result screen still shows only the session's own
earning).

---

## 2026-10-17 — M6 PR 1 merged: the Stardust ledger

**Status: M6 is under way; PR 1 of 4 is merged (#34).** Completed sessions
earn 1 Stardust per focused minute. There's a footer pill with the balance, a
panel listing entries, and "+N Stardust" on the result screen. The plan is
`docs/plans/2026-10-17-m6-progression.md` (committed as `8ba6c33`). Nothing
has been released: v0.2.0 ships at the end of M6.

### Next

*(Superseded: PR 2 is now open as #37; see the entry above.)*

- **PR 2 `feat/m6-streaks-goals`, on Sonnet.** Move the day math to
  `shared/lib/days.ts`, then add streak and goal derivation, the goal setting,
  goal/streak/constellation bonuses (new key namespaces in `reconcile.ts`) and
  the idle-screen progress line. Plan cases 4–6.
- Then PR 3 (shop and star styles), PR 4 (themes and packs, plus the full
  pass 14–16), then release v0.2.0 on Opus.
- **Before v0.2.0, push `20261017200000_m6_progression.sql` to the hosted
  project.** It's the first migration on a server with real users. It's
  additive only; leave `min_client_version` alone.

### Decisions made along the way

- **Ledger ids include the user id:** `stableId('<userId>:session:<id>')`.
  The server's primary key is global, so unprefixed ids would collide between
  people and one row would be silently dropped. This amends the plan.
- **A ledger row's `createdAt` is the session's end, not when it was
  recorded.** Every device then mints a byte-identical row.
- **The reconciler runs only in the main window**, debounced on the count of
  completed sessions (`useStardustReconciler` in `SignedIn`).
- **"+N Stardust" is computed from the session itself** with the same rule,
  so it shows before the ledger row is written.

### Bug found and fixed in the PR

Checking real v0.1.1 code against the M6 server: the old app synced fine and
the server kept the M6 settings columns. But **a device that then updated to
M6 never picked up the style, theme or goal another device had chosen**. Its
last 0.1.x upload had the same settings version as the server row, so it
thought it was current. The fix: at equal versions, adopt the server's M6
fields; the Dexie v4 upgrade also drops the `user_settings` sync cursor once.
Both have tests.

### Things worth not rediscovering

- **To run an old version against the local stack:** `git worktree add
  --detach <dir> v0.1.1`, copy `.env.development.local`, `npm ci`, and run its
  `npm run dev`. It needs port 5173, so stop the current dev server first.
  Vite listens only on `localhost`, so both versions share one browser store.
  Clear the `work-timer-account-*` database first to simulate a device that
  only ever ran the old app.
- **Removing that worktree fails with "Filename too long"** (node_modules
  under the long scratchpad path). Delete it with `rd /s /q "\?\<path>"`,
  then `git worktree prune`.
- **Don't use `npx supabase db reset`** to apply a migration locally: it wipes
  the test accounts. Use `npx supabase migration up`.
- **The local `a@test.local` account holds made-up M6 settings**
  (`it-style`, `it-theme`, 45 min) from the check above. Unknown keys render
  as the defaults; PR 3's real styles will replace them.
- **pgTAP fixtures must not be dated in the future**: the sessions table
  refuses them. Use past dates, and compare server stamps with
  `clock_timestamp()`.

### Acceptance results (PR 1's cases)

| Case | Result |
|---|---|
| 1 Earning rules | Pass (unit) |
| 2 No double-crediting (twice, concurrent, two devices) | Pass (unit + live: 34 rows / 108 locally and on the server) |
| 3 Old-app or pulled session credited once | Pass (unit + a real v0.1.1 session, +50) |
| 12 pgTAP | Pass, 65/65 |
| 13 M6 settings sync | Pass (unit) |
| 14 (partial) Old app vs M6 server | Pass after the fix; ran v0.1.1's browser build, not its exe |
| 17 Checks | Pass locally and in CI (db, desktop, web) |

**Not verified:** "+N Stardust" on a live result screen (no real session was
run), and the desktop exe of this build.

---

## 2026-10-17 — Starkeep is live: v0.1.0 and v0.1.1 released, ready to share

**Status: the Release milestone is done.** The hosted Supabase project is set
up (M5 case 29), and v0.1.0 and v0.1.1 are published; plan cases 10–16 all
passed. PRs #30 (friend-facing release notes) and #31 (0.1.1) merged; #32
(Prettier ignore) open at the time of writing (merged since; see git log).

### Where everything lives now

- **Web:** https://starkeep.vercel.app (Vercel project `lhlc/starkeep` on the
  existing Hobby account, which also hosts `opentabs`; not connected to Git).
- **Desktop installer, always the latest:**
  https://github.com/lucashlc822/work-timer/releases/latest/download/Starkeep-setup.exe
- **Hosted Supabase:** project ref `nbjehnbdgtrsglqxgxug`, East US (N.
  Virginia), free plan. `min_client_version` is null. Lucas's account is
  `lulouman@gmail.com`, the only invite so far.
- **Email:** codes go out from a dedicated Gmail, `starkeep09@gmail.com`,
  through a Google app password (Gmail SMTP), not Lucas's personal account.
- **GitHub:** the repo is public, with secret scanning and push protection on,
  and fork PRs needing approval. Secrets: the two signing ones and three
  Vercel ones. Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `WEB_URL`.
- **This machine's git email** is the GitHub `noreply` address, so new commits
  no longer expose the Gmail address.

### Decisions made along the way

- **Supabase, not Neon** (Lucas asked). Neon is only the database; moving would
  mean redoing M5's sign-in, live updates and privacy rules. Neon's one real
  advantage, no 7-day inactivity pause, is cheap to work around if needed.
- **"Automatically expose new tables" left on** when creating the project. The
  migration revokes and grants per table anyway, but the invite script (as
  `service_role`) relies on that default grant for `public.invites`. Turning it
  off needs a migration granting `service_role` on `invites` first.
- **A dedicated Gmail sends the codes**, so a leaked app password can only
  send as that account, and friends don't see Lucas's personal address.
- **The existing Vercel account was reused.** Its token can act on the whole
  account (Hobby tokens can't be limited to one project); it lives only in
  GitHub's secrets.

### Things worth not rediscovering

- **Supabase warns that Gmail is "for personal… messages"** in the SMTP form.
  That's expected. Codes can land in spam, and the invitation message says so.
- **The per-user installer can't install into `Program Files`** (NSIS: "Error
  opening file for writing … starkeep.exe"). Keep the suggested folder; #30
  says so in the release notes, invite message and CLAUDE.md.
- **`vercel link` has side effects:** it writes `.env.local` (a short-lived
  `VERCEL_OIDC_TOKEN`) and appends `.vercel` and `.env*` to `.gitignore`. The
  latter would ignore `.env.example`. Undo with `git checkout -- .gitignore`
  and delete `.env.local`.
- **`supabase link` writes `supabase/.temp/`**, which broke local
  `format:check` until #32 (Prettier doesn't read nested `.gitignore` files).
- **The workflows only check that a variable is set, not that it's right.**
  `VITE_SUPABASE_PUBLISHABLE_KEY` briefly held the updater's public key (a
  clipboard mix-up), which would have shipped an app that can't sign in.
  Fixed with `gh variable set --env-file .env.production.local`. After setting
  anything, read it back: `gh variable list` (values), `gh secret list`
  (names only).
- **A draft release can't be looked up by its tag.** Publish by id:
  `gh api -X PATCH repos/lucashlc822/work-timer/releases/<id> -F draft=false -f make_latest=true`.
- **Which key signed a release:** the minisign key id is bytes 2–10
  (little-endian) of the `.sig` file's second line, base64-decoded. It must be
  `8E3AF18012526DA8`, the one in `tauri.conf.json`. v0.1.0 and v0.1.1 both
  match.
- **`sb_secret_` appears in the web bundle, but it's not a leak.** It's
  supabase-js checking what kind of key it was given; the real secret key was
  confirmed absent.
- **To test an update,** fully quit from the tray and relaunch: the app checks
  10 s after launch, then every 6 hours. The Windows release build takes
  about 12 minutes; the web deploy about 2.

### Acceptance results

| Case | Result |
|---|---|
| M5 case 29 (hosted project) | Pass: invite, code email in the inbox, sign-up, session reaches the server; an uninvited address is refused |
| 10: signed draft, nothing public | Pass (key `8E3AF18012526DA8`) |
| 11: public links + web deploy | Pass |
| 12: web sign-in, sync, offline | Pass |
| 13: installer + desktop sign-in | Pass; found the Program Files issue (#30) |
| 14: installed app updates itself, never mid-session | Pass (0.1.0 → 0.1.1, signed in, history intact) |
| 15: open web tab offers the update | Pass |
| 16: mismatched tag refused | Pass (throwaway tag deleted) |

### Not verified

- A **friend's fresh PC.** Only Lucas's machine has installed it, and it had
  run earlier test builds.
- **Email to non-Gmail inboxes** (only Gmail → Gmail was tested).
- **Mac**, including Safari's "Add to Dock".
- Nothing guards against the **7-day Supabase pause** yet.

### Next

- **Invite friends**: `docs/invite-a-friend.md`.
- **Merge #32.**
- **The other machine:** `.env.production.local` (and `.env.admin.local` only
  if invites are managed there), Docker Desktop with WSL, and
  `git config --global user.email "123426268+lucashlc822@users.noreply.github.com"`.
  Migrations stay generated on one machine.
- **Renew the Vercel token** before the expiry chosen when it was created, or
  web deploys start failing.
- **M6, Progression:** currency ledger, unlock catalogue, shop, streaks,
  daily goals. Needs its own plan, absorbing M2's unlock gate.
- Optional: a weekly keep-alive ping if quiet weeks could pause the server.
- Autostart's reboot check, still carried over.

---

## 2026-10-14 — Release built: updater, release pipeline, docs (PRs #27, #28)

**Status: both merged (#27 as `37c31b2`, #28 as `3784a33`); the first real
release has not been cut.** Planned as `docs/plans/2026-10-13-release.md`. The
code and docs are done; what remains is Lucas's account setup and then running
v0.1.0 and v0.1.1, where everything the unit tests and `actionlint` could not
reach gets exercised for the first time.

### Product decisions, made with Lucas while planning

- **The repo goes public.** GitHub serves release files without a login only
  from a public repo, and the updater and download link need that. History was
  checked first: no secret was ever committed. Accepted: the code, plans, notes
  and the personal Gmail on 42 old commits become visible.
- **Vercel for the web version**, not Cloudflare Pages (Lucas's choice; both
  fit). Free Hobby plan is personal/non-commercial and 100 GB/month, about
  0.1% of what ten friends use. Supersedes the architecture doc's hosting row.
- **Updates are a notice and one click, never mid-session.** Not silent.
- **One deliberate "go":** CI builds a *draft* release from a `v*` tag;
  *publishing* it ships the desktop update and deploys the web version
  together. A merge reaches nobody. The Vercel project is not connected to
  the Git repo for the same reason.
- **No Windows code signing** (costs money): first install shows SmartScreen
  once. The invitation message says so.

### What was built

- **#27, the app side:** `tauri-plugin-updater` + `-process`; `UpdaterPort`
  on the runtime seam (no-op on web); `DesktopUpdatePrompt` (checks 10 s after
  launch and every 6 h, production builds only; hidden while a session or run
  is in progress; still offered on the sign-in screen); `hasWorkInFlight` /
  `isAccountDbBound`; `npm run version:set` for the five files that state the
  version, with a drift test covering all of them; version in the Account
  panel.
- **#28, shipping:** `release.yml` (tag → version check → signed installer +
  `latest.json` + fixed-name `Starkeep-setup.exe` in a draft release),
  `deploy-web.yml` (published release → Vercel), `tauri.release.conf.json`
  (turns on update files in CI only), `vercel.json`, `RELEASING.md`,
  `docs/invite-a-friend.md`, `.env.example`.

### Things worth not rediscovering

- **Update files are made only in CI.** `createUpdaterArtifacts` is off in
  `tauri.conf.json`; turning it on makes every local `tauri build` fail
  without the private key. CI passes `tauri.release.conf.json` as a *file*,
  to avoid quoting inline JSON through a Windows shell.
- **The release exe is 5.3 MB, up from 3.7 MB**: the updater's HTTP stack. The
  browser bundle grew only about 1.8 KB (the updater is in the lazy `desktop`
  chunk).
- **A failed update check is silent by design** (logs "Update check failed").
  With no release published, every production launch logs it. Not a bug.
- **`@testing-library/user-event` is now a dev dependency**, for clicking in
  component tests.
- **Run `cargo fmt --check` before pushing Rust**: it caught #25 in CI. #27
  and #28 ran the full local set first and passed.
- **`actionlint` runs from its Docker image** (needs Docker Desktop):
  `docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:latest`.
  It found two shell-style issues in the new workflows; fixed.
- **A throwaway key proves the build config** without touching the real one:
  `npx tauri signer generate -w <scratch> --ci -p ""`, then
  `npx tauri build --config src-tauri/tauri.release.conf.json` with
  `TAURI_SIGNING_PRIVATE_KEY` set. Output: `Starkeep_0.1.0_x64-setup.exe`
  (2.3 MB) + `.sig` in `src-tauri/target/release/bundle/nsis/`.
- **The plan's case 9 wording was wrong** (said only `deploy-web.yml` may use
  the hosted `VITE_*` values; the desktop build needs them too). The real
  property: nothing a PR or merge triggers can see them. Corrected in #28.

### Not verified

- **Neither workflow has run.** `actionlint` checks syntax and shell, not
  behaviour. `tauri-action`'s `releaseId` output, how it names `latest.json`
  and builds its URLs, and the Vercel `pull` → `build` → `deploy --prebuilt`
  flow are from documentation. Expect the first run to need a tweak.
- **That an update actually downloads, passes its signature check, installs
  and relaunches** (plan cases 11 and 14). The unit tests fake `install()`.
- That the plugin follows GitHub's `latest/download/…` redirect.
- Windows' `passive` install-mode experience on a real install.

**(Superseded 2026-10-17 — all four verified by the v0.1.0 and v0.1.1
releases; see the entry above.)**

### Next

- **Lucas, in this order** (`RELEASING.md` has the detail): (1) case 29, the
  hosted Supabase project; (2) make the repo public; (3) GitHub secrets
  (`TAURI_SIGNING_PRIVATE_KEY`, its password, `VERCEL_TOKEN`,
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) and variables (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, optionally `WEB_URL`); (4) `npx vercel
  link` without connecting the Git repo.
  **(Done 2026-10-17 — all set up; see the entry above.)**
- **Then the first releases, on Opus:** v0.1.0, then v0.1.1 to prove an
  installed app updates itself (plan cases 10–16). Expect debugging here.
  Record the results, and mark the updater items above verified.
  **(Done 2026-10-17 — both released, cases 10–16 passed; see the entry above.)**
- **M6, Progression:** currency ledger, unlock catalogue, shop, streaks,
  daily goals. Needs its own plan, and must absorb M2's simple "medium after
  one easy" unlock gate rather than add a second system.
- The other machine still needs Docker Desktop (with WSL).
- Autostart's reboot check, still carried over.

---

## 2026-10-13 — Desktop app no longer registers a service worker (PR #25)

**Status: merged (PR #25 as `348d4b1`); cases 1–5 passed.** A short follow-up to
M5, built from the plan flagged in the entry below. Nothing is in flight from
this work.

### What was wrong, and what changed

The desktop app runs the browser build's frontend, so it also registered the
browser build's service worker at `http://tauri.localhost`. A worker
registered by one exe kept serving that exe's cached `index-*.js` to the
*next* exe, with no waiting worker and no update prompt. Auto-updates would
have left desktop apps on a stale frontend.

- **No worker on desktop:** `App.tsx` mounts `UpdatePrompt` (the only thing
  that registers the worker) only when `!isDesktop()`. Offline support and the
  "new version" prompt are browser-only.
- **The exe retires old workers:** `src-tauri/src/no_service_worker.rs`
  injects a script into every webview at document start that unregisters
  workers and deletes CacheStorage, then reloads once (capped by a
  `sessionStorage` flag) if the page was served by a worker. It never touches
  IndexedDB or localStorage.
- **Why it has to be the exe:** a pinned install runs the *old* frontend, which
  can't fix itself. Don't move this rescue into the frontend.

### Things worth not rediscovering

- **`Get-Process starkeep` doesn't match a renamed exe.** A copy named
  `starkeep-master.exe` has process name `starkeep-master`, so my "stop it"
  missed it and the next launch exited at once (single-instance hands over to
  the first and exits 0). A "launch completed with exit code 0" notice right
  after starting an exe means another instance is running. Match
  `starkeep*`.
- **Simulating an update = swapping exes.** Both builds share one WebView2
  profile (same app identifier, not the exe path), so run the old exe, sign in,
  quit, then run the new one. Keep the old build as a copy in the scratchpad
  before changing anything.
- **Run `cargo fmt --check` before pushing Rust.** CI's "Rust formatting" step
  failed on one assertion; I had run clippy and the tests but not the format
  check. Add it to the local pre-push set: lint, typecheck, format:check, test,
  build, **cargo fmt --check**, clippy.
- **Case 1's "old install" is real, not simulated**: the `master` exe
  registered the worker itself, so the pinned state is the one users would
  actually have.

### Not verified

- Why the stale worker never updated (probably WebView2 not routing the
  worker's update fetch through Tauri's asset protocol). The fix doesn't
  depend on it.
- A real installer update; the installer doesn't exist yet. The exe swap
  stands in for it.
- A reload while a session is in flight was reasoned, not reproduced.
- macOS.

### Next

- **Case 29, by hand, Lucas:** the hosted Supabase project (see the entry
  below).
  **(Done 2026-10-17 — hosted project set up and verified; see the 2026-10-17 entry.)**
- **Release milestone:** Windows installer on GitHub Releases, Tauri
  auto-updates, web hosting. When the installer exists, repeat case 1 through
  it, since that is the part not covered here.
  **(Superseded 2026-10-14 — built in PRs #27 and #28; not yet released. Repeat
  case 1 through the real installer in the first release run.)**
- The other machine still needs Docker Desktop (with WSL).
- Autostart's reboot check, still carried over.

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
  **(Superseded 2026-10-13 — fixed in PR #25: the desktop app registers no
  worker and the exe retires old ones. The `document.scripts` check is still
  a good habit.)**
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
  **(Done 2026-10-17 — hosted project set up and verified; see the 2026-10-17 entry.)**
- **The service worker in the desktop app** (flagged as a task): make a new
  exe always load its own frontend before the Release milestone's
  auto-updates.
  **(Done 2026-10-13 — merged as PR #25; see the entry above.)**
- **Release milestone** after that: Windows installer on GitHub Releases,
  Tauri auto-updates, web hosting.
  **(Superseded 2026-10-14 — built in PRs #27 and #28; see the entry above.)**
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
  **(Done 2026-10-17 — hosted project set up and verified; see the 2026-10-17 entry.)**
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

Older entries (2026-Q3: M0, the naming, the Tauri pivot, M0.5) are in
`docs/notes-archive/2026-Q3.md`.
