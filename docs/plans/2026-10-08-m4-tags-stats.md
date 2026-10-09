# M4 — Tags and stats

## Context

M1–M3 are merged: a correct countdown, the sky, and Pomodoro. The architecture
doc's M4 row is one line ("Tagging, dashboard charts"), so this plan is the full
design. `SessionRow.tagId` already exists (indexed since schema v1) and is
plumbed through `SessionDraft` → `startSession` → `startNextBlock`, but is always
`null` — there is no `tags` table and no picker. `awayMs` has been recorded
since M1 "for the M4 stats" and is shown nowhere. M4 gives both a home.

Execution step 1 commits this plan as `docs/plans/2026-10-08-m4-tags-stats.md`
on branch `feat/m4-tags-stats`, as for M1–M3.

### Decided with Lucas on 2026-10-08

| Question | Decision |
|---|---|
| When a tag can be set | **Before start, changeable while running** (and during a Pomodoro break). Frozen once the session ends — completed rows stay immutable. A run's tag carries to every block. |
| Dashboard contents | **All four**: focus time per day, breakdown by tag, headline totals, session history list. |
| Time with the app fully quit | **Not away.** "Away" stays "running but hidden/minimised". Quit time is unmeasured. Closes the 2026-10-06 open question; no code change. |
| Ranges | **Calendar week / calendar month, pageable with prev/next.** |

### Decided in this plan (reopen in review if you disagree)

| Question | Decision | Why |
|---|---|---|
| Also an "All time" range? | Yes, a third tab beside Week / Month, not pageable. Daily bars become monthly bars there. | Totals over all time are the most-asked number; costs one branch in `periodBounds`. |
| Week start | **Monday.** Constant `WEEK_STARTS_ON = 1` in `stats/domain/period.ts`. | ISO convention; a setting can come later. |
| Which day focus counts toward | Split exactly: a session's focus interval is `[startedAt, startedAt + actualFocusS·1000)`, divided across local-day boundaries. Period *membership* for counts and the history list is by `startedAt`. | 23:30→00:20 shows 30 min on each day — honest, and pure/testable. |
| Cancelled sessions | Their `actualFocusS` **counts** toward focus time; they're counted as "ended early", earn no star. In-flight sessions (`endedAt === null`) are excluded everywhere. | Focus that happened is real; the star is the only reward gated on completion. |
| Day boundaries | Built with local `Date` arithmetic (`new Date(y, m, d)`), never `+ 86_400_000`. | Correct across DST changes. |
| Tag fields | `name`, `color` (a palette **key**, not hex), `archivedAt`, no icon. | Keys let the palette change in tokens.css without touching rows. Icon dropped until a design needs it. |
| Tag palette | 6 keys: `lavender` (lavender-400), `mint` (mint-300), `rose` (rose-400), and three new tokens `gold`, `sky`, `peach` (`--color-tag-*`). Lives in `shared/ui/tagColors.ts`, since both `tags` and `stats` render it. **Revised during the build:** the first draft (six pale existing tokens) failed the dataviz validator's separation checks (blush vs cool ΔE 6.5 for normal vision). This set passes CVD separation (worst adjacent ΔE 11.1) and normal-vision separation (≥ 21); it still fails the validator's lightness-band and chroma-floor checks, because the app is deliberately pastel, so a tag's name is always printed beside its colour. | Feature slices can't import each other; `shared/ui` is the legal meeting point. |
| Tag name rules | Trimmed, 1–24 chars, unique case-insensitively among **non-archived** tags. Max 20 active tags. | Keeps the picker a single row/popover. |
| Deleting tags | **Archive only** (soft delete). Archived tags vanish from the picker, keep their name/colour in stats and history. Un-archive offered in the manager. | The architecture doc's design; old sessions keep their label. |
| Tags are mutable rows | Yes (rename/recolor/archive), unlike sessions. `TagRow.updatedAt` added now so M5 can sync them last-write-wins. | Flag for M5, not a problem for M4. |
| Remember the last tag | `META_KEYS.lastTagId`; idle screen preselects it. An archived/missing id reads as "no tag". | Same pattern as `timerMode`. |
| Run's tag storage | New optional `PomodoroRunRow.tagId?: string \| null`; `startNextBlock` reads it from the run instead of from `context.result`. | **Fixes a latent bug**: after a reload during a break, `context.result` is null, so today the next block would lose its tag. Unobservable until now because tags are always null. |
| `runId` index (carried from M3) | **Not added.** No M4 query goes by run. | Answer to the carried question; revisit if a per-run stat appears. |
| Where stats live | A third view in `HomeRoute` (`'timer' \| 'sky' \| 'stats'`), opened by a "Stats" footer button beside "View sky", closed with Esc / "Back to timer". No route. | Paths 404 in the packaged app (CLAUDE.md). Timer stays mounted, so a running session is untouched. |
| Charts | Hand-written SVG, no chart library. Load the `dataviz` skill before writing chart code. | Two simple chart types; keeps bundle small and on tokens. |
| History list length | Whole period for Week/Month; All time pages 50 at a time ("Show more"). | Week/month are small. |

