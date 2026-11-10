'use strict';

// run-tree.js: where a path lands in a run's trees (its run root, tree, relative path, and slice), whether it is a test path, and the git state of a tree.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { inProgressSlices } = require('./ledger.js');
const { isTestPath: testPathOf } = require('./verification.js');

// The bound on each `git` call a run line needs; a call past it records `unknown` for its field (INV-0009).
const GIT_BOUND_MS = 1500;

function gitOut(tree, args) {
  const r = spawnSync('git', args, { cwd: tree, encoding: 'utf8', timeout: GIT_BOUND_MS, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.error || r.signal || r.status !== 0 ? null : r.stdout;
}

// The test-path classifier lives in `lib/verification.js` (ADR 0128), which also reads it from a commit; the hook
// reads its tree's own file. No file reads as no section: the defaults apply.
function isTestPath(tree, rel) {
  let text = '';
  try { text = fs.readFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), 'utf8'); } catch {}
  return testPathOf(text, rel);
}

// Where an absolute path lands: { runRoot, tree, rel, slice } under a run root's slicetree or
// scopetree, else null. A run root is a `.superdev/scopes/<slug>` directory holding a readable ledger.
function locate(abs) {
  const m = /^(.*?\/\.superdev\/scopes\/[^/]+)\/(?:slicetrees\/([^/]+)|(scopetree))\/(.+)$/.exec(abs.replace(/\\/g, '/'));
  if (!m) return null;
  const [, runRoot, id, scopetree, rel] = m;
  let ledger;
  try { ledger = fs.readFileSync(path.join(runRoot, 'ledger.md'), 'utf8'); } catch { return null; }
  let slice = id;
  let tree = path.join(runRoot, 'slicetrees', id || '');
  if (scopetree) {
    const open = inProgressSlices(ledger);
    slice = open.length === 1 ? open[0] : 'scope';
    tree = path.join(runRoot, 'scopetree');
  }
  return { runRoot, tree, rel, slice };
}

// The absolute path an Edit, Write, or NotebookEdit tool path names, resolved against `cwd` once. A relative path that repeats
// the working directory's own tree-relative prefix (a path given from the tree root while cwd is a subdirectory) names the
// tree-relative file when only that reading has an existing parent directory.
function toolTarget(cwd, p) {
  const abs = path.resolve(cwd, p);
  const here = locate(path.join(cwd, 'x'));
  if (path.isAbsolute(p) || !here) return abs;
  const dir = path.dirname(here.rel).replace(/\\/g, '/');
  const norm = p.replace(/\\/g, '/');
  if (dir === '.' || !norm.startsWith(dir + '/')) return abs;
  const fromTree = path.resolve(here.tree, p);
  const exists = (f) => { try { return fs.statSync(path.dirname(f)).isDirectory(); } catch { return false; } };
  return !exists(abs) && exists(fromTree) ? fromTree : abs;
}

// The `<sha> <clean|dirty|unknown>` of a tree, each under a time bound.
function treeState(tree) {
  const sha = (gitOut(tree, ['rev-parse', 'HEAD']) || '').trim();
  const st = gitOut(tree, ['--no-optional-locks', 'status', '--porcelain']);
  return [/^[0-9a-f]{40,64}$/.test(sha) ? sha : 'unknown', st === null ? 'unknown' : st.trim() ? 'dirty' : 'clean'];
}

module.exports = { locate, toolTarget, isTestPath, treeState, gitOut, GIT_BOUND_MS };
