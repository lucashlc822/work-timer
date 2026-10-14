-- M5: the server-side rules, exercised as two users A and B and a signed-out
-- visitor. Run with `npx supabase test db`. Everything happens inside one
-- transaction that is rolled back, so the database is left as it was.
--
-- Acting as a user: `set local role authenticated` plus the JWT claims that
-- auth.uid() reads. `reset role` returns to the test's superuser.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(41);

-- --- fixtures (as superuser) ------------------------------------------------
-- Addresses of their own, so the suite also runs on a local stack where the
-- acceptance-test accounts (a@test.local, b@test.local) already exist.

insert into public.invites (email) values ('rls-a@test.local'), ('rls-b@test.local');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'rls-a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'rls-b@test.local', now(), now());

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- --- invites ----------------------------------------------------------------

-- Case 3 (server half): an address that isn't invited cannot become a user.
select throws_ok(
  $$ insert into auth.users (instance_id, id, aud, role, email)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
             'authenticated', 'authenticated', 'stranger@test.local') $$,
  'P0001', 'not_invited', 'an uninvited email cannot sign up');

select lives_ok(
  $$ insert into auth.users (instance_id, id, aud, role, email)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
             'authenticated', 'authenticated', 'RLS-A@TEST.LOCAL') $$,
  'invites match case-insensitively');

-- Case 4: invites are invisible to every client role.
set local role anon;
select throws_ok($$ select * from public.invites $$, '42501', null,
  'a signed-out visitor cannot read invites');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select * from public.invites $$, '42501', null,
  'a signed-in user cannot read invites');
select throws_ok($$ insert into public.invites (email) values ('friend@test.local') $$,
  '42501', null, 'a signed-in user cannot invite anyone');

-- Case 4: app_config is readable by all, writable by none.
select is((select count(*)::int from public.app_config), 1,
  'a signed-in user can read the app config');
select throws_ok($$ update public.app_config set min_client_version = '0.0.0' $$,
  '42501', null, 'a signed-in user cannot change the app config');
reset role;

set local role anon;
select is((select count(*)::int from public.app_config), 1,
  'a signed-out visitor can read the app config');
select throws_ok($$ select * from public.sessions $$, '42501', null,
  'a signed-out visitor cannot read sessions');
reset role;

-- --- A writes their own rows -------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ insert into public.tags (id, name, color, created_at, updated_at)
     values ('11111111-0000-4000-8000-00000000000a', 'Writing', 'mint',
             '2026-10-01 09:00Z', '2026-10-01 09:00Z') $$,
  'A can add a tag');

select lives_ok(
  $$ insert into public.constellations (id, source, shape_id, seed, tier, chosen_at, client_created_at)
     values ('22222222-0000-4000-8000-00000000000a', 'catalogue', 'kite', null, 'easy',
             '2026-10-01 09:00Z', '2026-10-01 09:00Z') $$,
  'A can add a constellation choice');

select lives_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, away_ms, tag_id, seed, device, client_created_at, server_updated_at)
     values ('33333333-0000-4000-8000-00000000000a', 'countdown', 1500, 1500,
             '2026-10-01 09:00Z', '2026-10-01 09:25Z', 'completed', 0,
             '11111111-0000-4000-8000-00000000000a', 'seed-a', 'desktop/app',
             '2026-10-01 09:00Z', '2000-01-01Z') $$,
  'A can add a finished session with their own tag');

select ok(
  (select server_updated_at > '2020-01-01Z' from public.sessions
    where id = '33333333-0000-4000-8000-00000000000a'),
  'the server stamps server_updated_at, ignoring the client''s value');

-- Case 12 (server half): uploading the same session again is a no-op.
select lives_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at)
     values ('33333333-0000-4000-8000-00000000000a', 'countdown', 1500, 1500,
             '2026-10-01 09:00Z', '2026-10-01 09:25Z', 'completed', 'seed-a', 'desktop/app',
             '2026-10-01 09:00Z')
     on conflict (id) do nothing $$,
  're-uploading a session with on conflict do nothing succeeds');
select is((select count(*)::int from public.sessions), 1,
  '... and leaves exactly one copy');

-- --- finished sessions and choices are immutable ----------------------------

select throws_ok($$ update public.sessions set actual_focus_s = 1 $$, '42501', null,
  'A cannot edit their own finished session');
select throws_ok($$ delete from public.sessions $$, '42501', null,
  'A cannot delete their own session');
select throws_ok($$ update public.constellations set tier = 'hard' $$, '42501', null,
  'A cannot edit a constellation choice');
select throws_ok($$ delete from public.constellations $$, '42501', null,
  'A cannot delete a constellation choice');
select throws_ok($$ delete from public.tags $$, '42501', null,
  'A cannot delete a tag (tags are archived, never deleted)');

-- --- tags: last write wins ---------------------------------------------------

update public.tags set name = 'Stale', updated_at = '2026-09-30 09:00Z'
  where id = '11111111-0000-4000-8000-00000000000a';
