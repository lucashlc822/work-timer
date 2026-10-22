#!/usr/bin/env node
// PreToolUse guard for the qa-lead agent (.claude/agents/qa-lead.md).
//
// qa-lead reports; it never changes the project. Its memory needs Edit and
// Write, which Claude Code turns on for it, so this hook narrows them: a file
// edit is allowed only inside the agent's own memory folder,
// .claude/agent-memory/qa-lead/. Anything else (a test, a config, app code) is
// refused with exit code 2, which blocks the call and shows the agent why.
//
// It fails closed: any error here (unreadable input, a path it can't judge)
// also exits 2. Claude Code treats any other non-zero exit as "allow".
//
// Bash can still write files, which no hook can reliably see; the agent's own
// end-of-run `git status` check reports any change outside its memory as
// Critical. This guard is the first line, not the only one.

import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const refuse = (why) => {
  console.error(
    `qa-lead only reports: it may edit files in .claude/agent-memory/qa-lead/ and nothing else. ` +
      `${why} Report the problem instead of changing it.`,
  );
  process.exit(2);
};

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const project = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (target === undefined) process.exit(0); // nothing to judge (not a file edit)
  if (typeof target !== 'string' || target === '') refuse('Refused: no usable path.');

  // Windows paths are case-insensitive; compare them that way.
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const memory = fold(resolve(project, '.claude', 'agent-memory', 'qa-lead'));
  const inside = relative(memory, fold(resolve(project, target)));
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) process.exit(0);

  refuse(`Refused: ${target}.`);
} catch (error) {
  refuse(`Refused: the guard could not check this call (${error.message}).`);
}
