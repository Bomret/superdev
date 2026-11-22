'use strict';

// root-inventory.js: the scanner that keeps lib module, test suite, and superdev agent names out of the root
// AGENTS.md, so the root describes each growing set by the rule that fills it instead of enumerating it.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, shippedDir, missingDoc } = require('../lib');

const ROOT_DOC = 'AGENTS.md';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each name set is read from disk at scan time. `dir` is how a gap names the directory; `list` returns the
// names the directory holds; `patterns` turns one name into the forms that count as naming it. A lib or suite
// name counts only as a whole path segment, so `ledger.js` does not match inside `scope-ledger.test.js` or
// `scope-ledger.js`. A hyphenated agent name (`doc-reader`) counts wherever it stands as a whole segment, bare
// prose included. An unhyphenated one (`implementer`) counts only backticked or as `superdev:<agent>`, so the
// plain word does not. A `/superdev:<skill>` command counts for neither.
const SEGMENT = (name) => [new RegExp(`(?<![\\w.-])${escape(name)}(?![\\w-]|\\.\\w)`, 'g')];
const NAME_SETS = [
  {
    kind: 'lib module',
    dir: 'plugin/lib',
    list: (root) => fs.readdirSync(shippedDir(root, 'lib')).filter((f) => f.endsWith('.js')),
    patterns: SEGMENT,
  },
  {
    kind: 'test suite',
    dir: 'tests',
    list: (root) => fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')),
    patterns: SEGMENT,
  },
  {
    kind: 'superdev agent',
    dir: 'plugin/agents',
    list: (root) =>
      fs
        .readdirSync(docPath(root, 'agents'))
        .filter((f) => f.endsWith('.md') && f !== 'AGENTS.md')
        .map((f) => f.slice(0, -3)),
    patterns: (name) =>
      name.includes('-')
        ? [new RegExp(`(?<![\\w-])(?<!/superdev:)${escape(name)}(?![\\w-])`, 'g')]
        : [
            new RegExp(`\`${escape(name)}\``, 'g'),
            new RegExp(`(?<![\\w/-])superdev:${escape(name)}(?![\\w-])`, 'g'),
          ],
  },
];

// scanRootNoInventory(): one gap per place the root AGENTS.md names a lib module, a test suite, or a superdev
// agent, read over the raw text so the fenced Structure tree counts too. A missing root is the missing-document
// gap. A name directory that cannot be read, or that holds no name, is a gap rather than a pass.
function scanRootNoInventory(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, ROOT_DOC), 'utf8');
  } catch {
    return [missingDoc(ROOT_DOC)];
  }
  const gaps = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const set of NAME_SETS) {
    let names;
    try {
      names = set.list(root);
    } catch {
      names = [];
    }
    if (names.length === 0) {
      gaps.push({
        source: ROOT_DOC,
        expectation: `be checked against \`${set.dir}/\`, which cannot be read or holds no ${set.kind} name`,
      });
      continue;
    }
    for (const name of names) {
      for (const re of set.patterns(name)) {
        for (const m of text.matchAll(re)) {
          gaps.push({
            source: ROOT_DOC,
            expectation:
              `name no ${set.kind} — line ${lineOf(m.index)} names \`${name}\`; describe \`${set.dir}/\` by the ` +
              'rule that fills it instead',
          });
        }
      }
    }
  }
  return gaps;
}

module.exports = { scanRootNoInventory };
