# ui-ux-reviewer memory

Short notes for the next review: false alarms and which CLAUDE.md entry explains
them, screens that need special setup, token exceptions that are intentional.
Never store passwords, tokens or anything from `.env*` files.

- Confirmation pass 2026-10-28: H1-3, M1-M8, L1-L3, L5, L6 fixed. Open: focus drops to BODY after panel Esc/Back, Done, tag pick, Delete-account expand; ink-muted on running/result lines (4.3-4.7:1 over sky); "Manage tags"/"Done" 16px high; Pomodoro sliders drop rapid key repeats (press with ~250 ms gaps). Seeds now stay local.
- Sky stars are role=img `g` elements (not buttons); focus ring is an inner circle. Panels are fixed overlays on top of the timer (not dialogs); Delete account is an inline expander. Headless pane never reports `hidden`, so away time can't be produced; L1 was checked by simulating a 5th tile.
- Rendered-colour check: CSS custom props aren't enumerable from document.styleSheets in dev; map computed rgb to tokens.css by hand.
- Earlier: 2026-10-27, FULL signed-in pass (dev server on 5173 started by main session, signed in by Lucas in `.ui-review/profile`). Never reads `.env`.
- Playwright `filename:` for screenshots resolves against the workspace root: pass `.ui-review/<name>.png`.
- `browser_run_code_unsafe` is sandboxed: page.* works, `require`/`import` don't. `page.keyboard`, `page.context().setOffline`, `page.clock` all work.
- Do NOT use `page.clock.install/fastForward` to skip a session: the session ends in the real future, the server refuses it (400 `session_not_from_the_future`, "1 change waiting" stays) and the fake clock sticks to the context until `browser_close` + reopen. Use the 1 min (dev) length (a 62 s wait) instead.
- `__starkeep.seed/seedHistory` rows SYNC to the server and `clearSeeded()` only clears the local copy, so after a reload they come back (and earn Stardust). Seed sparingly; tell Lucas the test account keeps them.
- Pomodoro sliders: Home key drops Short break to 1 min (a synced setting); restore to 5 before finishing.
- Screens with no obvious entry: Pomodoro lobby (needs a friend; one account can't), tag manager (only when tags exist), Delete account dialog (destructive; not opened).
- False alarms seen: Countdown/Pomodoro pill looks unselected right after a click, and ghost blobs on panels (CLAUDE.md: transitions stall while pane hidden; check computed style); `hover:text-faded` contrast on Account at 375 (mid-transition); axe `color-contrast` is "incomplete" over the sky canvas (can't be proven by axe).
- Mini window `/?window=mini` signed in renders (shows `--:--` idle, countdown when a main tab runs a session); signed-out it is blank (deferred).
- Static drift left after PR #100 (`#ffffff`, `tracking-[0.4em]`, `bottom-[calc(...)]`) was removed by the colour-tokens PR. Still approved, do not re-flag: FocusBars' inline px geometry (the code comment says so) and `--color-faded` for "ended early" (the intended soft tone).
