-- M5: accounts, invites, and the tables a signed-in device syncs with.
--
-- The client's local IndexedDB stays the source of truth for the person using
-- it; these tables are the shared copy that every one of their devices syncs
-- through. Rules that matter, all enforced here rather than trusted to the app:
--
-- * Every data row belongs to one user, and row-level security (RLS) lets a
--   signed-in user read and write only their own rows. This is what keeps one
--   friend's history away from another's.
-- * Sessions and constellation choices are insert-only. A finished session
--   never changes, so upload is `insert ... on conflict (id) do nothing`, and
--   retries can never duplicate anything.
-- * Tags and settings are the mutable ones: the newest `updated_at` wins, and
--   an older write arriving late is ignored (`lww_guard`).
-- * `server_updated_at` is always stamped by the server, never the client. It
--   is the pull cursor, so it must not depend on any device's clock.
-- * Sign-up is invite-only (`invites` + `enforce_invite`).
--
-- Once the app has been released to other people, migrations after this one
-- must stay backward compatible: never drop or rename a column an older app
-- reads or writes, give new columns a default or allow null, and never add a
-- check that rejects what an older app sends.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Stamp the server time on insert, overriding whatever the client sent.
-- clock_timestamp() rather than now(): now() is fixed for a whole transaction.
create function public.stamp_server_time() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- Last-write-wins for the mutable tables. An update whose updated_at is not
-- newer than the stored row is skipped (returning null drops just that row's
-- update, so an upsert of a stale copy is a silent no-op). Ownership can never
-- move between users.
create function public.lww_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  if new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites: who may create an account
-- ---------------------------------------------------------------------------

-- Managed by the server's owner (dashboard or `npm run invite`, which uses the
-- service-role key). No client role can read or write it.
create table public.invites (
  email extensions.citext primary key,
  invited_at timestamptz not null default now(),
  note text check (char_length(note) <= 200)
);

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- Runs as its owner so it can read invites while Supabase Auth inserts the user.
create function public.enforce_invite() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- lower() on both sides rather than citext's `=`: with an empty search_path
  -- that operator isn't found, and `=` silently falls back to case-sensitive
  -- text comparison (caught by the pgTAP suite).
  if new.email is null
     or not exists (select 1 from public.invites where lower(email::text) = lower(new.email)) then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_invite() from public, anon, authenticated;

create trigger enforce_invite
  before insert on auth.users
  for each row execute function public.enforce_invite();

-- ---------------------------------------------------------------------------
-- App config: one row the app reads, nobody but the owner writes
-- ---------------------------------------------------------------------------

-- min_client_version: when set above an app's own version, that app pauses
-- sync and asks to be updated (it keeps working offline).
create table public.app_config (
  id boolean primary key default true check (id),
  min_client_version text check (char_length(min_client_version) <= 32)
);

insert into public.app_config default values;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

create policy "Anyone can read the app config"
  on public.app_config for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Tags (mutable, last-write-wins)
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  -- A palette key. Length-checked rather than enumerated, so a palette change
  -- in a newer app never needs a server migration first.
  color text not null check (char_length(color) between 1 and 16),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  -- Lets sessions reference a tag *and* its owner, so a session can never
  -- point at someone else's tag.
  unique (id, user_id)
);

create index tags_pull on public.tags (user_id, server_updated_at);

create trigger tags_stamp before insert on public.tags
  for each row execute function public.stamp_server_time();
create trigger tags_lww before update on public.tags
  for each row execute function public.lww_guard();

-- ---------------------------------------------------------------------------
-- Constellation choices (insert-only)
-- ---------------------------------------------------------------------------

create table public.constellations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('catalogue', 'generated')),
  shape_id text check (char_length(shape_id) <= 64),
  seed text check (char_length(seed) <= 64),
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  chosen_at timestamptz not null,
  client_created_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index constellations_pull on public.constellations (user_id, server_updated_at);

create trigger constellations_stamp before insert on public.constellations
  for each row execute function public.stamp_server_time();

-- ---------------------------------------------------------------------------
-- Sessions (insert-only; only finished sessions are ever uploaded)
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('countdown', 'pomodoro')),
  planned_duration_s integer not null check (planned_duration_s between 1 and 86400),
  actual_focus_s integer not null check (actual_focus_s >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  outcome text not null check (outcome in ('completed', 'cancelled')),
  away_ms bigint not null default 0 check (away_ms >= 0),
  tag_id uuid,
  seed text not null check (char_length(seed) between 1 and 64),
  device text not null check (char_length(device) <= 64),
  client_created_at timestamptz not null,
  run_id uuid,
  run_index integer check (run_index > 0),
  server_updated_at timestamptz not null default clock_timestamp(),

  foreign key (tag_id, user_id) references public.tags (id, user_id),

  -- The plausibility checks the architecture promised: a session cannot end
  -- before it starts, cannot credit more focus than the time it spanned
  -- (plus a little rounding slack), and cannot claim to have ended in the
  -- future. server_updated_at is the server's insert time (see the trigger).
  constraint session_ends_after_start check (ended_at >= started_at),
  constraint session_focus_fits_span
    check (actual_focus_s <= extract(epoch from (ended_at - started_at)) + 5),
  constraint session_not_from_the_future
    check (ended_at <= server_updated_at + interval '5 minutes')
);

create index sessions_pull on public.sessions (user_id, server_updated_at);

create trigger sessions_stamp before insert on public.sessions
  for each row execute function public.stamp_server_time();

-- ---------------------------------------------------------------------------
-- Settings (one row per user, last-write-wins)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (char_length(mode) <= 16),
  pomodoro jsonb not null check (jsonb_typeof(pomodoro) = 'object' and pg_column_size(pomodoro) <= 2048),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index user_settings_pull on public.user_settings (user_id, server_updated_at);

create trigger user_settings_stamp before insert on public.user_settings
  for each row execute function public.stamp_server_time();
create trigger user_settings_lww before update on public.user_settings
  for each row execute function public.lww_guard();

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------

-- Signed-out visitors get nothing. Signed-in users get only what each table
-- needs; RLS then narrows every row to its owner. The revokes are defence in
-- depth: even a policy mistake could not let anyone edit a finished session.
revoke all on public.tags, public.constellations, public.sessions, public.user_settings from anon;
revoke all on public.tags, public.constellations, public.sessions, public.user_settings from authenticated;
grant select, insert, update on public.tags to authenticated;
grant select, insert on public.constellations to authenticated;
grant select, insert on public.sessions to authenticated;
grant select, insert, update on public.user_settings to authenticated;

alter table public.tags enable row level security;
alter table public.constellations enable row level security;
alter table public.sessions enable row level security;
alter table public.user_settings enable row level security;

create policy "Read own tags" on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own tags" on public.tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Edit own tags" on public.tags for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Read own constellations" on public.constellations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own constellations" on public.constellations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Read own sessions" on public.sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own sessions" on public.sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Read own settings" on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own settings" on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Edit own settings" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Delete account
-- ---------------------------------------------------------------------------

-- Deletes the calling user. Every data table cascades from auth.users, so
-- their rows go with them and nobody else's are touched. The invite is kept,
-- so they can sign up again.
create function public.delete_my_account() returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates (used from M5's third PR)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.tags, public.constellations, public.sessions, public.user_settings;
