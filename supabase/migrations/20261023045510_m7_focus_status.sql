-- M7 phase 3: "Focusing now" — whether a person is in a focus block or on a
-- Pomodoro break right now, for their friends' list.
--
-- Same stance as phase 1 (20261023030027_m7_friends.sql): the table has no
-- grants and no policies, and three security definer functions are the only
-- way in. A friend reads only accepted friends' rows, and only while current.
--
-- * One row per person, overwritten as their status changes and deleted when
--   they stop. Not history: nothing else reads it.
-- * `until` is the planned end. A row whose `until` has passed reads as
--   nothing, so an app that was quit or crashed mid-session stops showing as
--   focusing at the session's own end — the same moment the session itself
--   ends, since sessions run on wall-clock time.
-- * Additive: released apps (0.2.x, 0.3.0) never touch it.

create table public.focus_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind text not null check (kind in ('focus', 'break')),
  started_at timestamptz not null,
  until timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint focus_status_until_after_start check (until > started_at)
);

alter table public.focus_status enable row level security;
revoke all on public.focus_status from anon, authenticated;

-- Share what you're doing now. Refuses anything implausible: an unknown kind,
-- an end before the start, a status already over, or one claiming a day ahead.
create function public.set_focus_status(kind text, started_at timestamptz, until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if kind is null or kind not in ('focus', 'break')
     or started_at is null or until is null
     or until <= started_at
     or until < now() - interval '1 minute'
     or until > now() + interval '25 hours' then
    raise exception 'invalid_focus_status' using errcode = 'P0001';
  end if;

  insert into public.focus_status (user_id, kind, started_at, until, updated_at)
  values ((select auth.uid()), kind, started_at, until, now())
  on conflict (user_id) do update
    set kind = excluded.kind,
        started_at = excluded.started_at,
        until = excluded.until,
        updated_at = excluded.updated_at;
end;
$$;

-- Stop sharing: idle again. Nothing to clear is not an error.
create function public.clear_focus_status() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.focus_status where user_id = (select auth.uid());
$$;

-- Your accepted friends who are focusing or on a break right now.
create function public.friends_focus()
returns table (friend_id uuid, kind text, started_at timestamptz, until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, s.kind, s.started_at, s.until
  from public.friendships f
  join public.focus_status s
    on s.user_id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  where f.status = 'accepted'
    and (select auth.uid()) in (f.requester, f.addressee)
    and s.until > now();
$$;

revoke execute on function
  public.set_focus_status(text, timestamptz, timestamptz),
  public.clear_focus_status(),
  public.friends_focus()
from public, anon;

grant execute on function
  public.set_focus_status(text, timestamptz, timestamptz),
  public.clear_focus_status(),
  public.friends_focus()
to authenticated;
