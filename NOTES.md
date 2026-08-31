# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-08-30 — M0 foundation: installable PWA shell

**Status: open PR.** First real code in the repo. Brainstormed the app from
scratch, wrote the architecture plan, then built the M0 foundation milestone
from it.

### What the app is

A Forest-style focus timer themed as a pastel night sky — finish a session,
earn a star; accumulate stars into constellations. The full plan (stack, data
model, milestones M0–M6, acceptance tests) is at
`docs/plans/2026-08-30-architecture.md`.

### The constraint that decided the platform

Wanting it on **iPhone + Windows + browser** while paying **nothing** has
exactly one answer: a PWA. Native iOS needs a $99/year Apple Developer account
*and* a Mac to build on, so the App Store is off the table entirely. An
installable web app covers all three targets from one codebase.

A useful thing fell out of that: the Page Visibility API works on installed
iOS PWAs, so the "you left the app, your session dies" mechanic is genuinely
enforceable on a phone. That was the part most at risk of not being possible,
and it is not a compromise.

### Decisions worth not re-litigating

- **Timestamps, never tick counting.** iOS freezes JavaScript outright when a
  PWA is backgrounded and browsers throttle `setInterval` in hidden tabs, so
  any timer that accumulates elapsed time by counting ticks silently
  under-reports. `src/shared/lib/clock.ts` exists to make the correct approach
  the easy one, and exposes a monotonic source alongside wall-clock so device
  clock changes are detectable.
- **Completed sessions are immutable**, which makes sync append-only and
  therefore conflict-free. Same reasoning drives an append-only currency
  ledger (balance = `SUM(delta)`) and deriving streaks by query rather than
  storing a counter.
- **Stars are seeds, not images.** A session stores a 16-char seed; the
  generator turns it into a star deterministically. Syncing a few bytes
  reproduces the identical sky on another device.
- **Sync is sequenced at M5, not M0**, despite "cloud sync from day one" being
  a stated want. Syncing a schema that is still moving means writing every
  migration twice. Nothing in M0–M4 needs redoing to add it later — records
  already carry client-generated UUIDs and are already immutable.

### Surprises during the build

- **Vitest defaulted to jsdom and it cost ~50 seconds per run** of pure
  environment setup, for tests that never touch a DOM. Switched the default to
  `node`; the suite went 39s → 1.7s. Component tests opt back in with a
  `// @vitest-environment jsdom` docblock.
- **`import.meta.url` is not a `file://` URL under Vitest** — it serves modules
  over http, so `fileURLToPath` throws. `src/styles/tokens.test.ts` resolves
  from `process.cwd()` instead.
- **Prettier rewrites `*emphasis*` to `_emphasis_` in markdown**, which would
  churn this file on every session. Markdown is now in `.prettierignore`. It
  had also mangled the `{{PROMPT}}` placeholders in the CI template into
  `{ { PROMPT } }`, though that file was being replaced anyway.
- **npm 11 blocks esbuild's postinstall** behind `npm approve-scripts`. It
  turned out not to matter — Vite builds fine without it — so it was left
  unapproved rather than granting a script it does not appear to need.

### Verified by hand, not just by CI

Ran the built app under `npm run preview`, then **stopped the server and
reloaded**: the app still rendered fully and IndexedDB still reported ready,
which is offline serving from the service worker confirmed for real rather
than inferred from the build output. Also confirmed the abandonment-policy
default flips `lenient` → `strict` under mobile emulation.

### Next

- **The app still has no name.** `work-timer` is the repo; "Work Timer" is a
  placeholder sitting in the manifest, `index.html`, and the icon generator.
- **Cloudflare Pages is not connected yet** — it needs an account and a repo
  authorisation that has to be done by hand. The build output in `dist/` is
  ready for it.
- **iOS install is unverified.** No iPhone was available in this session, so
  acceptance test 15 (home-screen install, standalone launch, offline) is
  outstanding. Everything it depends on — manifest `display: standalone`,
  apple-touch-icon, service worker — is confirmed present and serving.
- M1 is the timer itself. Plan recommends staying on the stronger-reasoning
  model for it (suspension and clock-skew edge cases).
