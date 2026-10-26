-- M7 phase 5: shared constellations. Two accepted friends build one
-- constellation together; a session counts toward it only when it was run for
-- it (`sessions.shared_id`), and never toward the person's own constellation.
--
-- Same stance as phases 1, 3 and 4: no existing table gets a new policy.
--
-- * `shared_constellations` has no grants and no policies. Only the functions
--   below read or write it. `a` proposed it, `b` was asked.
-- * One open per pair: a proposal, or an accepted one that is neither stopped
--   nor finished. "Finished" is judged from sessions by `shared_done`, using the
--   star count and tier minimum the proposing app sent, never stored as a flag.
-- * Stopping (either member) or unfriending freezes an accepted one at that
--   moment and deletes a proposal. A frozen one stays readable by both.
-- * `sessions.shared_id` (nullable) has no foreign key and no check: a refused
--   upload would be stuck forever, and released apps never send it. A session
--   counts only if its owner is a member and it ended inside the open window.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.shared_constellations (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('catalogue', 'generated')),
  shape_id text check (char_length(shape_id) <= 64),
  seed text check (char_length(seed) <= 64),
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  stars_needed integer not null check (stars_needed between 4 and 16),
  min_focus_s integer not null check (min_focus_s between 0 and 3600),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  stopped_at timestamptz,
  stopped_by uuid references auth.users (id) on delete set null,
  constraint shared_two_people check (a <> b),
  constraint shared_catalogue_has_shape check (source <> 'catalogue' or shape_id is not null),
  constraint shared_stopped_after_accepted check (stopped_at is null or accepted_at is not null)
);

create index shared_constellations_a on public.shared_constellations (a);
create index shared_constellations_b on public.shared_constellations (b);

alter table public.shared_constellations enable row level security;
revoke all on public.shared_constellations from anon, authenticated;

alter table public.sessions add column shared_id uuid;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Whether enough qualifying sessions from either member have filled it: each
-- completed, run for it, long enough for its tier, and ended while it was open.
create function public.shared_done(sc public.shared_constellations) returns boolean
language sql
stable
set search_path = ''
as $$
  select sc.accepted_at is not null and (
    select count(*) from public.sessions s
    where s.shared_id = sc.id
      and s.user_id in (sc.a, sc.b)
      and s.outcome = 'completed'
      and s.actual_focus_s >= sc.min_focus_s
      and s.ended_at >= sc.accepted_at
      and (sc.stopped_at is null or s.ended_at < sc.stopped_at)
  ) >= sc.stars_needed;
$$;

revoke execute on function public.shared_done(public.shared_constellations)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Propose a shape to an accepted friend. Refused while the pair already has
-- one open.
create function public.propose_shared(
  friend uuid,
  source text,
  shape_id text,
  seed text,
  tier text,
  stars_needed integer,
  min_focus_s integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  made uuid;
begin
  if not exists (select 1 from public.profiles where user_id = me and display_name is not null) then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;
  if friend is null or friend = me or not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = me and addressee = friend) or (requester = friend and addressee = me))
  ) then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;

  -- Two proposals racing for the same pair: the second waits, then sees the first.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(least(me, friend)::text || greatest(me, friend)::text, 0));

  if exists (
    select 1 from public.shared_constellations sc
    where ((sc.a = me and sc.b = friend) or (sc.a = friend and sc.b = me))
      and sc.stopped_at is null
      and not public.shared_done(sc)
  ) then
    raise exception 'shared_already_open' using errcode = 'P0001';
  end if;

  begin
    insert into public.shared_constellations (a, b, source, shape_id, seed, tier, stars_needed, min_focus_s)
    values (me, friend, source, shape_id, seed, tier, stars_needed, min_focus_s)
    returning id into made;
  exception
    when check_violation or not_null_violation then
      raise exception 'invalid_shared' using errcode = 'P0001';
  end;

  return made;
end;
$$;

