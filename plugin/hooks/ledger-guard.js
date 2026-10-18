#!/usr/bin/env node
'use strict';

// ledger-guard: deterministic PreToolUse guard for the ledger write path (ADR 0022) and the run trace
// (ADR 0117). scripts/scope.js is the only sanctioned writer of .superdev/scopes/*/ledger.md, and the
// hooks and lib/trace-log.js's appendTrace the only writers of .superdev/scopes/*/trace.log, so an
// Edit/Write tool call targeting a ledger or run trace, or a Bash shell write into one, is denied with a
// message naming scope.js. Reads pass; scope.js invocations pass (they never name ledger.md — the CLI takes
// --root, the run-root directory).
//
// An Edit or Write is decided here, on the raw file path alone. A Bash command is read by ../lib/ledger-writes.js (its per-tool
// write-target table, its command-line reader, and the ceiling of what it reads), which reads a command through the shared scanner,
// ../lib/shell-words.js (ADR 0135). The hook loads the scanner and the module each under its own guard. When either cannot be
// loaded, or the module lacks writesLedger, or either throws, every Bash call is refused (INV-0140, INV-0159): the guard has no
// reader of its own to fall back on. An Edit or Write still decides.

let scanner = null;
let scannerError = null;
try {
  scanner = require('../lib/shell-words.js');
  if (typeof scanner.scan !== 'function') throw new Error('../lib/shell-words.js exports no scan');
} catch (e) {
  scannerError = e;
}
let writesLedger = null;
let writesError = null;
try {
  ({ writesLedger } = require('../lib/ledger-writes.js'));
  if (typeof writesLedger !== 'function') throw new Error('../lib/ledger-writes.js exports no writesLedger');
} catch (e) {
  writesError = e;
}

function decide(input) {
  const ti = (input && input.tool_input) || {};
  const reason =
    'superdev: ledger.md is written only through scripts/scope.js (init/stage/step/slice/degraded/unresolved/deferred/docs/pr/deploy/suite/base/adopt verbs) — ' +
    'run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js <verb> …` instead of editing the ledger directly. ' +
    'The run trace (trace.log) is hook-written and no agent writes it. (ledger-guard)';

  if (typeof ti.file_path === 'string') {
    // Edit/Write shape. Deny only the scopes ledger and run trace themselves; dod.md, run.lock,
    // .superdev/brainstorm/* and everything else pass.
    if (/\.superdev\/scopes\/[^/]+\/(?:ledger\.md|trace\.log)$/i.test(ti.file_path.replace(/\\/g, '/'))) {
      return { block: true, reason };
    }
    return { block: false };
  }

  if (typeof ti.command === 'string') {
    // INV-0140: a guard that cannot read the command denies it, naming the broken install.
    const broken = (what, why) => ({
      block: true,
      reason: 'superdev: ledger-guard cannot read this Bash command because its ' + what + ' ' + why +
        '. The superdev install is broken: reinstall the plugin. (ledger-guard)',
    });
    const scannerName = 'shared shell scanner (lib/shell-words.js)';
    const writesName = 'write-target reader (lib/ledger-writes.js)';
    if (scannerError) return broken(scannerName, 'failed to load (' + scannerError.message + ')');
    if (writesError) return broken(writesName, 'failed to load (' + writesError.message + ')');
    try {
      if (writesLedger(ti.command)) return { block: true, reason };
    } catch (e) {
      // Any throw while reading a command is attributed to the scanner, as when the hook held the reader itself.
      return broken(scannerName, 'failed while reading it (' + (e && e.message) + ')');
    }
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

module.exports = { decide };