## Contracts

### Storage — `src/shared/db/schema.ts`

```ts
export type TagColor = 'lavender' | 'mint' | 'rose' | 'gold' | 'sky' | 'peach';

export interface TagRow {
  id: string;            // client UUID
  name: string;
  color: TagColor;
  createdAt: number;     // epoch ms
  updatedAt: number;     // epoch ms; bumped on rename/recolor/(un)archive
  archivedAt: number | null;
  syncedAt: number | null;
}

// PomodoroRunRow addition (optional: absent on runs written by M3)
tagId?: string | null;

META_KEYS.lastTagId = 'lastTagId';

WorkTimerDb.tags: EntityTable<TagRow, 'id'>;

// v3 (M4) — tags. Purely additive.
db.version(3).stores({ tags: 'id, createdAt, syncedAt' });
```

`TagColor` lives in `shared/db` (storage contract); `shared/ui/tagColors.ts`
exports `TAG_COLORS: readonly TagColor[]` and `tagColorVar(c: TagColor): string`
(returns `var(--color-…)`).

### Tags feature — `src/features/tags/` (new)

- `domain/tags.ts` — `normalizeTagName(raw: string): string`;
  `validateTagName(name: string, others: readonly TagRow[], selfId?: string): TagNameError | null`
  where `TagNameError = 'empty' | 'tooLong' | 'duplicate'`; `MAX_ACTIVE_TAGS = 20`.
- `data/tagRepository.ts` — `createTag(db, {name, color}, clock): Promise<TagRow>`
  (throws on invalid / over limit), `renameTag(db, id, name, clock)`,
  `recolorTag(db, id, color, clock)`, `setArchived(db, id, archived: boolean, clock)`,
  `listTags(db): Promise<TagRow[]>` (all, sorted by `createdAt`). Validation runs
  inside the write transaction.
- `hooks/useTags.ts` — `useLiveQuery(listTags)`; returns `{ active, all }`.
- `ui/TagPicker.tsx` — `({ value: string|null, onChange(id|null), disabled }) `:
  a pill showing the current tag (dot + name, or "No tag") that opens a popover:
  "No tag", active tags, "New tag…" inline form, "Manage tags".
- `ui/TagManager.tsx` — list with rename, colour swatches, archive/unarchive.
- `ui/TagDot.tsx`.
- `index.ts` exports `TagPicker`.

### Timer changes — `src/features/timer/`

- `ui/slots.ts`: `tagPicker?: (p: { value: string | null; onChange: (id: string | null) => void; disabled: boolean }) => ReactNode`.
  Rendered on the idle screen (under the mode toggle), the running screen, and
  `BreakScreen` (both break states).
- `data/sessionRepository.ts`:
  - `setInFlightTag(db, sessionId, tagId): Promise<void>` — updates the row only
    if still in flight (no-op otherwise, like `addAwayTime`); if the row's
    `runId` is the active run, writes `run.tagId` in the same transaction.
  - `startSession` writes `run.tagId = draft.tagId` for Pomodoro.
- `data/runRepository.ts`:
  - `setRunTag(db, runId, tagId): Promise<PomodoroRun>` — for breaks.
  - `startNextBlock(db, runId, ctx)` — **drops the `tagId` parameter**; uses
    `run.tagId ?? null`.
- `domain/timerMachine.ts`: event `{ type: 'TAG_CHANGED'; tagId: string | null }`
  accepted in `running`, `onBreak`, `breakOver`; assigns `session.tagId` and/or
  `run.tagId`. `startingNext` input loses `tagId`.
- `hooks/useTimerSession.ts`: exposes `setTag(tagId)` — writes via the right
  repository function for the current state, then sends `TAG_CHANGED`. Write
  failure sets `error` ("The tag could not be saved.") and leaves context alone.
- `hooks/useTimerPrefs.ts`: `tagId` + `setTagId` backed by `META_KEYS.lastTagId`;
  the draft uses it instead of the hard-coded `null` in `TimerScreen.tsx:148`.
  The prefs hook validates the id against `db.tags` (archived/missing → null).

### Stats feature — `src/features/stats/` (new)

Pure domain, no React:

- `domain/period.ts` — `type PeriodKind = 'week' | 'month' | 'all'`;
  `interface Period { kind; start: number; end: number; label: string }`;
  `periodContaining(kind, at: number): Period`; `shiftPeriod(p, by: -1 | 1): Period`
  (not for `'all'`); `isCurrent(p, now)` (disables "next" on the current period).
  `'all'` spans first session's day → end of today.
