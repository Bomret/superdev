'use strict';

// plan-open.js: the `open` verb, which sets up or rejoins a `/superdev:plan` run in one idempotent call — the lock
// check, the cut or reuse of the scope branch (references/scope-branch.md `## Cutting the scope branch`), the run
// lock, the empty `planned` ledger, and the plan step.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, getHeader, ledgerPath } = require('./ledger.js');
const { gitSpawn, refResolves } = require('./git-spawn.js');
const { judgeContainment } = require('./containment.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { verbInit, verbStep, validateLabel } = require('./ledger-lifecycle.js');
const { appendTrace } = require('./trace-log.js');
const { checkRun } = require('./run-check.js');

// Every outcome that set up nothing exits with this status, apart from the 1 a refusal exits with.
const STOPPED_EXIT = 3;

// The age past which a run lock is dead.
const STALENESS_MS = 60 * 60 * 1000;

// The anchor an empty ledger carries until §6 writes the store and the full `init` replaces it.
const PENDING_ANCHOR = 'pending';

function parseArgs(args) {
  const label = args[0];
  if (!label || label.startsWith('--')) fail('open needs a <type>/<slug> label');
  const opts = { label, remote: 'origin' };
  const flags = { '--base': 'base', '--remote': 'remote', '--lock': 'lock' };
  const seen = new Set();
  for (let i = 1; i < args.length; i += 2) {
    const key = flags[args[i]];
    if (!key) fail(`open: unrecognized argument "${args[i]}"`);
    if (args[i + 1] === undefined || args[i + 1] === '') fail(`open: ${args[i]} needs a value`);
    if (seen.has(key)) fail(`open: ${args[i]} given twice`);
    seen.add(key);
    opts[key] = args[i + 1];
  }
  if (!opts.base) fail('open needs --base <base-ref>');
  return opts;
}

// The lock's nonce and its age in ms, or null when there is no lock. Anything but a regular file or no file refuses.
function readLock(lockPath) {
  let stat;
  let text;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    fail(`open: cannot read the run lock ${lockPath}: ${e.code || e.message}`);
  }
  if (!stat.isFile()) {
    const kind = stat.isDirectory() ? 'a directory (EISDIR)' : stat.isSymbolicLink() ? 'a symbolic link' : 'another file type';
    fail(`open: the run lock ${lockPath} is ${kind}, not a regular file`);
  }
  try {
    text = fs.readFileSync(lockPath, 'utf8');
  } catch (e) {
    fail(`open: cannot read the run lock ${lockPath}: ${e.code || e.message}`);
  }
  const m = text.match(/^plan ([0-9a-f]+)\s*$/m);
  return { nonce: m ? m[1] : null, age: Date.now() - stat.mtimeMs, text: text.trim() };
}

function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// The path of the worktree that has `branch` checked out, or null.
function worktreeHolding(cwd, branch) {
  const listed = gitSpawn(['worktree', 'list', '--porcelain'], cwd);
  if (listed.status !== 0) return null;
  let at = null;
  for (const line of listed.stdout.split('\n')) {
    if (line.startsWith('worktree ')) at = line.slice('worktree '.length);
    else if (line === `branch refs/heads/${branch}`) return at;
  }
  return null;
}

function git(args, cwd) {
  return gitSpawn(args, cwd, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } });
}

function gitOrFail(args, cwd, what) {
  const r = git(args, cwd);
  if (r.status !== 0) fail(`open: ${what} failed: ${(r.stderr || '').trim() || `git exited ${r.status}`}`);
  return r;
}

// A stop: the outcome word and its lines on stdout, exit 3, nothing written.
function stop(word, lines) {
  return { word, lines, exitCode: STOPPED_EXIT };
}

// Puts `branch` in `scopetree`, creating the worktree when absent. Returns a stop when a different worktree holds it.
function attach(cwd, branch, scopetree) {
  const holder = worktreeHolding(cwd, branch);
  if (holder && realOrSelf(holder) !== realOrSelf(scopetree)) {
    return stop('held', [`the branch ${branch} is checked out in another worktree: ${holder}`]);
  }
  if (!holder) gitOrFail(['worktree', 'add', '--end-of-options', scopetree, branch], cwd, `git worktree add ${scopetree} ${branch}`);
  return null;
}

