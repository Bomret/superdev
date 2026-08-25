#!/usr/bin/env node
'use strict';

// ledger-guard: deterministic PreToolUse guard for the ledger write path (ADR 0022).
// scripts/scope.js is the only sanctioned writer of .superdev/scopes/*/ledger.md, so an
// Edit/Write tool call targeting a ledger, or a Bash shell write into one (redirect, tee,
// sed -i, cp/mv/install), is denied with a message naming scope.js. Reads pass; scope.js invocations pass
// (they never name ledger.md — the CLI takes --root, the run-root directory).

// One shell word, quoted/escaped forms included — the merge-guard ARG token.
const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;

// A word references a scopes ledger when, unquoted/unescaped, it carries
// `.superdev/scopes/…/ledger.md` (relative or under any absolute prefix).
function refsLedger(word) {
  const plain = word.replace(/\\(.)/g, '$1').replace(/["']/g, '');
  return /\.superdev\/scopes\/.*ledger\.md/.test(plain);
}

// The shell write shapes the spec names. Each captures its target word(s). TEE and CPMV capture
// only to the end of their own `[;&|\n]`-delimited segment — like SED_SEGMENT — so a `cp`/`mv`/
// `tee` elsewhere never swallows a later command's pure ledger read into its target scan.
const REDIR = new RegExp('>{1,2}\\s*(' + ARG + ')', 'g');
const TEE = /(^|[;&|\n])\s*tee\s+([^;&|\n]*)/gm;
const SED_SEGMENT = /(^|[;&|\n])([^;&|\n]*\bsed\b[^;&|\n]*)/gm;
const CPMV = /(^|[;&|\n])\s*\b(?:cp|mv|install)\b\s+([^;&|\n]*)/gm;

function bashWritesLedger(cmd) {
  let m;
  REDIR.lastIndex = 0;
  while ((m = REDIR.exec(cmd))) {
    if (refsLedger(m[1])) return true;
  }
  TEE.lastIndex = 0;
  while ((m = TEE.exec(cmd))) {
    for (const word of m[2].match(new RegExp(ARG, 'g')) || []) {
      if (refsLedger(word)) return true;
    }
  }
  SED_SEGMENT.lastIndex = 0;
  while ((m = SED_SEGMENT.exec(cmd))) {
    const seg = m[2];
    if (!/\s-i/.test(seg)) continue; // in-place flag only; a plain sed read passes
    for (const word of seg.match(new RegExp(ARG, 'g')) || []) {
      if (refsLedger(word)) return true;
    }
  }
  CPMV.lastIndex = 0;
  while ((m = CPMV.exec(cmd))) {
    for (const word of m[2].match(new RegExp(ARG, 'g')) || []) {
      if (refsLedger(word)) return true;
    }
  }
  return false;
}
// ponytail: same ceiling as merge-guard — honest/common forms only. A `cd` into the scopes
// dir followed by a bare `> ledger.md`, an interpreter wrapper (`bash -c "…"`), or a `cp`/`mv`/
// `install` invoked through a variable or a wrapper script, slips past; this is a guardrail
// against the model's normal output, not a sandbox.

function decide(input) {
  const ti = (input && input.tool_input) || {};
  const reason =
    'superdev: ledger.md is written only through scripts/scope.js (init/stage/slice/degraded/unresolved verbs) — ' +
    'run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js <verb> …` instead of editing the ledger directly. (ledger-guard)';

  if (typeof ti.file_path === 'string') {
    // Edit/Write shape. Deny only the scopes ledger itself; dod.md, run.lock,
    // .superdev/brainstorm/* and everything else pass.
    if (/\.superdev\/scopes\/[^/]+\/ledger\.md$/.test(ti.file_path.replace(/\\/g, '/'))) {
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

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const file = (file_path) => decide({ tool_input: { file_path } });
  const bash = (command) => decide({ tool_input: { command } });
  const L = '.superdev/scopes/demo/ledger.md';

  // Edit/Write on a scopes ledger → deny, message names scope.js.
  assert.equal(file(L).block, true, 'relative ledger path denied');
  assert.equal(file('/abs/repo/' + L).block, true, 'absolute ledger path denied');
  assert.ok(/scope\.js/.test(file(L).reason), 'denial names scope.js');
  // Edit/Write elsewhere → allow.
  assert.equal(file('.superdev/scopes/demo/dod.md').block, false, 'dod.md passes');
  assert.equal(file('.superdev/brainstorm/notes.md').block, false, 'brainstorm passes');
  assert.equal(file('docs/ledger.md').block, false, 'a ledger.md outside .superdev/scopes passes');
  assert.equal(file('src/index.js').block, false, 'ordinary file passes');

  // Bash shell writes into a scopes ledger → deny, quoted/escaped forms included.
  assert.equal(bash('echo "**Stage:** merged" > ' + L).block, true, 'redirect > denied');
  assert.equal(bash('echo bullet >> /abs/' + L).block, true, 'append >> denied');
  assert.equal(bash('echo x > ".superdev/scopes/demo/ledger.md"').block, true, 'double-quoted redirect denied');
  assert.equal(bash("echo x >> '.superdev/scopes/demo/ledger.md'").block, true, 'single-quoted append denied');
  assert.equal(bash('echo x > .superdev/scopes/my\\ demo/ledger.md').block, true, 'backslash-escaped path denied');
  assert.equal(bash('cat new.md | tee ' + L).block, true, 'tee denied');
  assert.equal(bash('cat new.md | tee -a "' + L + '"').block, true, 'tee -a quoted denied');
  assert.equal(bash("sed -i '' 's/merged/reviewed/' " + L).block, true, 'sed -i denied');
  assert.equal(bash('sed -i.bak "s/a/b/" "' + L + '"').block, true, 'sed -i.bak quoted denied');
  assert.equal(bash('cp new.md ' + L).block, true, 'cp denied');
  assert.equal(bash('mv new.md "' + L + '"').block, true, 'mv quoted denied');
  assert.equal(bash('install -m 644 new.md ' + L).block, true, 'install denied');
  assert.equal(bash('cp a b').block, false, 'cp elsewhere allowed');

  // Compound commands: a write elsewhere followed by a pure ledger read stays allowed — the
  // target scan is bounded to the writing command's own segment.
  assert.equal(bash('cp a b && cat ' + L).block, false, 'cp elsewhere then a ledger read passes');
  assert.equal(bash('mv x y; grep Stage ' + L).block, false, 'mv elsewhere then a ledger grep passes');
  assert.equal(bash('echo hi | tee /tmp/log; cat ' + L).block, false, 'tee elsewhere then a ledger read passes');
  assert.equal(bash('cat x; cp new.md ' + L).block, true, 'cp into the ledger after another command still denied');
  assert.equal(bash('true && mv new.md ' + L).block, true, 'mv into the ledger after && still denied');
  assert.equal(bash('echo x | tee /tmp/log ' + L).block, true, 'tee with the ledger as a later target still denied');

  // scope.js invocations and reads → allow.
  assert.equal(bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root /abs/.superdev/scopes/demo').block, false, 'scope.js passes');
  assert.equal(bash('node scripts/scope.js init feat/demo < slices.json').block, false, 'scope.js init with stdin redirect-in passes');
  assert.equal(bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" adopt --root /abs/.superdev/scopes/demo').block, false, 'scope.js adopt passes — the write it makes is the sanctioned one');
  assert.equal(bash('cat ' + L).block, false, 'read passes');
  assert.equal(bash('grep Stage ' + L).block, false, 'grep passes');
  assert.equal(bash('sed -n "1,5p" ' + L).block, false, 'sed without -i passes');
  assert.equal(bash('echo hi > /tmp/out.txt').block, false, 'redirect elsewhere passes');
  assert.equal(bash('bun run test').block, false, 'unrelated bash passes');

  // ARG mirrors merge-guard's token (comment at the declaration); hooks stay standalone, so pin
  // the copy against the canonical one instead of sharing it — silent drift would be a bug.
  {
    const fs = require('node:fs');
    const path = require('node:path');
    const sibling = fs.readFileSync(path.join(__dirname, 'merge-guard.js'), 'utf8');
    const m = sibling.match(/^const ARG = \/(.*)\/\.source;$/m);
    assert.ok(m, 'merge-guard.js declares its ARG token where this pin expects it');
    assert.equal(ARG, m[1], 'ledger-guard ARG is byte-identical to merge-guard ARG');
  }

  console.log('ledger-guard selftest ok');
} else {
  main();
}
