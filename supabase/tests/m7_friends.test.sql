-- M7 phase 1: profiles, friend requests, and what a friend can see. Run with
-- `npx supabase test db`. One rolled-back transaction, with fixture users of
-- its own (fr-*@test.local) so it never collides with the other suites.
--
-- A and B become friends; C is a stranger (and later gets a request from A);
-- D is used for the pending-request cap.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(53);

-- --- fixtures (as superuser) ------------------------------------------------

insert into public.invites (email) values
  ('fr-a@test.local'), ('fr-b@test.local'), ('fr-c@test.local'), ('fr-d@test.local');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-7777-4000-8000-000000000001',
   'authenticated', 'authenticated', 'fr-a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-7777-4000-8000-000000000002',
   'authenticated', 'authenticated', 'fr-b@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-7777-4000-8000-000000000003',
   'authenticated', 'authenticated', 'fr-c@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-7777-4000-8000-000000000004',
   'authenticated', 'authenticated', 'fr-d@test.local', now(), now());

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- A's sky: one completed and one ended-early session, a constellation, a theme.
insert into public.sessions (id, user_id, mode, planned_duration_s, actual_focus_s,
    started_at, ended_at, outcome, seed, device, client_created_at, away_ms, star_style) values
  ('a7000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-7777-4000-8000-000000000001',
   'countdown', 1500, 1500, '2026-10-20 09:00Z', '2026-10-20 09:25Z', 'completed', 'seed-1',
   'laptop', '2026-10-20 09:00Z', 4000, 'style.ember'),
  ('a7000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-7777-4000-8000-000000000001',
   'countdown', 1500, 600, '2026-10-21 09:00Z', '2026-10-21 09:10Z', 'cancelled', 'seed-2',
   'laptop', '2026-10-21 09:00Z', 0, null);
insert into public.constellations (id, user_id, source, shape_id, tier, chosen_at, client_created_at) values
  ('a7000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-7777-4000-8000-000000000001',
   'catalogue', 'the-fox', 'easy', '2026-10-19 12:00Z', '2026-10-19 12:00Z');
insert into public.user_settings (user_id, mode, pomodoro, updated_at, sky_theme) values
  ('aaaaaaaa-7777-4000-8000-000000000001', 'countdown', '{}', '2026-10-19 12:00Z', 'dusk');

-- Codes, read as superuser and handed to the signed-in steps as settings.
select set_config('t.code_a', (select friend_code from public.profiles
  where user_id = 'aaaaaaaa-7777-4000-8000-000000000001'), true);
select set_config('t.code_b', (select friend_code from public.profiles
  where user_id = 'bbbbbbbb-7777-4000-8000-000000000002'), true);
select set_config('t.code_c', (select friend_code from public.profiles
  where user_id = 'cccccccc-7777-4000-8000-000000000003'), true);

-- --- 1. profiles --------------------------------------------------------------

