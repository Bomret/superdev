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

// Codex's own PreToolUse payload for its apply_patch tool: tool_name is the literal string
// 'apply_patch', and tool_input.command carries the whole patch envelope — never a shell command,
// even though the field name coincides with the Bash shape's own `command` (verified 2026-09-22
// against https://learn.chatgpt.com/docs/hooks: "tool_name: canonical tool name (e.g. 'Bash' or
// 'apply_patch')", "Bash and apply_patch use tool_input.command"). A target path in that envelope
// names its file after one of four headers — `*** Add File:`, `*** Update File:`, `*** Delete
// File:`, or a following `*** Move to:` rename (verified 2026-09-22 against
// https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/assets/tools/apply_patch.lark,
// which names exactly these four headers). That grammar's filename rule is a bare `/(.+)/`, so it
// does not itself settle whether a target path is relative or absolute; the suffix test below
// matches either shape, so it does not need that question settled.
const PATCH_TARGET = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

function patchTargetsLedger(patchText) {
  let m;
  PATCH_TARGET.lastIndex = 0;
  while ((m = PATCH_TARGET.exec(patchText))) {
    // The grammar's filename rule is a bare `/(.+)/`: it swallows trailing whitespace, a tab, or
    // a stray \r into the same capture group. Trim before the suffix test, or a header like
    // `*** Update File: …/ledger.md  ` (or `…ledger.md\r`) evades the guard.
    const target = m[1].replace(/\\/g, '/').trim();
    if (/\.superdev\/scopes\/[^/]+\/ledger\.md$/.test(target)) return true;
  }
  return false;
}

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

  if (input && input.tool_name === 'apply_patch' && typeof ti.command === 'string') {
    if (patchTargetsLedger(ti.command)) return { block: true, reason };
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
