-- M7 phase 5: shared constellations. Run with `npx supabase test db`. One
-- rolled-back transaction with fixture users of its own (sh-*@test.local).
-- Counts name the fixture rows only: the local database also holds the e2e runs'.
--
-- A is friends with B and C; D is a stranger; E has only asked A; C has no name.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

-- --- fixtures (as superuser) ------------------------------------------------

insert into public.invites (email)
select 'sh-' || x || '@test.local' from unnest(array['a','b','c','d','e']) x;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       'sh-' || x || '@test.local', now(), now()
from (values
  ('a', 'aaaaaaaa-5555-4000-8000-000000000001'::uuid),
  ('b', 'bbbbbbbb-5555-4000-8000-000000000002'::uuid),
  ('c', 'cccccccc-5555-4000-8000-000000000003'::uuid),
  ('d', 'dddddddd-5555-4000-8000-000000000004'::uuid),
  ('e', 'eeeeeeee-5555-4000-8000-000000000005'::uuid)
) u(x, id);

update public.profiles set display_name = upper(substr(u.email, 4, 1))
from auth.users u
where u.id = profiles.user_id and u.email like 'sh-%@test.local' and u.email <> 'sh-c@test.local';

insert into public.friendships (requester, addressee, status, responded_at)
select 'aaaaaaaa-5555-4000-8000-000000000001', f, 'accepted', now()
from unnest(array['bbbbbbbb-5555-4000-8000-000000000002', 'cccccccc-5555-4000-8000-000000000003']::uuid[]) f;
insert into public.friendships (requester, addressee, status) values
  ('eeeeeeee-5555-4000-8000-000000000005', 'aaaaaaaa-5555-4000-8000-000000000001', 'pending');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- A finished session `ago` before now, run for `shared` (as superuser).
create function pg_temp.add_session(who uuid, shared uuid, focus_s integer, ago interval,
                                    outcome text default 'completed') returns void
language sql as $$
  insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s, started_at,
                               ended_at, outcome, seed, device, client_created_at, shared_id)
  values (gen_random_uuid(), who, 'countdown', focus_s, focus_s, now() - ago - make_interval(secs => focus_s),
          now() - ago, outcome, 'sh-seed', 'test', now() - ago, shared);
$$;

create function pg_temp.done(shared uuid) returns boolean language sql as $$
  select public.shared_done(sc) from public.shared_constellations sc where sc.id = shared;
$$;

-- --- S1.1 only accepted friends with a name can propose --------------------------

select pg_temp.act_as('cccccccc-5555-4000-8000-000000000003');
set local role authenticated;
select throws_ok(
  $$ select public.propose_shared('aaaaaaaa-5555-4000-8000-000000000001', 'catalogue', 'swan', null, 'medium', 7, 1500) $$,
  'P0001', 'display_name_required', 'S1.1 proposing needs a name');
reset role;

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.propose_shared('dddddddd-5555-4000-8000-000000000004', 'catalogue', 'swan', null, 'medium', 7, 1500) $$,
  'P0001', 'not_friends', 'S1.1 a stranger can''t be asked');
select throws_ok(
  $$ select public.propose_shared('eeeeeeee-5555-4000-8000-000000000005', 'catalogue', 'swan', null, 'medium', 7, 1500) $$,
  'P0001', 'not_friends', 'S1.1 a pending friend can''t be asked');
select throws_ok(
  $$ select public.propose_shared('aaaaaaaa-5555-4000-8000-000000000001', 'catalogue', 'swan', null, 'medium', 7, 1500) $$,
  'P0001', 'not_friends', 'S1.1 nobody can ask themselves');
select throws_ok(
  $$ select public.propose_shared('cccccccc-5555-4000-8000-000000000003', 'catalogue', 'swan', null, 'medium', 3, 1500) $$,
  'P0001', 'invalid_shared', 'S2.1 too few stars is refused');
select throws_ok(
  $$ select public.propose_shared('cccccccc-5555-4000-8000-000000000003', 'catalogue', null, null, 'medium', 7, 1500) $$,
  'P0001', 'invalid_shared', 'S2.1 a catalogue shape needs its key');
select throws_ok(
  $$ select public.propose_shared('cccccccc-5555-4000-8000-000000000003', 'generated', null, 's', 'cosmic', 7, 1500) $$,
  'P0001', 'invalid_shared', 'S2.1 an unknown tier is refused');

-- --- S2.1 propose, one per pair, accept ------------------------------------------

select set_config('t.s1', public.propose_shared(
  'bbbbbbbb-5555-4000-8000-000000000002', 'catalogue', 'kite', null, 'easy', 4, 60)::text, true);
select isnt(current_setting('t.s1'), '', 'S2.1 A proposes a Kite to B');
select throws_ok(
  $$ select public.propose_shared('bbbbbbbb-5555-4000-8000-000000000002', 'generated', null, 'x', 'easy', 5, 0) $$,
  'P0001', 'shared_already_open', 'S2.1 a second proposal to the same friend is refused');
