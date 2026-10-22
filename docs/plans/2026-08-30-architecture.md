# work-timer — architecture and build plan

> **Partly superseded on 2026-08-31.** Two of this document's foundational
> decisions were reversed after M0 shipped. It is kept intact rather than
> rewritten, because the reasoning below explains why the code looked the way
> it did, and the parts not listed here still stand.
>
> 1. **Mobile is out of scope; the app is a Tauri desktop app** (Windows now,
>    macOS possible later), with the browser build kept alongside it. Every
>    "PWA on iPhone" justification below therefore no longer applies — though
>    the PWA machinery survives, because the browser build still uses it.
> 2. **Leaving the app never forfeits a session.** The entire *Abandonment
>    detection* section and acceptance tests O2 (4–7) are void. The timer runs
>    on wall-clock time regardless of window state, and the only way to fail is
>    to cancel deliberately. There is no `abandoned` outcome and no policy.
>
> Current decisions live in `CLAUDE.md`. The pivot's reasoning is in
> `NOTES.md`.

## Context

`work-timer` is a greenfield focus-timer app in the spirit of Forest: the user
commits to a block of focused time, and leaving the app forfeits the session.
The differentiator is theme — a soft, pastel celestial world where each completed
session becomes a star and accumulated sessions form constellations — rather than
Forest's trees.

The repo currently contains only process scaffolding (`CLAUDE.md`, `NOTES.md`,
README, `.gitignore`, an unfilled CI workflow). There is no application code, so
every decision below is greenfield.

Two constraints drive the entire design:

1. **No paid services** (recorded in `CLAUDE.md` as a settled decision).
2. **Must run on iPhone, Windows desktop, and any browser.**

Those two together eliminate native iOS — the App Store requires $99/year and a
Mac. The only free path to all three targets is a **PWA**: one codebase that
installs to an iPhone home screen, installs as a windowed app on Windows, and
runs in any browser.

The stated quality bar is "professional/enterprise grade, not unorganized vibe
coding," combined with "minimize friction." Those pull in opposite directions at
the seams — the resolution throughout is *structural rigor underneath, almost no
ceremony on the surface*: no signup wall, no configuration before first use, but
a strict domain layer, explicit state machines, and reviewable migrations behind
it.

## Decisions settled during planning

