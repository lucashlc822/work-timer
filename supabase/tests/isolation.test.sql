-- Isolation: no signed-in user can read or change another user's rows, and a
-- new table or function can't ship without the same protection. Run with
-- `npx supabase test db`. One transaction, rolled back.
--
-- Two halves:
--   * Catalogue guards read the schema itself (RLS flags, grants, policies,
--     security definer functions, the Realtime publication). They fail when a
--     future migration adds something unprotected, before any row exists.
--   * The matrix acts as user B against user A's row in every user table and
--     tries each way in: read, insert as A, update, delete, upsert onto A's id,
--     moving B's own row to A, signed-out reads, and deleting B's account.
--
-- If a guard fails because a change is intentional (a new table, a new
-- shared table, a new function), update the expected set here in the same PR
-- and say why in its description.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(50);

-- --- catalogue guards ----------------------------------------------------------

select is_empty(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row-level security on');

-- Tables that aren't owned per user are a deliberate, short list. A new one
-- must be added here on purpose.
select set_eq(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) $$,
  array['app_config', 'invites'],
  'the only public tables without a user_id are app_config and invites');

select set_eq(
  $$ select c.relname || ':' || p.priv
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and has_table_privilege('anon', c.oid, p.priv) $$,
  array['app_config:SELECT'],
  'signed-out visitors can only read app_config');

select set_eq(
  $$ select c.relname || ':' || p.priv
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and has_table_privilege('authenticated', c.oid, p.priv) $$,
  array['app_config:SELECT',
        'tags:SELECT', 'tags:INSERT', 'tags:UPDATE',
        'constellations:SELECT', 'constellations:INSERT',
        'sessions:SELECT', 'sessions:INSERT',
        'user_settings:SELECT', 'user_settings:INSERT', 'user_settings:UPDATE',
        'ledger:SELECT', 'ledger:INSERT'],
  'signed-in users have exactly the expected grants: no delete anywhere, update only on tags and settings');

-- Every policy on a per-user table is for signed-in users only and compares
-- the owner to auth.uid() on each side that applies (USING for reads and
-- updates, WITH CHECK for inserts and updates).
select is_empty(
  $$ select p.tablename || '.' || p.policyname from pg_policies p
     where p.schemaname = 'public'
       and p.tablename not in ('app_config', 'invites')
       and (p.roles <> array['authenticated']::name[]
            or (p.cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL')
                and coalesce(p.qual, '') not in ('(( SELECT auth.uid() AS uid) = user_id)', '(auth.uid() = user_id)'))
            or (p.cmd in ('INSERT', 'UPDATE', 'ALL')
                and coalesce(p.with_check, '') not in ('(( SELECT auth.uid() AS uid) = user_id)', '(auth.uid() = user_id)'))) $$,
  'every policy on a per-user table is for signed-in users and matches the owner to auth.uid()');

select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef $$,
  array['delete_my_account', 'enforce_invite'],
  'the only security definer functions in public are delete_my_account and enforce_invite');

select is_empty(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') $$,
  'signed-out visitors cannot run any security definer function');

select ok(not has_function_privilege('authenticated', 'public.enforce_invite()', 'execute'),
  'signed-in users cannot run enforce_invite directly');

select set_eq(
  $$ select schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime' $$,
  array['public.tags', 'public.constellations', 'public.sessions', 'public.user_settings', 'public.ledger'],
  'live updates publish exactly the five per-user tables');

select is_empty(
  $$ select pt.schemaname || '.' || pt.tablename from pg_publication_tables pt
     join pg_namespace n on n.nspname = pt.schemaname
     join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename
     where pt.pubname = 'supabase_realtime' and not c.relrowsecurity $$,
  'every table published to live updates has row-level security on');

-- --- fixtures (as superuser) ----------------------------------------------------
-- Addresses and ids of their own, so this file never collides with the other
-- suites or with the acceptance-test accounts on a local stack.

insert into public.invites (email) values ('iso-a@test.local'), ('iso-b@test.local');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-1111-4000-8000-000000000001',
   'authenticated', 'authenticated', 'iso-a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-1111-4000-8000-000000000002',
   'authenticated', 'authenticated', 'iso-b@test.local', now(), now());

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- One row per table for each of A (the target) and B (the attacker's own).
insert into public.tags (id, user_id, name, color, created_at, updated_at) values
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-1111-4000-8000-000000000001',
   'A tag', 'rose', '2026-10-01 12:00Z', '2026-10-01 12:00Z'),
  ('b0000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-1111-4000-8000-000000000002',
   'B tag', 'sky', '2026-10-01 12:00Z', '2026-10-01 12:00Z');

