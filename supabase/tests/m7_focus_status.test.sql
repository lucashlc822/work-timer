-- M7 phase 3: "Focusing now". Run with `npx supabase test db`. One rolled-back
-- transaction with fixture users of its own (fs-*@test.local).
--
-- A and B are friends; C is a stranger; D has only asked A (pending).
-- Counts name A's row: the local stack may hold other users' statuses (the
-- e2e tests leave theirs behind), and those must not change the answer.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- --- fixtures (as superuser) ------------------------------------------------

insert into public.invites (email) values
  ('fs-a@test.local'), ('fs-b@test.local'), ('fs-c@test.local'), ('fs-d@test.local');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-8888-4000-8000-000000000001',
   'authenticated', 'authenticated', 'fs-a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-8888-4000-8000-000000000002',
   'authenticated', 'authenticated', 'fs-b@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-4000-8000-000000000003',
   'authenticated', 'authenticated', 'fs-c@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-8888-4000-8000-000000000004',
   'authenticated', 'authenticated', 'fs-d@test.local', now(), now());

insert into public.friendships (requester, addressee, status, responded_at) values
  ('aaaaaaaa-8888-4000-8000-000000000001', 'bbbbbbbb-8888-4000-8000-000000000002', 'accepted', now()),
  ('dddddddd-8888-4000-8000-000000000004', 'aaaaaaaa-8888-4000-8000-000000000001', 'pending', null);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.seen_by(uid uuid) returns int language sql as $$
  select count(*)::int from public.friends_focus();
$$;

-- --- A shares a focus block ----------------------------------------------------

select pg_temp.act_as('aaaaaaaa-8888-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$ select public.set_focus_status('focus', now() - interval '5 minutes', now() + interval '20 minutes') $$,
  'A shares a focus block');
select lives_ok(
  $$ select public.set_focus_status('break', now(), now() + interval '5 minutes') $$,
  'A moves on to a break (the same row, overwritten)');
reset role;
select is((select count(*)::int from public.focus_status where user_id = 'aaaaaaaa-8888-4000-8000-000000000001'), 1, 'one row per person');
select is((select kind from public.focus_status where user_id = 'aaaaaaaa-8888-4000-8000-000000000001'), 'break', 'holding the latest status');

-- --- 1.1 who sees it -----------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-8888-4000-8000-000000000002');
set local role authenticated;
select ok((select friend_id = 'aaaaaaaa-8888-4000-8000-000000000001' and kind = 'break'
           and until > now() from public.friends_focus()),
  '1.1 B, a friend, sees A on a break');
reset role;

select pg_temp.act_as('cccccccc-8888-4000-8000-000000000003');
set local role authenticated;
select is((select count(*)::int from public.friends_focus()), 0, '1.1 C, a stranger, sees nothing');
select throws_ok($$ select * from public.focus_status $$, '42501', null,
  '1.5 C cannot read the table directly');
select throws_ok(
  $$ insert into public.focus_status (user_id, kind, started_at, until)
     values ('aaaaaaaa-8888-4000-8000-000000000001', 'focus', now(), now() + interval '1 hour') $$,
  '42501', null, '1.5 C cannot write anyone''s status directly');
reset role;

select pg_temp.act_as('dddddddd-8888-4000-8000-000000000004');
set local role authenticated;
select is((select count(*)::int from public.friends_focus()), 0,
  '1.1 D, with only a pending request, sees nothing');
reset role;

-- --- 1.4 implausible statuses -----------------------------------------------------

select pg_temp.act_as('aaaaaaaa-8888-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.set_focus_status('nap', now(), now() + interval '5 minutes') $$,
  'P0001', 'invalid_focus_status', '1.4 an unknown kind is refused');
select throws_ok($$ select public.set_focus_status('focus', now(), now() - interval '1 second') $$,
  'P0001', 'invalid_focus_status', '1.4 an end before the start is refused');
select throws_ok(
  $$ select public.set_focus_status('focus', now() - interval '30 minutes', now() - interval '2 minutes') $$,
  'P0001', 'invalid_focus_status', '1.4 a status already over is refused');
select throws_ok($$ select public.set_focus_status('focus', now(), now() + interval '26 hours') $$,
  'P0001', 'invalid_focus_status', '1.4 a status claiming a day ahead is refused');
reset role;

-- --- 1.2 an expired status reads as nothing ------------------------------------------

update public.focus_status set started_at = now() - interval '30 minutes', until = now() - interval '1 second'
where user_id = 'aaaaaaaa-8888-4000-8000-000000000001';
select pg_temp.act_as('bbbbbbbb-8888-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.friends_focus()), 0,
  '1.2 once its planned end has passed, B no longer sees it');
reset role;

-- --- 1.3 clearing, and the friendship ending -------------------------------------------

select pg_temp.act_as('aaaaaaaa-8888-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$ select public.set_focus_status('focus', now(), now() + interval '25 minutes') $$,
  'A starts again');
select lives_ok($$ select public.clear_focus_status() $$, 'A stops');
select lives_ok($$ select public.clear_focus_status() $$, 'stopping twice is fine');
reset role;
select is((select count(*)::int from public.focus_status where user_id = 'aaaaaaaa-8888-4000-8000-000000000001'), 0, '1.3 clearing removes the row');

select pg_temp.act_as('aaaaaaaa-8888-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$ select public.set_focus_status('focus', now(), now() + interval '25 minutes') $$,
  'A starts once more');
reset role;
delete from public.friendships
where requester = 'aaaaaaaa-8888-4000-8000-000000000001' and addressee = 'bbbbbbbb-8888-4000-8000-000000000002';
select pg_temp.act_as('bbbbbbbb-8888-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.friends_focus()), 0,
  '1.3 after the friendship ends, B sees nothing');
reset role;

-- --- 1.5 signed out, and account deletion ----------------------------------------------

set local role anon;
select throws_ok($$ select * from public.friends_focus() $$, '42501', null,
  '1.5 a signed-out visitor cannot ask who is focusing');
reset role;

select pg_temp.act_as('aaaaaaaa-8888-4000-8000-000000000001');
set local role authenticated;
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.focus_status where user_id = 'aaaaaaaa-8888-4000-8000-000000000001'), 0,
  '1.5 deleting an account removes its status');

select * from finish();
rollback;
