# M6 — Progression: Stardust, streaks, daily goals, and a shop

Committed at execution as `docs/plans/2026-10-17-m6-progression.md`. Architecture doc row M6:
"Currency ledger, unlock catalogue, shop, streaks, daily goals."

## Context

Starkeep is released (v0.1.1) and in friends' hands. Today a finished session gives a star and nothing
else; there is no reason to come back tomorrow beyond the sky itself. M6 adds the progression loop the
architecture always planned: focus earns **Stardust**, Stardust buys new looks (star styles, sky themes,
constellation packs, early tier unlocks), and **streaks** and a **daily goal** reward consistency.

Already decided (CLAUDE.md / architecture, not re-opened): currency is an **append-only ledger, balance =
`SUM(delta)`**; streaks and goal progress are **derived from sessions, never stored**; finished sessions are
immutable; server migrations stay **backward compatible** (0.1.x is in the wild); the server enforces rules.

### Decided with Lucas (2026-10-17)

| Question | Decision |
|---|---|
| Earning | **1 Stardust per focused minute, completed sessions only** (ended early earns nothing, like stars). Each finished Pomodoro block earns for itself. |
| Bonuses | **Daily goal reached** (once a day), **streak milestones**, **constellation finished** (more for harder tiers). |
| Shop | **Star styles**, **sky themes**, **constellation packs** — plus tier unlocks (below). |
| Streak | A day counts if **any session was completed** that local day. A skipped day resets it. |
| Star styles | Apply to **future stars only**; each star keeps the style it was born with. |
| Daily goal | **Focus minutes per day, set by you**, synced between devices. |
| Tier unlocks | Finishing an easier constellation still unlocks the next tier; you can also **buy a tier early, at a steep price**. |
| Name | **Stardust**. |

### Decided in this plan (reopen in review if you disagree)

| Question | Decision | Why |
|---|---|---|
| How earnings are written | A **reconciler**: from sessions, constellation completions and settings it computes every ledger row that *should* exist and inserts the missing ones. Each row's id is **derived from what it's for** (`stableId('session:<id>')`, `'goal:2026-10-20'`, `'streak:<runStart>:7'`, `'constellation:<choiceId>'`, `'purchase:<itemKey>'`), each **prefixed with the account's user id** (`stableId('<userId>:session:<id>')`; amended in PR 1 — the server's primary key is global, so unprefixed ids would collide between people). | Any device can run it, any number of times, and the server's insert-only `on conflict do nothing` collapses duplicates — no double-crediting across devices, retries or reloads. Sessions recorded by an old 0.1.x app (or synced in from another device) still get credited. No coupling of the ledger into the timer's transaction. |
| History before M6 | **Counts.** Every completed session earns; past streak milestones and constellations pay once. | It's factual, deterministic, and today's history is tiny. |
| Daily-goal bonus window | Only **today and yesterday** are evaluated. | The goal is a setting you can change; re-evaluating old days would pay out history whenever it's lowered. Yesterday covers sessions spanning midnight and late syncs. |
| Rule changes later | A changed rule gets a **new id namespace** (`session.v2:`); old rows stand. | Two app versions must never mint the same id with different amounts. |
| Purchases | A ledger row with negative `delta`, `reason 'purchase'`, id `purchase:<itemKey>`. **Owned = derived from purchase rows** (+ free defaults + earned tiers). No separate unlocks table. | One new table. The deterministic id makes buying the same item twice impossible, even on two offline devices. |
| Overspending | Buying needs `balance ≥ price` locally. Two offline devices buying *different* items can push the balance negative; it's shown as-is and buying waits until it's positive again. | Rare, honest, auditable; no server arbitration needed. |
| Equipped style/theme, daily goal | **Synced settings**: new nullable `user_settings` columns `star_style`, `sky_theme`, `daily_goal_min` (+ `META_KEYS`); last-write-wins with mode/Pomodoro. | Separate columns, not keys inside `pomodoro` jsonb: a 0.1.x client rewrites that object wholesale. PostgREST upsert leaves columns it isn't sent alone. |
| A session's style | Stamped onto the session when it **completes** (`SessionRow.starStyle?`, server `sessions.star_style` nullable). | "Born with" semantics; finished rows never change. |
| Where code lives | New `features/progression` (ledger, reconciler, streak/goal math, catalogue & prices, shop UI). Visuals stay in `features/sky` (style palettes, theme palettes, pack shapes), keyed by the same item keys. **`app/` composes** them, as `timerSlots` does today. Pure day math (`dayStart`, `addDays`, `dayKey`, `overlapMs`) moves from `features/stats` to `shared/lib/days.ts` for both to use. | Feature slices stay opaque to each other (CLAUDE.md). |
| Economy (one file, tunable) | Earn 1/min · goal +20/day · streak 3→30, 7→70, 14→150, 30→300, then +300 every 30 days · constellation easy +25, medium +75, hard +200 · star styles 300–600 · sky themes 1,200 · packs 800 · **tier: medium 2,000, hard 6,000**. | ~1 h/day ≈ 80/day: a style in about a week, a theme in ~2 weeks; buying a tier costs ~33 h / ~100 h of focus ("quite costly"), versus finishing one easier constellation. |
| Defaults | Default style `classic` and theme `night` are free and **render exactly as today**. Daily goal defaults to 60 min. | Nobody's sky changes until they choose. |
| Older apps | 0.1.x ignores the ledger, styles and themes (default look); a pack constellation shows there as a generated shape of the same tier (`resolveDef` fallback). `min_client_version` is **not** raised. | Friends update at their own pace; nothing breaks. |