insert into public.constellations (id, user_id, source, shape_id, tier, chosen_at, client_created_at) values
  ('a0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-1111-4000-8000-000000000001',
   'catalogue', 'the-fox', 'easy', '2026-10-01 12:00Z', '2026-10-01 12:00Z'),
  ('b0000000-0000-4000-8000-0000000000b2', 'bbbbbbbb-1111-4000-8000-000000000002',
   'catalogue', 'the-owl', 'easy', '2026-10-01 12:00Z', '2026-10-01 12:00Z');

insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s,
    started_at, ended_at, outcome, seed, device, client_created_at) values
  ('a0000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-1111-4000-8000-000000000001',
   'countdown', 60, 60, '2026-10-01 12:00Z', '2026-10-01 12:01Z', 'completed', 'sa', 'd', '2026-10-01 12:00Z'),
  ('b0000000-0000-4000-8000-0000000000b3', 'bbbbbbbb-1111-4000-8000-000000000002',
   'countdown', 60, 60, '2026-10-01 12:00Z', '2026-10-01 12:01Z', 'completed', 'sb', 'd', '2026-10-01 12:00Z');

insert into public.user_settings (user_id, mode, pomodoro, updated_at) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'countdown', '{}', '2026-10-01 12:00Z'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'countdown', '{}', '2026-10-01 12:00Z');

insert into public.ledger (id, user_id, reason, delta, ref, created_at) values
  ('a0000000-0000-4000-8000-0000000000a5', 'aaaaaaaa-1111-4000-8000-000000000001',
   'session', 25, 'a', '2026-10-01 12:01Z'),
  ('b0000000-0000-4000-8000-0000000000b5', 'bbbbbbbb-1111-4000-8000-000000000002',
   'session', 25, 'b', '2026-10-01 12:01Z');

-- A fingerprint of every one of A's rows. Compared after B's attempts and
-- after B deletes their account: any change at all to A's data shows here.
create function pg_temp.a_rows() returns table (tbl text, h text) language sql as $$
  select 'tags', md5(t::text) from public.tags t where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
  union all
  select 'constellations', md5(c::text) from public.constellations c where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
  union all
  select 'sessions', md5(s::text) from public.sessions s where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
  union all
  select 'user_settings', md5(u::text) from public.user_settings u where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
  union all
  select 'ledger', md5(l::text) from public.ledger l where user_id = 'aaaaaaaa-1111-4000-8000-000000000001';
$$;

create temp table a_before as select * from pg_temp.a_rows();

-- --- B against A's rows -----------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-1111-4000-8000-000000000002');
set local role authenticated;

-- Read
select is((select count(*)::int from public.tags where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
           or id = 'a0000000-0000-4000-8000-0000000000a1'), 0, 'B cannot read A''s tags');
select is((select count(*)::int from public.constellations where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
           or id = 'a0000000-0000-4000-8000-0000000000a2'), 0, 'B cannot read A''s constellations');
select is((select count(*)::int from public.sessions where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
           or id = 'a0000000-0000-4000-8000-0000000000a3'), 0, 'B cannot read A''s sessions');
select is((select count(*)::int from public.user_settings where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'),
  0, 'B cannot read A''s settings');
select is((select count(*)::int from public.ledger where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'
           or id = 'a0000000-0000-4000-8000-0000000000a5'), 0, 'B cannot read A''s ledger');

-- Insert a row owned by A
select throws_ok(
  $$ insert into public.tags (id, user_id, name, color, created_at, updated_at)
     values (gen_random_uuid(), 'aaaaaaaa-1111-4000-8000-000000000001', 'x', 'x', now(), now()) $$,
  '42501', null, 'B cannot add a tag as A');
select throws_ok(
  $$ insert into public.constellations (id, user_id, source, tier, chosen_at, client_created_at)
     values (gen_random_uuid(), 'aaaaaaaa-1111-4000-8000-000000000001', 'generated', 'easy', now(), now()) $$,
  '42501', null, 'B cannot add a constellation as A');
select throws_ok(
  $$ insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s,
       started_at, ended_at, outcome, seed, device, client_created_at)
     values (gen_random_uuid(), 'aaaaaaaa-1111-4000-8000-000000000001', 'countdown', 60, 60,
             '2026-10-02 12:00Z', '2026-10-02 12:01Z', 'completed', 's', 'd', '2026-10-02 12:00Z') $$,
  '42501', null, 'B cannot add a session as A');
