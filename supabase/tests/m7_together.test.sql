-- M7 phase 4: focus together. Run with `npx supabase test db`. One rolled-back
-- transaction with fixture users of its own (tg-*@test.local). Counts name the
-- fixture rooms and users only: the local database also holds the e2e runs'.
--
-- A is friends with B, C, F and G; D is a stranger; E has only asked A.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(46);

-- --- fixtures (as superuser) ------------------------------------------------

insert into public.invites (email)
select 'tg-' || x || '@test.local' from unnest(array['a','b','c','d','e','f','g']) x;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       'tg-' || x || '@test.local', now(), now()
from (values
  ('a', 'aaaaaaaa-9999-4000-8000-000000000001'::uuid),
  ('b', 'bbbbbbbb-9999-4000-8000-000000000002'::uuid),
  ('c', 'cccccccc-9999-4000-8000-000000000003'::uuid),
  ('d', 'dddddddd-9999-4000-8000-000000000004'::uuid),
  ('e', 'eeeeeeee-9999-4000-8000-000000000005'::uuid),
  ('f', 'ffffffff-9999-4000-8000-000000000006'::uuid),
  ('g', '99999999-9999-4000-8000-000000000007'::uuid)
) u(x, id);

update public.profiles set display_name = upper(substr(u.email, 4, 1))
from auth.users u
where u.id = profiles.user_id and u.email like 'tg-%@test.local' and u.email <> 'tg-c@test.local';

insert into public.friendships (requester, addressee, status, responded_at)
select 'aaaaaaaa-9999-4000-8000-000000000001', f, 'accepted', now()
from unnest(array['bbbbbbbb-9999-4000-8000-000000000002', 'cccccccc-9999-4000-8000-000000000003',
                  'ffffffff-9999-4000-8000-000000000006', '99999999-9999-4000-8000-000000000007']::uuid[]) f;
insert into public.friendships (requester, addressee, status) values
  ('eeeeeeee-9999-4000-8000-000000000005', 'aaaaaaaa-9999-4000-8000-000000000001', 'pending');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- --- 1.1 creating a room ----------------------------------------------------------

select pg_temp.act_as('cccccccc-9999-4000-8000-000000000003');
set local role authenticated;
select throws_ok(
  $$ select public.create_room(array['aaaaaaaa-9999-4000-8000-000000000001']::uuid[], 1500) $$,
  'P0001', 'display_name_required', '1.1 a room needs the host to have a name');
reset role;

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.create_room(array['dddddddd-9999-4000-8000-000000000004']::uuid[], 1500) $$,
  'P0001', 'not_friends', '1.1 a stranger can''t be invited');
select throws_ok(
  $$ select public.create_room(array['eeeeeeee-9999-4000-8000-000000000005']::uuid[], 1500) $$,
  'P0001', 'not_friends', '1.1 a pending friend can''t be invited');
select throws_ok(
  $$ select public.create_room(array['bbbbbbbb-9999-4000-8000-000000000002', 'cccccccc-9999-4000-8000-000000000003',
                                     'ffffffff-9999-4000-8000-000000000006', '99999999-9999-4000-8000-000000000007']::uuid[], 1500) $$,
  'P0001', 'too_many', '1.1 at most three friends');
select throws_ok($$ select public.create_room('{}'::uuid[], 1500) $$,
  'P0001', 'invalid_room', '1.1 at least one friend');
select throws_ok(
  $$ select public.create_room(array['bbbbbbbb-9999-4000-8000-000000000002']::uuid[], 30) $$,
  'P0001', 'invalid_room', '1.1 at least a minute');

select set_config('t.room1', public.create_room(
  array['bbbbbbbb-9999-4000-8000-000000000002', 'cccccccc-9999-4000-8000-000000000003',
        'ffffffff-9999-4000-8000-000000000006']::uuid[], 1500)::text, true);
select ok(current_setting('t.room1') <> '', 'A opens a room with B, C and F');
select throws_ok(
  $$ select public.create_room(array['99999999-9999-4000-8000-000000000007']::uuid[], 1500) $$,
  'P0001', 'already_in_room', '1.1 the host can''t open a second room while in one');
select is((select count(*)::int from public.together_members
           where room_id = current_setting('t.room1')::uuid), 1,
  'A reads only A''s own membership row');
select is((select state from public.together_members), 'joined', 'the host starts joined');
select throws_ok($$ select * from public.together_rooms $$, '42501', null,
  '1.5 nobody reads rooms directly');
