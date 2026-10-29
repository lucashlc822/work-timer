# ui-ux-reviewer memory

Short notes for the next review: false alarms and which CLAUDE.md entry explains
them, screens that need special setup, token exceptions that are intentional.
Never store passwords, tokens or anything from `.env*` files.

- Final confirmation pass 2026-10-28 (master b4bac28): all earlier items fixed (H-A, M-A..M-D, L-A..L-E). Open/new: focus lands on "Back to timer" (last control) when a panel opens, so Tab leaves the panel and Shift+Tab reaches content; Account version line ink-muted fails axe only if scanned <1 s after open (mid-fade), passes once settled.
- Axe is lost on every page reload (re-add the script tag); open panels block clicks on the nav (close with Escape before clicking nav again).
- Friends load error copy: "Couldn't reach the server" appears only on a fresh load with kong stopped (reload first); opening Friends after the first load keeps the old list. "You're offline" needs navigator.onLine false at load (spoof it; no service worker in dev).
- Sky stars are role=img `g` elements (24x24, not buttons). Panels are fixed overlays with a footer "Back to timer" bar; sky and friend's sky keep the floating pill. Delete account is an inline expander. Headless pane never reports `hidden`, so away time can't be produced.
- Rendered-colour check: map computed rgb to tokens.css by hand; colours with alpha come back as oklab and are skipped.
- Playwright `filename:` for screenshots resolves against the workspace root: pass `.ui-review/<name>.png`.
- `browser_run_code_unsafe` is sandboxed: page.* works, `require`/`import` don't. `page.keyboard`, `page.context().setOffline`, `page.route`, `emulateMedia` all work.
- Do NOT use `page.clock.install/fastForward` to skip a session (server refuses it, fake clock sticks). Use the 1 min (dev) length (a 62 s wait).
- Seeds stay local now; `clearSeeded()` + reload leaves the real 14 sessions the account already has (not seeded; no true empty state without a new account; an earlier week shows the empty copy).
- Pomodoro sliders: restore Focus 25 and Short break 5 after a test run (synced settings); rapid ArrowRight now works.
- Screens with no obvious entry: Pomodoro lobby and friend's sky (need a friend), Delete account confirm (not submitted).
- False alarms seen: pill looks unselected right after click and ghost blobs on panels (transitions stall while pane hidden); axe `color-contrast` "incomplete" over the sky canvas.
- Mini window `/?window=mini` signed in renders (`--:--` idle, countdown when a main tab runs); signed-out it is blank (deferred).
- Approved, do not re-flag: FocusBars inline px geometry and 4px top radius (`rounded-t-sm`, documented in the file), `--color-faded` for "ended early", AmbientCanvas rgba helper (sky renderer).
