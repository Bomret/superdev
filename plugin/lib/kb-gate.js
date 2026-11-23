'use strict';

// kb-gate.js: the publish gate of publish-kb.js (ADR 0278, INV-0207). It decides from the scope's run root and its
// ledger's `**Stage:**` line alone, and runs no git command.

const fs = require('fs');
const path = require('path');
const { readLedgerHeader, STAGES } = require('./ledger.js');

// `{ ok: true }` publishes; `{ ok: false, overridable, message }` refuses, and `--allow-unmerged` lifts an overridable one.
function checkGate(mainCheckout, scope) {
  if (scope === '_adhoc') return { ok: true };
  const rel = path.join('.superdev', 'scopes', scope);
  const root = path.join(mainCheckout, rel);
  const unreadable = (what, e) => ({ ok: false, overridable: false, message: `${what} cannot be read (${e.code})` });
  // `.superdev`, `.superdev/scopes`, then the run root: only `lstat`'s ENOENT on one of them reads as gone. A symlink
  // among them is followed, so a dangling one is unreadable, never absent.
  for (const p of [path.dirname(path.dirname(rel)), path.dirname(rel), rel]) {
    const abs = path.join(mainCheckout, p);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (e) {
      if (e.code === 'ENOENT') return { ok: true };
      return unreadable(p, e);
    }
    if (st.isSymbolicLink()) {
      try {
        fs.statSync(abs);
      } catch (e) {
        return unreadable(p, e);
      }
    }
  }
  let text;
  try {
    text = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') return unreadable(path.join(rel, 'ledger.md'), e);
    return { ok: false, overridable: true, message: `scope "${scope}" has a run root with no ledger` };
  }
  const stage = readLedgerHeader(text, 'Stage');
  if (stage === 'shipped' || stage === 'closed') return { ok: true };
  if (!stage) return { ok: false, overridable: true, message: `scope "${scope}" has a ledger with no **Stage:** line` };
  if (STAGES.includes(stage)) {
    return {
      ok: false,
      overridable: true,
      message: `scope "${scope}" stands at stage ${stage}, below shipped — run /superdev:ship ${scope} first`,
    };
  }
  return { ok: false, overridable: true, message: `scope "${scope}" has a ledger at stage "${stage}", outside the stage vocabulary` };
}

module.exports = { checkGate };