select throws_ok($$ select public.respond_shared(current_setting('t.s1')::uuid, true) $$,
  'P0001', 'shared_not_found', 'S2.1 the proposer can''t accept their own');
reset role;

select pg_temp.act_as('bbbbbbbb-5555-4000-8000-000000000002');
set local role authenticated;
select throws_ok(
  $$ select public.propose_shared('aaaaaaaa-5555-4000-8000-000000000001', 'generated', null, 'x', 'easy', 5, 0) $$,
  'P0001', 'shared_already_open', 'S2.1 the friend can''t open a second one the other way');
select ok((select jsonb_array_length(m) = 1 and m -> 0 ->> 'partner_name' = 'A'
                  and m -> 0 ->> 'proposed_by' = 'aaaaaaaa-5555-4000-8000-000000000001'
                  and m -> 0 -> 'accepted_at' = 'null'::jsonb
           from public.my_shared() m),
  'S2.1 B sees the proposal from A, not yet accepted');
select lives_ok($$ select public.respond_shared(current_setting('t.s1')::uuid, true) $$,
  'S2.1 B accepts');
select throws_ok($$ select public.respond_shared(current_setting('t.s1')::uuid, true) $$,
  'P0001', 'shared_not_found', 'S2.1 accepting twice is refused');
reset role;

select isnt((select accepted_at from public.shared_constellations where id = current_setting('t.s1')::uuid),
  null, 'S2.1 accepted_at is set');

select pg_temp.act_as('dddddddd-5555-4000-8000-000000000004');
set local role authenticated;
select is(jsonb_array_length(public.my_shared()), 0, 'S1.1 a stranger sees no shared constellation');
select throws_ok($$ select public.stop_shared(current_setting('t.s1')::uuid) $$,
  'P0001', 'shared_not_found', 'S1.1 a stranger can''t stop it');
reset role;

-- --- S3 / S5.3 what counts, from the server's sessions --------------------------

update public.shared_constellations set accepted_at = now() - interval '2 hours'
where id = current_setting('t.s1')::uuid;

select pg_temp.add_session('aaaaaaaa-5555-4000-8000-000000000001', current_setting('t.s1')::uuid, 120, interval '90 minutes');
select pg_temp.add_session('aaaaaaaa-5555-4000-8000-000000000001', current_setting('t.s1')::uuid, 120, interval '80 minutes');
select pg_temp.add_session('bbbbbbbb-5555-4000-8000-000000000002', current_setting('t.s1')::uuid, 120, interval '70 minutes');
-- Too short, cancelled, before acceptance, and a non-member: none count.
select pg_temp.add_session('bbbbbbbb-5555-4000-8000-000000000002', current_setting('t.s1')::uuid, 30, interval '60 minutes');
select pg_temp.add_session('aaaaaaaa-5555-4000-8000-000000000001', current_setting('t.s1')::uuid, 120, interval '50 minutes', 'cancelled');
select pg_temp.add_session('aaaaaaaa-5555-4000-8000-000000000001', current_setting('t.s1')::uuid, 120, interval '3 hours');
select pg_temp.add_session('cccccccc-5555-4000-8000-000000000003', current_setting('t.s1')::uuid, 120, interval '40 minutes');

select ok(not pg_temp.done(current_setting('t.s1')::uuid),
  'S5.3 three qualifying sessions don''t finish a four-star one');

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select is((select jsonb_array_length(m -> 0 -> 'sessions') from public.my_shared() m), 5,
  'S1.1 A sees the five completed sessions both members ran for it (no cancelled, no non-member)');
select is((select count(*)::int from public.my_shared() m, jsonb_array_elements(m -> 0 -> 'sessions') s
           where s ->> 'user_id' = 'cccccccc-5555-4000-8000-000000000003'), 0,
  'S1.1 a non-member''s session never shows');
select ok((select not (m -> 0 -> 'sessions' -> 0 ? 'tag_id') and not (m -> 0 -> 'sessions' -> 0 ? 'device')
           from public.my_shared() m),
  'S1.1 sessions carry no tag or device');
select throws_ok(
  $$ select public.propose_shared('bbbbbbbb-5555-4000-8000-000000000002', 'generated', null, 'x', 'easy', 5, 0) $$,
  'P0001', 'shared_already_open', 'S2.1 still open while unfinished');
reset role;

select pg_temp.act_as('bbbbbbbb-5555-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from jsonb_array_elements(public.friend_sky('aaaaaaaa-5555-4000-8000-000000000001') -> 'sessions') s
           where s ->> 'shared_id' = current_setting('t.s1')), 4,
  'S3 a friend''s sky marks the sessions they ran for a shared constellation');
reset role;

select pg_temp.add_session('bbbbbbbb-5555-4000-8000-000000000002', current_setting('t.s1')::uuid, 120, interval '30 minutes');
select ok(pg_temp.done(current_setting('t.s1')::uuid), 'S5.3 the fourth qualifying session finishes it');