## Outcomes

- O1. Focus earns Stardust exactly as specified; the balance always equals the ledger sum and never double-counts across devices, retries or old-app sessions.
- O2. Streak and daily-goal progress are correct, derived, and pay their bonuses once.
- O3. The shop sells styles, themes, packs and tiers; owning is derived; a bought style marks only future stars; a theme changes the sky; a pack's shapes become choosable; a bought tier is choosable without finishing an easier one.
- O4. All of it syncs between a person's devices, and the server keeps everyone's ledger private and append-only.
- O5. Released 0.1.x apps keep working against the M6 server.
- O6. It feels right in the real app (visual review with Lucas), and nothing regresses.

## Contracts

### Server — one migration `supabase/migrations/<ts>_m6_progression.sql` (all of M6's server changes, in PR 1)

- `public.ledger`: `id uuid pk`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `reason text not null check (char_length 1..32)`, `delta integer not null check (delta between -100000 and 100000)`, `ref text check (char_length <= 80)`, `created_at timestamptz not null`, `server_updated_at` + `stamp_server_time` trigger, pull index, **insert-only** (select/insert grants and "Read own"/"Add own" policies only), added to `supabase_realtime`. No FK to sessions (a `retryLater` session would strand its earning row forever).
- `alter table public.sessions add column star_style text check (char_length(star_style) <= 32)` — nullable.
- `alter table public.user_settings add column star_style text …, add column sky_theme text …, add column daily_goal_min integer check (daily_goal_min between 5 and 1440)` — all nullable.
- pgTAP `supabase/tests/m6_progression.test.sql`: own insert works; re-insert keeps one copy; update/delete refused (42501); B can't read A's ledger; out-of-range delta / overlong reason refused (23514); cascade on account delete; a settings upsert without the new columns leaves them unchanged; sessions insert without `star_style` still works.

### Shared

