'use strict';

// The scanner that joins the drift registry to the invariant register.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, missingDoc } = require('../lib');
const contracts = require('../contracts');

// The invariant register joined to the drift registry and the contract tables (ADR 0156). A register
// `Check:` line that names `scripts/drift-check.js` lists the ids it pins as backticked tokens up to the
// next `;`; a token shaped like a check id must be a registered one (a backticked token that is not
// lowercase words joined by hyphens is prose). A contract row whose expectation cites `INV-NNNN` must
// pin a document one of that entry's `Paths:` globs covers, the plugin-relative path mapped to its
// repository path the way `docPath()` does; an entry with no `Paths:` covers every path except the
// register itself. A row whose document is absent is scanContract()'s to report. `checkIds` and
// `tables` default to the real registry and tables; the selftest passes its own.
function scanInvariantRegisterJoin(root, { checkIds, tables } = {}) {
  const { REGISTER, REGISTER_PATH, parseEntries, globMatcher, list, unquote } = require('../../invariant-check');
  const register = path.join(root, REGISTER);
  if (!fs.existsSync(register)) return [missingDoc(REGISTER_PATH)];
  const { entries } = parseEntries(fs.readFileSync(register, 'utf8'));
  const known = new Set(checkIds || require('../checks').map((c) => c.id));
  const gaps = [];

  const DRIFT = 'scripts/drift-check.js';
  for (const e of entries) {
    for (const segment of (e.fields.Check || '').split(';')) {
      const at = segment.indexOf(DRIFT);
      if (at < 0) continue;
      for (const [, token] of segment.slice(at + DRIFT.length).replace(/^`/, '').matchAll(/`([^`]+)`/g)) {
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token) && !known.has(token)) {
          gaps.push({ message: `${e.id}: Check: \`${token}\` is not a registered drift-check id` });
        }
      }
    }
  }

  const byId = new Map(entries.map((e) => [e.id, e]));
  // An entry with no `Paths:` governs every path but the register, as `invariant-check.js` reads it.
  const covers = (e, repoPath) =>
    e.fields.Paths
      ? list(e.fields.Paths).map(unquote).some((g) => globMatcher(g)(repoPath))
      : repoPath !== REGISTER_PATH;
  const seen = new Set();
  const allTables =
    tables || Object.fromEntries(Object.entries(contracts).filter(([, v]) => Array.isArray(v)));
  for (const [name, rows] of Object.entries(allTables)) {
    for (const row of rows) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[2] !== 'string') continue;
      const doc = docPath(root, row[0]);
      if (!fs.existsSync(doc)) continue;
      const repoPath = path.relative(root, doc).split(path.sep).join('/');
      for (const id of new Set(row[2].match(/INV-\d{4}/g) || [])) {
        const key = `${id}|${name}|${repoPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const e = byId.get(id);
        if (!e) {
          gaps.push({ message: `${name}: a row on ${repoPath} cites ${id}, which the register does not carry` });
        } else if (!covers(e, repoPath)) {
          gaps.push({ message: `${id}: Paths covers none of ${repoPath}, which a ${name} row pins as that invariant's rule` });
        }
      }
    }
  }
  return gaps;
}

module.exports = { scanInvariantRegisterJoin };
