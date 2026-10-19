# Releasing Starkeep

One deliberate action ships the desktop app and the web version together, at the
same version: **publishing a draft GitHub Release**. Nothing reaches anyone from
a merge, a tag, or a pull request alone.

```
version bump PR ──merge──▶ tag vX.Y.Z ──▶ draft release (CI builds) ──review──▶ Publish
                                                                                  │
                                              installed apps see the update ◀─────┤
                                              web version deploys to Vercel ◀─────┘
```

## One-time setup

Done once by Lucas; the release workflows fail with a clear message if any of it is
missing. `.env.example` lists every name.

- **The repository is public.** GitHub serves a release's files to people without a
  GitHub account only from a public repo.
- **The update-signing key.** `npx tauri signer generate -w <path>` made a key
  pair. The public half is in `src-tauri/tauri.conf.json`. The private half and its
  password are in a password manager and in the GitHub secrets below, and **nowhere
  else**. See "If the signing key is lost".
- **GitHub secrets** (Settings → Secrets and variables → Actions → Secrets):
  `TAURI_SIGNING_PRIVATE_KEY` (the contents of the key file),
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`.
- **GitHub variables** (same page, Variables): `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` of the **hosted** project (not secret: the
  publishable key is designed to ship inside the app). Optional: `WEB_URL`, the
  site's address (e.g. `https://starkeep.vercel.app`), which makes the deploy
  verify the live site is serving the new build.
- **Vercel project**, created with `npx vercel link` and **not** connected to the
  Git repository (so merges never deploy). The org and project ids it writes to
  `.vercel/project.json` are the two `VERCEL_*` secrets above.
- **The hosted Supabase project** (`supabase/README.md`, "Setting up the hosted
  project"), with `min_client_version` left empty.

## Releasing a version

1. **Migration first, if there is one.** `npx supabase db push` to the hosted
   project *before* publishing. Migrations are backward compatible (CLAUDE.md), so
   apps still on the previous version keep working against the new schema.
2. **Bump the version.** On a branch: `npm run version:set -- X.Y.Z`. It rewrites the
   five files that state the version, one line each. Open a PR, let CI pass, merge.
3. **Tag `master`.**
   ```bash
   git checkout master && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   The `Release` workflow first checks the tag against the five files, then builds
   the installer and its signed update files into a **draft** release (about 10–15
   minutes).
4. **Review the draft** (Releases page). It should hold: `Starkeep_X.Y.Z_x64-setup.exe`,
   its `.sig`, `latest.json`, and `Starkeep-setup.exe`. The description is already
   written for friends (how to install); add a line about what changed above it.
5. **Publish.** This is the "go": installed apps will find it on their next check
   (within hours, and never mid-session), and the `Deploy web` workflow publishes the
   web version. From the Releases page, check the tag box still says `vX.Y.Z`
   before pressing Publish. From the command line, a draft can't be looked up by its
   tag, so publish by id **and name the tag in the same call**:
   ```bash
   gh api repos/lucashlc822/work-timer/releases --jq '.[] | select(.draft) | "\(.id) \(.tag_name)"'
   gh api -X PATCH repos/lucashlc822/work-timer/releases/<id> -F draft=false -f make_latest=true -f tag_name=vX.Y.Z
   ```
   Then confirm the published release's tag is `vX.Y.Z`, not `untagged-…`
   (`gh release list --limit 1`). Publishing v0.2.0 without `tag_name` came back as
   `untagged-…`: `latest.json` points at `/download/vX.Y.Z/…`, so installed apps
   would have failed to download the update, and `Deploy web` checked out the
   `untagged-…` ref instead of the tag. If it happens anyway, re-tag at once with
   `gh api -X PATCH …/releases/<id> -f tag_name=vX.Y.Z`, check the web deploy built
   the tagged commit, and delete the stray `untagged-…` git tag.
6. **Verify.**
   - The web address loads, and signing in works.
   - `https://github.com/lucashlc822/work-timer/releases/latest/download/Starkeep-setup.exe`
     downloads.
   - An installed desktop app shows "Starkeep X.Y.Z is ready" once it is between
     sessions, and "Restart to update" brings it back on the new version, signed in.
7. **Only now** raise `app_config.min_client_version` — and only if this release
   *requires* it (a server change an older app can't handle). See
   `supabase/README.md`. Raising it before the release is published locks every
   installed app out of syncing with nothing to update to.

## Something went wrong

| Situation | What to do |
|---|---|
| The `version` job fails | The tag and the files disagree. Delete the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), fix with `version:set`, merge, tag again. |
| The build fails on a missing secret or variable | The error names it. Add it, then re-run the failed workflow run from the Actions page. |
| A draft release is wrong | Delete the draft and its tag, then redo from step 3. Nothing was visible to anyone. |
| A published release is bad | Delete it (or edit it back to draft) so `latest` points at the previous release again: apps that haven't updated stay on what they have. Apps that already updated can't be rolled back by the updater, so ship a fixed `X.Y.(Z+1)` as the next release. For the web, redeploy the previous release from Vercel's dashboard (Deployments → ⋯ → Promote). |
| The web deploy failed after publishing | The desktop update is already visible. Fix the cause and re-run the `Deploy web` run; until then the web version stays on the previous release. |

## If the signing key is lost

Installed apps only accept updates signed by the key whose public half they
shipped with. Without the private key (or its password), no update can ever reach
them. Recovery:

1. Generate a new key pair and put the new public key in `tauri.conf.json`.
2. Ship a release signed with the new key.
3. Every installed app will fail the signature check and stay on its current
   version, so tell everyone to reinstall from the `Starkeep-setup.exe` link
   once. Their data is safe: it lives in the app's local store and on the server,
   and signing in again restores it.

Keep the key and password in two places that don't depend on this laptop.

## What is not covered

- **Windows code signing.** There is none (it costs money), so a first install
  shows "Windows protected your PC": More info → Run anyway. Updates don't.
- **macOS.** There is no Mac app; Mac users use the web version.
