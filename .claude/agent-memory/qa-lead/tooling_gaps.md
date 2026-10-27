---
name: tooling-gaps
description: Tools missing or notable on this machine that affect which qa-lead steps can run
metadata:
  type: project
---

- **`cargo audit` is installed on this machine since 2026-10-26** (0.22.2).
  Run it from `src-tauri/`, which picks up `src-tauri/.cargo/audit.toml`: it
  ignores RUSTSEC-2026-0367/0368/0369 (zip via tauri-plugin-updater 2.x,
  unreachable for signed .exe updates; reasons in the file, #96). A clean run
  exits 0 with "6 allowed warnings" (unmaintained/unsound, informational). Any
  new vulnerability, or zip >= 9.0.0 in `cargo tree -i zip` (the ignores
  should then be dropped), is a finding. On a machine without it, report
  "Not run — tool missing" (`cargo install cargo-audit`), don't skip silently.
- Chrome and Edge are both installed (`C:\Program Files\Google\Chrome\...`,
  `C:\Program Files (x86)\Microsoft\Edge\...`), so `npm run perf:lighthouse`
  runs fine here — no gap to report for that step on this machine.
