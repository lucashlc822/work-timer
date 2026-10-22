---
name: tooling-gaps
description: Tools missing or notable on this machine that affect which qa-lead steps can run
metadata:
  type: project
---

- **`cargo audit` is not installed** on this dev machine as of 2026-10-21
  (`cargo audit --version` → "error: no such command: `audit`"). Step 5's
  `cd src-tauri && cargo audit` cannot run until it is. Install with
  `cargo install cargo-audit`. Report as "Not run — tool missing" each time,
  don't skip silently.
- Chrome and Edge are both installed (`C:\Program Files\Google\Chrome\...`,
  `C:\Program Files (x86)\Microsoft\Edge\...`), so `npm run perf:lighthouse`
  runs fine here — no gap to report for that step on this machine.
