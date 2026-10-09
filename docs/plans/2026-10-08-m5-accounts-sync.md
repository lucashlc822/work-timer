# M5 — Accounts and sync, for friends and family

## Context

M0–M4 built a local-only app: one IndexedDB store per device, nothing backed
up, no notion of a user. The goal now is an app Lucas can hand to **friends and
family**: each person has an account, their history lives on a shared server
and syncs across their devices, and nobody can see anyone else's data. M5
builds accounts and sync on Supabase (Postgres + Auth + row-level security, free
tier) designed for many users from the start. Shipping it to people (installer,
auto-updates, web hosting) is the **next** milestone, "Release", not this one.
The architecture doc's M5 row is one line; this plan is the design. Execution
commits it as `docs/plans/2026-10-08-m5-accounts-sync.md`.

### Decided with Lucas on 2026-10-08

| Question | Decision |
|---|---|
| Who uses it | **Lucas plus invited friends and family**, on Windows (desktop app) and in a browser (the web version, which is also the Mac answer — installed to the Dock/Start menu as a web app). |
| Sign-in | **Email + password**; the email is the username. |
| Email confirmation | **Required, by a 6-digit code typed into the app.** Password reset is also by code. No browser redirects or deep links. |
| Sending email | **Lucas's Gmail via an app password**, as Supabase's custom SMTP on the hosted project (free, ~500/day, reliable delivery). The local test stack uses its built-in fake inbox. |
| Who can sign up | **Invite-only.** Lucas adds an address to an allow-list; only those addresses can create an account. |
| Guests | **None** — the app is usable only when signed in. **Supersedes** the architecture doc's "guest-first; account optional and claims local history" and acceptance case O7.18. No claim step exists. |
| Data on a device | **One local copy per account.** Sign-out hides it behind the sign-in screen; signing back in shows it at once. Two people on one computer never see each other's data. |
| History from before M5 | **Start fresh.** The old `work-timer` IndexedDB is never opened again (left untouched). |
| What syncs | Sessions, constellation choices, tags, and **settings** (mode + Pomodoro lengths). |
| Extras | **Delete-account** button; **live updates** between a person's open devices. |
| Release (installer, auto-update, web hosting) | **Separate milestone after M5.** Windows installer on GitHub Releases, Tauri auto-updates, web version on a free host. No macOS app. |
| Testing | **Lucas installs Docker Desktop** so a local Supabase stack runs on `localhost`. |

### Decided in this plan (reopen in review if you disagree)