// The cut on a run with no live ledger: a new branch from base, or a contained branch reused and re-pointed.
function cut(cwd, branch, base, remote, scopetree) {
  if (!refResolves(`refs/heads/${branch}`, cwd)) {
    if (!refResolves(base, cwd)) fail(`open: the base ${base} does not resolve to a commit`);
    gitOrFail(['worktree', 'add', '-b', branch, '--end-of-options', scopetree, base], cwd, `git worktree add -b ${branch}`);
    return { word: 'cut' };
  }
  const judged = judgeContainment(cwd, base, `refs/heads/${branch}`, remote);
  if (judged.verdict !== 'contained') {
    const ahead = git(['log', '--oneline', '--no-decorate', '--end-of-options', `${judged.judgedBase}..refs/heads/${branch}`], cwd);
    const commits = ahead.status === 0 ? ahead.stdout.split('\n').filter(Boolean) : [`(could not list ${base}..${branch})`];
    const date = new Date().toISOString().slice(0, 10);
    return stop('not-contained', [
      `the branch ${branch} carries commits base ${base} does not hold:`,
      ...commits.map((c) => `  ${c}`),
      `remedy: git branch -m ${branch} ${branch}-${date}`,
    ]);
  }
  const held = attach(cwd, branch, scopetree);
  if (held) return held;
  const dirty = git(['status', '--porcelain'], scopetree);
  if (dirty.status !== 0) fail(`open: git status in ${scopetree} failed`);
  if (dirty.stdout.trim()) return stop('dirty', [`the scopetree ${scopetree} holds uncommitted changes:`, ...dirty.stdout.trimEnd().split('\n').map((l) => `  ${l}`)]);
  // The one reset scope-branch.md's `## Cutting the scope branch` permits: on a branch containment has just proved contained.
  gitOrFail(['reset', '-q', '--hard', judged.judgedBase], scopetree, `git reset --hard ${base}`);
  return { word: 'reused' };
}

function verbOpen(cwd, args) {
  const { label, base, remote, lock } = parseArgs(args);
  const { slug } = validateLabel(label);
  const workTree = mainWorkTree(cwd) || cwd;
  const root = path.join(workTree, '.superdev', 'scopes', slug);
  const scopetree = path.join(root, 'scopetree');
  const lockPath = path.join(root, 'run.lock');
  // `open` names no `--root`, so it checks the run's digest itself, once, before it reads or writes a file of the run (ADR 0227).
  // The check runs once, before any path that writes. A refusal, the `locked` stop, and a cut or attach stop write no file of the run.
  // A run that passes them writes `run.lock`, writes the ledger through `verbInit` or `verbStep`, and writes the trace with
  // `appendTrace` beside each; a repeat call with the same nonce at step `plan` writes `run.lock` alone.
  checkRun(root);

  let stage = null;
  let step = null;
  if (fs.existsSync(ledgerPath(root))) {
    let lines;
    try {
      lines = readLines(root);
    } catch (e) {
      fail(`open: cannot read the ledger ${ledgerPath(root)}: ${e.code || e.message}`);
    }
    stage = getHeader(lines, 'Stage');
    step = getHeader(lines, 'Step');
    if (stage === 'planned') {
      const branch = getHeader(lines, 'Branch');
      if (branch !== label) fail(`open: the planned ledger under ${root} names the branch ${branch}, not ${label}`);
    } else if (stage !== 'closed') {
      fail(`open: the ledger under ${root} is at stage "${stage}" — only a planned run takes another plan`);
    }
  }
  const existing = stage === 'planned';

  // A fresh lock held by another nonce stops the run. On a planned ledger the other session counts as live only
  // while its step stands, the rule /superdev:status applies (ADR 0163): a plan run that finished cleared it.
  const held = readLock(lockPath);
  if (held && held.age < STALENESS_MS && held.nonce !== lock && (!existing || step !== null)) {
    return report(stop('locked', [`a run lock under an hour old (${Math.round(held.age / 60000)} min) names another session: ${held.text}`]));
  }

  let outcome;
  if (existing) {
    outcome = fs.existsSync(scopetree) ? { word: 'existing' } : attach(cwd, label, scopetree) || { word: 'existing' };
  } else {
    outcome = cut(cwd, label, base, remote, scopetree);
  }
  if (outcome.exitCode) return report(outcome);

  const nonce = lock || crypto.randomBytes(6).toString('hex');
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(lockPath, `plan ${nonce}\n`);
  } catch (e) {
    fail(`open: cannot write the run lock ${lockPath}: ${e.code || e.message}; a second open reuses the branch ${label} and the scopetree ${scopetree}`);
  }

  if (!existing) {
    verbInit(cwd, label, 'planned', JSON.stringify({ anchor: PENDING_ANCHOR, slices: [] }), () => {}, true);
    appendTrace(root, { kind: 'ledger', fields: ['init', label, 'planned'] });
  }
  // A repeat call of the same run leaves the step it already set; every new run records a start of its own (ADR 0147).
  if (!(lock && lock === (held && held.nonce) && step === 'plan')) {
    verbStep(root, 'set', 'plan');
    appendTrace(root, { kind: 'ledger', fields: ['step', 'set', 'plan'] });
  }
  return report({ word: outcome.word, lines: [`root ${root}`, `lock ${nonce}`] });
}

function report({ word, lines, exitCode }) {
  console.log([word, ...lines].join('\n'));
  if (exitCode) process.exitCode = exitCode;
}

module.exports = { verbOpen, STALENESS_MS };