- `shared/lib/id.ts`: `stableId(key: string): string` — synchronous, deterministic, UUID-formatted (128-bit cyrb-style hash; must be sync because it runs inside Dexie transactions).
- `shared/lib/days.ts`: `dayStart`, `addDays`, `dayKey(ms) → 'YYYY-MM-DD'` (local), `overlapMs` — moved from `features/stats` (stats re-imports; its tests move with them).
- `shared/db/schema.ts`: `db.version(4)` adds `ledger: 'id, createdAt, syncedAt'`; `LedgerRow { id, reason, delta, ref, createdAt, syncedAt }`; `SessionRow.starStyle?: string`; `META_KEYS.starStyle`, `skyTheme`, `dailyGoalMin`.
- `shared/db/meta.ts`: `touchSettings(db, now)` — the `settingsUpdatedAt = max(now, prev+1)` bump, reused by timer prefs and progression.
- `shared/sync`: `ledger` as an insert-only `SyncTable` (wire mappers, push after sessions, add-if-absent pull, rejected sets, `countPending`, `LIVE_TABLES`, `FakeRemote`); `sessionToWire/FromWire` carry optional `star_style`; settings sync carries the three new fields (absent → default, so 0.1.x rows still parse).

### `features/progression`

- `domain/economy.ts` — every number in the table above.
- `domain/catalogue.ts` — items `{ key, kind: 'star-style'|'sky-theme'|'pack'|'tier', name, price }`; keys are permanent (persisted in ledger refs).
- `domain/streak.ts` — `streakAt(sessions, now)` (current run; alive if today or yesterday counts) and `streakRuns(sessions)` for milestones; days by **start time**, local.
- `domain/goal.ts` — `focusOnDay(sessions, day)` via `overlapMs`; `goalProgress`.
- `domain/reconcile.ts` — pure: `expectedRows({ sessions, completions, goalMin, now }) → LedgerRow[]`; `data/ledgerRepository.ts` — `reconcile(db, completions, now)` (one rw transaction, inserts missing ids), `balance(db)`, `owned(db)`, `buy(db, itemKey, now)`, `setEquipped`, `setDailyGoal`.
- `ui/ProgressShop.tsx` — balance, streak, today's goal (with the goal setting), then shop sections; previews come through slots from `app/`. `ui/RewardNote.tsx` — "+25 Stardust" (plus any bonuses) for the result screen.

### `features/sky`

- `domain/starStyles.ts` — palettes/halo per style key; `starAppearance(seed, focusS, style?)`; `classic` reproduces today exactly; unknown key → classic. Hex colours added to `design-tokens.mjs` (drift test applies).
- `domain/skyThemes.ts` — background and nebula palettes per theme; `night` = today. `AmbientCanvas`/`SkyBackdrop` read the equipped theme.
- `domain/catalogue.ts` — 6 new hand-designed pack shapes (2 packs × easy/medium/hard), growth-order connected (existing tests cover them); picker shows pack shapes only when owned.
- `CompletedSession.starStyle`, `ConstellationLayer` / `StarGlyph` take the style; `ConstellationPicker` takes `owned` (tiers + pack keys) from `app/`; public exports `useConstellationCompletions()`, `StyledStarPreview`, `ThemeSwatch`, `PackPreview`.

### `features/timer`

- `finishSession` stamps `starStyle` from `META_KEYS.starStyle` on completed sessions (same transaction). `ResultInfo.starStyle` reaches `StarGlyph`. New slot `progressLine` on the idle screen ("Today 35 of 60 min · 4-day streak").

### `app/`

- `useProgression()` in `SignedIn` (main window only): runs `reconcile` whenever sessions, choices, settings or completions change (debounced), like `useSync`.
- `HomeRoute`: footer pill "240 Stardust" opens a `'shop'` view (same overlay pattern as Stats); wires slots and `owned` into sky; `RewardNote` into `timerSlots.resultNote`.
- A test that every progression item key has a sky visual (`app/` may import both).

### Docs

CLAUDE.md decisions (ledger reconciler + stable ids, owned derived from purchases, styles stamped at completion, settings columns not jsonb, economy file), architecture doc M6 row → this plan, NOTES entries per PR.

## Acceptance tests

Unit (Vitest), except where marked.

