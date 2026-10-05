#!/usr/bin/env node
'use strict';

// ledger-guard: deterministic PreToolUse guard for the ledger write path (ADR 0022) and the run trace
// (ADR 0117). scripts/scope.js is the only sanctioned writer of .superdev/scopes/*/ledger.md, and the
// hooks and scope.js's appendTrace the only writers of .superdev/scopes/*/trace.log, so an
// Edit/Write tool call targeting a ledger, or a Bash shell write into one (redirect, tee,
// sed -i, cp/mv/install), is denied with a message naming scope.js. Reads pass; scope.js invocations pass
// (they never name ledger.md — the CLI takes --root, the run-root directory).

// One shell word, quoted/escaped forms included — the merge-guard ARG token.
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;

// A word references a scopes ledger or run trace when, unquoted/unescaped, it carries
// `.superdev/scopes/…/ledger.md` or `…/trace.log` (relative or under any absolute prefix).
function refsLedger(word) {
  const plain = word.replace(/\\(.)/g, '$1').replace(/["']/g, '');
  return /\.superdev\/scopes\/.*(?:ledger\.md|trace\.log)/.test(plain);
}

// The shell write shapes the spec names. Each captures its target word(s). TEE and CPMV capture
// only to the end of their own `[;&|\n]`-delimited segment — like SED_SEGMENT — so a `cp`/`mv`/
// `tee` elsewhere never swallows a later command's pure ledger read into its target scan.
// Every write scan reads its words with both tokens (`words`). RAW_ARG reads `$(`, `${` and a backtick as
// plain characters and splits at every unquoted space. A target blocks when either reading names a ledger:
// ARG catches a ledger path behind a balanced substitution holding spaces, RAW_ARG one behind a
// substitution ARG cannot balance (`$((1+(2)))/…`).
// A redirect reads one word after `>`, so a target whose unbalanced substitution holds a space still
// passes (triage #814).
const RAW_ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
const ARG_WORDS = new RegExp(ARG, 'g');
const RAW_ARG_WORDS = new RegExp(RAW_ARG, 'g');
const words = (t) => [...(t.match(ARG_WORDS) || []), ...(t.match(RAW_ARG_WORDS) || [])];
const REDIR = new RegExp('>{1,2}\\s*(' + ARG + ')', 'g');
const REDIR_RAW = new RegExp('>{1,2}\\s*(' + RAW_ARG + ')', 'g');
const TEE = /(^|[;&|\n])\s*tee\s+([^;&|\n]*)/gm;
const SED_SEGMENT = /(^|[;&|\n])([^;&|\n]*\bsed\b[^;&|\n]*)/gm;
const CPMV = /(^|[;&|\n])\s*\b(?:cp|mv|install)\b\s+([^;&|\n]*)/gm;

// A heredoc body is data, not a command: drop every body (and its closing delimiter line) so prose in it
// that names `cp`, `tee`, or a ledger path is never scanned. The command line carrying `<<` stays.
function stripHeredocs(cmd) {
  const out = [];
  const queue = []; // Queue of [delimiter, indented] pairs for pending heredocs
  for (const line of cmd.split('\n')) {
    // If we're inside a heredoc body, check if this line closes the first pending heredoc
    if (queue.length > 0) {
      const [delim, indented] = queue[0];
      if ((indented ? line.trim() : line) === delim) {
        queue.shift(); // Matched delimiter line — skip it
      }
      // If still inside a heredoc body, skip this line
      if (queue.length > 0) continue;
      continue; // Also skip the delimiter line itself
    }

    out.push(line);
    // Mask quoted text, `$(( ))` arithmetic, and comments so a `<<` inside them is no opener; `<<<` is
    // a here-string. Comments are `#` not preceded by `$` (which would be `$#`, the arg count parameter)
    // through to end of line. Match either (non-$ character before #) or (# at line start).
    const masked = line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|\$\(\([^)]*\)\)|(?:(?<!\$)#|^#).*$/g, (m) => '_'.repeat(m.length));
    // Find all heredoc openers on this line
    const heredocRe = /(?<!<)<<(?!<)/g;
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = heredocRe.exec(masked)) !== null) {
      const at = match.index;
      const h = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?(\w+))/.exec(line.slice(at));
      if (h) {
        queue.push([h[2] || h[3] || h[4], h[1] === '-']);
      }
    }
  }
  return out.join('\n');
}

function bashWritesLedger(command) {
  const cmd = stripHeredocs(command);
  let m;
  for (const re of [REDIR, REDIR_RAW]) {
    re.lastIndex = 0;
    while ((m = re.exec(cmd))) {
      if (refsLedger(m[1])) return true;
    }
  }
  TEE.lastIndex = 0;
  while ((m = TEE.exec(cmd))) {
    for (const word of words(m[2])) {
      if (refsLedger(word)) return true;
    }
  }
  SED_SEGMENT.lastIndex = 0;
  while ((m = SED_SEGMENT.exec(cmd))) {
    const seg = m[2];
    if (!/\s-i/.test(seg)) continue; // in-place flag only; a plain sed read passes
    for (const word of words(seg)) {
      if (refsLedger(word)) return true;
    }
  }
  CPMV.lastIndex = 0;
  while ((m = CPMV.exec(cmd))) {
    for (const word of words(m[2])) {
      if (refsLedger(word)) return true;
    }
  }
  return false;
}
// simplicity: same ceiling as merge-guard — honest/common forms only. A `cd` into the scopes
// dir followed by a bare `> ledger.md`, an interpreter wrapper (`bash -c "…"`), or a `cp`/`mv`/
// `install` invoked through a variable or a wrapper script, slips past; this is a guardrail
// against the model's normal output, not a sandbox.

function decide(input) {
  const ti = (input && input.tool_input) || {};
  const reason =
    'superdev: ledger.md is written only through scripts/scope.js (init/stage/slice/degraded/unresolved verbs) — ' +
    'run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js <verb> …` instead of editing the ledger directly. ' +
    'The run trace (trace.log) is hook-written and no agent writes it. (ledger-guard)';

  if (typeof ti.file_path === 'string') {
    // Edit/Write shape. Deny only the scopes ledger and run trace themselves; dod.md, run.lock,
    // .superdev/brainstorm/* and everything else pass.
    if (/\.superdev\/scopes\/[^/]+\/(?:ledger\.md|trace\.log)$/.test(ti.file_path.replace(/\\/g, '/'))) {
      return { block: true, reason };
    }
    return { block: false };
  }

  if (typeof ti.command === 'string') {
    if (bashWritesLedger(ti.command)) return { block: true, reason };
    return { block: false };
  }

  return { block: false };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0); // not our shape → never block
    }
    const { block, reason } = decide(input);
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = { decide, ARG };