reset role;

select is((select array_agg(state order by state) from public.together_members
           where room_id = current_setting('t.room1')::uuid),
  array['invited', 'invited', 'invited', 'joined'], 'the friends start invited');

-- --- 1.2 strangers and members ----------------------------------------------------------

select pg_temp.act_as('dddddddd-9999-4000-8000-000000000004');
set local role authenticated;
select is(jsonb_array_length(public.my_rooms()), 0, '1.2 a stranger sees no room');
select throws_ok($$ select public.respond_room(current_setting('t.room1')::uuid, true) $$,
  'P0001', 'room_not_found', '1.2 a stranger can''t join');
select throws_ok($$ select public.start_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'room_not_found', '1.2 a stranger can''t start');
select throws_ok($$ select public.cancel_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'room_not_found', '1.2 a stranger can''t cancel');
select is((select count(*)::int from public.together_members), 0,
  '1.5 a stranger reads no membership rows');
reset role;

select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select ok((select r ->> 'status' = 'lobby' and jsonb_array_length(r -> 'members') = 4
                  and (r -> 'members' -> 0 ->> 'display_name') = 'A'
           from jsonb_array_elements(public.my_rooms()) r),
  '1.2 B sees the room: a lobby of four, host first by name');
select throws_ok($$ select public.start_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'room_not_found', '1.3 only the host starts');

-- --- 1.3 joining and starting ----------------------------------------------------------------

reset role;
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.start_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'nobody_joined', '1.3 start needs someone to have joined');
reset role;

select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$ select public.respond_room(current_setting('t.room1')::uuid, true) $$, 'B joins');
reset role;
select pg_temp.act_as('ffffffff-9999-4000-8000-000000000006');
set local role authenticated;
select lives_ok($$ select public.respond_room(current_setting('t.room1')::uuid, false) $$, 'F declines');
reset role;

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.start_room(current_setting('t.room1')::uuid) $$, 'A starts');
select ok((select r ->> 'status' = 'running'
                  and (r ->> 'ends_at')::timestamptz - (r ->> 'starts_at')::timestamptz = interval '1500 seconds'
           from jsonb_array_elements(public.my_rooms()) r),
  '1.3 the room runs for exactly its planned length');
select throws_ok($$ select public.start_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'room_closed', '1.3 a running room can''t be started again');
reset role;

select is((select state from public.together_members
           where room_id = current_setting('t.room1')::uuid and user_id = 'cccccccc-9999-4000-8000-000000000003'),
  'missed', '1.3 C, still only invited at the start, has missed it');
select pg_temp.act_as('cccccccc-9999-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$ select public.respond_room(current_setting('t.room1')::uuid, true) $$,
  'P0001', 'room_not_found', '1.3 nobody joins after the start');
reset role;

-- --- cancelling: anyone's deliberate cancel ends it for everyone ----------------------------------

select pg_temp.act_as('ffffffff-9999-4000-8000-000000000006');
set local role authenticated;
select throws_ok($$ select public.cancel_room(current_setting('t.room1')::uuid) $$,
  'P0001', 'room_not_found', 'F, who declined, can''t cancel');
reset role;

select set_config('t.before_cancel', clock_timestamp()::text, true);
select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$ select public.cancel_room(current_setting('t.room1')::uuid) $$, 'B ends the session early');
select lives_ok($$ select public.cancel_room(current_setting('t.room1')::uuid) $$,
  'cancelling again (a retry) is fine');
reset role;
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select ok((select r ->> 'status' = 'cancelled'
                  and r ->> 'cancelled_by' = 'bbbbbbbb-9999-4000-8000-000000000002'
                  and (r ->> 'cancelled_at') is not null
           from jsonb_array_elements(public.my_rooms()) r),
  'A sees the room cancelled, by B, with the moment');
reset role;

-- --- the realtime signal: every change touches every member's row ------------------------------

select is((select count(*)::int from public.together_members
           where room_id = current_setting('t.room1')::uuid
             and updated_at > current_setting('t.before_cancel')::timestamptz), 4,
  'the cancel touched all four members'' rows, so every device hears it');

-- --- 1.4 a lobby lapses after ten minutes -------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select set_config('t.room2', public.create_room(
  array['99999999-9999-4000-8000-000000000007']::uuid[], 600)::text, true);
reset role;
update public.together_rooms set created_at = now() - interval '11 minutes'
where id = current_setting('t.room2')::uuid;