- `domain/aggregate.ts`:
  - `splitFocusByDay(s: SessionRow): Array<{ dayStart: number; focusS: number }>`
  - `focusBuckets(sessions, period): Array<{ start: number; label: string; focusS: number }>`
    — one per day for week/month, one per month for all.
  - `focusByTag(sessions, period): Array<{ tagId: string | null; focusS: number }>`
    sorted desc, `null` = Untagged.
  - `totals(sessions, period): { focusS; stars; completed; endedEarly; avgSessionS; awayMs }`
  - All take only ended sessions; in-flight rows are filtered first.
- `data/statsRepository.ts` — `readSessionsFor(db, period)`: `startedAt` index
  range `[period.start − 24h, period.end)` (lookback catches sessions that start
  before the period and spill in), `endedAt !== null`; `readTagsById(db)`.
  Reads `db.tags` directly from `shared/db` — no import of the tags feature.
- `hooks/useStats.ts` — live query keyed on the period.
- `ui/StatsView.tsx` (range tabs, prev/next, label), `ui/FocusBars.tsx`,
  `ui/TagBreakdown.tsx` (horizontal bars, tag colour, "Untagged" muted),
  `ui/Totals.tsx`, `ui/SessionHistory.tsx` (date/time, length, tag dot + name,
  completed/ended early, away time if > 0; newest first).
- Empty period → one line "No focus sessions this week/month", not empty charts.
- `dev/devTools.ts` + `installStatsDevTools()` in `index.ts`: dev-only
  `__starkeep.seedHistory(days = 30)` writing completed and cancelled sessions
  spread across past days and existing tags (creates three tags if none),
  including one session that crosses midnight. Merged into the existing
  `window.__starkeep` object rather than replacing it.
- `index.ts` exports `StatsView`, `installStatsDevTools`.

### App — `src/app/routes/HomeRoute.tsx`

`view: 'timer' | 'sky' | 'stats'` replaces `viewingSky`. Adds `tagPicker` to
`timerSlots` (renders `TagPicker`), a "Stats" footer button, and the stats
overlay (scrollable panel over the dimmed sky, Esc/"Back to timer" closes).

### Docs

- `docs/plans/2026-08-30-architecture.md`: M4 row points at the new plan; data
  model notes `tags` has no `icon`, gains `updatedAt`.
- `CLAUDE.md` decisions: "quit time is not away time"; "tags are archived, never
  deleted; sessions' tags freeze at end".
- `NOTES.md` entry at session end.

## Acceptance tests

Outcome **A — tags can be managed.**

1. Unit (`tagRepository.test.ts`, fake-indexeddb): create "Writing"/mint → row
   with `archivedAt: null`, `createdAt === updatedAt`. Pass: listed by `listTags`.
2. Unit: create "writing " when "Writing" is active → rejects `duplicate`; empty
   → `empty`; 25 chars → `tooLong`; 21st active tag → rejects. Creating
   "Writing" again after archiving the first → succeeds.
3. Unit: rename and recolor bump `updatedAt`, keep `createdAt`/`id`.
4. Browser: create, rename, recolor, archive a tag in the picker's manager.
   Pass: archived tag disappears from the picker; unarchive brings it back.

Outcome **B — sessions carry the chosen tag, and it freezes at the end.**

5. Browser: pick "Writing", start a 1-min (dev) countdown, let it complete.
   Pass: the row's `tagId` is Writing's id.
6. Browser: start with "Writing", switch to "Reading" while running, complete.
   Pass: row has Reading. Reload mid-session first → picker still shows Reading.
7. Unit: `setInFlightTag` on a completed session → row unchanged.
8. Browser: Pomodoro (dev 1/1/2) with "Writing": block 1 completes; during the
   break switch to "Reading"; **reload during the break**; start block 2.
   Pass: block 1 = Writing, block 2 = Reading (exercises the latent-bug fix).
9. Unit (`runRepository.test.ts`): `startNextBlock` takes `run.tagId`; a run
   row without `tagId` (written by M3) yields `null`.
10. Browser: after a session, reload → idle picker preselects the last tag.
    Archive it, reload → shows "No tag".
11. Browser: pick "No tag" → row `tagId: null`.

Outcome **C — the dashboard shows the four views over calendar periods.**

12. Unit (`period.test.ts`): `periodContaining('week', Wed 2026-10-07 15:00)`
    → Mon 2026-10-05 00:00 to Mon 2026-10-12 00:00 local; month → Oct 1 to
    Nov 1; `shiftPeriod` back from Jan 2026 month → Dec 2025.