select throws_ok(
  $$ insert into public.user_settings (user_id, mode, pomodoro, updated_at)
     values ('aaaaaaaa-1111-4000-8000-000000000001', 'pomodoro', '{}', now()) $$,
  '42501', null, 'B cannot add settings as A');
select throws_ok(
  $$ insert into public.ledger (id, user_id, reason, delta, created_at)
     values (gen_random_uuid(), 'aaaaaaaa-1111-4000-8000-000000000001', 'purchase', -100000, now()) $$,
  '42501', null, 'B cannot add a ledger row as A');

-- Update A's row. Tags and settings allow updates, so RLS must reach 0 rows;
-- the other tables refuse updates outright. A's rows are compared afterwards.
select lives_ok(
  $$ update public.tags set name = 'Hijacked', updated_at = '2030-01-01Z'
     where id = 'a0000000-0000-4000-8000-0000000000a1' $$,
  'B''s update of A''s tag runs but reaches no row');
select throws_ok(
  $$ update public.constellations set tier = 'hard' where id = 'a0000000-0000-4000-8000-0000000000a2' $$,
  '42501', null, 'B cannot update A''s constellation');
select throws_ok(
  $$ update public.sessions set actual_focus_s = 1 where id = 'a0000000-0000-4000-8000-0000000000a3' $$,
  '42501', null, 'B cannot update A''s session');
select lives_ok(
  $$ update public.user_settings set mode = 'pomodoro', updated_at = '2030-01-01Z'
     where user_id = 'aaaaaaaa-1111-4000-8000-000000000001' $$,
  'B''s update of A''s settings runs but reaches no row');
select throws_ok(
  $$ update public.ledger set delta = 100000 where id = 'a0000000-0000-4000-8000-0000000000a5' $$,
  '42501', null, 'B cannot update A''s ledger row');

-- Delete A's row
select throws_ok($$ delete from public.tags where id = 'a0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'B cannot delete A''s tag');
select throws_ok($$ delete from public.constellations where id = 'a0000000-0000-4000-8000-0000000000a2' $$,
  '42501', null, 'B cannot delete A''s constellation');
select throws_ok($$ delete from public.sessions where id = 'a0000000-0000-4000-8000-0000000000a3' $$,
  '42501', null, 'B cannot delete A''s session');
select throws_ok($$ delete from public.user_settings where user_id = 'aaaaaaaa-1111-4000-8000-000000000001' $$,
  '42501', null, 'B cannot delete A''s settings');
select throws_ok($$ delete from public.ledger where id = 'a0000000-0000-4000-8000-0000000000a5' $$,
  '42501', null, 'B cannot delete A''s ledger row');

-- Upsert onto A's id, as B's own row: the conflict lands on A's row, which B
-- may neither see nor update.
select throws_ok(
  $$ insert into public.tags (id, name, color, created_at, updated_at)
     values ('a0000000-0000-4000-8000-0000000000a1', 'Hijacked', 'x', now(), '2030-01-01Z')
     on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at $$,
  '42501', null, 'B cannot upsert over A''s tag');
select throws_ok(
  $$ insert into public.constellations (id, source, tier, chosen_at, client_created_at)
     values ('a0000000-0000-4000-8000-0000000000a2', 'generated', 'hard', now(), now())
     on conflict (id) do update set tier = excluded.tier $$,
  '42501', null, 'B cannot upsert over A''s constellation');
select throws_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s,
       started_at, ended_at, outcome, seed, device, client_created_at)
     values ('a0000000-0000-4000-8000-0000000000a3', 'countdown', 60, 1,
             '2026-10-02 12:00Z', '2026-10-02 12:01Z', 'cancelled', 's', 'd', '2026-10-02 12:00Z')
     on conflict (id) do update set actual_focus_s = excluded.actual_focus_s $$,
  '42501', null, 'B cannot upsert over A''s session');
