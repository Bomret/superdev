'use strict';

// remote.js: the remote a superdev step reaches, read from the `Remote:` bullet of `docs/agents/code-management.md`
// (INV-0203), for any step that fetches from or pushes to it.

const fs = require('fs');
const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');

// The trimmed value of a document's first `- **<label>:** <value>` bullet, in either the `**<label>:**` or the
// `**<label>**:` spelling, or null where the document holds no such bullet. `label` is a literal word or phrase.
function bulletValue(docText, label) {
  if (!docText) return null;
  const m = docText.match(new RegExp('^-\\s*\\*\\*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':?\\*\\*:?\\s*(.+)$', 'm'));
  return m ? m[1].trim() : null;
}

// `docs/agents/code-management.md`'s `- **Remote:** <value>` bullet, in either the `**Remote:**` or the `**Remote**:`
// spelling, with backticks and trailing punctuation stripped and no whitespace rejection: every shipped Remote bullet ("- **Remote**: `origin` (GitHub). Confirm with `git remote -v`.")
// carries a trailing sentence, so rejecting on whitespace would make the bullet unparseable on every
// repo that ships it. `readLedgerHeader`'s own `normalizeHeaderValue` (lib/ledger.js) already cuts a
// single-token header value to its first whitespace-delimited token before stripping markup this way;
// this mirrors that. Absent or unparseable -> null: a missing remote is not a refusal.
function parseRemote(docText) {
  const raw = bulletValue(docText, 'Remote');
  if (!raw) return null;
  const token = raw.split(/\s+/)[0];
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

module.exports = { bulletValue, parseRemote, resolveRemote };