1. (O1) Completing a 25-min session yields exactly one `+25` row; ending early yields none; each completed Pomodoro block earns its own.
2. (O1) Reconciling twice, or on two stores syncing through `FakeRemote`, leaves one row per event; displayed balance equals `SUM(delta)` (architecture case 13).
3. (O1) A session pulled from another device, or recorded with no ledger row (old app), is credited exactly once.
4. (O2) Streak counts consecutive local days with a completed session; still alive today before today's first session; a skipped day resets it (architecture case 14); DST and midnight-spanning sessions handled (pinned-timezone test, as in stats).
5. (O2) Daily-goal progress splits a session across midnight; the bonus is paid once a day, only for today/yesterday; lowering the goal later pays no past days.
6. (O2) Streak milestones pay once per run at 3/7/14/30 (+30s); a new run pays again. Constellation bonuses pay once per finished constellation, by tier.
7. (O3) Buying deducts the price; buying the same item again (or on a second device) is impossible; insufficient balance refuses; owned = defaults ∪ purchases ∪ earned tiers.
8. (O3) A bought tier is choosable without finishing an easier one; the earned path still works.
9. (O3) `starAppearance(seed, focusS, 'classic')` equals the pre-M6 output for fixed seeds (golden values); an unknown style renders as classic.
10. (O3) A completed session is stamped with the equipped style; changing style afterwards leaves finished stars unchanged.
11. (O3) Pack shapes are connected in growth order; locked pack shapes are hidden in the picker until owned.
12. (O4) pgTAP suite above passes.
13. (O4) Settings (goal, style, theme) sync between two stores last-write-wins; a 0.1.x-shaped settings row (no new fields) parses and leaves local values intact.
14. (O5) **Backward compatibility, local stack:** a v0.1.1 desktop build (from tag `v0.1.1`, pointed at the local stack with the M6 migration) signs in, completes a session, edits Pomodoro lengths — no sync errors; afterwards the M6 build's style/theme/goal are unchanged, and the old app's session is credited by the M6 build.
15. (O6) Desktop + browser on the local stack, same account: finish a session → "+N Stardust" on the result screen and the balance updates on the other device live; streak and goal line on the idle screen; buy and equip a style → the next star uses it, earlier stars don't change; buy a theme → the sky changes; buy a pack → its shapes appear in the picker; buy a tier → it's choosable.
16. (O6) **Visual review with Lucas** (screenshots): every style, theme and pack shape looks intended in both the sky and the result screen.
17. (O6) lint, typecheck, format:check, test, build, `cargo fmt --check`, clippy; CI green on every PR.
18. Release **v0.2.0** through `RELEASING.md` (migration pushed to the hosted project *first*; `min_client_version` untouched), then 15 spot-checked on the real server.

## Execution order (one idea per PR; each stops for review)

1. **PR 1 `feat/m6-stardust`** — commit this plan; the migration + pgTAP; `stableId`; ledger table + sync; settings plumbing for the new fields; reconciler with **session earnings only**; balance pill + minimal panel; "+N Stardust" on the result screen → cases 1–3, 12, 13, 14 (partial), 17.
2. **PR 2 `feat/m6-streaks-goals`** — `shared/lib/days.ts` move; streak + goal derivation; goal setting; bonuses (goal, streak, constellation via `useConstellationCompletions`); idle-screen progress line → 4–6.
3. **PR 3 `feat/m6-shop-styles`** — catalogue + prices, purchases, owned, shop UI, star styles end to end, tier purchases → 7–10.
4. **PR 4 `feat/m6-themes-packs`** — sky themes, constellation packs → 11, then the full pass 14–16.
5. **Release v0.2.0** → 18. NOTES entry.

## Model recommendation

- **PR 1: Opus.** A new synced table, a server migration that must stay compatible with released apps, deterministic ids and a reconciler — the same class of subtle data-correctness work as M5's sync engine.
- **PRs 2–4: Sonnet.** Derivations, UI and visual content against the settled data layer — step-by-step building.
- **Release v0.2.0: Opus** (first migration pushed to a server with real users).
