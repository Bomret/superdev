'use strict';

// Suite for `scope.js branch delete` (ADR 0274, INV-0204, INV-0203, INV-0009): how the verb deletes a run's scope
// branch that base contains, locally, as its remote-tracking ref, and on the remote, leased on the tip it tested.
// Real git repositories and a real bare remote throughout. The repository and its remote are built once into a
// template and copied for each case.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath, writeOperatorConfig } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { verbBranchDelete } = require('../plugin/lib/branch-delete.js');

const BRANCH = 'feat/delete-me';
const made = [];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

function commit(repo, file, body, msg) {
  fs.writeFileSync(path.join(repo, file), body);
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', msg], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

// `main` and the scope branch both on a bare `origin`, the branch's work squash-merged into `main`, so base contains
// the branch by its tree and not by ancestry.
const template = templateOnce((dir) => {
  const repo = path.join(dir, 'repo');
  const origin = path.join(dir, 'origin');
  fs.mkdirSync(repo);
  fs.mkdirSync(origin);
  git(['init', '-q', '--bare', '-b', 'main'], origin);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'test'], repo);
  git(['config', 'maintenance.auto', 'false'], repo);
  commit(repo, 'README.md', 'x\n', 'init');
  git(['remote', 'add', 'origin', origin], repo);
  git(['checkout', '-q', '-b', BRANCH], repo);
  commit(repo, 'design.md', 'plan\n', 'docs: plan');
  git(['checkout', '-q', 'main'], repo);
  git(['merge', '-q', '--squash', BRANCH], repo);
  git(['commit', '-q', '-m', 'docs: plan (#1)'], repo);
  git(['push', '-q', 'origin', 'main', BRANCH], repo);
}, 'scope-branch-delete-template-');

function fixture({ ledger = `# Ledger — delete-me\n\n**Stage:** shipped\n**Branch:** ${BRANCH}\n` } = {}) {
  const copy = copyFixture(template(), 'scope-branch-delete-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  const root = tmp('scope-branch-delete-root-');
  if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger);
  return { repo, origin, root };
}

function del(f, extra = ['--remote', 'origin'], env = {}) {
  const result = spawnSync(
    process.execPath,
    [scopePath, 'branch', 'delete', '--root', f.root, '--base', 'main', ...extra],
    { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, ...env } }
  );
  assertSpawnDecided(result, 'scope.js branch delete');
  const lines = {};
  for (const l of result.stdout.split('\n')) {
    const [ref, word] = l.split(' ');
    if (['local', 'tracking', 'remote'].includes(ref)) lines[ref] = { word, line: l };
  }
  return { status: result.status, out: result.stdout, err: result.stderr, lines };
}

const refAt = (repo, ref) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repo, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const localTip = (f) => refAt(f.repo, `refs/heads/${BRANCH}`);
const trackingTip = (f, remote = 'origin') => refAt(f.repo, `refs/remotes/${remote}/${BRANCH}`);
const remoteTip = (f) => refAt(f.origin, `refs/heads/${BRANCH}`);
const allRefs = (f) => [localTip(f), trackingTip(f), remoteTip(f)];