| Question | Decision |
|---|---|
| Distribution | PWA only, designed for it properly. No native shell. |
| Session model | Both countdown and Pomodoro, user's choice per session |
| Visuals | Procedural — Canvas for the sky, SVG for the constellation |
| Abandonment | Strict on mobile, honor system on desktop (a setting, per-platform default) |
| Accounts | Guest-first; account optional and claims local history **(Superseded 2026-10-08 by M5: an account is required, sign-up is invite-only, and there are no guests to claim from.)** |
| Sign-in | Google OAuth + email magic link (Apple Sign-In needs the same $99) **(Superseded 2026-10-08 by M5: email + password, with confirmation and password reset by a 6-digit code typed into the app.)** |
| v1 scope | Tags, streaks + daily goals, unlockable star variants, stats dashboard |

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict: true` | Non-negotiable for the structure bar |
| UI | React + Vite | Fastest PWA toolchain; no SSR needed for a local-first timer |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, offline shell, install prompts |
| Styling | Tailwind + CSS custom properties as design tokens | Tokens make the pastel palette a single source of truth |
| Timer logic | XState | Modes × phases × failure states is exactly what ad-hoc `useState` turns to spaghetti |
| Local store | Dexie (IndexedDB) | Source of truth; app is fully functional offline |
| Backend | Supabase (Postgres, Auth, RLS) | Real relational schema + SQL migrations reviewable in PRs — Firestore's schemaless documents fight the structure goal |
| Hosting | ~~Cloudflare Pages~~ **Vercel** *(superseded 2026-10-13, see `docs/plans/2026-10-13-release.md`)* | Free; deploys only from a published release |
| Tests | Vitest (unit) + Playwright (e2e) | Fills the already-scaffolded CI workflow |

## The three decisions that make or break this

### 1. Time is computed from timestamps, never accumulated from ticks

This is the bug that kills timer apps. Browsers throttle `setInterval` in
background tabs, and **iOS freezes JavaScript entirely** when a PWA is
backgrounded. A timer that counts ticks will silently under-report every session.

The rule: persist `startedAt`; compute `elapsed = now - startedAt` on every
render and on every resume. The interval exists only to trigger repaints — never
to hold truth. On resume from suspension, elapsed time is recovered from the
clock, not reconstructed.

Guard the cheat/correctness vector: record `Date.now()` **and**
`performance.now()` at session start and cross-check on resume, so a system
clock change is detectable. On sync, the server sanity-checks that a session's
claimed duration is plausible against its received-at time.

### 2. Completed sessions are immutable — which makes sync nearly free

Because a finished session never changes, sync becomes **append-only**, and
append-only sync has no merge conflicts. Client-generated UUIDs give every record
a stable identity created offline. Only settings and unlocks are mutable, and
those are a small last-write-wins set.

The same reasoning applies to currency: an **append-only ledger** (`delta`,
`reason`, `session_id`) rather than a mutable `balance` column. Balance is
`SUM(delta)`. No drift, conflict-free sync, and fully auditable when the numbers
look wrong. Streaks are likewise **derived by query**, never stored — a stored
streak counter is a classic corruption source.

### 3. Each star is a seed, not an image

A session stores a `seed` string; the generator turns that seed into a star's
position, size, color temperature, and twinkle phase deterministically. The same
session renders the identical star on phone and desktop, forever, with nothing
but a few bytes synced. Reproducible rather than random-on-every-load, and it
keeps the free tier comfortable.

## Making procedural celestial art look premium

Celestial is the rare theme where generated visuals can beat commissioned ones —
a night sky is points of light, soft gradients, and noise, which is what code is
naturally good at. Specifics that separate "premium" from "programmer art":

- **Color temperature variation** across stars (icy blue-white → warm amber).
  This alone carries most of the realism.
- **Per-star random twinkle phase.** Synchronised pulsing reads as fake instantly.
- **Nebulae** as layered fractal-noise clouds, additively blended in 2–3 hues.
  This is where the brief is won: pastel lavender / rose / mint, *not* the
  black-and-neon-blue sci-fi default.
- **Bloom** — a few blurred layers — is the biggest "looks expensive" lever.
- **Parallax depth**: 2–3 star layers drifting at different rates.

**Renderer split:** Canvas 2D for the ambient starfield (thousands of particles,
cheap); SVG for the earned constellation (needs to be clickable, labelled, and
screen-reader navigable). Both sit behind one `SkyRenderer` interface so a WebGL
implementation can replace the Canvas one later without touching game logic.
WebGL is deliberately deferred: it is the heaviest battery drain during a
90-minute phone session, which is precisely when it cannot be afforded.

**Non-negotiables:** `prefers-reduced-motion` kills drift and twinkle; the RAF
loop pauses when the document is hidden; DPR capped at 2; pastel-on-dark contrast
is verified, not assumed.

## Abandonment detection

> **(Superseded 2026-08-31 — this whole section is void. Leaving the app never
> forfeits a session; only an explicit cancel does. Time away is still recorded
> as `awayMs`, but purely as a statistic.)**

Signals: `visibilitychange` (primary), plus `pagehide` and `freeze` for iOS.
Record `lastHiddenAt`; on return compute the away duration from the clock, since
JS was frozen and could not measure it live.

- **Grace period** (~8s) before a session is forfeited, so a glanced notification
  or a mis-swipe doesn't destroy 90 minutes of work. Forest is harsher; this is a
  deliberate kindness that prevents rage-quits.
- **Mobile default: strict.** Exceeding grace ⇒ `outcome: 'abandoned'`.
- **Desktop default: honor system.** Away time is *recorded* but does not fail
  the session. Same code path, different policy — exposed as a user setting with
  a per-platform default.
- **Pomodoro breaks are exempt.** Leaving during a break is expected behavior.
  *(Moot since abandonment was removed on 2026-08-31.)*

The in-flight session is written to IndexedDB on every state transition, so a
crash or reload resumes correctly rather than losing the block.

## Data model

Postgres schema (mirrored in Dexie), every user table protected by RLS
`user_id = auth.uid()`; catalogue tables are read-only to all.

```
profiles          id, display_name, settings jsonb, created_at
sessions          id uuid (client-generated), user_id, mode, planned_duration_s,
                  actual_focus_s, started_at, ended_at,
                  outcome ('completed'|'abandoned'|'cancelled'),
                  tag_id, seed, star_variant_id, device, client_created_at
