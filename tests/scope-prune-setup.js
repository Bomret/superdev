'use strict';

// Shared setup of the scope-prune suites (`tests/scope-prune*.test.js`): the hook, and the fixture repositories and run
// roots they build. Each suite requires it, so each suite runs on its own. It is no suite.

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
const { copyFixture, templateOnce } = require('./fixture-git');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const hookPath = require.resolve('../plugin/hooks/scope-prune.js');
const hook = require(hookPath);
const { TTL_MS } = hook;

function gitTest(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

// The repository is built once into a template and copied for each call.
const repoTemplate = templateOnce((dir) => {
  gitTest(['init', '-q', '-b', 'main'], dir);
  gitTest(['config', 'user.email', 'test@example.com'], dir);
  gitTest(['config', 'user.name', 'test'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  gitTest(['add', '.'], dir);
  gitTest(['commit', '-q', '-m', 'init'], dir);
}, 'scope-prune-template-');
function makeRepo() {
  return copyFixture(repoTemplate(), 'scope-prune-smoke-');
}

function makeScope(repoDir, scope, ledgerBody = '**Stage:** closed\n') {
  const scopeDir = path.join(repoDir, '.superdev', 'scopes', scope);
  fs.mkdirSync(scopeDir, { recursive: true });
  const ledger = path.join(scopeDir, 'ledger.md');
  fs.writeFileSync(ledger, `# ledger\n\n${ledgerBody}`);
  const past = new Date(Date.now() - TTL_MS - 1000);
  fs.utimesSync(ledger, past, past);
  return scopeDir;
}

const refExists = (repoDir, ref) =>
  spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoDir, stdio: 'ignore' }).status === 0;

// Every case that keeps the scope branch standing, which is this repository's own steady state:
// `/superdev:ship` leaves it (the pull request is open from it) and nothing later returns for it, so
// the absence arm never fires and containment is the only thing that can (ADR 0053). Each fixture
// reaches git for real, so it exercises `containedInBase` rather than a stub.
function makeWorkBranch(repoDir, branch, file, body) {
  gitTest(['checkout', '-q', '-b', branch], repoDir);
  fs.writeFileSync(path.join(repoDir, file), body);
  gitTest(['add', '.'], repoDir);
  gitTest(['commit', '-q', '-m', `work on ${branch}`], repoDir);
  gitTest(['checkout', '-q', 'main'], repoDir);
}

// A base that edits the branch's files after taking its work conflicts with a branch it holds in
// full, which is what left twenty shipped run roots and their branches standing (ADR 0082).
function makeConflictingSquashRepo(branch) {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nl2\nl3\n');
  gitTest(['add', '.'], dir);
  gitTest(['commit', '-q', '-m', 'app'], dir);
  makeWorkBranch(dir, branch, 'app.txt', 'l1\nB2\nl3\n');
  gitTest(['merge', '--squash', branch], dir);
  gitTest(['commit', '-q', '-m', 'took it (#1)'], dir);
  fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nB2 revised\nl3\n');
  gitTest(['commit', '-q', '-am', 'base revises the same line'], dir);
  return dir;
}

// A fake git on PATH, the same wrapper shape `#no-write-tree-support` uses.
function withFakeGit(body, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-fakegit-'));
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\n${body}\nexec "${realGit}" "$@"\n`, {
    mode: 0o755,
  });
  const saved = process.env.PATH;
  process.env.PATH = dir + path.delimiter + saved;
  try {
    return fn();
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { hookPath, hook, TTL_MS, gitTest, makeRepo, makeScope, refExists, makeWorkBranch, makeConflictingSquashRepo, withFakeGit };
