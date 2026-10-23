-- M7 phase 1: profiles (a display name and a friend code per person),
-- friendships, and the one way a friend's sky leaves the server.
--
-- The rule that shapes everything here: no existing table gets a new policy.
-- The app's sync pulls every table with row-level security alone and no
-- user_id filter, so a "friends can read" policy would pour a friend's rows
-- into your own local store. Instead, friends' data is read only through
-- security definer functions that check the friendship first and return a
-- fixed, minimal set of fields.
--
-- * `profiles` rows are made by a trigger on sign-up (and backfilled below);
--   the owner can read theirs, and changes go through `set_display_name`.
--   The friend code is the server's: nobody can choose or change it.
-- * `friendships` has no grants and no policies at all: only the functions
--   below read or write it.
-- * Additive only (CLAUDE.md): released apps never touch these tables or
--   functions, so they keep working unchanged.
--
-- Errors are raised as P0001 with a stable code as the message
-- ('friend_code_not_found', ...), matched by the app as `not_invited` is.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 24),
  -- Six characters from an alphabet without look-alikes (no 0/O, 1/I/L).
  -- Stored bare; the app shows it as "K7Q-2MX".
  friend_code text not null unique check (friend_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

-- A fresh, unused code. Rejection sampling over random bytes keeps every
-- character equally likely (31 doesn't divide 256). Not callable by clients.
create function public.new_friend_code() returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  code text;
  b int;
  i int;
begin
  for attempt in 1..10 loop
    code := '';
    while char_length(code) < 6 loop
      bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        b := get_byte(bytes, i);
        -- 248 = 31 * 8: bytes at or above it would favour the first characters.
        if b < 248 and char_length(code) < 6 then
          code := code || substr(alphabet, (b % 31) + 1, 1);
        end if;
      end loop;
    end loop;
    if not exists (select 1 from public.profiles where friend_code = code) then
      return code;
    end if;
  end loop;
  raise exception 'friend_code_exhausted' using errcode = 'P0001';
end;
$$;

revoke execute on function public.new_friend_code() from public, anon, authenticated;

-- Every new account gets a profile. Runs after enforce_invite has let the
-- insert through, as its owner, since clients can't insert profiles.
create function public.create_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, friend_code) values (new.id, public.new_friend_code());
  return new;
end;
$$;

revoke execute on function public.create_profile() from public, anon, authenticated;

create trigger create_profile
  after insert on auth.users
  for each row execute function public.create_profile();

-- Accounts made before this migration. One row at a time, so each code is
-- checked against the ones just issued.
do $$
declare
  u record;
begin
  for u in select id from auth.users where id not in (select user_id from public.profiles) loop
    insert into public.profiles (user_id, friend_code) values (u.id, public.new_friend_code());
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendship_not_with_self check (requester <> addressee)
);

-- One row per pair, whichever way round it was asked.
create unique index friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on public.friendships (addressee);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

create function public.set_display_name(name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(coalesce(name, ''));
begin
  if clean = '' or char_length(clean) > 24 or clean ~ '[[:cntrl:]]' then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  update public.profiles set display_name = clean, updated_at = now()
  where user_id = (select auth.uid());
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Ask the owner of `code` to be friends. If they already asked the caller,
-- this accepts their request instead. Returns 'pending' or 'accepted'.
create function public.request_friend(code text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  them uuid;
  clean text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  existing public.friendships;
begin
  if not exists (select 1 from public.profiles where user_id = me and display_name is not null) then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;

  select user_id into them from public.profiles where friend_code = clean;
  if them is null then
    raise exception 'friend_code_not_found' using errcode = 'P0001';
  end if;
  if them = me then
    raise exception 'cannot_friend_self' using errcode = 'P0001';
  end if;

  select * into existing from public.friendships
  where least(requester, addressee) = least(me, them)
    and greatest(requester, addressee) = greatest(me, them)
  for update;

  if found then
    if existing.status = 'accepted' then
      raise exception 'already_friends' using errcode = 'P0001';
    end if;
    if existing.requester = me then
      raise exception 'request_already_sent' using errcode = 'P0001';
    end if;
    update public.friendships set status = 'accepted', responded_at = now() where id = existing.id;
    return 'accepted';
  end if;

  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 20 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  begin
    insert into public.friendships (requester, addressee) values (me, them);
  exception when unique_violation then
    -- The same pair asked at the same moment from another device.
    raise exception 'request_already_sent' using errcode = 'P0001';
  end;
  return 'pending';
end;
$$;

-- The addressee accepts or declines. Declining deletes the request, so it
-- can be asked again later.
create function public.respond_friend(request_id uuid, accept boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  perform 1 from public.friendships
  where id = request_id and addressee = me and status = 'pending'
  for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;

  if accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = request_id;
  else
    delete from public.friendships where id = request_id;
  end if;
end;
$$;

-- Either side ends a friendship, or withdraws or declines a request.
create function public.remove_friend(friendship_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  delete from public.friendships
  where id = friendship_id and (requester = me or addressee = me);
  if not found then
    raise exception 'friendship_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Everyone the caller is friends with or has a request with. direction is
-- null once accepted; last_focus_at is shown to accepted friends only.
create function public.my_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  display_name text,
  direction text,
  status text,
  since timestamptz,
  last_focus_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    o.id,
    p.display_name,
    case when f.status = 'accepted' then null
         when f.requester = (select auth.uid()) then 'outgoing'
         else 'incoming' end,
    f.status,
    coalesce(f.responded_at, f.created_at),
    case when f.status = 'accepted' then
      (select max(s.ended_at) from public.sessions s
       where s.user_id = o.id and s.outcome = 'completed')
    end
  from public.friendships f
  cross join lateral (
    select case when f.requester = (select auth.uid()) then f.addressee else f.requester end as id
  ) o
  left join public.profiles p on p.user_id = o.id
  where (select auth.uid()) in (f.requester, f.addressee)
  order by f.status, p.display_name nulls last;
$$;

-- A friend's sky: what the app needs to draw it and to show summary numbers,
-- and nothing else (no tags, devices, away time, Stardust or other settings).
-- Includes ended-early sessions, with their outcome: "focus this week" counts
-- their focus too, so leaving them out would disagree with the friend's own
-- Stats.
create function public.friend_sky(friend uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if friend is null or me is null or friend = me or not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = me and addressee = friend) or (requester = friend and addressee = me))
  ) then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'display_name', (select p.display_name from public.profiles p where p.user_id = friend),
    'sky_theme', (select u.sky_theme from public.user_settings u where u.user_id = friend),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'seed', s.seed,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'actual_focus_s', s.actual_focus_s,
        'outcome', s.outcome,
        'star_style', s.star_style
      ) order by s.ended_at, s.id)
      from public.sessions s where s.user_id = friend), '[]'::jsonb),
    'constellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'source', c.source,
        'shape_id', c.shape_id,
        'seed', c.seed,
        'tier', c.tier,
        'chosen_at', c.chosen_at
      ) order by c.chosen_at, c.id)
      from public.constellations c where c.user_id = friend), '[]'::jsonb)
  );
end;
$$;

revoke execute on function
  public.set_display_name(text),
  public.request_friend(text),
  public.respond_friend(uuid, boolean),
  public.remove_friend(uuid),
  public.my_friends(),
  public.friend_sky(uuid)
from public, anon;

grant execute on function
  public.set_display_name(text),
  public.request_friend(text),
  public.respond_friend(uuid, boolean),
  public.remove_friend(uuid),
  public.my_friends(),
  public.friend_sky(uuid)
to authenticated;