select is((select name from public.tags where id = '11111111-0000-4000-8000-00000000000a'),
  'Writing', 'an older tag edit arriving late is ignored');

insert into public.tags (id, name, color, created_at, updated_at)
  values ('11111111-0000-4000-8000-00000000000a', 'Essays', 'rose',
          '2026-10-01 09:00Z', '2026-10-02 09:00Z')
  on conflict (id) do update set name = excluded.name, color = excluded.color,
    updated_at = excluded.updated_at, archived_at = excluded.archived_at;
select is((select name from public.tags where id = '11111111-0000-4000-8000-00000000000a'),
  'Essays', 'a newer tag edit, sent as an upsert, wins');

select throws_ok(
  $$ update public.tags set user_id = 'bbbbbbbb-0000-4000-8000-000000000002',
       updated_at = '2026-10-03 09:00Z' $$,
  '42501', null, 'a tag cannot be handed to another user');

-- --- plausibility and size limits --------------------------------------------

select throws_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'countdown', 1500, 3600,
             '2026-10-01 10:00Z', '2026-10-01 10:25Z', 'completed', 's', 'd', '2026-10-01 10:00Z') $$,
  '23514', null, 'a session cannot credit more focus than it spanned');

select throws_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'countdown', 60, 60,
             now() + interval '1 hour', now() + interval '1 hour 1 minute', 'completed', 's', 'd',
             now()) $$,
  '23514', null, 'a session cannot end in the future');

select throws_ok(
  $$ insert into public.tags (id, name, color, created_at, updated_at)
     values (gen_random_uuid(), repeat('x', 25), 'mint', now(), now()) $$,
  '23514', null, 'a tag name longer than 24 characters is refused');

select throws_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'meditation', 60, 60,
             '2026-10-01 11:00Z', '2026-10-01 11:01Z', 'completed', 's', 'd', '2026-10-01 11:00Z') $$,
  '23514', null, 'an unknown session mode is refused');

select lives_ok(
  $$ insert into public.user_settings (mode, pomodoro, updated_at)
     values ('pomodoro', '{"focusS": 1500}', '2026-10-01 09:00Z') $$,
  'A can save their settings');

-- Settings: last write wins, through the same upsert the app sends (M5 PR 3).
insert into public.user_settings (mode, pomodoro, updated_at)
  values ('countdown', '{"focus_s": 600}', '2026-09-30 09:00Z')
  on conflict (user_id) do update set mode = excluded.mode, pomodoro = excluded.pomodoro,
    updated_at = excluded.updated_at;
select is((select mode from public.user_settings), 'pomodoro',
  'older settings arriving late are ignored');

insert into public.user_settings (mode, pomodoro, updated_at)
  values ('countdown', '{"focus_s": 1800}', '2026-10-02 09:00Z')
  on conflict (user_id) do update set mode = excluded.mode, pomodoro = excluded.pomodoro,
    updated_at = excluded.updated_at;
select is((select mode from public.user_settings), 'countdown',
  'newer settings, sent as an upsert, win');
reset role;

-- --- B can see and touch none of A's data -------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
set local role authenticated;

select is((select count(*)::int from public.sessions), 0, 'B cannot see A''s sessions');
select is((select count(*)::int from public.tags), 0, 'B cannot see A''s tags');
select is((select count(*)::int from public.user_settings), 0, 'B cannot see A''s settings');

select throws_ok(
  $$ insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s,
       started_at, ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'countdown', 60, 60,
             '2026-10-01 12:00Z', '2026-10-01 12:01Z', 'completed', 's', 'd', '2026-10-01 12:00Z') $$,
  '42501', null, 'B cannot add a session as A');

select throws_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s,
       started_at, ended_at, outcome, tag_id, seed, device, client_created_at)
     values (gen_random_uuid(), 'countdown', 60, 60, '2026-10-01 12:00Z', '2026-10-01 12:01Z',
             'completed', '11111111-0000-4000-8000-00000000000a', 's', 'd', '2026-10-01 12:00Z') $$,
  '23503', null, 'B cannot tag a session with A''s tag');

update public.tags set name = 'Hijacked', updated_at = '2030-01-01Z';
update public.user_settings set mode = 'pomodoro', updated_at = '2030-01-01Z';
reset role;
select is((select name from public.tags where id = '11111111-0000-4000-8000-00000000000a'),
  'Essays', 'B''s update reaches none of A''s tags');
select is((select mode from public.user_settings
           where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'countdown', 'B''s update reaches none of A''s settings');

-- --- delete account ------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
set local role authenticated;
insert into public.tags (id, name, color, created_at, updated_at)
  values ('11111111-0000-4000-8000-00000000000b', 'Reading', 'mint', now(), now());
select lives_ok($$ select public.delete_my_account() $$, 'B can delete their own account');
reset role;

select is((select count(*)::int from auth.users where email = 'rls-b@test.local'), 0,
  'B''s user is gone');
select is((select count(*)::int from public.tags where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 0,
  'B''s rows are gone with it');
select is((select count(*)::int from public.sessions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1,
  'A''s rows are untouched');

select * from finish();
rollback;
