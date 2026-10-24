-- M7 phase 4: focus together. Up to four friends run one countdown that
-- starts and ends at the same moment; anyone's deliberate cancel ends it for
-- everyone, and a bonus is due when every member completes.
--
-- Same stance as phases 1 and 3: no existing table gets a new policy.
--
-- * `together_rooms` has no grants and no policies. Only the functions below
--   read or write it.
-- * `together_members` is one row per person per room, readable only by that
--   person (an owner-only policy, so the isolation guard holds). It is
--   published to Realtime, and every change to a room touches every member's
--   row: that is how each device hears about its own rooms, on a channel
--   filtered to its own user id, with no new kind of access control.
-- * A lobby lapses after 10 minutes; a running room is over at `ends_at`.
--   Both are judged by time in every function, never by a background job.
-- * `sessions.together_id` (nullable) marks a session run in a room. Released
--   apps never send it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.together_rooms (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  planned_duration_s integer not null check (planned_duration_s between 60 and 10800),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'cancelled')),
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  constraint together_room_times check (
    (status = 'lobby' and starts_at is null and ends_at is null)
    or (status <> 'lobby' and (starts_at is null) = (ends_at is null))
  )
);

alter table public.together_rooms enable row level security;
revoke all on public.together_rooms from anon, authenticated;

create table public.together_members (
  room_id uuid not null references public.together_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null check (state in ('invited', 'joined', 'declined', 'left', 'missed')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (room_id, user_id)
);

create index together_members_user on public.together_members (user_id);

alter table public.together_members enable row level security;
revoke all on public.together_members from anon, authenticated;
grant select on public.together_members to authenticated;

create policy "Read own room memberships" on public.together_members for select to authenticated
  using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.together_members;

alter table public.sessions add column together_id uuid;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- What a room is now, judged by time: a lobby past 10 minutes has lapsed, a
-- running room past its end is done.
create function public.together_effective_status(r public.together_rooms) returns text
language sql
stable
set search_path = ''
as $$
  select case
    when r.status = 'lobby' and r.created_at < now() - interval '10 minutes' then 'lapsed'
    when r.status = 'running' and r.ends_at <= now() then 'done'
    else r.status
  end;
$$;

-- Whether this person has joined a room that is still open (lobby or running).
create function public.together_busy(who uuid) returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.together_members m
    join public.together_rooms r on r.id = m.room_id
    where m.user_id = who and m.state = 'joined'
      and public.together_effective_status(r) in ('lobby', 'running')
  );
$$;

-- Touch every member's row so each device hears that its room changed.
create function public.together_touch(room uuid) returns void
language sql
set search_path = ''
as $$
  update public.together_members set updated_at = clock_timestamp() where room_id = room;
$$;

revoke execute on function
  public.together_effective_status(public.together_rooms),
  public.together_busy(uuid),
  public.together_touch(uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Open a room with 1–3 accepted friends; the caller is the host, already in.
create function public.create_room(friends uuid[], planned_duration_s integer) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invitees uuid[];
  room uuid;
begin
  if not exists (select 1 from public.profiles where user_id = me and display_name is not null) then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct f), '{}') into invitees
  from unnest(coalesce(friends, '{}')) f
  where f is not null and f <> me;

  if cardinality(invitees) = 0 or planned_duration_s is null
     or planned_duration_s not between 60 and 10800 then
    raise exception 'invalid_room' using errcode = 'P0001';
  end if;
  if cardinality(invitees) > 3 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(invitees) f
    where not exists (
      select 1 from public.friendships fs
      where fs.status = 'accepted'
        and ((fs.requester = me and fs.addressee = f) or (fs.requester = f and fs.addressee = me))
    )
  ) then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;
  if public.together_busy(me) then
    raise exception 'already_in_room' using errcode = 'P0001';
  end if;

  insert into public.together_rooms (host, planned_duration_s)
  values (me, planned_duration_s)
  returning id into room;

  insert into public.together_members (room_id, user_id, state) values (room, me, 'joined');
  insert into public.together_members (room_id, user_id, state)
  select room, f, 'invited' from unnest(invitees) f;

  return room;
end;
$$;

