'use strict';

// contained.js: the `contained` verb, which prints the containment verdict of a branch against a base and how it was judged (ADR 0053, ADR 0065, INV-0195).

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { resolveCommit } = require('./git-spawn.js');
const { judgeContainment, refetchMark } = require('./containment.js');
const { parseRemote } = require('./kb-containment.js');
const { pushTimeoutMs } = require('./push.js');

// Each verdict's exit status. A usage refusal exits 1. `not-contained` and `could-not-resolve` stay apart so a caller
// never reads an undecided answer as a verdict on the work (INV-0003, INV-0009).
const EXIT = { contained: 0, 'not-contained': 3, 'could-not-resolve': 4 };

// `contained <base> <branch> [--remote <remote>]`: only `--remote` is an option, so an option-shaped `<base>` or
// `<branch>` stays an operand. The remote defaults to the `Remote:` value of `docs/agents/code-management.md`.
function parseArgs(args) {
  const operands = [];
  let remote;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--remote') {
      operands.push(args[i]);
      continue;
    }
    if (remote !== undefined) fail('contained: --remote given twice');
    if (!args[i + 1]) fail('contained: --remote needs a value');
    remote = args[++i];
  }
  if (operands.length !== 2) fail('contained needs <base> <branch> [--remote <remote>]');
  return { base: operands[0], branch: operands[1], remote };
}

function configuredRemote(cwd) {
  try {
    return parseRemote(fs.readFileSync(path.join(cwd, 'docs', 'agents', 'code-management.md'), 'utf8'));
  } catch {
    return null;
  }
}

// Prints the verdict, `base <full sha>` (the base judged against: the refetched one when the refetch ran), `remote <name>`,
// and `judged local|refetched`, then `fallback ancestor` where the git lacks `--write-tree`, and `refetch timed-out` or
// `refetch failed` where the refetch ended without a base to judge. Writes no ledger, trace, or digest, and changes no ref,
// index, or working tree: the test writes tree objects and the refetch writes fetched commit objects and `FETCH_HEAD`.
function verbContained(cwd, args) {
  const { base, branch, remote: given } = parseArgs(args);
  const remote = given || configuredRemote(cwd);
  if (!remote) fail('contained: no remote; pass --remote <remote> or give docs/agents/code-management.md a Remote: value');
  const judged = judgeContainment(cwd, base, branch, remote, { fetchTimeoutMs: pushTimeoutMs(cwd) });
  const refetched = judged.refetch !== null && judged.refetch.status === 0;
  const lines = [
    judged.verdict,
    `base ${resolveCommit(judged.judgedBase, cwd) || 'unresolved'}`,
    `remote ${remote}`,
    `judged ${refetched ? 'refetched' : 'local'}`,
  ];
  if (judged.fallback) lines.push('fallback ancestor');
  const mark = refetchMark(judged);
  if (mark) lines.push(mark);
  console.log(lines.join('\n'));
  process.exitCode = EXIT[judged.verdict];
}

module.exports = { verbContained };