13. Unit: a period spanning a DST change (e.g. the week containing the local
    zone's DST transition, test pins `TZ=Europe/London` via `process.env.TZ`
    set before Date use, or uses an explicit fixture) has 7 day buckets each
    starting at local midnight.
14. Browser: seed with `__starkeep.seedHistory(40)`. Open Stats. Pass: Week tab
    shows 7 bars Mon–Sun with the current week labelled; "next" disabled;
    "prev" moves one week back and the label changes; Month shows one bar per
    day of the month; All time shows monthly bars.
15. Browser: tag breakdown lists each tag with its colour plus "Untagged";
    the sum of its values equals the headline focus total.
16. Browser: history list for the week shows every session started in that
    week, newest first, with tag, length, outcome; a cancelled one reads
    "ended early"; away time appears only where > 0.
17. Browser: a week with no sessions shows the empty-state line, no charts.
18. Browser: archived tag still appears by name in breakdown and history.

Outcome **D — the numbers are right.**

19. Unit (`aggregate.test.ts`): session 23:30 for 50 min completed → 30 min on
    day 1, 20 min on day 2.
20. Unit: cancelled session with `actualFocusS` 600 → focus +600 s,
    `endedEarly` +1, `stars` +0; completed → `stars` +1.
21. Unit: in-flight row (`endedAt: null`) contributes nothing anywhere.
22. Unit: `totals.awayMs` = sum of `awayMs`; `avgSessionS` = focus / sessions
    (0 when none, no NaN).
23. Unit: a session starting 23:50 on the day before the period, 30 min →
    20 min inside the period's first day; it is **not** in the period's history
    or counts (membership by `startedAt`).
24. Browser: while a session is running, opening Stats does not show it, and
    closing Stats returns to the still-running countdown.

Outcome **E — architecture and invariants hold.**

25. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass;
    no `@/features/*/*` cross-imports (lint rule).
26. Unit (`db.test.ts`): opening a v2 database with existing sessions and
    constellations upgrades to v3 with rows untouched and an empty `tags` table.
27. Code check: no M4 code path writes a session row whose `endedAt !== null`
    (grep the new repository functions; covered by test 7).

Outcome **F — desktop.**

28. Desktop (`npm run tauri:dev`): create a tag, run a 1-min tagged countdown,
    open Stats. Pass: it appears in the current week's bars, breakdown, history.
29. Desktop: change tag while the session is minimised to the tray and restored;
    mini window still shows the countdown unaffected.

## Execution order

1. Branch `feat/m4-tags-stats`; commit this plan into `docs/plans/`.
2. Schema v3 + `tagColors` + db upgrade test (26).
3. Tags feature domain/data + tests (1–3).
4. Timer tag plumbing (repository, machine, hook, prefs) + tests (7, 9).
5. Tag picker/manager UI + `HomeRoute` slot.
6. Stats domain + tests (12, 13, 19–23).
7. Stats data/hook/UI + dev seeder; `HomeRoute` stats view.
8. Docs (architecture doc, CLAUDE.md decisions).
9. Acceptance pass: browser cases via `npm run dev` in the browser pane;
   desktop cases 28–29 by hand (Lucas), as in M3. Record every case in the PR.
10. PR, why-then-what, verification section. Do not merge.

## Verification

- `npm run lint && npm run typecheck && npm test && npm run build`.
- Browser pane on `npm run dev`: seed with `__starkeep.seedHistory(40)`, walk
  cases 4–18, 24; inspect rows via `db.sessions` in the console.
- Desktop cases 28–29 need `npm run tauri:dev` and a human; will be reported as
  not run until observed.

## Model recommendation

No multi-file architectural refactor (two new slices following the sky's
pattern, small additive timer changes) and no tricky debugging expected. The
one subtle piece — the run's tag surviving a reload — is specified above.
**Switch to the faster model (Sonnet) for execution.**

## As built — differences from this plan

- **Tag palette** changed before merge; see the Tag palette row above.
- **`splitFocusByDay` was not written.** `aggregate.ts` has one primitive,
  `overlapMs(session, from, to)`, that `focusBuckets`, `focusByTag` and `totals`
  all use, which is what keeps the tag breakdown summing to the headline total.
  Case 19 is tested through `focusBuckets`.
- **`totals.avgSessionS`** averages the full focus of sessions that *started* in
  the period; `totals.focusS` includes focus spilled in from the day before.
  They differ only when a session crosses the period boundary.
- **Tag changes** go through `setInFlightTag` / `setRunTag` and report whether
  the write applied; `TAG_CHANGED` is sent only when it did, so a session that
  ended a moment earlier never shows a tag it did not get.
- **Dev tools** also gained `__starkeep.clearSeeded()`; the sky's dev helper now
  merges into `window.__starkeep` rather than replacing it.
