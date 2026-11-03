-- M7 presence: Online / Away. Run with `npx supabase test db`. One rolled-back
-- transaction with fixture users of its own (fp-*@test.local).
--
-- A and B are friends; C is a stranger; D has only asked A (pending).
-- Counts name A's row: the local stack may hold other users' presence (the
-- e2e tests leave theirs behind), and those must not change the answer.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- --- fixtures (as superuser) ------------------------------------------------

insert into public.invites (email) values
  ('fp-a@test.local'), ('fp-b@test.local'), ('fp-c@test.local'), ('fp-d@test.local');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-9999-4000-8000-000000000001',
   'authenticated', 'authenticated', 'fp-a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-9999-4000-8000-000000000002',
   'authenticated', 'authenticated', 'fp-b@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-9999-4000-8000-000000000003',
   'authenticated', 'authenticated', 'fp-c@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-9999-4000-8000-000000000004',
   'authenticated', 'authenticated', 'fp-d@test.local', now(), now());

insert into public.friendships (requester, addressee, status, responded_at) values
  ('aaaaaaaa-9999-4000-8000-000000000001', 'bbbbbbbb-9999-4000-8000-000000000002', 'accepted', now()),
  ('dddddddd-9999-4000-8000-000000000004', 'aaaaaaaa-9999-4000-8000-000000000001', 'pending', null);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.a_rows() returns int language sql as $$
  select count(*)::int from public.presence where user_id = 'aaaaaaaa-9999-4000-8000-000000000001';
$$;

-- --- 2.1 on by default; A says they're here -------------------------------------

select is((select share_online from public.profiles where user_id = 'aaaaaaaa-9999-4000-8000-000000000001'),
  true, '2.1 a new profile shares being online');

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select is((select share_online from public.profiles), true, '2.1 A can read their own setting');
select lives_ok($$ select public.set_presence('online') $$, 'A is online');
select lives_ok($$ select public.set_presence('away') $$, 'A steps away (the same row, overwritten)');
reset role;
select is(pg_temp.a_rows(), 1, 'one row per person');
select is((select state from public.presence where user_id = 'aaaaaaaa-9999-4000-8000-000000000001'),
  'away', 'holding the latest state');

-- --- 2.2 who sees it -----------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select ok((select friend_id = 'aaaaaaaa-9999-4000-8000-000000000001' and state = 'away'
           from public.friends_presence()),
  '2.2 B, a friend, sees A away');
reset role;

select pg_temp.act_as('cccccccc-9999-4000-8000-000000000003');
set local role authenticated;
select is((select count(*)::int from public.friends_presence()), 0, '2.2 C, a stranger, sees nothing');
select throws_ok($$ select * from public.presence $$, '42501', null,
  '2.2 C cannot read the table directly');
select throws_ok(
  $$ insert into public.presence (user_id, state) values ('aaaaaaaa-9999-4000-8000-000000000001', 'online') $$,
  '42501', null, '2.2 C cannot write anyone''s presence directly');
reset role;

select pg_temp.act_as('dddddddd-9999-4000-8000-000000000004');
set local role authenticated;
select is((select count(*)::int from public.friends_presence()), 0,
  '2.2 D, with only a pending request, sees nothing');
reset role;

-- --- 2.3 refusals ------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.set_presence('busy') $$,
  'P0001', 'invalid_presence', '2.3 an unknown state is refused');
select throws_ok($$ select public.set_presence(null) $$,
  'P0001', 'invalid_presence', '2.3 no state is refused');
select throws_ok($$ select public.set_share_online(null) $$,
  'P0001', 'invalid_share_online', '2.3 no setting is refused');
select throws_ok($$ update public.profiles set share_online = false $$,
  '42501', null, '2.3 the setting changes only through set_share_online');
reset role;

-- --- 2.4 a row not refreshed for three minutes reads as nothing ------------------------

update public.presence set seen_at = now() - interval '3 minutes 1 second'
where user_id = 'aaaaaaaa-9999-4000-8000-000000000001';
select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.friends_presence()), 0,
  '2.4 once stale, B no longer sees A');
reset role;

-- --- 2.5 opting out ---------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.set_presence('online') $$, 'A is back');
select lives_ok($$ select public.set_share_online(false) $$, 'A turns sharing off');
reset role;
select is(pg_temp.a_rows(), 0, '2.5 turning it off forgets the row at once');

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.set_presence('online') $$,
  '2.5 a device that hasn''t noticed can still send, without an error');
reset role;
select is(pg_temp.a_rows(), 0, '2.5 but nothing is written while it is off');

-- A row left behind by any path (inserted here as superuser) is still hidden.
insert into public.presence (user_id, state) values ('aaaaaaaa-9999-4000-8000-000000000001', 'online');
select pg_temp.act_as('bbbbbbbb-9999-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.friends_presence()), 0,
  '2.5 B sees nothing of A while A has opted out');
reset role;

-- --- 2.6 signed out, and account deletion ---------------------------------------------

set local role anon;
select throws_ok($$ select * from public.friends_presence() $$, '42501', null,
  '2.6 a signed-out visitor cannot ask who is online');
reset role;

select pg_temp.act_as('aaaaaaaa-9999-4000-8000-000000000001');
set local role authenticated;
select public.delete_my_account();
reset role;
select is(pg_temp.a_rows(), 0, '2.6 deleting an account removes its presence');

select * from finish();
rollback;
