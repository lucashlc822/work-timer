# {{PROJECT_NAME}}

## What this is

{{PROMPT: One or two sentences — what the project does and who it's for.}}

{{PROMPT: The stack — language, framework, database, hosting. Keep it to
facts a new contributor (or future you) needs, not a sales pitch.}}

## Working on this repo

{{PROMPT: If developed from more than one machine, note the per-machine
setup this implies — e.g. separate .env per device, separate dev database
branch, generate migrations on one device only. If this is single-machine,
delete this paragraph entirely rather than leaving it as dead framing.}}

Read `NOTES.md` (newest entries first) plus `git log` at the start of a
session. My general planning and collaboration norms live in
`~/.claude/CLAUDE.md` and apply here too; this file only holds what's
specific to this project.

## Environment — check here before believing a bug

Standing facts about the tooling, not news. As investigations turn up things
that look like app bugs but aren't (a stale cache, a quirk of some tool, an
environment gap), record the short version here and the full investigation
in `NOTES.md`. Empty at project start — that's expected, not a gap to fill
preemptively.

## Decisions already made — don't re-open these

Record a decision here once it's actually been made and would otherwise get
re-litigated (a library choice, an architecture call, something explicitly
rejected). Don't pre-populate this with guesses.

## Plans include acceptance tests

Every implementation plan states the outcomes the change must deliver, then
derives a numbered acceptance test from each — setup, action, and the
condition that counts as a pass. Write them as part of the plan, before
building, so the tests check what was promised rather than whatever turns
out to be convenient to verify afterward.

Run the acceptance pass as its own step once the work is done, and report
every case with its observed result, passes included. A failing case blocks
the merge. A pre-existing bug found during the pass does not — confirm it
against the main branch first, then report it separately rather than folding
it into the change.