select is((select count(*)::int from public.profiles
           where user_id in ('aaaaaaaa-7777-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000002',
                             'cccccccc-7777-4000-8000-000000000003', 'dddddddd-7777-4000-8000-000000000004')
             and friend_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' and display_name is null),
  4, '1.1 every new account gets a profile with a valid code and no name yet');

select is((select count(*)::int from auth.users u
           where not exists (select 1 from public.profiles p where p.user_id = u.id)),
  0, '1.2 every account has a profile (backfill and trigger)');

select is((select count(distinct c)::int from (select public.new_friend_code() c from generate_series(1, 200)) g
           where c ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  200, '1.3 two hundred fresh codes are distinct and well-formed');

select pg_temp.act_as('aaaaaaaa-7777-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'A reads exactly one profile: their own');
select throws_ok($$ update public.profiles set friend_code = 'AAAAAA' $$, '42501', null,
  '1.4 A cannot change their own friend code');
select throws_ok(
  $$ insert into public.profiles (user_id, friend_code) values ('aaaaaaaa-7777-4000-8000-000000000001', 'AAAAAA') $$,
  '42501', null, '1.4 A cannot insert a profile');
select throws_ok($$ select public.new_friend_code() $$, '42501', null,
  'A cannot call the code generator');

-- --- 3.1 / 2. names -------------------------------------------------------------

select throws_ok($$ select public.request_friend(current_setting('t.code_b')) $$,
  'P0001', 'display_name_required', '3.1 a request needs a display name first');

select lives_ok($$ select public.set_display_name('  Ada ') $$, 'A sets a name');
select is((select display_name from public.profiles), 'Ada', '2.1 the name is stored trimmed');
select throws_ok($$ select public.set_display_name('   ') $$, 'P0001', 'invalid_display_name',
  '2.2 a blank name is refused');
select throws_ok($$ select public.set_display_name(repeat('x', 25)) $$, 'P0001', 'invalid_display_name',
  '2.2 a 25-character name is refused');
select throws_ok($$ select public.set_display_name(E'Ada\nLovelace') $$, 'P0001', 'invalid_display_name',
  '2.2 a name with a line break is refused');
select is((select display_name from public.profiles), 'Ada', 'refused names leave the old one');

reset role;
select pg_temp.act_as('bbbbbbbb-7777-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$ select public.set_display_name('Bea') $$, 'B sets a name');
reset role;
select pg_temp.act_as('cccccccc-7777-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$ select public.set_display_name('Cy') $$, 'C sets a name');
reset role;

-- --- 3. requests ------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-7777-4000-8000-000000000001');
set local role authenticated;

select is(public.request_friend(lower(substr(current_setting('t.code_b'), 1, 3)) || '-'
                                || lower(substr(current_setting('t.code_b'), 4))),
  'pending', '3.2 A asks B, typing the code in lower case with a hyphen');
select throws_ok($$ select public.request_friend('Z') $$, 'P0001', 'friend_code_not_found',
  '3.3 an unknown code is refused');
select throws_ok($$ select public.request_friend(current_setting('t.code_a')) $$,
  'P0001', 'cannot_friend_self', '3.3 your own code is refused');
select throws_ok($$ select public.request_friend(current_setting('t.code_b')) $$,
  'P0001', 'request_already_sent', '3.3 asking twice is refused');

-- Only the addressee may answer.
select set_config('t.ab', (select friendship_id::text from public.my_friends()), true);
select throws_ok($$ select public.respond_friend(current_setting('t.ab')::uuid, true) $$,
  'P0001', 'request_not_found', '4.1 the requester cannot accept their own request');
reset role;

select pg_temp.act_as('cccccccc-7777-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$ select public.respond_friend(current_setting('t.ab')::uuid, true) $$,
  'P0001', 'request_not_found', '4.1 a stranger cannot accept someone else''s request');
reset role;

select pg_temp.act_as('bbbbbbbb-7777-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$ select public.friend_sky('aaaaaaaa-7777-4000-8000-000000000001') $$,
  'P0001', 'not_friends', '5.1 a pending request shows nothing');
select is(public.request_friend(current_setting('t.code_a')), 'accepted',
  '3.4 B asking A while A''s request waits makes them friends');
select throws_ok($$ select public.request_friend(current_setting('t.code_a')) $$,
  'P0001', 'already_friends', '3.5 asking a friend again is refused');
reset role;

select is((select count(*)::int from public.friendships
           where 'aaaaaaaa-7777-4000-8000-000000000001' in (requester, addressee)
             and 'bbbbbbbb-7777-4000-8000-000000000002' in (requester, addressee)),
  1, '3.4 and leaves exactly one row for the pair');

-- --- 5. what a friend sees ------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-7777-4000-8000-000000000002');
set local role authenticated;
select set_config('t.sky', public.friend_sky('aaaaaaaa-7777-4000-8000-000000000001')::text, true);
reset role;

select is((current_setting('t.sky')::jsonb) ->> 'display_name', 'Ada', '5.2 B sees A''s name');
select is((current_setting('t.sky')::jsonb) ->> 'sky_theme', 'dusk', '5.2 and A''s sky theme');
select set_eq($$ select jsonb_object_keys(current_setting('t.sky')::jsonb) $$,
  array['display_name', 'sky_theme', 'sessions', 'constellations'],
  '5.2 the sky has exactly four parts: no ledger, no other settings');
select is(jsonb_array_length((current_setting('t.sky')::jsonb) -> 'sessions'), 2,
  '5.2 both of A''s ended sessions, the ended-early one included');
select set_eq(
  $$ select distinct k from jsonb_array_elements((current_setting('t.sky')::jsonb) -> 'sessions') s,
       jsonb_object_keys(s) k $$,
  array['id', 'seed', 'started_at', 'ended_at', 'actual_focus_s', 'outcome', 'star_style', 'shared_id'],
  '5.2 sessions carry exactly the agreed fields: no tag, device, or away time (M7 phase 5: plus shared_id)');
select is((current_setting('t.sky')::jsonb) #>> '{sessions,0,outcome}', 'completed',
  '5.2 sessions come in end order, with their outcome');
select is((current_setting('t.sky')::jsonb) #>> '{constellations,0,shape_id}', 'the-fox',
  '5.2 and A''s constellation choice');

select pg_temp.act_as('cccccccc-7777-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$ select public.friend_sky('aaaaaaaa-7777-4000-8000-000000000001') $$,
  'P0001', 'not_friends', '5.1 a stranger sees nothing');
select throws_ok($$ select public.friend_sky(gen_random_uuid()) $$,
  'P0001', 'not_friends', '5.1 an unknown id says not_friends, not "no such user"');
reset role;

select pg_temp.act_as('aaaaaaaa-7777-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.friend_sky('aaaaaaaa-7777-4000-8000-000000000001') $$,
  'P0001', 'not_friends', '5.1 asking for your own sky this way is refused');

-- A also asks C, so A has one friend and one outgoing request.
select is(public.request_friend(current_setting('t.code_c')), 'pending', 'A asks C');
select is((select count(*)::int from public.my_friends()), 2, '5.3 A''s list has B and the request to C');
select ok((select status = 'accepted' and direction is null and display_name = 'Bea' and last_focus_at is null
           from public.my_friends() where friend_id = 'bbbbbbbb-7777-4000-8000-000000000002'),
  '5.3 B is listed as an accepted friend, by name (B has no sessions yet)');
select ok((select status = 'pending' and direction = 'outgoing' and display_name = 'Cy' and last_focus_at is null
           from public.my_friends() where friend_id = 'cccccccc-7777-4000-8000-000000000003'),
  '5.3 the request to C is outgoing, with no focus time');
reset role;

select pg_temp.act_as('bbbbbbbb-7777-4000-8000-000000000002');
set local role authenticated;
select is((select last_focus_at from public.my_friends()), '2026-10-20 09:25Z'::timestamptz,
  '5.3 an accepted friend sees when A last completed a session (not the ended-early one)');
reset role;

select pg_temp.act_as('cccccccc-7777-4000-8000-000000000003');
set local role authenticated;
select ok((select count(*) = 1 and bool_and(direction = 'incoming' and display_name = 'Ada' and last_focus_at is null)
           from public.my_friends()),
  '5.3 C sees only the incoming request from Ada, with no focus time');
select throws_ok($$ select * from public.friendships $$, '42501', null,
  '5.4 C cannot read the friendships table directly');
select is((select count(*)::int from public.profiles where user_id <> 'cccccccc-7777-4000-8000-000000000003'),
  0, '5.4 C cannot read anyone else''s profile');

-- --- 4. declining and removing -----------------------------------------------------------

select set_config('t.ac', (select friendship_id::text from public.my_friends()), true);
select lives_ok($$ select public.respond_friend(current_setting('t.ac')::uuid, false) $$, 'C declines');
select is((select count(*)::int from public.my_friends()), 0, '4.2 declining removes the request');
select throws_ok($$ select public.remove_friend(current_setting('t.ab')::uuid) $$,
  'P0001', 'friendship_not_found', '4.3 C cannot end A and B''s friendship');
reset role;

select pg_temp.act_as('aaaaaaaa-7777-4000-8000-000000000001');
set local role authenticated;
select is(public.request_friend(current_setting('t.code_c')), 'pending', '4.2 A can ask C again after a decline');
reset role;

select pg_temp.act_as('bbbbbbbb-7777-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$ select public.remove_friend(current_setting('t.ab')::uuid) $$, '4.3 B ends the friendship');
select throws_ok($$ select public.friend_sky('aaaaaaaa-7777-4000-8000-000000000001') $$,
  'P0001', 'not_friends', '4.3 and can no longer see A''s sky');
reset role;

-- --- 3.6 the pending-request cap -----------------------------------------------------------

-- D has a name and twenty outstanding requests, made directly as superuser.
update public.profiles set display_name = 'Dee' where user_id = 'dddddddd-7777-4000-8000-000000000004';
insert into public.invites (email) select 'fr-x' || g || '@test.local' from generate_series(1, 20) g;
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'fr-x' || g || '@test.local', now(), now()
from generate_series(1, 20) g;
insert into public.friendships (requester, addressee)
select 'dddddddd-7777-4000-8000-000000000004', u.id from auth.users u where u.email like 'fr-x%@test.local';

select pg_temp.act_as('dddddddd-7777-4000-8000-000000000004');
set local role authenticated;
select throws_ok($$ select public.request_friend(current_setting('t.code_c')) $$,
  'P0001', 'too_many_pending', '3.6 a twenty-first outstanding request is refused');
reset role;

-- --- deleting an account takes its friendships with it -------------------------------------

select pg_temp.act_as('cccccccc-7777-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'C deletes their account');
reset role;
select is((select count(*)::int from public.friendships
           where 'cccccccc-7777-4000-8000-000000000003' in (requester, addressee))
        + (select count(*)::int from public.profiles where user_id = 'cccccccc-7777-4000-8000-000000000003'),
  0, 'and C''s profile and A''s request to C are gone');

select * from finish();
rollback;
