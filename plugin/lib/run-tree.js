'use strict';

// run-tree.js: where a path lands in a run's trees (its run root, tree, relative path, and slice), whether it is a test path, and the git state of a tree.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { inProgressSlices } = require('./ledger.js');
const { isTestPath: testPathOf } = require('./verification.js');
const { drivePath } = require('./drive-path.js');

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

// The absolute path an Edit, Write, or NotebookEdit tool path names, resolved once and normalized. The hook runs after the tool,
// and the tool resolved a relative path against its own working directory, which the hook's `cwd` may not be (triage #34): the
// reading against `cwd` stands, and the reading against the tree root of `cwd` replaces it only when the tool's file exists at
// that one and not at the first. A file at both readings is a tie the hook cannot break: the `cwd` reading wins. An absolute path, a `cwd` outside a run tree, and a path neither reading names a file for
// resolve against `cwd`.
function toolTarget(cwd, p) {
  const abs = path.resolve(cwd, p);
  const here = path.isAbsolute(p) ? null : locate(path.join(cwd, 'x'));
  if (!here) return abs;
  const fromTree = path.resolve(here.tree, p);
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  return fromTree !== abs && !isFile(abs) && isFile(fromTree) ? fromTree : abs;
}

// The `<sha> <clean|dirty|unknown>` of a tree, each under a time bound.
function treeState(tree) {
  const sha = (gitOut(tree, ['rev-parse', 'HEAD']) || '').trim();
  const st = gitOut(tree, ['--no-optional-locks', 'status', '--porcelain']);
  return [/^[0-9a-f]{40,64}$/.test(sha) ? sha : 'unknown', st === null ? 'unknown' : st.trim() ? 'dirty' : 'clean'];
}

// A directory as one spelling (ADR 0150): an MSYS drive path as the Windows path, backslashes as `/` on win32 (a POSIX name may hold
// one), the symlinks of its existing part resolved, no trailing slash.
function canonical(dir) {
  let p = path.resolve(drivePath(dir));
  if (process.platform === 'win32') p = p.replace(/\\/g, '/');
  const tail = [];
  for (;;) {
    try { p = fs.realpathSync(p); break; } catch {
      const up = path.dirname(p);
      if (up === p) break;
      tail.unshift(path.basename(p));
      p = up;
    }
  }
  return path.join(p, ...tail);
}

// The directory `dir` as the run line's last field: relative to `tree`, `/`-separated, `.` at the tree root. A directory outside the
// tree is its own relative path (`..` first, or absolute across drives), never `.`.
function relDir(tree, dir) {
  const rel = path.relative(canonical(tree), canonical(dir)).split(path.sep).join('/');
  return rel || '.';
}

module.exports = { relDir, locate, toolTarget, isTestPath, treeState, gitOut, GIT_BOUND_MS };