| Question | Decision | Why |
|---|---|---|
| One server for everyone | **One hosted Supabase project** that every release build talks to. Development uses a **local stack per machine** (Docker). `npm run dev` / `tauri dev` read `.env.development.local` (local); release builds read `.env.production.local` (hosted). | Supersedes CLAUDE.md's "each machine gets its own Supabase project". Friends and both of Lucas's machines must share one server to sync; development must never touch real people's data. |
| Enforcing invites | `public.invites (email citext primary key, invited_at, note)` with RLS on and **no client policies** (unreadable from the app). A `before insert` trigger on `auth.users` rejects sign-ups whose email isn't invited. The client turns that error into "This email hasn't been invited yet — ask the person who shared the app with you." | Works on every Supabase plan. (Supabase's newer "before user created" auth hook would be cleaner — use it instead if PR 1 confirms it's on the free tier.) |
| Managing invites | `npm run invite -- add|remove|list <email>` (`scripts/invite.mjs`) using a **service-role key from `.env.admin.local`** (gitignored, never `VITE_`-prefixed, never in a build), or the dashboard's table editor. | Lucas needs a one-liner; the secret key stays on his machine. |
| Old app versions in the wild | Once released, **server migrations are additive and backward compatible**: never drop or rename a column an older app reads or writes; new columns are nullable or defaulted; new checks must accept what older apps send. On pull, the client maps only the columns it knows and **skips rows it can't understand** (e.g. a future `mode`) instead of failing the whole sync. A public read-only `app_config.min_client_version` lets a future server tell a too-old app to update ("Please update to keep syncing"); the app keeps working offline either way. | Friends won't all update on the same day. This is the rule that keeps their apps from breaking. Recorded in CLAUDE.md. |
| Privacy note | The account panel has a short "About your data" note: what is stored (sessions, tag names, settings, your email), that only you can read it through the app, and that the person running the server can technically see it. | Friends' data sits on Lucas's server; say so plainly. |
| Split into PRs | **Three PRs**: (1) server + invites + auth + per-account store; (2) sync engine; (3) live updates, settings sync, delete account, version check. | One idea per PR; the sync engine deserves its own review. |
| Local store per account | Dexie database `work-timer-account-<userId>`. `shared/db` exports `let db`, bound once by `bindAccountDb(userId)` before the signed-in app renders (ES module live binding). Switching accounts reloads the window. | Every existing `db` import keeps working; a reload guarantees no live query or timer machine holds the old store. |
| Who is signed in at startup | Supabase's stored session (read locally, no network) **plus** `lastUserId` in `localStorage`, written on sign-in, removed on sign-out. If the token can't be refreshed (offline), the app still opens that account's store and sync waits. | An expired token while offline must never lock anyone out of their own timer. |
| Sign-out / switch while busy | **Blocked** while a session or Pomodoro run is in flight, with the reason shown. | In-flight state is per device and never synced. |
| Never synced | In-flight sessions, `activeRun`, `activeSessionId`, `lastTagId`, sync bookkeeping. | Per-device by nature. |
| Outbox | Rows with `syncedAt === null` (sessions only once `endedAt !== null`), found by **filtered scan**. | IndexedDB doesn't index `null`, so the v1 schema comment's "find unsynced rows via the `syncedAt` index" never worked. A scan of a few thousand rows is milliseconds. |
| `syncedAt` on finished sessions | Written locally after upload. **Not** a breach of "completed sessions are immutable": it's local bookkeeping, never uploaded. Recorded in CLAUDE.md. | The device must know what it has uploaded. |
| Sessions & constellations on the server | **Insert-only**, no update/delete policies; upload is `insert … on conflict (id) do nothing`. | Append-only ⇒ idempotent and conflict-free (architecture §2). |
| Tags & settings on the server | **Last-write-wins on `updated_at`**: a `before update` trigger keeps the old row when the incoming one isn't newer, forbids changing `user_id`, and bumps `server_updated_at`. | Tags are the one mutable table (M4). |
| Same-named tags from two devices | Allowed to coexist after a pull; the uniqueness rule still applies to edits. | Only happens if two devices both create "Writing" offline before syncing. |
| Pull cursor | Server-set `server_updated_at`; per-table cursor in `meta`; each pull re-reads a **60 s overlap**; applying is idempotent. | Never trusts device clocks; the overlap covers transactions that commit late. |
| Plausibility checks (architecture §1) | `ended_at >= started_at`; `actual_focus_s <= duration + 5 s`; `ended_at <= now() + 5 min`; text fields length-capped (tag names ≤ 24, device ≤ 64, seed ≤ 64). | The promised server sanity check, and no one can stuff megabytes into a tag name. |
| When sync runs | App start, after sign-in, window becomes visible, `online` event, 2 s after the outbox changes, every 5 min, on a realtime change. Exponential backoff to 5 min on errors. **Main window only** — the mini window never syncs. | Covers every way new data appears. |
| Two windows or tabs | **Single-flight** via the Web Locks API (`navigator.locks`, in WebView2 and browsers); in-process fallback in tests. | Two concurrent syncs could double-mark or race the cursor. |
| Live updates | Supabase Realtime `postgres_changes` on the four tables, filtered to the user; an event **triggers a pull**. | One code path applies server data. |
| Delete account | SQL function `delete_my_account()` (`security definer`, deletes `auth.users` where `id = auth.uid()`; tables cascade). Typed confirmation; disabled offline; afterwards the local account store is deleted. The invite stays, so they can rejoin. | No Edge Function or secret key in the app. |
| Passwords | Minimum 8 characters (client check + Supabase config). | Supabase's default of 6 is weak. |
| Unconfigured build | No Supabase env vars ⇒ "This build isn't connected to a server". Tests and `npm run build` pass with no env. | CI and a fresh clone must not break. |
| Server limits to know | Free tier: 50,000 monthly users, 500 MB database (years of sessions for a few dozen people); **pauses after ~7 days with no activity** — the app keeps working offline and the status reads "Couldn't reach the server" until Lucas restores it. Gmail: ~500 emails/day. Recorded in CLAUDE.md. | So none of these is debugged as an app bug. |
| CI | New `db` job: `supabase start` + `supabase test db` (pgTAP) on GitHub Actions. | Row-level security is what keeps one friend's data away from another; it gets an automated check. |