select pg_temp.act_as('99999999-9999-4000-8000-000000000007');
set local role authenticated;
select ok((select r ->> 'status' = 'lapsed' from jsonb_array_elements(public.my_rooms()) r),
  '1.4 an old lobby reads as lapsed');
select throws_ok($$ select public.respond_room(current_setting('t.room2')::uuid, true) $$,
  'P0001', 'room_closed', '1.4 a lapsed invitation can''t be joined');
reset role;
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.start_room(current_setting('t.room2')::uuid) $$,
  'P0001', 'room_closed', '1.4 a lapsed lobby can''t be started');

-- A lapsed lobby no longer holds the host: a new room opens.
select set_config('t.room3', public.create_room(
  array['bbbbbbbb-9999-4000-8000-000000000002']::uuid[], 300)::text, true);
select ok(current_setting('t.room3') <> '', 'a lapsed lobby frees the host for a new room');

-- The host can give a lobby up.
select lives_ok($$ select public.leave_room(current_setting('t.room3')::uuid) $$, 'A gives up the lobby');
select ok((select r ->> 'status' = 'cancelled' from jsonb_array_elements(public.my_rooms()) r
           where r ->> 'id' = current_setting('t.room3')),
  'giving up a lobby cancels it');
reset role;

-- --- 1.6 together_wins: only when every joined member completed --------------------------------

-- Room 4: A and B ran it to the end (moved into the past by hand).
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select set_config('t.room4', public.create_room(
  array['bbbbbbbb-9999-4000-8000-000000000002']::uuid[], 1500)::text, true);
reset role;
select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select public.respond_room(current_setting('t.room4')::uuid, true);
reset role;
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select public.start_room(current_setting('t.room4')::uuid);
reset role;
update public.together_rooms
set starts_at = now() - interval '40 minutes', ends_at = now() - interval '15 minutes'
where id = current_setting('t.room4')::uuid;

insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s, started_at,
    ended_at, outcome, seed, device, client_created_at, together_id)
values ('a9000000-0000-4000-8000-000000000001', 'aaaaaaaa-9999-4000-8000-000000000001',
        'countdown', 1500, 1500, now() - interval '40 minutes', now() - interval '15 minutes',
        'completed', 's', 'd', now() - interval '40 minutes', current_setting('t.room4')::uuid);

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.together_wins()
           where room_id = current_setting('t.room4')::uuid), 0,
  '1.6 no win while B''s session hasn''t arrived');
reset role;

insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s, started_at,
    ended_at, outcome, seed, device, client_created_at, together_id)
values ('b9000000-0000-4000-8000-000000000002', 'bbbbbbbb-9999-4000-8000-000000000002',
        'countdown', 1500, 1500, now() - interval '40 minutes', now() - interval '15 minutes',
        'completed', 's', 'd', now() - interval '40 minutes', current_setting('t.room4')::uuid);

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.together_wins()
           where room_id = current_setting('t.room4')::uuid), 1,
  '1.6 a win once every joined member completed');
reset role;
select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.together_wins()
           where room_id = current_setting('t.room4')::uuid), 1, '1.6 B has the same win');
reset role;
select pg_temp.act_as('cccccccc-9999-4000-8000-000000000003');
set local role authenticated;
select is((select count(*)::int from public.together_wins()), 0, '1.6 C, not in it, has none');
reset role;

-- Room 1 was cancelled: even completed sessions carrying its id win nothing.
insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s, started_at,
    ended_at, outcome, seed, device, client_created_at, together_id)
values ('a9000000-0000-4000-8000-000000000003', 'aaaaaaaa-9999-4000-8000-000000000001',
        'countdown', 60, 60, now() - interval '3 minutes', now() - interval '2 minutes',
        'completed', 's', 'd', now() - interval '3 minutes', current_setting('t.room1')::uuid);
select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.together_wins()
           where room_id = current_setting('t.room1')::uuid), 0,
  '1.6 a cancelled room is never a win');
reset role;

-- --- 1.5 signed out, and account deletion -----------------------------------------------------

set local role anon;
select throws_ok($$ select public.my_rooms() $$, '42501', null, '1.5 a signed-out visitor can''t list rooms');
select throws_ok($$ select * from public.together_members $$, '42501', null,
  '1.5 a signed-out visitor can''t read memberships');
reset role;

select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.together_members
           where user_id = 'bbbbbbbb-9999-4000-8000-000000000002'), 0,
  '1.5 deleting an account removes its memberships');

select * from finish();
rollback;