session_phases    -- NOT BUILT: superseded by M3 (docs/plans/2026-10-07-m3-pomodoro.md).
                  -- Blocks are sessions with run_id/run_index; breaks aren't stored.
                  id, session_id, kind ('work'|'short_break'|'long_break'),
                  index, started_at, ended_at, outcome        -- Pomodoro only
tags              id, user_id, name, color, created_at, updated_at, archived_at
                  -- soft delete, so old sessions keep their label.
                  -- As built in M4: `color` is a palette key, there is no `icon`,
                  -- and `updated_at` exists so M5 can sync tags last-write-wins.
star_variants     id, name, rarity, unlock_cost, palette jsonb -- global catalogue
unlocks           user_id, star_variant_id, unlocked_at
currency_ledger   id, user_id, delta, reason, session_id, created_at -- append-only
```

Streaks and daily-goal progress are **queries over `sessions`**, not columns.

## Project structure

Feature-sliced. The rule that does the real work: **features never import each
other's internals — only through a public `index.ts`.**

```
src/
  app/          providers, router, error boundaries
  features/
    timer/      XState machine, hooks, UI
    sky/        renderer interface, canvas + svg impls, seeded generator
    sessions/   repository, queries
    tags/  stats/  collection/  auth/
  shared/
    db/         Dexie schema + migrations
    sync/       outbox queue, sync engine
    ui/         design system primitives
    lib/        time, seeded RNG, formatting
  styles/       design tokens
supabase/
  migrations/   checked in, reviewed in PRs
