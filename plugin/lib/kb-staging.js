'use strict';

// kb-staging.js: finds the repository's main checkout and the staging root's pending scopes, and
// resolves which one scope a publish run works on.

const fs = require('fs');
const path = require('path');
const { SLUG_RE } = require('./ledger.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { fail } = require('./refusal.js');

// `<run-root>/scopetree` sits INSIDE `.superdev/`, so a checkout-relative
// `.superdev/kb-pending/` resolves one level too deep from a scopetree's own cwd. `lib/main-work-tree.js`'s
// `mainWorkTree` reaches the repository's main checkout from any cwd, scopetree and submodule included
// (skills/publish-kb/SKILL.md §1).
function resolveMainCheckout(cwd) {
  const main = mainWorkTree(cwd);
  if (main === null) fail(`cannot resolve the repository's main checkout: not inside a git repository (cwd: ${cwd})`);
  return main;
}

// Each subdirectory of the staging root holding at least one `.md` file is one pending scope.
function listPendingScopes(stagingRoot) {
  const counts = new Map();
  let dirents;
  try {
    dirents = fs.readdirSync(stagingRoot, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return counts;
    throw e;
  }
  for (const d of dirents.filter((e) => e.isDirectory())) {
    const n = fs.readdirSync(path.join(stagingRoot, d.name)).filter((f) => f.endsWith('.md')).length;
    if (n > 0) counts.set(d.name, n);
  }
  return counts;
}

// `_adhoc` is the internal literal `/superdev:document` writes for a doc pass outside a live
// scope, not external input, so the scope-slug charset does not apply to it.
function resolveScope(pending, requested) {
  if (requested) {
    if (requested !== '_adhoc' && !SLUG_RE.test(requested)) {
      fail(`--scope "${requested}" fails the scope-slug charset ${SLUG_RE}`);
    }
    if (!pending.has(requested)) fail(`no staged knowledge-base pages under scope "${requested}"`);
    return requested;
  }
  if (pending.size === 0) fail('No staged knowledge-base pages in this repo.');
  if (pending.size === 1) return [...pending.keys()][0];
  const lines = [...pending.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => `  ${s}: ${n} staged page${n === 1 ? '' : 's'}`);
  fail(`more than one pending scope — pass --scope <slug>:\n${lines.join('\n')}`);
}

module.exports = { resolveMainCheckout, listPendingScopes, resolveScope };