select throws_ok(
  $$ insert into public.user_settings (user_id, mode, pomodoro, updated_at)
     values ('aaaaaaaa-1111-4000-8000-000000000001', 'pomodoro', '{}', '2030-01-01Z')
     on conflict (user_id) do update set mode = excluded.mode, updated_at = excluded.updated_at $$,
  '42501', null, 'B cannot upsert over A''s settings');
select throws_ok(
  $$ insert into public.ledger (id, reason, delta, created_at)
     values ('a0000000-0000-4000-8000-0000000000a5', 'session', 100000, now())
     on conflict (id) do update set delta = excluded.delta $$,
  '42501', null, 'B cannot upsert over A''s ledger row');

-- The same upserts with "do nothing" (how an upload of a duplicate behaves)
-- must leave A's row alone and not hand it to B.
select lives_ok(
  $$ insert into public.tags (id, name, color, created_at, updated_at)
     values ('a0000000-0000-4000-8000-0000000000a1', 'Hijacked', 'x', now(), '2030-01-01Z')
     on conflict (id) do nothing $$,
  'B''s duplicate tag upload is ignored');
select lives_ok(
  $$ insert into public.constellations (id, source, tier, chosen_at, client_created_at)
     values ('a0000000-0000-4000-8000-0000000000a2', 'generated', 'hard', now(), now())
     on conflict (id) do nothing $$,
  'B''s duplicate constellation upload is ignored');
select lives_ok(
  $$ insert into public.sessions (id, mode, planned_duration_s, actual_focus_s,
       started_at, ended_at, outcome, seed, device, client_created_at)
     values ('a0000000-0000-4000-8000-0000000000a3', 'countdown', 60, 1,
             '2026-10-02 12:00Z', '2026-10-02 12:01Z', 'cancelled', 's', 'd', '2026-10-02 12:00Z')
     on conflict (id) do nothing $$,
  'B''s duplicate session upload is ignored');
select lives_ok(
  $$ insert into public.ledger (id, reason, delta, created_at)
     values ('a0000000-0000-4000-8000-0000000000a5', 'session', 100000, now())
     on conflict (id) do nothing $$,
  'B''s duplicate ledger upload is ignored');

-- Moving B's own row over to A
select throws_ok(
  $$ update public.tags set user_id = 'aaaaaaaa-1111-4000-8000-000000000001', updated_at = '2030-01-01Z'
     where id = 'b0000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'B cannot hand their own tag to A');
select throws_ok(
  $$ update public.user_settings set user_id = 'aaaaaaaa-1111-4000-8000-000000000001', updated_at = '2030-01-01Z'
     where user_id = 'bbbbbbbb-1111-4000-8000-000000000002' $$,
  '42501', null, 'B cannot hand their own settings to A');

reset role;

select set_eq($$ select * from pg_temp.a_rows() $$, $$ select * from a_before $$,
  'after all of B''s attempts, every one of A''s rows is exactly as it was');

-- --- signed-out visitors -------------------------------------------------------------

set local role anon;
select throws_ok($$ select * from public.tags $$, '42501', null, 'a signed-out visitor cannot read tags');
select throws_ok($$ select * from public.constellations $$, '42501', null,
  'a signed-out visitor cannot read constellations');
select throws_ok($$ select * from public.sessions $$, '42501', null, 'a signed-out visitor cannot read sessions');
select throws_ok($$ select * from public.user_settings $$, '42501', null,
  'a signed-out visitor cannot read settings');
select throws_ok($$ select * from public.ledger $$, '42501', null, 'a signed-out visitor cannot read the ledger');
reset role;

-- --- B deletes their account ----------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-1111-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'B can delete their own account');
reset role;

select set_eq($$ select * from pg_temp.a_rows() $$, $$ select * from a_before $$,
  'deleting B''s account leaves every one of A''s rows in every table');

select is(
  (select (select count(*) from public.tags where user_id = 'bbbbbbbb-1111-4000-8000-000000000002')
        + (select count(*) from public.constellations where user_id = 'bbbbbbbb-1111-4000-8000-000000000002')
        + (select count(*) from public.sessions where user_id = 'bbbbbbbb-1111-4000-8000-000000000002')
        + (select count(*) from public.user_settings where user_id = 'bbbbbbbb-1111-4000-8000-000000000002')
        + (select count(*) from public.ledger where user_id = 'bbbbbbbb-1111-4000-8000-000000000002'))::int,
  0, 'and takes all of B''s own rows with it');

select * from finish();
rollback;