// A git on PATH that runs `action` before it forwards the call, for each call named by `name`.
const fakeGit = (name, action) => {
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = tmp('scope-branch-delete-bin-');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nif [ "$1" = ${name} ]; then ${action}; fi\nexec '${realGit}' "$@"\n`);
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
};

// A branch that carries one commit base does not hold.
const notContained = (f) => {
  git(['checkout', '-q', BRANCH], f.repo);
  commit(f.repo, 'extra.md', 'more\n', 'docs: more');
  git(['checkout', '-q', 'main'], f.repo);
};

try {
  // #module: the verb's module exports the entry `scope.js branch delete` calls.
  assert.strictEqual(typeof verbBranchDelete, 'function', 'lib/branch-delete.js exports verbBranchDelete');

  // #contained: a contained branch with a configured remote: every ref is gone, every line reads deleted, exit 0.
  // The remote comes from the `Remote:` value of code-management.md, with no `--remote` given.
  {
    const f = fixture();
    fs.mkdirSync(path.join(f.repo, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(f.repo, 'docs', 'agents', 'code-management.md'), '- **Remote:** `origin`. Confirm with `git remote -v`.\n');
    const r = del(f, []);
    assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
    for (const ref of ['local', 'tracking', 'remote']) assert.strictEqual(r.lines[ref] && r.lines[ref].word, 'deleted', `${ref} reads deleted: ${r.out}`);
    assert.deepStrictEqual(allRefs(f), [null, null, null], 'the local ref, the tracking ref, and the remote branch are gone');
    assert.notStrictEqual(refAt(f.origin, 'refs/heads/main'), null, 'the remote base stays');
  }

  // #remote-gone: a remote already gone reads deleted — the host deleted the branch on merge; its line reads gone, exit 0.
  {
    const f = fixture();
    git(['branch', '-q', '-D', BRANCH], f.origin);
    const r = del(f);
    assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.remote.word, 'gone', `the remote line reads gone: ${r.out}`);
    assert.strictEqual(r.lines.local.word, 'deleted', `the local line reads deleted: ${r.out}`);
    assert.strictEqual(r.lines.tracking.word, 'deleted', `the tracking line reads deleted: ${r.out}`);
    assert.deepStrictEqual(allRefs(f), [null, null, null], 'no ref is left');
  }

  // #moved-remote: a remote moved past the tested tip is kept — its commits stay, its line names both tips, exit 4.
  {
    const f = fixture();
    const tested = localTip(f);
    git(['checkout', '-q', BRANCH], f.repo);
    const moved = commit(f.repo, 'late.md', 'late\n', 'docs: late');
    git(['reset', '-q', '--hard', tested], f.repo);
    git(['checkout', '-q', 'main'], f.repo);
    git(['push', '-q', 'origin', `${moved}:refs/heads/${BRANCH}`], f.repo);
    git(['update-ref', `refs/remotes/origin/${BRANCH}`, tested], f.repo);
    const r = del(f);
    assert.strictEqual(r.status, 4, `exits 4: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.remote.word, 'kept-moved', `the remote line reads kept-moved: ${r.out}`);
    assert.ok(r.lines.remote.line.includes(tested) && r.lines.remote.line.includes(moved), `names both tips: ${r.out}`);
    assert.match(r.out, /git push/, `names the command to run by hand: ${r.out}`);
    assert.strictEqual(remoteTip(f), moved, 'the remote keeps its commits');
    assert.strictEqual(trackingTip(f), tested, 'the tracking ref stays beside the kept remote branch');
  }

  // #lease-rejected: a remote that moves between the read and the push rejects the lease, which reads kept-moved.
  {
    const f = fixture();
    git(['checkout', '-q', BRANCH], f.repo);
    const moved = commit(f.repo, 'race.md', 'race\n', 'docs: race');
    git(['reset', '-q', '--hard', 'HEAD~1'], f.repo);
    git(['checkout', '-q', 'main'], f.repo);
    git(['push', '-q', 'origin', `${moved}:refs/heads/moved-later`], f.repo);
    const r = del(f, ['--remote', 'origin'], fakeGit('push', `git --git-dir='${f.origin}' update-ref refs/heads/${BRANCH} ${moved}`));
    assert.strictEqual(r.status, 4, `exits 4: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.remote.word, 'kept-moved', `a rejected lease reads kept-moved: ${r.out}`);
    assert.strictEqual(remoteTip(f), moved, 'the remote keeps its commits');
  }

  // #hook-declined: a remote whose pre-receive hook declines the delete reads failed, never kept-moved: only git's own
  // lease rejection reads moved.
  {
    const f = fixture();
    const before = remoteTip(f);
    const hook = path.join(f.origin, 'hooks', 'pre-receive');
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, '#!/bin/sh\necho "protected branch" >&2\nexit 1\n');
    fs.chmodSync(hook, 0o755);
    const r = del(f);
    assert.strictEqual(r.status, 4, `exits 4: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.remote.word, 'failed', `a declined push reads failed: ${r.out}`);
    assert.strictEqual(remoteTip(f), before, 'the remote branch stays');
  }

  // #not-contained: a not-contained branch deletes nothing; the verdict is printed, exit 3 (INV-0204).
  {
    const f = fixture();
    notContained(f);
    const before = allRefs(f);
    const r = del(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out} ${r.err}`);
    assert.match(r.out, /^not-contained/, `prints the verdict: ${r.out}`);
    assert.deepStrictEqual(allRefs(f), before, 'no ref is deleted');
  }

  // #undecidable: a not-contained answer whose refetch of base failed is undecided; it deletes nothing, exit 3.
  {
    const f = fixture();
    notContained(f);
    const before = allRefs(f);
    git(['remote', 'set-url', 'origin', path.join(f.origin, 'gone')], f.repo);
    const r = del(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out} ${r.err}`);
    assert.match(r.out, /refetch failed/, `marks the refetch: ${r.out}`);
    assert.deepStrictEqual(allRefs(f), before, 'no ref is deleted');
  }

  // #nothing-to-judge: neither the local ref nor the remote's tracking ref is present: nothing deleted, exit 3.
  {
    const f = fixture();
    git(['branch', '-q', '-D', BRANCH], f.repo);
    git(['update-ref', '-d', `refs/remotes/origin/${BRANCH}`], f.repo);
    const r = del(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out} ${r.err}`);
    assert.notStrictEqual(remoteTip(f), null, 'the remote branch stays');
  }

  // #base-guard: a ledger branch naming the base, in any spelling, refuses with exit 1 and deletes nothing.
  for (const [branch, base] of [['main', 'main'], ['main', 'refs/heads/main'], ['refs/heads/main', 'main'], ['origin/main', 'main'], ['main', 'origin/main']]) {
    const f = fixture({ ledger: `# Ledger\n\n**Branch:** ${branch}\n` });
    const r = spawnSync(process.execPath, [scopePath, 'branch', 'delete', '--root', f.root, '--base', base, '--remote', 'origin'], { cwd: f.repo, encoding: 'utf8', timeout: 120000 });
    assert.strictEqual(r.status, 1, `branch ${branch} against base ${base} refuses: ${r.stdout} ${r.stderr}`);
    assert.match(r.stderr, /base/, `names the base: ${r.stderr}`);
    assert.notStrictEqual(refAt(f.repo, 'refs/heads/main'), null, 'the local base stays');
    assert.notStrictEqual(refAt(f.origin, 'refs/heads/main'), null, 'the remote base stays');
  }

  // #option-shaped: an option-shaped ledger branch, remote, or base reaches git as a name, never as an option. The
  // ledger branch and the base name no ref, so nothing is deleted; the remote names no repository, so the remote branch
  // and its tracking ref stay, and only the contained local ref goes. The base stays in every case.
  for (const [label, branch, extra, kept] of [
    ['a ledger branch --upload-pack=x', '--upload-pack=x', ['--base', 'main', '--remote', 'origin'], allRefs],
    ['a ledger branch -D', '-D', ['--base', 'main', '--remote', 'origin'], allRefs],
    ['a --remote --foo', BRANCH, ['--base', 'main', '--remote', '--foo'], (f) => [trackingTip(f), remoteTip(f)]],
    ['a --base --foo', BRANCH, ['--base', '--foo', '--remote', 'origin'], allRefs],
  ]) {
    const f = fixture({ ledger: `# Ledger\n\n**Branch:** ${branch}\n` });
    const before = kept(f);
    const r = spawnSync(process.execPath, [scopePath, 'branch', 'delete', '--root', f.root, ...extra], { cwd: f.repo, encoding: 'utf8', timeout: 120000 });
    assert.notStrictEqual(r.status, 0, `${label} exits nonzero: ${r.stdout} ${r.stderr}`);
    assert.deepStrictEqual(kept(f), before, `${label} deletes no ref past the contained local one: ${r.stdout}`);
    assert.notStrictEqual(refAt(f.repo, 'refs/heads/main'), null, `${label} keeps the local base`);
    assert.notStrictEqual(refAt(f.origin, 'refs/heads/main'), null, `${label} keeps the remote base`);
  }

  // #local-gone: a local branch deleted by hand: the resolved remote's tracking ref is judged and the remote delete is
  // leased on its tip; a tracking ref of another remote, here one base does not contain, is never judged.
  {
    const f = fixture();
    const tested = localTip(f);
    notContained(f);
    const foreign = localTip(f);
    git(['remote', 'add', 'aaa', f.origin], f.repo);
    git(['update-ref', `refs/remotes/aaa/${BRANCH}`, foreign], f.repo);
    git(['branch', '-q', '-D', BRANCH], f.repo);
    const r = del(f);
    assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.local.word, 'gone', `the local line reads gone: ${r.out}`);
    assert.strictEqual(r.lines.tracking.word, 'deleted', `the tracking line reads deleted: ${r.out}`);
    assert.strictEqual(r.lines.remote.word, 'deleted', `the remote line reads deleted: ${r.out}`);
    assert.ok(r.out.includes(tested), `names the tested tip: ${r.out}`);
    assert.strictEqual(remoteTip(f), null, 'the remote branch is gone');
    assert.strictEqual(trackingTip(f, 'aaa'), foreign, 'the other remote\'s tracking ref is left to the prune');
  }

  // #fallback-ancestor: a `contained` verdict carrying `fallback ancestor` deletes as any contained verdict does.
  {
    const f = fixture();
    git(['branch', '-q', '-f', BRANCH, 'main'], f.repo);
    git(['push', '-q', '-f', 'origin', BRANCH], f.repo);
    const r = del(f, ['--remote', 'origin'], fakeGit('merge-tree', 'if [ "$2" = "--write-tree" ]; then exit 129; fi'));
    assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
    assert.match(r.out, /fallback ancestor/, `marks the fallback: ${r.out}`);
    assert.deepStrictEqual(allRefs(f), [null, null, null], 'every ref is gone');
  }

  // #no-branch-line: a ledger without a `**Branch:**` line refuses with exit 1 and deletes nothing.
  {
    const f = fixture({ ledger: '# Ledger\n\n**Stage:** shipped\n' });
    const before = allRefs(f);
    const r = del(f);
    assert.strictEqual(r.status, 1, `exits 1: ${r.out} ${r.err}`);
    assert.match(r.err, /Branch/, `names the missing line: ${r.err}`);
    assert.deepStrictEqual(allRefs(f), before, 'no ref is deleted');
  }

  // #no-remote: no `--remote` deletes the local ref alone — with no configured `Remote:` either, no fetch, ls-remote,
  // or push runs, and the remote line reads not-reached (INV-0203).
  {
    const f = fixture();
    const log = path.join(tmp('scope-branch-delete-log-'), 'calls');
    const r = del(f, [], fakeGit('"$1"', `case "$1" in fetch|push|ls-remote) echo "$1" >> '${log}';; esac`));
    assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.local.word, 'deleted', `the local line reads deleted: ${r.out}`);
    assert.strictEqual(r.lines.remote.word, 'not-reached', `the remote line reads not-reached: ${r.out}`);
    assert.strictEqual(localTip(f), null, 'the local ref is gone');
    assert.notStrictEqual(remoteTip(f), null, 'the remote branch stays');
    assert.strictEqual(fs.existsSync(log), false, `no network call ran: ${fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''}`);
  }

  // #checked-out: a branch a worktree still holds reads kept-checked-out with git's reason and the hand command; nothing is forced.
  {
    const f = fixture();
    const wt = path.join(tmp('scope-branch-delete-wt-'), 'tree');
    git(['worktree', 'add', '-q', wt, BRANCH], f.repo);
    const r = del(f);
    assert.strictEqual(r.status, 4, `exits 4: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.local.word, 'kept-checked-out', `the local line reads kept-checked-out: ${r.out}`);
    assert.match(r.out, new RegExp(`git branch -D ${BRANCH}`), `names the command to run by hand: ${r.out}`);
    assert.notStrictEqual(localTip(f), null, 'the local ref stays');
  }

  // A remote the verb cannot reach: the remote line names its outcome and the hand command, never deleted, exit 4. The
  // tracking ref stays as the clone's pointer to the surviving remote branch.
  const unreached = (label, f, word, env) => {
    const before = remoteTip(f);
    const tracking = trackingTip(f);
    const r = del(f, ['--remote', 'origin'], env);
    assert.strictEqual(r.status, 4, `${label} exits 4: ${r.out} ${r.err}`);
    assert.strictEqual(r.lines.remote.word, word, `${label} reads ${word}: ${r.out}`);
    assert.match(r.lines.remote.line, /git push/, `${label} names the command to run by hand: ${r.out}`);
    assert.strictEqual(remoteTip(f), before, `${label} deletes no remote branch`);
    assert.strictEqual(trackingTip(f), tracking, `${label} keeps the tracking ref: ${r.out}`);
    assert.strictEqual(r.lines.tracking.word, 'not-reached', `${label} reads the tracking line not-reached: ${r.out}`);
    return r;
  };

  // #unreachable: the remote's URL names no repository.
  {
    const f = fixture();
    const realOrigin = f.origin;
    git(['remote', 'set-url', 'origin', path.join(f.origin, 'gone')], f.repo);
    unreached('an unreachable remote', { ...f, origin: realOrigin }, 'failed');
  }

  // #credential-rejected: a host that rejects the credential.
  {
    const f = fixture();
    unreached('a rejected credential', f, 'credential-rejected', fakeGit('ls-remote', `echo "fatal: Authentication failed for 'https://example.invalid/r.git/'" >&2; exit 128`));
  }

  // #timed-out: an upload-pack that stalls past the verb's own bound; the killed call carries no verdict.
  {
    const f = fixture();
    git(['config', 'remote.origin.uploadpack', 'sleep 3;'], f.repo);
    writeOperatorConfig(f.repo, { 'code-host': { pushTimeoutMs: 500 } });
    const r = unreached('a call its bound ended', f, 'timed-out');
    assert.match(r.lines.remote.line, /code-host\.pushTimeoutMs/, `names the key that sets the bound: ${r.out}`);
  }

  // #read-verb: `branch --root` prints the verdict it printed before, and `branch --root delete` reads `delete` as the root path.
  {
    const f = fixture();
    const run = (args) => spawnSync(process.execPath, [scopePath, 'branch', ...args], { cwd: f.repo, encoding: 'utf8', timeout: 120000 });
    const read = run(['--root', f.root]);
    assert.strictEqual(read.status, 0, `the read exits 0: ${read.stderr}`);
    assert.strictEqual(read.stdout.trim(), `ledger ${BRANCH}`, `prints the ledger verdict: ${read.stdout}`);
    const asRoot = run(['--root', 'delete']);
    assert.strictEqual(asRoot.status, 1, `delete as the root path refuses: ${asRoot.stdout}`);
    assert.match(asRoot.stderr, /delete" is not a directory/, `names delete as the root: ${asRoot.stderr}`);
    assert.notStrictEqual(localTip(f), null, 'nothing is deleted');
  }

  // #usage: a missing, duplicate, or unknown flag, and a --root that is no directory, refuse with exit 1.
  {
    const f = fixture();
    const run = (args) => spawnSync(process.execPath, [scopePath, 'branch', 'delete', ...args], { cwd: f.repo, encoding: 'utf8', timeout: 120000 });
    for (const [label, args] of [
      ['no --root', ['--base', 'main']],
      ['no --base', ['--root', f.root]],
      ['a duplicate --base', ['--root', f.root, '--base', 'main', '--base', 'main']],
      ['an unknown flag', ['--root', f.root, '--base', 'main', '--force']],
      ['a leftover word', ['--root', f.root, '--base', 'main', 'extra']],
      ['a --root that is no directory', ['--root', path.join(f.root, 'ledger.md'), '--base', 'main']],
    ]) {
      const r = run(args);
      assert.strictEqual(r.status, 1, `${label} exits 1: ${r.stdout} ${r.stderr}`);
    }
    assert.notStrictEqual(localTip(f), null, 'nothing is deleted');
  }
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}

console.log('scope-branch-delete: ok');
