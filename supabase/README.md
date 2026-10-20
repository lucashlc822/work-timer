# Supabase

The app's server: Postgres, Auth and row-level security. Two copies exist:

- **Local stack**, for development, on every machine: `npx supabase start`
  (needs Docker Desktop running). `npm run dev` and `npm run tauri:dev` use it
  through `.env.development.local`. Studio is at <http://127.0.0.1:54323>, and
  every email the stack "sends" lands in the fake inbox at
  <http://127.0.0.1:54324> instead of a real one.
- **Hosted project**, the one real server that friends and family use. Release
  builds point at it through `.env.production.local`. See "Setting up the
  hosted project" below.

## Everyday commands

```
npx supabase start          # start the local stack (first run downloads images)
npx supabase stop           # stop it
npx supabase db reset       # wipe the local database and re-apply every migration
npx supabase test db        # run the pgTAP tests in supabase/tests
npx supabase migration new <name>   # create a new migration file
npm run invite -- add <email> --local    # allow an address to sign up locally
```

The sync adapter has an integration test against the local stack, off by
default. With the stack running and `a@test.local` signed up once:

```
SUPABASE_IT=1 SUPABASE_IT_KEY=<publishable key from `npx supabase status`> npx vitest run supabaseRemote.integration
```

### Asking old apps to update

`app_config.min_client_version` is the oldest app version the server still
syncs with (compared with `package.json`'s `version`). Apps older than it stop
syncing and show "Please update the app to keep syncing"; they keep working
offline. Set it in Studio's SQL editor (local: `http://127.0.0.1:54323`), only
once the matching release is out:

```sql
update public.app_config set min_client_version = '0.2.0';
update public.app_config set min_client_version = null;   -- any version again
```

Generate migrations on **one machine only**, so the two machines' histories
never diverge. Once the app has been released to other people, every new
migration must be backward compatible: never drop or rename a column an older
app uses, give new columns a default or allow null, and never add a check that
rejects what an older app sends.

## Local test accounts

Used by acceptance runs against the **local stack only** (they don't exist on
the hosted project, and `db reset` removes them):

| Email | Password |
|---|---|
| `a@test.local` | `local-test-pass-1` |
| `b@test.local` | `local-test-pass-1` |

Invite them first: `npm run invite -- add a@test.local --local` (and `b@…`).

## Setting up the hosted project

Done once, by the person who runs the server:

1. Create a free project at supabase.com. Pick the region closest to the people using it.
2. `npx supabase link --project-ref <ref>` (asks for the database password),
   then `npx supabase db push` to apply the migrations.
3. Authentication → Sign In / Providers → Email: turn on **Confirm email**, set
   the minimum password length to 8.
4. Authentication → Emails → SMTP: use Gmail (`smtp.gmail.com`, port 587, your
   Gmail address, and a Google *app password*, which needs 2-step verification
   on that Google account). Without this, Supabase only emails the project's
   own team.
5. Authentication → Emails → Templates: paste `templates/confirmation.html` into
   "Confirm signup" and `templates/recovery.html` into "Reset password", with
   the subjects from `config.toml`.
6. Put the project URL and **publishable** key in `.env.production.local` on
   each machine that builds releases. Put the URL and **secret** key in
   `.env.admin.local` on the machine you manage invites from — never anywhere
   else.
7. `npm run invite -- add you@example.com`, then sign up from the app.

## Keeping the hosted project awake

The free tier pauses a project after about 7 days with no activity.
`.github/workflows/keep-alive.yml` prevents that by running
`scripts/keep-alive.mjs` every ~3 days: one read of the public `app_config`
table with the publishable key. A failed run means the project is paused (restore
it from the dashboard) or its URL or key changed. To ping by hand:

```
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... node scripts/keep-alive.mjs
```
