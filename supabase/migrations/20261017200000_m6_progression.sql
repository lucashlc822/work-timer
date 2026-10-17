-- M6: Stardust (an append-only ledger), and the settings and session fields
-- that star styles, sky themes and the daily goal need.
--
-- Released apps (0.1.x) already talk to this server, so everything here is
-- additive and backward compatible (CLAUDE.md): one new table they never
-- touch, and new columns that allow null, so their inserts and upserts — which
-- don't send these columns — keep working and leave the new values alone.
--
-- * `ledger` is insert-only, like sessions. Balance is SUM(delta), never a
--   stored number. A row's id is derived on the client from the fact it
--   records (e.g. "<user>:session:<id>"), so a fact recorded twice — by two
--   devices, or one device retrying — is the same row, and
--   `on conflict (id) do nothing` keeps one copy.
-- * No foreign key to sessions: a session the server refuses for now
--   (`session_not_from_the_future`) would otherwise permanently strand the
--   Stardust it earned, since a foreign-key failure is treated as a bad row.
-- * Nothing here can change or delete a ledger row, including the app.

-- ---------------------------------------------------------------------------
-- Ledger (insert-only)
-- ---------------------------------------------------------------------------

create table public.ledger (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- What the row is for: 'session', 'goal', 'streak', 'constellation',
  -- 'purchase', ... Length-checked rather than enumerated, so a newer app's new
  -- reason never needs a migration first.
  reason text not null check (char_length(reason) between 1 and 32),
  -- Positive for earnings, negative for spending. Bounded so a bad client
  -- can't write an absurd number.
  delta integer not null check (delta between -100000 and 100000),
  -- What it refers to: a session id, a day, an item key, ...
  ref text check (char_length(ref) <= 80),
  created_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index ledger_pull on public.ledger (user_id, server_updated_at);

create trigger ledger_stamp before insert on public.ledger
  for each row execute function public.stamp_server_time();

revoke all on public.ledger from anon;
revoke all on public.ledger from authenticated;
grant select, insert on public.ledger to authenticated;

alter table public.ledger enable row level security;

create policy "Read own ledger" on public.ledger for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own ledger" on public.ledger for insert to authenticated
  with check ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.ledger;

-- ---------------------------------------------------------------------------
-- The star style a session was finished with (nullable: older apps send none,
-- and a missing style renders as the default look)
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column star_style text check (char_length(star_style) <= 32);

-- ---------------------------------------------------------------------------
-- Settings: the equipped star style and sky theme, and the daily goal.
-- Separate nullable columns, not keys inside `pomodoro`: a 0.1.x app rebuilds
-- that jsonb object from its own four fields on every edit, which would erase
-- anything else stored there. An upsert that doesn't mention these columns
-- (every 0.1.x app) leaves them as they are.
-- ---------------------------------------------------------------------------

alter table public.user_settings
  add column star_style text check (char_length(star_style) <= 32),
  add column sky_theme text check (char_length(sky_theme) <= 32),
  add column daily_goal_min integer check (daily_goal_min between 5 and 1440);