-- Accept or decline a proposal made to the caller. Declining deletes it.
create function public.respond_shared(shared uuid, accept boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  perform 1 from public.shared_constellations
  where id = shared and b = me and accepted_at is null
  for update;
  if not found then
    raise exception 'shared_not_found' using errcode = 'P0001';
  end if;

  if accept then
    update public.shared_constellations set accepted_at = now() where id = shared;
  else
    delete from public.shared_constellations where id = shared;
  end if;
end;
$$;

-- Either member lets it go: a proposal is withdrawn (deleted), an open one is
-- frozen as it is. Stopping one already stopped or finished changes nothing.
create function public.stop_shared(shared uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  sc public.shared_constellations;
begin
  select * into sc from public.shared_constellations
  where id = shared and (a = me or b = me)
  for update;
  if not found then
    raise exception 'shared_not_found' using errcode = 'P0001';
  end if;

  if sc.accepted_at is null then
    delete from public.shared_constellations where id = shared;
  elsif sc.stopped_at is null and not public.shared_done(sc) then
    update public.shared_constellations
    set stopped_at = now(), stopped_by = me
    where id = shared;
  end if;
end;
$$;

-- Every shared constellation the caller is in, frozen ones included, with the
-- completed sessions either member ran for it. Only those sessions are shown:
-- no tags, devices, away time, or anything run for something else.
create function public.my_shared() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item ->> 'created_at')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', sc.id,
      'proposed_by', sc.a,
      'partner_id', case when sc.a = (select auth.uid()) then sc.b else sc.a end,
      'partner_name', p.display_name,
      'source', sc.source,
      'shape_id', sc.shape_id,
      'seed', sc.seed,
      'tier', sc.tier,
      'stars_needed', sc.stars_needed,
      'min_focus_s', sc.min_focus_s,
      'created_at', sc.created_at,
      'accepted_at', sc.accepted_at,
      'stopped_at', sc.stopped_at,
      'stopped_by', sc.stopped_by,
      'sessions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'user_id', s.user_id,
          'seed', s.seed,
          'started_at', s.started_at,
          'ended_at', s.ended_at,
          'actual_focus_s', s.actual_focus_s,
          'star_style', s.star_style
        ) order by s.ended_at, s.id)
        from public.sessions s
        where s.shared_id = sc.id and s.user_id in (sc.a, sc.b) and s.outcome = 'completed'
      ), '[]'::jsonb)
    ) as item
    from public.shared_constellations sc
    left join public.profiles p
      on p.user_id = case when sc.a = (select auth.uid()) then sc.b else sc.a end
    where (select auth.uid()) in (sc.a, sc.b)
  ) items;
$$;

-- Unfriending now also freezes the pair's open shared constellation and
-- withdraws any proposal between them. Same signature and errors as phase 1.
create or replace function public.remove_friend(friendship_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  one uuid;
  two uuid;
begin
  delete from public.friendships
  where id = friendship_id and (requester = me or addressee = me)
  returning requester, addressee into one, two;
  if not found then
    raise exception 'friendship_not_found' using errcode = 'P0001';
  end if;

  delete from public.shared_constellations
  where ((a = one and b = two) or (a = two and b = one))
    and accepted_at is null;

  update public.shared_constellations sc
  set stopped_at = now(), stopped_by = me
  where ((sc.a = one and sc.b = two) or (sc.a = two and sc.b = one))
    and sc.accepted_at is not null
    and sc.stopped_at is null
    and not public.shared_done(sc);
end;
$$;

revoke execute on function
  public.propose_shared(uuid, text, text, text, text, integer, integer),
  public.respond_shared(uuid, boolean),
  public.stop_shared(uuid),
  public.my_shared()
from public, anon;

grant execute on function
  public.propose_shared(uuid, text, text, text, text, integer, integer),
  public.respond_shared(uuid, boolean),
  public.stop_shared(uuid),
  public.my_shared()
to authenticated;
