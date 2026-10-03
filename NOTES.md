# Session log

Running notes on where work stopped and why, so a session on either device
can pick up without guessing. **Newest entry first.** Commit messages cover
*what changed*; this covers *what's in flight*.

Read this plus `git log` at the start of a session. Add an entry before you
finish one.

Once this file passes ~1,000 lines, archive older entries to
`docs/notes-archive/YYYY-QN.md` and leave a pointer here.

---

## 2026-09-01 — M0.5 landed, and the desktop shell is verified on screen

**Status: merged (PRs #3 and #4).** The Tauri pivot from the entry below is in,
and the OS-level behaviour it could not check in-session has now been confirmed
by hand.

### The unverified list from below is closed

M0.5 shipped with five acceptance items that needed eyes on a screen, since
nothing in this setup can observe an OS window. All five were checked and pass:
the window itself, the tray icon and its menu, close-to-tray (X hides rather
than exits), a real notification firing, and the autostart toggle.

One genuine gap remains: **autostart has not survived an actual reboot.** The
toggle flips and reports `on`, but the reboot test was deferred.

### Two visual defects, found by looking at a screenshot

Both were invisible to every automated check, because both are about *context*
rather than correctness:

- **The title bar rendered light** against a deep-indigo app. Windows themes it
  from the system setting unless told otherwise; the window now declares
  `"theme": "Dark"`.
- **The in-app logo had a box around it.** It reused `favicon.svg`, which paints
  an opaque rounded square behind the star. That is *correct* for a launcher
  icon — it needs its own ground against arbitrary wallpaper — and wrong on a
  page that is already night-coloured. Added `shared/ui/StarMark`, the star
  alone, reading its colours from the design tokens.

Worth knowing for any future SVG work: **CSS custom properties inside SVG
gradient stops fail silently to black** when they don't resolve. Verified all
six stops compute to real token values rather than assuming they would.

### Environment fact worth not rediscovering

**Running `git checkout` while `tauri dev` is up kills it.** The watcher saw
`src-tauri/Cargo.toml` disappear mid-checkout and exited 101:

    error: could not find `Cargo.toml` in ...\src-tauri or any parent directory

Not an app bug — a dev watcher cannot survive its own source tree being swapped
underneath it. Stop the dev process before switching branches. Now recorded in
CLAUDE.md.

Also confirmed: the CI Rust cache works. The desktop job went 6m40s cold to
1m33s warm.

### Housekeeping

All four merged branches deleted from the remote; `master` is now the only
branch, locally and remotely. Working tree clean, lint/build/27 tests green.

### Next

- **M1, the timer.** Nothing blocks it. Design is settled in the entry below:
  countdown only, elapsed from timestamps, `endedAt` records the *planned* end
  rather than when the app was reopened. **(Added 2026-10-03 — the full plan,
  with contracts and acceptance tests, is now `docs/plans/2026-10-03-m1-timer.md`.
  Start there.)**
- Two decisions deferred into M1: whether to render remaining minutes *into*
  the tray icon image (Windows has no persistent tray label, only a tooltip),
  and what the mini window actually displays.
- Autostart's reboot check, whenever the machine next restarts.

---

## 2026-08-31 — Pivot: desktop-only Tauri app, and leaving no longer forfeits

**Status: open PR (M0.5).** **(Superseded 2026-09-01 — merged as PR #3; see the
entry above.)** Two decisions reversed on the same day, both while
planning M1. They are related: one of them is what made the other obvious.

### Decision 1 — leaving the app never forfeits a session

Planning M1's abandonment mechanic turned up a perverse edge. On a phone,
**locking the screen and switching apps are indistinguishable to a web app** —
both just report `hidden`. So strict abandonment would punish locking your
phone and putting it in your pocket, which is the single best focus behaviour
there is.

The resolution was to drop the mechanic entirely: the timer runs on wall-clock
time regardless of window state, and **the only way to fail is to cancel
deliberately**. Honour system, closer to how Forest frames the commitment
anyway.

This turned out to be *less* work, not more, because elapsed time was already
computed from timestamps. There is no clock to keep alive — on reopening, the
app compares `startedAt` to now and knows where the session stands, including
that it finished an hour ago. Background continuation came for free.

Consequences: no grace period, no wake lock, no strict/lenient policy, no
`abandoned` outcome, and `SessionRow.policy` deleted. `awayMs` survives as a
pure statistic that must never affect success.

### Decision 2 — desktop-only, via Tauri

Mobile dropped completely. That removed the constraint the whole architecture
was bent around — the PWA choice existed solely to reach an iPhone for free.

**Tauri over Electron:** ~10MB bundle and ~40MB idle versus ~150MB and
~250MB. For something meant to sit running for hours, that gap matters more
than Electron's gentler setup.

**The browser build stays**, which is the consequential half of the decision:
every native capability now needs a browser fallback forever. That seam is
`src/shared/runtime/` — four ports (notifications, tray, mini window,
autostart) with a Tauri implementation and a web one, chosen once by
`getRuntime()`. The rule that makes it pay: **unsupported is a silent no-op,
not a throw**, so feature code calls `tray.setStatus(...)` unconditionally and
simply has nothing happen on the web. `isSupported` exists only for hiding UI.

Almost all of M0 survived — React app, tokens, Dexie, clock, ids, icon
generator, lint boundaries, CI. Roughly 40 lines were genuinely wasted (touch
detection, iOS meta tags and CSS, two icon sizes). One known limit disappeared
outright: **iOS PWA storage eviction no longer applies**, since Tauri keeps
IndexedDB in the app data directory.

### Things worth remembering

- **A client-side route would 404 in the packaged app.** Tauri serves the
  frontend over an asset protocol with no `index.html` fallback, so `/mini`
  works in dev and breaks in production. Extra windows are addressed with
  `?window=mini` instead, and the mini timer is rendered as a *surface* rather
  than a route — which is arguably the more honest model anyway.
- **jsdom crept back in and cost 60s.** The first runtime test used
  `// @vitest-environment jsdom` and took the suite from 1.7s to 62s, 56s of
  it jsdom setup. Rewritten to stub `window` by hand in the `node`
  environment: three lines, and the suite went back to 2.9s.
- **The Windows tray has no persistent label**, only a tooltip — so a
  glanceable countdown is macOS-only unless the remaining minutes are rendered
  *into* the tray icon image. The procedural PNG generator could do that.
  Deferred to M1.
- Toolchain installed this session: Rust 1.98 via `winget Rustlang.Rustup`,
  and VS 2022 Build Tools with the VCTools workload (MSVC 14.44, Windows SDK
  10.0.26100). Neither was present.

### Next

- M1 is the timer, now considerably simpler than originally planned. Its
  design is settled: countdown only, timestamps only, `endedAt` records the
  *planned* end rather than when the app was reopened.
- Tray countdown, mini-window contents, and the completion notification are
  M1 work — the M0.5 shell only proves the seam.
- Cloudflare Pages and iOS install verification from the M0 entry below are
  **no longer relevant** — there is no iPhone target, and the desktop app
  needs no hosting. Web hosting is only worth setting up if the browser build
  is ever actually wanted somewhere.

---

## 2026-08-31 — Named the app Starkeep (provisionally)

**Status: added to the open M0 PR.** The M0 entry below flagged that the app
had no name. It has one now, though it is explicitly not locked in.

### Why Starkeep, and what was ruled out

Checked three candidates by web search — not an authoritative trademark
clearance, but enough to spot obvious collisions:

- **Astra** — ruled out hard. `astra.app` is Topaz Labs' AI video upscaler,
  there are several live USPTO software-class marks, and the Astra WordPress
  theme is one of the most-installed themes on the web.
- **Glimmer** — ruled out on findability. An App Store app is named exactly
  that, plus a dating app, an Australian sustainability app, a creator
  platform at glimmer.io, and an AI PDF tool. `glimmer.app` is parked on
  GoDaddy with a for-sale page.
- **Starbloom** — workable but compromised. `starbloom.app` is a live AI
  hiring/ATS product, `starbloom.com` is broker-parked as a premium domain,
  and STARBLOOM LTD is a registered UK company.
- **Starjar** (bonus check) — dead on arrival, six-plus children's chore-chart
  apps. Would miscategorise the app entirely.
- **Starkeep** — returned nothing at all. Also the better name on merit:
  "keep" means both to retain (you keep the stars you earn) and a stronghold,
  which suits an app about defending your attention.

**The bar here is lower than commercial trademark clearance**, and that was
deliberate: the no-paid-services rule means no domain purchase, so the app
will live on a free `*.pages.dev` subdomain. What actually matters is not
being buried in search and not colliding with something famous.

### How the rename was made cheap

The name now lives in `brand.mjs` (with `brand.d.mts` for types), mirroring
the `design-tokens.mjs` pattern. It is read by the PWA manifest and the HTML
title/description (via a small `inject-brand` Vite plugin that substitutes
`%APP_NAME%` into `index.html`) and by the React app through
`src/shared/config/brand.ts`. Changing the name is a one-line edit to
`brand.mjs`; nothing else hard-codes it.

The repository stays `work-timer` — renaming a GitHub repo is a separate
decision and nothing in the code depends on it.

### Next

- Name is provisional. If it changes, edit `brand.mjs` and nothing else.

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
  **(Superseded 2026-08-31 — named Starkeep, provisionally; the name now lives
  in `brand.mjs` alone. See the entry above.)**
- **Cloudflare Pages is not connected yet** — it needs an account and a repo
  authorisation that has to be done by hand. The build output in `dist/` is
  ready for it.
- **iOS install is unverified.** No iPhone was available in this session, so
  acceptance test 15 (home-screen install, standalone launch, offline) is
  outstanding. Everything it depends on — manifest `display: standalone`,
  apple-touch-icon, service worker — is confirmed present and serving.
- M1 is the timer itself. Plan recommends staying on the stronger-reasoning
  model for it (suspension and clock-skew edge cases).