## How it fits together

```
app/AuthGate ──(signed out)──> features/account   (sign in / sign up / code / reset)
     │ (session or lastUserId)
     ├─ bindAccountDb(userId) ──> shared/db  (work-timer-account-<uid>)
     ├─ <HomeRoute/> as today (+ account button in the footer)
     └─ useSync() ──> shared/sync/engine ──> shared/sync/remote (SupabaseRemote | FakeRemote)
                                                   └─ shared/backend/supabase (client; null if unconfigured)
```

Slice rules hold: `shared/sync` and `shared/backend` import only `shared/*`;
`features/account` imports `shared/*`; `app/` composes.

## Contracts

### Server — `supabase/` (Supabase CLI as a devDependency)

- `supabase/config.toml` (local stack): `minimum_password_length = 8`,
  `enable_confirmations = true`, templates `supabase/templates/{confirmation,recovery}.html`
  containing `{{ .Token }}`.
- `supabase/migrations/<ts>_m5_accounts.sql` (PR 1, all tables so later PRs add none):
  - `sessions` (`id uuid pk`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`,
    `mode`, `planned_duration_s`, `actual_focus_s`, `started_at`, `ended_at not null`,
    `outcome`, `away_ms`, `tag_id uuid references tags`, `seed`, `device`,
    `client_created_at`, `run_id uuid`, `run_index int`, `server_updated_at timestamptz not null default now()`, checks above);
    `constellations`; `tags` (`updated_at`, `archived_at`); `user_settings`
    (`user_id pk`, `mode`, `pomodoro jsonb`, `updated_at`); each with an index on `(user_id, server_updated_at)`.
  - RLS: `select` + `insert` where `user_id = auth.uid()`; `update` only on `tags` and `user_settings`; no `delete` policies.
  - `lww_guard()` trigger on `tags`, `user_settings`.
  - `invites` + `enforce_invite()` trigger on `auth.users`; `app_config (min_client_version text)` readable by everyone, writable by no client.
  - `delete_my_account()`; the four data tables added to the `supabase_realtime` publication.
- `supabase/tests/*.test.sql` (pgTAP) — acceptance cases 4 and 18.

### Client

- `src/shared/backend/supabase.ts` — `getSupabase(): SupabaseClient | null` from
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `src/shared/db/schema.ts` — `export let db`; `bindAccountDb(userId)`;
  `accountDbName(userId)`; `deleteAccountDb(userId)`. New `META_KEYS`:
  `syncCursors`, `lastSyncedAt`, `settingsUpdatedAt`, `settingsSyncedAt`. No Dexie version bump.
- `src/features/tags/data/tagRepository.ts` — every write sets `syncedAt: null`.
- `src/features/timer/data/runRepository.ts` — `saveTimerPrefs` bumps
  `settingsUpdatedAt` only when mode or Pomodoro lengths change; `useTimerPrefs`
  reads through a live query so pulled settings appear.
- `src/shared/sync/remote.ts` — `interface RemoteStore { push(table, rows); pull(table, since): { rows; cursor };
  subscribe(userId, onChange): () => void; deleteAccount(); minClientVersion(): Promise<string | null> }`.
- `src/shared/sync/supabaseRemote.ts` — camelCase ⇄ snake_case, epoch ms ⇄ ISO; maps known columns only.
- `src/shared/sync/apply.ts` — pure merge rules: validate each row (unknown/invalid ⇒ skip and count);
  immutable rows added only if absent; tags/settings by LWW; never touches in-flight rows.
- `src/shared/sync/engine.ts` — `createSyncEngine({ db, remote, clock, lock })` →
  `{ syncNow(): Promise<SyncResult>; status }`. Push tags → constellations → sessions → settings,
  then pull in the same order. Marks `syncedAt` in a transaction **only** for rows
  whose `syncedAt` is still null and (tags/settings) whose `updatedAt` equals what was pushed.
- `src/features/account/` — `AuthScreens` (sign in, sign up, code, forgot password,
  new password; the invite error message), `AccountPanel` (email, status "Synced 2 min ago /
  N waiting / Offline / Couldn't reach the server / Please update", About your data,
  sign out, delete account), `authRepository.ts` over `supabase.auth`
  (`signUp`, `verifyOtp` types `'email'` and `'recovery'`, `signInWithPassword`,
  `resetPasswordForEmail`, `updateUser`, `signOut`).
- `src/app/AuthGate.tsx`, `src/app/useSync.ts`; `MiniWindow` binds the same account store and never syncs.
- `src-tauri/tauri.conf.json` CSP: add `connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321` (check Tauri still appends its IPC sources).
- `scripts/invite.mjs` + `npm run invite`; `.env.example` rewritten (each variable, which file, what's secret); `.gitignore` covers `.env.admin.local`.

### Docs

CLAUDE.md: Docker + `npx supabase start`; Mailpit at `http://127.0.0.1:54324`;
which `.env.*` each command reads; free-tier limits and the 7-day pause; Gmail
limits; the old-app-versions migration rule; decisions (account required,
invite-only, per-account store, `syncedAt` is bookkeeping, LWW for tags and
settings); rewrite the "no environment variables" paragraph. Architecture doc:
supersede the Accounts / Sign-in rows and O7.18; M5 row points here; add a
**Release** milestone between M5 and M6.

## Acceptance tests

Local stack unless marked. "Device A" = desktop app (`tauri dev`), "device B" =
Claude's browser pane (the web version). Test accounts exist only on the local
stack; codes are read from its fake inbox.

**PR 1 — server, invites, accounts, per-account store**

1. No env vars: "not connected" screen; `npm test` and `npm run build` pass.
2. Invited address: sign up → code arrives → entering it signs in to an empty sky. A wrong code errors and stays on the code step. A 7-character password is refused before submit.
3. **Uninvited address: sign-up is refused with the invite message, and no account is created.** `npm run invite -- add` then lets it through; `remove` stops new sign-ups again.
4. pgTAP: `invites` cannot be read or written by `anon` or `authenticated`; `app_config` is readable, not writable.
5. Wrong password → error, form still usable. Correct password → in.
6. Forgot password → code → new password → old fails, new works.
7. Account A with sessions signs out → sign-in screen; A's local store still exists. Sign in as B → none of A's data. Back to A → A's history is there.
8. Sign out is disabled with a reason while a session or Pomodoro run is in flight.
9. The legacy `work-timer` database is unchanged after signing in.
10. Mini window (device A) shows the signed-in account's running session.
11. Offline launch: sign in on A, stop the stack, relaunch → app opens with history, timer works, status reads Offline.

**PR 2 — sync engine**

12. Unit: pushing the same rows twice leaves one copy (fake remote); pgTAP proves `on conflict do nothing`.
13. Unit: a tag edited while its push is in flight stays unsynced and goes up next run.
14. Unit: pull adds unseen sessions, never overwrites a local session, applies tags/settings by LWW both ways; re-applying the 60 s overlap changes nothing.
15. Unit: a pulled row with an unknown `mode` (or other invalid value) is skipped and counted; the rest of the batch applies.
16. Unit: in-flight sessions are never pushed; the mini window never constructs an engine.
17. Unit: two concurrent `syncNow()` calls ⇒ one run.
18. pgTAP: user B cannot read A's rows or insert as A; sessions and constellations reject update and delete; a stale tag update is ignored; changing `user_id` fails; implausible sessions and over-long text are rejected; `delete_my_account` removes that user's rows and no one else's.
19. Stop the stack, complete three sessions on A, start it → exactly three new server rows (architecture O4.10).
20. Same account on A and B: a session from A appears on B after B's next sync, with the identical star seed and identical stats totals (architecture O3.9).
21. Two accounts (two invited test users) both syncing: each sees only their own sessions, tags and stats.
22. Tag created on A, renamed on B, renamed again on A ⇒ both end with A's last rename.

**PR 3 — live updates, settings, delete, version check**

23. Both devices open on one account: a session completed on A appears on B within 5 s with no focus change.
24. Change Pomodoro lengths on A ⇒ B's idle screen shows them after sync; `lastTagId` stays per device.
25. Delete account: typed confirmation; afterwards no server rows for that user, other users untouched, the local account store gone, back at sign-in, and signing in fails. Disabled offline.
26. Set `app_config.min_client_version` above the app's version ⇒ status reads "Please update", sync pauses, the timer still works; set it back ⇒ sync resumes.

**All PRs**

27. `npm run lint`, `typecheck`, `test`, `format:check`, `build`; CI `web`, `desktop`, `db` green.
28. Release binary (`tauri build`, run `target/release/starkeep.exe` with env pointed at the local stack): sign in and one sync round trip work — proves the CSP.
29. **By hand, Lucas — the real server:** create the free hosted project; `supabase link` + `db push`; set Gmail as custom SMTP (app password entered by Lucas in the dashboard) and paste the two email templates; `npm run invite -- add` his own address; set `.env.production.local` on both machines; sign up, and see a session from one machine appear on the other. I can't run this: I'm not allowed to sign in to a hosted service or handle the Gmail app password.

## Before execution — needs Lucas

1. **Install Docker Desktop** (free for personal use; enables WSL 2, may need a reboot): `winget install Docker.DockerDesktop`, then check `docker info` works.
2. Case 29 at the end of PR 3. The Gmail app password needs 2-step verification on the Google account.

## Execution order

- **PR 1** `feat/m5-accounts`: commit plan; Supabase CLI + `supabase init`; migration + pgTAP; invites script; `shared/backend`; per-account `db`; AuthGate + account screens; CSP; env files; docs → cases 1–11, 27 → PR, stop.
- **PR 2** `feat/m5-sync`: `shared/sync` (remote, apply, engine, adapter); `syncedAt: null` on tag writes; `useSync`; status in AccountPanel → 12–22, 27, 28 → PR, stop.
- **PR 3** `feat/m5-live-settings-delete`: realtime; settings sync; delete account; version check → 23–27; Lucas runs 29 → PR, stop.

## Verification

- `npx supabase start`, `npx supabase test db` for the server.
- `npm test` for the engine and merge rules (fake remote).
- Browser pane on `npm run dev` + the desktop app driven over WebView2 remote debugging (NOTES.md, 2026-10-08) as two devices on the local stack; the fake inbox's API on `127.0.0.1:54324` for codes.

## Model recommendation

Multi-file architectural work (new backend, a store that becomes per-account,
an app-wide gate, an invite system) **and** a sync engine, where subtle
data-loss and data-leak bugs hide (marking rows synced, cursors, races between
windows, row-level security between friends). **Stay on the stronger-reasoning
model (Opus) for all three PRs.**

## As built — PR 1

- **Invite enforcement** is the `before insert` trigger on `auth.users`, as
  planned. The newer auth hook exists in this CLI, but the trigger needs no
  dashboard switch on the hosted project, so friends are protected as soon as
  the migration is pushed.
- **Two bugs caught by the acceptance pass, fixed before the PR:**
  - The invite check compared citext with `=` inside a function whose
    `search_path` is empty, which silently became a case-sensitive text
    comparison. Now `lower()` on both sides (pgTAP case "invites match
    case-insensitively").
  - supabase-js reports every HTTP 500 as `AuthRetryableFetchError`, so an
    uninvited sign-up was shown as "Couldn't reach the server". The classifier
    now reads the message first and treats only status 0 and 502–504 as
    offline; the observed error shape is a unit test.
- **The pgTAP suite already covers case 18's rules** (written with the schema,
  since the tables all land in PR 1); PR 2 adds the client side.
- **Case 11's "status reads Offline"** needs the sync status, which is PR 2.
  PR 1 verified the rest: an offline relaunch with an expired token opens
  straight into the account, the running session resumes, and the app stays
  signed in until the server is back (then refreshes the token by itself).

