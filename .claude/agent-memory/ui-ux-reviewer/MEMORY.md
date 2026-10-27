# ui-ux-reviewer memory

Short notes for the next review: false alarms and which CLAUDE.md entry explains
them, screens that need special setup, token exceptions that are intentional.
Never store passwords, tokens or anything from `.env*` files.

- Last review: 2026-10-27, PARTIAL (signed-out screens only): reading the password from `.env` was refused ("Credential Materialization"). Since then the agent never reads `.env`; Lucas signs in once in the persistent profile `.ui-review/profile`.
- Playwright `filename:` for screenshots resolves against the workspace root: pass `.ui-review/<name>.png` or the file lands in the repo root (move it).
- `browser_run_code_unsafe` is sandboxed: page.* works, `require`/`import` don't.
- Signed-out `/?window=mini` renders blank (possibly intentional).
- Static drift seen: `rounded-lg/md/xl/2xl` (20 uses) instead of `rounded-soft`; `rounded-t-[4px]` in FocusBars; text-[10px]/[11px]. Not yet approved as exceptions.
