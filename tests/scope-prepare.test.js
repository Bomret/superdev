'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `prepare <tree>` verb: it runs the prepare command a worktree's own
// `docs/agents/verification.md` states at that worktree's root (ADR 0218). Every case writes only inside its own temporary
// directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { scopePath } = require('./scope-setup');

const D = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prepare-')));
const git = (cwd, argv) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(r, 'git ' + argv[0]);
  assert.equal(r.status, 0, 'git ' + argv.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
};
const verification = (extra) => '# V\n\n```sh\ntrue\n```\n\n```sh\ntrue {paths}\n```\n' + extra;
const section = (body) => `\n## Prepare command\n\n${body}\n`;
// A worktree of `repo` on a branch of its own whose `verification.md` carries `extra`.
const worktree = (repo, name, extra) => {
  const tree = path.join(D, name);
  git(repo, ['worktree', 'add', '-q', '-b', name, tree]);
  fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), verification(extra));
  git(tree, ['commit', '-q', '-am', name]);
  return tree;
};
const prepare = (tree, o = {}) => {
  const r = spawnSync(process.execPath, [scopePath, 'prepare', tree], { cwd: repo, encoding: 'utf8', timeout: 30000, ...o });
  assertSpawnDecided(r, 'scope.js prepare');
  return r;
};

const repo = path.join(D, 'repo');
fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
git(repo, ['init', '-q', '-b', 'main']);
// The invoking checkout states a command of its own, which no case below may run.
fs.writeFileSync(path.join(repo, 'docs', 'agents', 'verification.md'), verification(section('`echo invoking >> "$P_LOG"`')));
git(repo, ['add', '-A']);
git(repo, ['commit', '-q', '-m', 'base']);
const log = path.join(D, 'log');
const env = { ...process.env, P_LOG: log };
const logged = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);

try {
  // The named tree's own command runs at its root, its output on stderr and nothing on stdout.
  const tree = worktree(repo, 'cmd', section('`echo "ran $(pwd)" >> "$P_LOG"; echo PREPARED-OUT; echo PREPARED-ERR >&2`'));
  let r = prepare(tree, { env, cwd: path.join(repo, 'docs') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'nothing on stdout');
  assert.match(r.stderr, /PREPARED-OUT/, "the command's stdout goes to stderr");
  assert.match(r.stderr, /PREPARED-ERR/);
  assert.deepEqual(logged(), [`ran ${tree}`], "the tree's own command ran once, at the tree root");
  fs.rmSync(log);

  // No section: one note naming the section and /superdev:setup, exit 0, nothing run.
  const bare = worktree(repo, 'bare', '');
  r = prepare(bare, { env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim().split('\n').length, 1, 'one note: ' + r.stderr);
  assert.match(r.stderr, /## Prepare command/);
  assert.match(r.stderr, /\/superdev:setup/);
  assert.deepEqual(logged(), [], 'nothing ran');

  // `none`: exit 0 silently.
  r = prepare(worktree(repo, 'none', section('`none`')), { env });
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''], 'none prepares nothing, silently');
  assert.deepEqual(logged(), []);

  // A failing command exits 3, naming the command and its exit; a signal ends one the same way.
  r = prepare(worktree(repo, 'failing', section('`exit 4`')), { env });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /`exit 4`/);
  assert.match(r.stderr, /\b4\b/);
  r = prepare(worktree(repo, 'signalled', section('`kill -TERM $$`')), { env });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /SIGTERM/);

  // Refused with exit 1: a path that does not exist, a directory that is no worktree, a subdirectory of a worktree, and a
  // worktree of another repository.
  const plain = path.join(D, 'plain');
  fs.mkdirSync(plain);
  const other = path.join(D, 'other');
  fs.mkdirSync(other);
  git(other, ['init', '-q', '-b', 'main']);
  for (const [label, target] of [['a missing path', path.join(D, 'missing')], ['a plain directory', plain], ['a subdirectory', path.join(tree, 'docs')], ['another repository', other]]) {
    r = prepare(target, { env });
    assert.equal(r.status, 1, `${label}: ${r.stderr}`);
    assert.match(r.stderr, /^prepare: /, `${label}: one refusal line`);
  }
  assert.deepEqual(logged(), [], 'no refusal ran anything');

  // An interrupt ends every process the command started.
  const pid = path.join(D, 'pid');
  const mark = path.join(D, 'mark');
  const hang = worktree(repo, 'hang', section(`\`sleep 60 & echo $! > "${pid}"; touch "${mark}"; wait\``));
  const driver = spawnSync('bash', ['-c', `node "${scopePath}" prepare "${hang}" 2>/dev/null & V=$!; for i in $(seq 300); do [ -e "${mark}" ] && break; sleep 0.05; done; kill -TERM $V; wait $V; echo "status $?"; for i in $(seq 100); do kill -0 $(cat "${pid}") 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; kill -9 $(cat "${pid}"); echo alive`], { cwd: repo, encoding: 'utf8', timeout: 60000 });
  assertSpawnDecided(driver, 'the interrupt driver');
  assert.match(driver.stdout, /status 143/, 'the verb exits 128 plus the signal: ' + driver.stdout + driver.stderr);
  assert.equal(driver.stdout.trim().split('\n').pop(), 'gone', "the command's background child is ended");

  // `scope.js help` lists the verb.
  const help = spawnSync(process.execPath, [scopePath, '--help'], { encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(help, 'scope.js --help');
  assert.match(help.stdout, /^ {2}prepare <tree>/m);
} finally {
  fs.rmSync(D, { recursive: true, force: true });
}
