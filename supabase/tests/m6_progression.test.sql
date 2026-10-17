-- M6: the ledger's rules, and the new settings and session columns staying
-- compatible with 0.1.x apps. Run with `npx supabase test db`. One rolled-back
-- transaction, like the M5 suite (same fixture users; nothing persists).

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- --- fixtures (as superuser) ------------------------------------------------

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

-- --- A records Stardust -------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$ insert into public.ledger (id, reason, delta, ref, created_at)
     values ('11111111-0000-8000-8000-000000000001', 'session', 25, 's-1', '2026-10-20 10:00Z') $$,
  'A can add a row to their own ledger');

-- The same fact recorded again (another device, a retry) is the same id: one copy stays.
select lives_ok(
  $$ insert into public.ledger (id, reason, delta, ref, created_at)
     values ('11111111-0000-8000-8000-000000000001', 'session', 999, 's-1', '2026-10-21 10:00Z')
     on conflict (id) do nothing $$,
  'recording the same fact again is accepted');
select is((select count(*)::int from public.ledger), 1, 'and leaves exactly one row');
select is((select delta from public.ledger), 25, 'with the first amount, unchanged');

-- The server's own clock, not the client's created_at (which is days away).
select is((select abs(extract(epoch from server_updated_at - clock_timestamp())) < 60
           from public.ledger), true,
  'server_updated_at is stamped by the server');

select lives_ok(
  $$ insert into public.ledger (id, reason, delta, ref, created_at)
     values ('11111111-0000-8000-8000-000000000002', 'purchase', -300, 'style-rose', now()) $$,
  'spending is a negative row');
select is((select sum(delta)::int from public.ledger), -275, 'balance is the sum of the rows');

-- Append-only: nothing can change or remove a row.
select throws_ok($$ update public.ledger set delta = 100000 $$, '42501', null,
  'A cannot change a ledger row');
select throws_ok($$ delete from public.ledger $$, '42501', null,
  'A cannot delete a ledger row');

-- Bounds.
select throws_ok(
  $$ insert into public.ledger (id, reason, delta, created_at)
     values (gen_random_uuid(), 'session', 100001, now()) $$,
  '23514', null, 'an absurd amount is refused');
select throws_ok(
  $$ insert into public.ledger (id, reason, delta, created_at)
     values (gen_random_uuid(), '', 1, now()) $$,
  '23514', null, 'an empty reason is refused');
select throws_ok(
  $$ insert into public.ledger (id, reason, delta, created_at)
     values (gen_random_uuid(), repeat('r', 33), 1, now()) $$,
  '23514', null, 'an over-long reason is refused');
select throws_ok(
  $$ insert into public.ledger (id, reason, delta, ref, created_at)
     values (gen_random_uuid(), 'session', 1, repeat('x', 81), now()) $$,
  '23514', null, 'an over-long ref is refused');

-- --- sessions: star_style is optional ------------------------------------------

select lives_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'countdown', 60, 60,
             '2026-10-01 11:00Z', '2026-10-01 11:01Z', 'completed', 's', 'd', '2026-10-01 11:00Z') $$,
  'a session without star_style (every 0.1.x app) is still accepted');
select lives_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at,
       ended_at, outcome, seed, device, client_created_at, star_style)
     values (gen_random_uuid(), 'countdown', 60, 60,
             '2026-10-01 12:00Z', '2026-10-01 12:01Z', 'completed', 's', 'd', '2026-10-01 12:00Z',
             'style-rose') $$,
  'a session with a star_style is accepted');

-- --- settings: the new columns survive an older app's upsert --------------------

insert into public.user_settings (mode, pomodoro, updated_at, star_style, sky_theme, daily_goal_min)
  values ('pomodoro', '{"focus_s": 1500}', '2026-10-20 09:00Z', 'style-rose', 'theme-dusk', 90);

-- Exactly what a 0.1.x app sends: no new columns, a newer updated_at.
insert into public.user_settings (mode, pomodoro, updated_at)
  values ('countdown', '{"focus_s": 1800}', '2026-10-21 09:00Z')
  on conflict (user_id) do update set mode = excluded.mode, pomodoro = excluded.pomodoro,
    updated_at = excluded.updated_at;
select is((select mode from public.user_settings), 'countdown',
  'the older app''s newer edit wins');
select is((select star_style || ' ' || sky_theme || ' ' || daily_goal_min from public.user_settings),
  'style-rose theme-dusk 90', 'and leaves the style, theme and daily goal alone');

select throws_ok(
  $$ update public.user_settings set daily_goal_min = 2, updated_at = '2026-10-22Z' $$,
  '23514', null, 'a daily goal under 5 minutes is refused');
reset role;

-- --- isolation ---------------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.ledger), 0, 'B cannot see A''s ledger');
select throws_ok(
  $$ insert into public.ledger (id, user_id, reason, delta, created_at)
     values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'session', 500, now()) $$,
  '42501', null, 'B cannot add Stardust to A''s ledger');
reset role;

set local role anon;
select throws_ok($$ select * from public.ledger $$, '42501', null,
  'a signed-out visitor cannot read any ledger');
reset role;

select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'ledger'),
  'ledger changes are announced live');

-- --- delete account ------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'A can delete their account');
reset role;
select is((select count(*)::int from public.ledger
           where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0,
  'and their ledger goes with it');

select * from finish();
rollback;
