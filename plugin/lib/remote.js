'use strict';

// remote.js: the remote a superdev step reaches, read from the `Remote:` bullet of `docs/agents/code-management.md`
// (INV-0203). `plan-open.js`, `contained.js`, `branch-delete.js`, and `run-state-ref.js` import it.

const fs = require('fs');
const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');

// `docs/agents/code-management.md`'s `- **Remote:** <value>` bullet, in either the `**Remote:**` or the `**Remote**:`
// spelling, with backticks and trailing punctuation stripped and no whitespace rejection: every shipped Remote bullet ("- **Remote**: `origin` (GitHub). Confirm with `git remote -v`.")
// carries a trailing sentence, so rejecting on whitespace would make the bullet unparseable on every
// repo that ships it. `readLedgerHeader`'s own `normalizeHeaderValue` (lib/ledger.js) already cuts a
// single-token header value to its first whitespace-delimited token before stripping markup this way;
// this mirrors that. Absent or unparseable -> null: a missing remote is not a refusal.
function parseRemote(docText) {
  if (!docText) return null;
  const m = docText.match(/^-\s*\*\*Remote:?\*\*:?\s*(.+)$/m);
  if (!m) return null;
  const token = m[1].trim().split(/\s+/)[0];
  const value = token.replace(/^`+/, '').replace(/[`.,;:]+$/, '');
  return value || null;
}

// The remote a containment refetch names (INV-0203): `given`, the caller's explicit `--remote`, where one is passed;
// otherwise the `Remote:` value of `docs/agents/code-management.md` at the repository's top level, so a call from a
// subdirectory reads the same document, and the current directory where git cannot name the top level. Null where
// neither names one: the caller then reaches no remote.
function resolveRemote(cwd, given) {
  if (given) return given;
  const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
  const root = top.status === 0 && top.stdout.trim() ? drivePath(top.stdout.trim()) : cwd;
  try {
    return parseRemote(fs.readFileSync(path.join(root, 'docs', 'agents', 'code-management.md'), 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { parseRemote, resolveRemote };