```

**The single biggest professionalism signal:** domain logic — the timer machine,
the sky generator, streak and currency math — is pure TypeScript with zero React
imports, unit-testable without a DOM.

## Milestones

Each milestone is its own branch and PR, with its own acceptance pass.

| # | Milestone | Deliverable |
|---|---|---|
| **M0** | Foundation | Vite/TS/React skeleton, design tokens, feature-sliced layout, Dexie schema v1, CI filled in, deployed to Cloudflare Pages. **An installable empty PWA on iPhone and Windows.** |
| **M1** | The timer | XState machine, timestamp-based truth, countdown mode, visibility/abandonment with grace, resume-after-reload. **A correct timer, deliberately ugly.** |
| **M2** | The sky | Seeded generator, Canvas starfield, SVG constellation, session → star. **It becomes beautiful and rewarding.** |
| **M3** | Pomodoro | Phase machine, break-exempt abandonment semantics. *Built as `docs/plans/2026-10-07-m3-pomodoro.md`: blocks are sessions, breaks are derived.* |
| **M4** | Tags + stats | Tagging, dashboard charts. *Built as `docs/plans/2026-10-08-m4-tags-stats.md`: archivable tags chosen before or during a session, and a week / month / all-time stats view derived from sessions.* |
| **M5** | Accounts + sync | Supabase, RLS, outbox sync engine, local→account claim. *Built as `docs/plans/2026-10-08-m5-accounts-sync.md`: invite-only accounts, one local store per account, no claim step (no guests).* |
| **Release** | Ship to friends and family | Windows installer on GitHub Releases, Tauri auto-updates, the web version on a free host (also the Mac answer). Added 2026-10-08. *Planned as `docs/plans/2026-10-13-release.md`: public repo, a notice-and-one-click updater that never interrupts a session, Vercel for the web, one "publish" action ships both.* |
| **M6** | Progression | Currency ledger, unlock catalogue, shop, streaks, daily goals. *Planned as `docs/plans/2026-10-17-m6-progression.md`: Stardust earned per focused minute, written by a reconciler with ids derived from what each row pays for; purchases are ledger rows; styles, themes and the goal are synced settings.* |
| **M7** | Friends | Friend codes and display names, a friend's sky and summary stats, focusing now, focus together, shared constellations. *Planned as `docs/plans/2026-10-22-m7-friends.md`: friends' data only through friendship-checked server functions; one PR per phase.* |

**On sequencing — worth pushing back on if you disagree.** You asked for accounts
and cloud sync "from day one," and they *are* in v1 scope. But they're sequenced
at M5 rather than M0 on purpose: syncing a schema that is still changing means
writing every migration twice, once locally and once server-side. The local data
model needs M1–M4 to settle first. Nothing about M0–M4 has to be redone to add
sync — records already carry client-generated UUIDs and are already immutable —
so this is a sequencing choice, not a scope cut.

Guest-first onboarding also makes the wait harmless: local records are written
against a local user id, and signing in stamps the unsynced rows with the real
`user_id` and pushes them. No separate migration path, and the app is fully
functional with zero network on first run.

## Outcomes and acceptance tests

**O1 — Elapsed time is always correct, including across suspension.**
1. Start a 25-minute countdown on the iPhone PWA, background it for 3 minutes,
   return. *Pass:* remaining time reflects real elapsed wall-clock time, not a
   frozen or drifted count.
2. Start a session, hard-reload the page mid-session. *Pass:* the session resumes
   with correct elapsed time rather than restarting or being lost.
3. Unit: advance fake timers with the tab hidden. *Pass:* computed elapsed equals
   wall-clock delta regardless of how many intervals fired.

**O2 — Abandonment is enforced on mobile and only recorded on desktop.**
> **(Superseded 2026-08-31 — tests 4–7 are void. Replaced by: leaving never
> forfeits, and only an explicit cancel fails a session.)**
4. Mobile, strict: start a session, switch apps for longer than the grace period,
   return. *Pass:* session recorded `outcome: 'abandoned'`; no star awarded.
5. Mobile: switch away for less than the grace period. *Pass:* session continues,
   uninterrupted, no forfeit.
6. Desktop, honor system: switch tabs for 2 minutes. *Pass:* session still
   completes; away time recorded on the record.
7. Pomodoro: leave the app during a break phase. *Pass:* no forfeit.

**O3 — The sky is deterministic and reproducible.**
8. Unit: generate from the same seed twice. *Pass:* byte-identical output.
9. Complete a session on desktop, open the synced account on the phone. *Pass:*
   that star renders identically — same position, color, size.

**O4 — The app works offline and syncs without loss or duplication.**
10. Go offline, complete three sessions, come back online. *Pass:* exactly three
    sessions appear server-side; no duplicates, none missing.
11. Complete sessions as a guest, then sign in. *Pass:* all prior local history
    is claimed and attributed to the new account.
12. Sync the same outbox twice (simulated retry). *Pass:* idempotent — client
    UUIDs prevent duplicate rows.

**O5 — Progression math is auditable and cannot drift.**
13. Complete sessions, spend currency on an unlock. *Pass:* displayed balance
    equals `SUM(currency_ledger.delta)` exactly.
14. Complete sessions on consecutive days, then skip a day. *Pass:* streak
    derived from session dates resets correctly, with no stored counter involved.

**O6 — It installs and is usable as an app on both targets.**
15. Open in iOS Safari, add to home screen. *Pass:* launches standalone (no
    browser chrome), works offline, retains session history.
16. Open in Edge/Chrome on Windows, install. *Pass:* launches in its own window.

**O7 — Accessibility and friction.**
17. Enable OS "reduce motion," open the app. *Pass:* twinkle and drift are
    disabled; the sky remains legible.
18. Open the app for the first time with no account. *Pass:* a focus session can
    be started in one tap, with no signup wall.
    **(Superseded 2026-10-08 by M5: the app now requires an account, so there is
    deliberately a sign-in screen first.)**

## Known constraints to accept up front

- **iOS PWA storage eviction.** Safari can clear IndexedDB after extended
  non-use. Much less aggressive for home-screen-installed PWAs, but real —
  cloud sync (M5) is the mitigation, which is another argument for prompting
  sign-in reasonably early.
- **Session-end notifications are unreliable on backgrounded iOS.** JS is frozen,
  so a scheduled local notification won't fire. Conveniently aligned with the
  product: on mobile you aren't supposed to have left. Not worth a server-push
  workaround in v1.
- **Supabase free tier pauses projects after ~7 days of inactivity.** Restorable,
  and irrelevant in active use — but record it in `CLAUDE.md`'s *Environment*
  section so a paused project is never mistaken for a sync bug.
- **The app still needs a name.** `work-timer` is the repo, not the product.

## Model recommendation

Mixed, by milestone:

- **Stay on the stronger-reasoning model (Opus) for M0, M1, and M5.** M0 sets
  multi-file architecture that everything else inherits; M1 is the tricky
  correctness work (suspension, clock skew, state machine edge cases); M5 is a
  sync engine, which is the classic source of subtle data-loss bugs.
- **Switch to a faster model (Sonnet) for M2, M3, M4, and M6.** Once the
  interfaces exist, these are well-specified step-by-step building against a
  settled architecture.
