-- M7 presence: whether a person has the app open (Online) or open but out of
-- sight or untouched (Away), for their friends' list. Focusing / On a break
-- stays in `focus_status` and wins over this in the app.
--
-- Same stance as `focus_status` (20261023045510_m7_focus_status.sql): the
-- table has no grants and no policies, and security definer functions are the
-- only way in. A friend reads only accepted friends' rows, and only while
-- fresh.
--
-- * One row per person, refreshed about once a minute by every open app and
--   deleted when the app closes (best effort). A row not refreshed for three
--   minutes reads as nothing, so a crashed or offline app goes Offline on its
--   own. Not history: nothing else reads it.
-- * On by default, with an opt-out: `profiles.share_online`. Turning it off
--   deletes the row at once, and `set_presence` writes nothing while it is
--   off, so a second device that hasn't noticed yet can't put it back.
-- * Additive: released apps (0.6.x and older) never touch it, and their people
--   read as Offline unless focusing — exactly what they showed before.

alter table public.profiles add column share_online boolean not null default true;

create table public.presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null check (state in ('online', 'away')),
  seen_at timestamptz not null default now()
);

alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;

-- "I'm here" (or "here but away"). Nothing is written while the caller has
-- turned sharing off.
create function public.set_presence(state text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if state is null or state not in ('online', 'away') then
    raise exception 'invalid_presence' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.share_online
  ) then
    return;
  end if;

  insert into public.presence (user_id, state, seen_at)
  values ((select auth.uid()), state, now())
  on conflict (user_id) do update
    set state = excluded.state,
        seen_at = excluded.seen_at;
end;
$$;

-- The app is closing. Nothing to clear is not an error.
create function public.clear_presence() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.presence where user_id = (select auth.uid());
$$;

-- "Show when I'm online". Off also forgets the current row, so friends see
-- Offline on their next read rather than three minutes later.
create function public.set_share_online(share boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if share is null then
    raise exception 'invalid_share_online' using errcode = 'P0001';
  end if;
  update public.profiles set share_online = share, updated_at = now()
  where user_id = (select auth.uid());
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  if not share then
    delete from public.presence where user_id = (select auth.uid());
  end if;
end;
$$;

-- Your accepted friends who have the app open right now, and whether they're
-- away. `share_online` is checked again here, so a row left behind by any
-- path is never shown once someone has opted out.
create function public.friends_presence()
returns table (friend_id uuid, state text, seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, s.state, s.seen_at
  from public.friendships f
  join public.presence s
    on s.user_id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  join public.profiles p on p.user_id = s.user_id
  where f.status = 'accepted'
    and (select auth.uid()) in (f.requester, f.addressee)
    and p.share_online
    and s.seen_at > now() - interval '3 minutes';
$$;

revoke execute on function
  public.set_presence(text),
  public.clear_presence(),
  public.set_share_online(boolean),
  public.friends_presence()
from public, anon;

grant execute on function
  public.set_presence(text),
  public.clear_presence(),
  public.set_share_online(boolean),
  public.friends_presence()
to authenticated;
