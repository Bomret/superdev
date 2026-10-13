#!/usr/bin/env node
'use strict';

// tree-guard: deterministic PreToolUse(Edit|Write|NotebookEdit) guard (ADR 0148, INV-0152).
// A dispatched implementer works in the slicetree its dispatch named. A file-tool write it aims at a checkout of a repository
// that holds a superdev run, or at that repository's git directory, is denied.
//
// The guard fails open, the opposite of the Bash guardrails (INV-0140): a call it cannot judge passes. That covers unreadable hook
// input, a git call that fails or exceeds its bound, an unreadable run directory, a main working tree it cannot determine, and a
// `scope.js` that will not load. A misdirected write into a checkout shows in `git status` and reverts easily. A write into a git
// directory never shows there, which is why the guard refuses one whenever it can judge the call. A transient git failure must
// not stop every implementer write in a run (ADR 0148, INV-0009).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// scope.js owns the main-working-tree resolver (ADR 0080). No resolver, no verdict: every call passes.
let mainWorkTree = null;
try {
  ({ mainWorkTree } = require('../scripts/scope.js'));
} catch {
  /* fail open */
}

// The bound on each git call; a call past it carries no verdict and the write passes (INV-0009). The at most three calls a
// decision makes (one here, two in `mainWorkTree` for a target in a working tree) stay inside the hook's own 5 s exit below.
const GIT_BOUND_MS = Number(process.env.TREE_GUARD_GIT_BOUND_MS) || 1500;

const git = (args, cwd) => spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: GIT_BOUND_MS });

// Whether the repository whose main working tree is `main` holds a run: a readable ledger under `.superdev/scopes/<slug>/`.
function holdsRun(main) {
  const scopes = path.join(main, '.superdev', 'scopes');
  let names;
  try {
    names = fs.readdirSync(scopes);
  } catch {
    return false; // no scopes directory, or one that cannot be read: no run this guard can see
  }
  return names.some((name) => {
    try {
      fs.readFileSync(path.join(scopes, name, 'ledger.md'));
      return true;
    } catch {
      return false;
    }
  });
}

// Whether `p` lies under a `.git` whose parent directory holds a run. Only the nearest `.git` ancestor counts.
// Limit (ADR 0148): a path with no `.git` segment, such as a `.git` symlink's target or a `--separate-git-dir` directory, or a
// case variant like `.GIT` through a symlinked `.git`, is not placed.
function underRunGit(p) {
  let at = p;
  while (path.basename(at) !== '.git' && path.dirname(at) !== at) at = path.dirname(at);
  return path.basename(at) === '.git' && holdsRun(path.dirname(at));
}

function decide(input) {
  if (!input || input.agent_type !== 'superdev:implementer') return { block: false };
  if (!mainWorkTree) return { block: false };
  try {
    return judge(input);
  } catch {
    return { block: false };
  }
}

// Where a write to `abs`, an absolute path whose `..` segments are not yet collapsed, lands. The walk takes one segment at a time,
// the way the kernel does: each existing symlink is followed (`lstat`, `readlink`) before the next `..` applies, so a `..` leaves
// the symlink's target and a dangling symlink is followed to the file it would create. The result is the nearest existing
// ancestor in its letter case as the filesystem stores it, joined with the part not created yet. `dir` is the directory git is
// asked about. A chain past `MAX_HOPS` links, a loop among them, throws, and `decide` lets the write pass.
const MAX_HOPS = 40;
const lstat = (p) => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};
const segments = (p) => p.split(path.sep).filter((s) => s && s !== '.');
function landing(abs) {
  const todo = segments(abs);
  let at = path.parse(abs).root; // the walk so far: no `..`, every symlink in it followed
  let hops = 0;
  while (todo.length) {
    const seg = todo.shift();
    if (seg === '..') {
      at = path.dirname(at);
      continue;
    }
    const next = path.join(at, seg);
    const st = lstat(next);
    if (st && st.isSymbolicLink()) {
      if (++hops > MAX_HOPS) throw new Error('symlink loop');
      const link = fs.readlinkSync(next);
      todo.unshift(...segments(link));
      if (path.isAbsolute(link)) at = path.parse(link).root;
      continue;
    }
    at = next;
  }
  let anc = at;
  let st;
  while (!(st = lstat(anc))) anc = path.dirname(anc);
  const real = fs.realpathSync.native(anc);
  const dir = st.isDirectory() ? real : path.dirname(real);
  return { file: path.join(real, path.relative(anc, at)), dir };
}

function judge(input) {
  const ti = input.tool_input || {};
  const target = typeof ti.file_path === 'string' ? ti.file_path : ti.notebook_path;
  if (typeof target !== 'string' || !target) return { block: false };
  // A relative target is appended to `cwd` as text: `path.resolve` over the whole would collapse a `..` across a symlink.
  const abs = path.isAbsolute(target) ? target : path.resolve(input.cwd || process.cwd()) + path.sep + target;
  const { file, dir } = landing(abs);
  // One call that fails nowhere inside a repository: whether `dir` is in a working tree, and the way up to that tree's top.
  // Inside a git directory the second line is absent.
  const rp = git(['rev-parse', '--is-inside-work-tree', '--show-cdup'], dir);
  if (rp.status !== 0) return { block: false };
  const [inside, cdup = ''] = rp.stdout.split('\n');
  if (inside !== 'true') {
    // A git directory is refused when it lies under the `.git` of a main working tree that holds a run: the main `.git/`, every
    // linked working tree's gitdir under its `worktrees/`, and every submodule's gitdir under its `modules/`. `git status`
    // never shows a write there. git run inside a submodule's gitdir names the submodule, so the path places it, not git. Any
    // other git directory, a bare repository inside the main checkout included, holds no run and passes. A `.git` that is a
    // symlink leaves no `.git` segment in the real path, so the target as spelled is walked too.
    if (!underRunGit(file) && !underRunGit(path.resolve(abs))) return { block: false };
    return {
      block: true,
      reason:
        `superdev: refused a write to ${file}, inside the git directory of a repository that holds a superdev run. ` +
        `An implementer writes only inside the slicetree its dispatch named, and never into a repository's git directory.`,
    };
  }
  const found = mainWorkTree(dir, { timeout: GIT_BOUND_MS });
  if (!found) return { block: false };
  const main = fs.realpathSync.native(found);
  if (!holdsRun(main)) return { block: false };
  // The main working tree's `.superdev/` holds every run root and every slicetree and scopetree: a write there passes. A
  // `.superdev` that is a symlink places them under its real directory, outside `main`.
  if (path.relative(main, file).split(path.sep)[0] === '.superdev') return { block: false };
  const store = path.relative(fs.realpathSync.native(path.join(main, '.superdev')), file);
  if (!path.isAbsolute(store) && store.split(path.sep)[0] !== '..') return { block: false };
  const rel = path.relative(path.resolve(dir, cdup), file);
  return {
    block: true,
    reason:
      `superdev: refused a write to ${file}, a checkout of a repository that holds a superdev run. ` +
      `An implementer writes only inside the slicetree its dispatch named. Write \`${rel}\` under that slicetree instead.`,
  };
}

function main() {
  // A hook that cannot finish lets the write through: exit 0 at the bound.
  setTimeout(() => process.exit(0), 5000).unref();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0); // not our shape: never block
    }
    const { block, reason } = decide(input);
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { decide };
