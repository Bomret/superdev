#!/usr/bin/env node
'use strict';

// test-guard: deterministic PreToolUse(Bash) guard (ADR 0181, INV-0174).
// A dispatched implementer runs only the tests that verify its work, and the controller owns every full-suite run (ADR 0177).
// A dispatched implementer's Bash call is denied when it runs the full or the whole-repo command: `scope.js test full`,
// `scope.js test whole`, a `scope.js test focused` with no path, or the configured full or whole-repo command run directly or
// through `scope.js test --` or `scope.js fail-to-pass … --`. Where the focused fence repeats the full fence, a `scope.js test
// focused` with paths runs the full suite too, and is denied (ADR 0180, ADR 0182).
//
// The guard fails open, the opposite of the Bash guardrails (INV-0140), as tree-guard does: a call it cannot judge passes. That
// covers unreadable hook input, a library that will not load, and a call outside every run tree. A missed refusal costs a suite
// run, and a guard that fails closed would stop every test run an implementer makes.

let lib = null;
try {
  const { cmdSegments, plain } =require('../lib/bash-command.js');
  const { testRuns, verificationKind, scopeTestCalls, scopeCall, scopeVars } = require('../lib/test-runs.js');
  const { verificationCommands } = require('../lib/verification.js');
  const { locate } = require('../lib/run-tree.js');
  if ([cmdSegments, testRuns, verificationKind, scopeTestCalls, scopeCall, scopeVars, verificationCommands, plain, locate].every((f) => typeof f === 'function')) {
    lib = { cmdSegments, testRuns, verificationKind, scopeTestCalls, scopeCall, scopeVars, verificationCommands, plain, locate };
  }
} catch {
  /* fail open */
}

const OWN_RUNS =
  'An implementer runs only the tests that verify its work: `scope.js test focused <paths>` with at least one path, ' +
  '`scope.js test -- <command>` for one test file, or `scope.js fail-to-pass <base>..HEAD -- <command>` naming its own test ' +
  'files. The controller owns every full-suite run.';
const ONE_FILE =
  'The focused command repeats the full one in this repository, so `test focused` runs the whole suite. Run each test file ' +
  'the step works on through `scope.js test -- <command>`, and leave the run before your report to the controller.';

const refuse = (what, why) => ({ block: true, reason: `superdev: refused ${what}. ${why}` });

function decide(input) {
  if (!input || input.agent_type !== 'superdev:implementer' || !lib) return { block: false };
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || !command) return { block: false };
  try {
    return judge(command, input.cwd || process.cwd());
  } catch {
    return { block: false };
  }
}

function judge(command, cwd) {
  const { cmdSegments, testRuns, verificationKind, scopeTestCalls, scopeCall, scopeVars, verificationCommands, plain } = lib;
  const segs = cmdSegments(command);
  const vars = scopeVars(segs);
  for (const c of scopeTestCalls(segs, vars, cwd)) {
    if (!c.at) continue;
    const verb = plain(c.words[0]) || c.words[0];
    const rest = c.words.slice(1);
    if (verb === 'full' || verb === 'whole') return refuse(`\`scope.js test ${verb}\``, OWN_RUNS);
    if (verb === 'focused') {
      if (!rest.length) return refuse('`scope.js test focused` with no path, which runs the full command', OWN_RUNS);
      const v = verificationCommands(c.at.tree);
      if (v.full && v.focused === v.full) return refuse('`scope.js test focused`', ONE_FILE);
    }
    if (verb === '--' && rest.length) {
      const kind = verificationKind(rest.length === 1 ? plain(rest[0]) || rest[0] : rest.join(' '), verificationCommands(c.at.tree));
      if (kind === 'full' || kind === 'whole') return refuse(`a ${kind}-suite run through \`scope.js test --\``, OWN_RUNS);
    }
  }
  // A fail-to-pass run's command, after its `--`, is judged as a `test --` command is. simplicity: it is read in the call's cwd,
  // so a `cd` before it is not followed; a command the guard cannot place passes.
  const at = lib.locate(require('path').join(cwd, 'x'));
  if (at) {
    for (const [n, seg] of segs.entries()) {
      // The script word is read as `scopeTestCalls` reads it: quoted, or a variable that names `scope.js`.
      const c = !seg.fn && scopeCall(seg, vars[n]);
      if (!c || c.args[c.j + 1] !== 'fail-to-pass') continue;
      const d = c.args.indexOf('--', c.j + 2);
      if (d < 0 || d === c.args.length - 1) continue;
      const rest = c.args.slice(d + 1);
      const kind = verificationKind(rest.length === 1 ? plain(rest[0]) || rest[0] : rest.join(' '), verificationCommands(at.tree));
      if (kind === 'full' || kind === 'whole') return refuse(`a ${kind}-suite run through \`scope.js fail-to-pass\``, OWN_RUNS);
    }
  }
  for (const r of testRuns(command, cwd)) {
    if (r.kind === 'full' || r.kind === 'whole') return refuse(`a direct run of the ${r.kind === 'full' ? 'full' : 'whole-repo'} command`, OWN_RUNS);
  }
  return { block: false };
}

function main() {
  // A hook that cannot finish lets the call through: exit 0 at the bound.
  setTimeout(() => process.exit(0), 5000).unref();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0); // not our shape: never block
    }
    const { block, reason } = decide(input);
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { decide };