-- --- S2.1 / S6.1 withdraw, stop, freeze ---------------------------------------------

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.stop_shared(current_setting('t.s1')::uuid) $$,
  'S6.1 stopping a finished one is allowed');
reset role;
select is((select stopped_at from public.shared_constellations where id = current_setting('t.s1')::uuid),
  null, 'S6.1 ...and changes nothing');

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select set_config('t.s2', public.propose_shared(
  'bbbbbbbb-5555-4000-8000-000000000002', 'generated', null, 'wild-1', 'easy', 5, 0)::text, true);
select lives_ok($$ select public.stop_shared(current_setting('t.s2')::uuid) $$,
  'S2.1 a new proposal once the first is finished, then withdrawn');
reset role;
select is((select count(*)::int from public.shared_constellations where id = current_setting('t.s2')::uuid), 0,
  'S2.1 a withdrawn proposal is gone');

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select set_config('t.s3', public.propose_shared(
  'bbbbbbbb-5555-4000-8000-000000000002', 'catalogue', 'teacup', null, 'easy', 4, 0)::text, true);
reset role;
select pg_temp.act_as('bbbbbbbb-5555-4000-8000-000000000002');
set local role authenticated;
select public.respond_shared(current_setting('t.s3')::uuid, true);
reset role;
update public.shared_constellations set accepted_at = now() - interval '1 hour'
where id = current_setting('t.s3')::uuid;
select pg_temp.act_as('bbbbbbbb-5555-4000-8000-000000000002');
set local role authenticated;
select public.stop_shared(current_setting('t.s3')::uuid);
reset role;
select ok((select stopped_at = now() and stopped_by = 'bbbbbbbb-5555-4000-8000-000000000002'
           from public.shared_constellations where id = current_setting('t.s3')::uuid),
  'S6.1 B stops an open one: frozen now, by B');

-- Four sessions after the stop: none count.
select pg_temp.add_session('aaaaaaaa-5555-4000-8000-000000000001', current_setting('t.s3')::uuid, 60, interval '-1 minute')
from generate_series(1, 4);
select ok(not pg_temp.done(current_setting('t.s3')::uuid), 'S6.1 sessions after the stop don''t count');

-- Unfriending: A–C's proposal is deleted, A–B's open one is frozen.
select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select set_config('t.s4', public.propose_shared(
  'cccccccc-5555-4000-8000-000000000003', 'catalogue', 'arrow', null, 'easy', 4, 0)::text, true);
select set_config('t.s5', public.propose_shared(
  'bbbbbbbb-5555-4000-8000-000000000002', 'catalogue', 'kite', null, 'easy', 4, 0)::text, true);
reset role;
update public.shared_constellations set accepted_at = now() - interval '1 hour'
where id = current_setting('t.s5')::uuid;

select pg_temp.act_as('aaaaaaaa-5555-4000-8000-000000000001');
set local role authenticated;
select public.remove_friend((select f.friendship_id from public.my_friends() f
                             where f.friend_id = 'cccccccc-5555-4000-8000-000000000003'));
reset role;
select is((select count(*)::int from public.shared_constellations where id = current_setting('t.s4')::uuid), 0,
  'S6.1 unfriending withdraws a proposal between them');

select pg_temp.act_as('bbbbbbbb-5555-4000-8000-000000000002');
set local role authenticated;
select public.remove_friend((select f.friendship_id from public.my_friends() f
                             where f.friend_id = 'aaaaaaaa-5555-4000-8000-000000000001'));
select ok((select s -> 'stopped_at' <> 'null'::jsonb
           from public.my_shared() m, jsonb_array_elements(m) s
           where s ->> 'id' = current_setting('t.s5')),
  'S6.1 unfriending freezes the open one, and B still sees it');
select is(jsonb_array_length(public.my_shared()), 3,
  'S6.1 B still sees all three (finished, stopped, frozen)');
select throws_ok(
  $$ select public.propose_shared('aaaaaaaa-5555-4000-8000-000000000001', 'generated', null, 'x', 'easy', 5, 0) $$,
  'P0001', 'not_friends', 'S6.1 no new proposal after unfriending');
reset role;

-- --- S7.1 a session without shared_id (a 0.5.0 upload) is unchanged ------------

select pg_temp.act_as('dddddddd-5555-4000-8000-000000000004');
set local role authenticated;
select lives_ok($$
  insert into public.sessions (id, mode, planned_duration_s, actual_focus_s, started_at, ended_at,
                               outcome, seed, device, client_created_at)
  values (gen_random_uuid(), 'countdown', 60, 60, now() - interval '2 minutes', now() - interval '1 minute',
          'completed', 'old', 'test', now())
$$, 'S7.1 an older app''s session (no shared_id) uploads as before');
reset role;

select ok(not has_function_privilege('anon', 'public.my_shared()', 'execute'),
  'S1.1 signed-out visitors can''t read shared constellations');

select * from finish();
rollback;