-- Join or decline an invitation.
create function public.respond_room(room uuid, join_room boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.together_rooms;
begin
  select * into r from public.together_rooms where id = room for update;
  if not found or not exists (
    select 1 from public.together_members where room_id = room and user_id = me and state = 'invited'
  ) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if public.together_effective_status(r) <> 'lobby' then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if join_room and public.together_busy(me) then
    raise exception 'already_in_room' using errcode = 'P0001';
  end if;

  update public.together_members
  set state = case when join_room then 'joined' else 'declined' end
  where room_id = room and user_id = me;
  perform public.together_touch(room);
end;
$$;

-- The host starts the room: everyone joined counts down to the same end.
-- Anyone still only invited has missed it.
create function public.start_room(room uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.together_rooms;
begin
  select * into r from public.together_rooms where id = room for update;
  if not found or r.host <> me then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if public.together_effective_status(r) <> 'lobby' then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.together_members where room_id = room and user_id <> me and state = 'joined'
  ) then
    raise exception 'nobody_joined' using errcode = 'P0001';
  end if;

  update public.together_rooms
  set status = 'running',
      starts_at = now(),
      ends_at = now() + make_interval(secs => r.planned_duration_s)
  where id = room;
  update public.together_members set state = 'missed' where room_id = room and state = 'invited';
  perform public.together_touch(room);
end;
$$;

-- Before the start: an invitee leaves, or the host gives the room up.
create function public.leave_room(room uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.together_rooms;
begin
  select * into r from public.together_rooms where id = room for update;
  if not found or not exists (
    select 1 from public.together_members where room_id = room and user_id = me
  ) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if public.together_effective_status(r) <> 'lobby' then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  if r.host = me then
    update public.together_rooms
    set status = 'cancelled', cancelled_by = me, cancelled_at = now()
    where id = room;
  else
    update public.together_members set state = 'left' where room_id = room and user_id = me;
  end if;
  perform public.together_touch(room);
end;
$$;

-- A member deliberately ends a running room: it ends for everyone.
-- Idempotent, so a device retrying after a lost answer gets no error.
create function public.cancel_room(room uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.together_rooms;
begin
  select * into r from public.together_rooms where id = room for update;
  if not found or not exists (
    select 1 from public.together_members where room_id = room and user_id = me and state = 'joined'
  ) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if r.status = 'cancelled' then
    return;
  end if;
  if public.together_effective_status(r) <> 'running' then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;

  update public.together_rooms
  set status = 'cancelled', cancelled_by = me, cancelled_at = now()
  where id = room;
  perform public.together_touch(room);
end;
$$;

-- The caller's rooms from the last day, newest first, as the app shows them:
-- members by name, the effective status, and who cancelled.
create function public.my_rooms() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(room order by (room ->> 'created_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id,
      'host', r.host,
      'planned_duration_s', r.planned_duration_s,
      'status', public.together_effective_status(r),
      'created_at', r.created_at,
      'starts_at', r.starts_at,
      'ends_at', r.ends_at,
      'cancelled_by', r.cancelled_by,
      'cancelled_at', r.cancelled_at,
      'members', (
        select jsonb_agg(jsonb_build_object(
          'user_id', m.user_id,
          'display_name', p.display_name,
          'state', m.state
        ) order by m.user_id = r.host desc, p.display_name)
        from public.together_members m
        left join public.profiles p on p.user_id = m.user_id
        where m.room_id = r.id
      )
    ) as room
    from public.together_rooms r
    where r.created_at > now() - interval '1 day'
      and exists (
        select 1 from public.together_members m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
  ) rooms;
$$;

-- Rooms the caller finished together: never cancelled, over, and every joined
-- member has a completed session carrying the room's id. Read from sessions,
-- so it holds only once everyone's session has synced.
create function public.together_wins()
returns table (room_id uuid, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.ends_at
  from public.together_rooms r
  join public.together_members me
    on me.room_id = r.id and me.user_id = (select auth.uid()) and me.state = 'joined'
  where r.status = 'running'
    and r.ends_at <= now()
    and not exists (
      select 1 from public.together_members m
      where m.room_id = r.id and m.state = 'joined'
        and not exists (
          select 1 from public.sessions s
          where s.user_id = m.user_id and s.together_id = r.id and s.outcome = 'completed'
        )
    );
$$;

revoke execute on function
  public.create_room(uuid[], integer),
  public.respond_room(uuid, boolean),
  public.start_room(uuid),
  public.leave_room(uuid),
  public.cancel_room(uuid),
  public.my_rooms(),
  public.together_wins()
from public, anon;

grant execute on function
  public.create_room(uuid[], integer),
  public.respond_room(uuid, boolean),
  public.start_room(uuid),
  public.leave_room(uuid),
  public.cancel_room(uuid),
  public.my_rooms(),
  public.together_wins()
to authenticated;
