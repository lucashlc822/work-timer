# work-timer

## What this is

A focused-work timer app in the spirit of Forest — the user sets a timer to
work, and lets it run instead of picking up other apps. Personal project;
more features may get added as they're decided on.

Stack is not chosen yet. Constraint: no paid services — language, framework,
database, and hosting all need to stay on free tiers/free tools.

## Working on this repo

This is developed from more than one machine. Once a stack (and a database,
if any) is chosen, record the per-machine implications here — e.g. a
separate `.env` per device, a separate dev database branch per device, or
generating migrations from one device only so they don't diverge.

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

- **No paid services.** Language, framework, database, and hosting choices
  must stay on free tiers/free tools. Rule out anything requiring payment
  when suggesting a stack.

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
