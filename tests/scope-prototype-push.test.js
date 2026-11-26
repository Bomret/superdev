'use strict';

// Suite for `scope.js prototype push` (ADR 0287, INV-0210): how the verb puts a run's local `prototype/<slug>` branches
// on the remote as `prototype/<scope>/<slug>`, never by force, and records each pushed branch with its commit in the
// ledger's `**Prototypes:**` header. Real git repositories and a real bare remote throughout. The repository and its
// remote are built once into a template and copied for each case.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const SCOPE = 'proto-me';
const BRANCH = `feat/${SCOPE}`;

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

// `main` pushed to a bare `origin`, and two local prototype branches, `prototype/a` and `prototype/b`, each one commit
// past `main`.
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
  git(['push', '-q', 'origin', 'main'], repo);
  for (const slug of ['a', 'b']) {
    git(['checkout', '-q', '-b', `prototype/${slug}`, 'main'], repo);
    commit(repo, `${slug}.md`, `${slug}\n`, `prototype: ${slug}`);
  }
  git(['checkout', '-q', 'main'], repo);
}, 'scope-proto-template-');

const LEDGER = `# Ledger — ${SCOPE}\n\n**Stage:** planned\n**Branch:** ${BRANCH}\n**Anchor:** #1 — proto\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #2 | one | behavior | — | todo | — |\n`;

function fixture({ ledger = LEDGER } = {}) {
  const copy = copyFixture(template(), 'scope-proto-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  const root = path.join(tmp('scope-proto-root-'), SCOPE);
  fs.mkdirSync(root);
  if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger);
  return { repo, origin, root };
}

function protoPush(f, branches, { extra = [], env = {}, remote = 'origin' } = {}) {
  const result = spawnSync(
    process.execPath,
    [scopePath, 'prototype', 'push', '--root', f.root, '--remote', remote, ...extra, ...branches],
    { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, ...env } }
  );
  assertSpawnDecided(result, 'scope.js prototype push');
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const remoteTip = (f, ref) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], { cwd: f.origin, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const ledgerOf = (f) => fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8');
const bullets = (f) => {
  const lines = ledgerOf(f).split('\n');
  const at = lines.indexOf('**Prototypes:**');
  if (at < 0) return null;
  const out = [];
  for (let i = at + 1; i < lines.length && lines[i].startsWith('- '); i++) out.push(lines[i].slice(2));
  return out;
};

test('#push-two: both local prototype branches reach the remote under the scope, a fresh clone fetches both, and the ledger records each with its commit.', () => {
  const f = fixture();
  const a = git(['rev-parse', 'prototype/a'], f.repo);
  const b = git(['rev-parse', 'prototype/b'], f.repo);
  const r = protoPush(f, ['prototype/a', 'prototype/b']);
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^pushed prototype/${SCOPE}/a ${a}$`, 'm'), `prints a pushed line for a: ${r.out}`);
  assert.match(r.out, new RegExp(`^pushed prototype/${SCOPE}/b ${b}$`, 'm'), `prints a pushed line for b: ${r.out}`);
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/a`), a, 'the remote holds a at its local commit');
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/b`), b, 'the remote holds b at its local commit');
  const clone = path.join(tmp('scope-proto-clone-'), 'c');
  git(['clone', '-q', f.origin, clone], f.repo);
  git(['fetch', '-q', 'origin', `prototype/${SCOPE}/a`, `prototype/${SCOPE}/b`], clone);
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a}`, `prototype/${SCOPE}/b ${b}`], `records both: ${ledgerOf(f)}`);
});

test('#missing-branch: a branch missing locally prints missing with no git push, and the other branch still pushes and is recorded.', () => {
  const f = fixture();
  const a = git(['rev-parse', 'prototype/a'], f.repo);
  const r = protoPush(f, ['prototype/gone', 'prototype/a']);
  assert.strictEqual(r.status, 5, `some pushed, some not, exits 5: ${r.out} ${r.err}`);
  assert.match(r.out, /^missing prototype\/gone /m, `prints missing: ${r.out}`);
  assert.match(r.out, new RegExp(`run by hand: git push origin refs/heads/prototype/gone:refs/heads/prototype/${SCOPE}/gone`), `names the hand command: ${r.out}`);
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/gone`), null, 'nothing pushed for the missing branch');
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a}`], 'records the branch that pushed');
});

test('#refused-remote: a remote branch of that name at an unrelated commit prints refused with a hand command, keeps the remote branch, and writes no bullet.', () => {
  const f = fixture();
  const other = path.join(tmp('scope-proto-other-'), 'o');
  git(['clone', '-q', f.origin, other], f.repo);
  git(['config', 'user.email', 'test@example.com'], other);
  git(['config', 'user.name', 'test'], other);
  git(['checkout', '-q', '--orphan', 'x'], other);
  const foreign = commit(other, 'foreign.md', 'foreign\n', 'foreign');
  git(['push', '-q', 'origin', `HEAD:refs/heads/prototype/${SCOPE}/a`], other);
  const r = protoPush(f, ['prototype/a']);
  assert.strictEqual(r.status, 3, `none pushed exits 3: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^refused prototype/${SCOPE}/a: .*run by hand: git push origin `, 'm'), `prints refused with a hand command: ${r.out}`);
  assert.doesNotMatch(r.out, /--force|\+refs/, 'offers no overwriting command');
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/a`), foreign, 'the remote branch is unchanged');
  assert.strictEqual(bullets(f), null, `no bullet is written: ${ledgerOf(f)}`);
});

// A git on PATH that leaves a marker for every call, so a refusal shows it started no git process.
const markingGit = (marker) => {
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = tmp('scope-proto-bin-');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$@" >> '${marker}'\nexec '${realGit}' "$@"\n`);
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
};

test('#refused-names: a name whose slug carries a slash, a leading dash, a plus, or a colon is refused with no git process started, and the remote is unchanged.', () => {
  const f = fixture();
  for (const name of ['prototype/a/b/c', 'prototype/-a', 'prototype/+a', 'prototype/a:b', 'feature/a', 'prototype/other-scope/a']) {
    const marker = path.join(tmp('scope-proto-mark-'), 'calls');
    const r = protoPush(f, ['prototype/a', name], { env: markingGit(marker) });
    assert.strictEqual(r.status, 1, `${name} is a usage refusal: ${r.out} ${r.err}`);
    assert.match(r.err, /names no prototype branch/, `${name} names why: ${r.err}`);
    assert.strictEqual(fs.existsSync(marker), false, `${name} starts no git process`);
  }
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/a`), null, 'the remote is unchanged');
  assert.strictEqual(bullets(f), null, 'nothing recorded');
});

test('#both-spellings: prototype/a and prototype/<scope>/a name one prototype, pushed once and recorded once.', () => {
  const f = fixture();
  const a = git(['rev-parse', 'prototype/a'], f.repo);
  const r = protoPush(f, ['prototype/a', `prototype/${SCOPE}/a`]);
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  assert.strictEqual(r.out.trim().split('\n').length, 1, `one outcome line: ${r.out}`);
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a}`]);
});

test('#push-bound: a push its bound ended before the remote applied it prints timed-out, says the outcome is unknown, and records nothing.', () => {
  const f = fixture();
  const { fetchBound, writeOperatorConfig } = require('./scope-setup');
  const bound = fetchBound();
  const hook = path.join(f.repo, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(hook, `#!/bin/sh\nexec sleep ${Math.ceil(bound / 1000) + 4}\n`);
  fs.chmodSync(hook, 0o755);
  writeOperatorConfig(f.repo, { 'code-host': { pushTimeoutMs: bound } });
  const r = protoPush(f, ['prototype/a']);
  assert.strictEqual(r.status, 3, `exits 3: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^timed-out prototype/${SCOPE}/a: .*outcome is unknown`, 'm'), `prints timed-out and unknown: ${r.out}`);
  assert.strictEqual(bullets(f), null, 'records nothing');
});

test('#push-bound-landed: a push its bound ended after the remote applied it is confirmed by ls-remote, prints pushed, and is recorded.', () => {
  const f = fixture();
  const { fetchBound, writeOperatorConfig } = require('./scope-setup');
  const bound = fetchBound();
  const a = git(['rev-parse', 'prototype/a'], f.repo);
  // A git on PATH whose push runs the real push to the end and then outlives the bound.
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = tmp('scope-proto-bin-');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nif [ "$1" = push ]; then '${realGit}' "$@"; exec sleep ${Math.ceil(bound / 1000) + 4}; fi\nexec '${realGit}' "$@"\n`);
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  writeOperatorConfig(f.repo, { 'code-host': { pushTimeoutMs: bound } });
  const r = protoPush(f, ['prototype/a'], { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/a`), a, 'the fixture landed the push on the remote');
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^pushed prototype/${SCOPE}/a ${a}: .*confirmed`, 'm'), `prints pushed, confirmed after the bound: ${r.out}`);
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a}`], `records the branch: ${ledgerOf(f)}`);
});

test('#redacted-url:a remote URL carrying a token appears in the output of neither prototype push nor scope.js push, on failure or success.', () => {
  const f = fixture();
  git(['remote', 'set-url', 'origin', 'https://tok:SECRET-TOKEN@127.0.0.1:1/hidden-repo.git'], f.repo);
  const r = protoPush(f, ['prototype/a']);
  assert.strictEqual(r.status, 3, `the unreachable push exits 3: ${r.out} ${r.err}`);
  assert.match(r.out, /^unreachable /m, `reads unreachable: ${r.out}`);
  const p = spawnSync(process.execPath, [scopePath, 'push', '--root', f.root, '--remote', 'origin', '--base', 'main'], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
  assertSpawnDecided(p, 'scope.js push');
  for (const [label, text] of [['prototype push', r.out + r.err], ['scope.js push', p.stdout + p.stderr]]) {
    assert.doesNotMatch(text, /SECRET-TOKEN|hidden-repo|:\/\//, `${label} prints no URL and no credential: ${text}`);
  }
  git(['remote', 'set-url', 'origin', f.origin], f.repo);
  const ok = protoPush(f, ['prototype/a']);
  assert.strictEqual(ok.status, 0, `the healthy push exits 0: ${ok.out}`);
  assert.ok(!ok.out.includes(f.origin), `a success prints no remote URL: ${ok.out}`);
});

test('#re-push: a second push of prototype/a at a new commit replaces its bullet, and prototype/b\'s bullet stays.', () => {
  const f = fixture();
  const b = git(['rev-parse', 'prototype/b'], f.repo);
  assert.strictEqual(protoPush(f, ['prototype/a', 'prototype/b']).status, 0);
  git(['checkout', '-q', 'prototype/a'], f.repo);
  const a2 = commit(f.repo, 'a2.md', 'a2\n', 'prototype: a again');
  git(['checkout', '-q', 'main'], f.repo);
  const r = protoPush(f, ['prototype/a']);
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a2}`, `prototype/${SCOPE}/b ${b}`], `replaces a, keeps b: ${ledgerOf(f)}`);
});

const scope = (args, cwd, input) => {
  const r = spawnSync(process.execPath, [scopePath, ...args], { cwd, input, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, `scope.js ${args[0]}`);
  return r;
};
const C1 = 'a'.repeat(40);
const C2 = 'b'.repeat(64);

test('#init-carries: init over a planned ledger holding a **Prototypes:** header keeps it with its bullets.', () => {
  const f = fixture();
  const root = path.join(f.repo, '.superdev', 'scopes', SCOPE);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), LEDGER.replace('**Anchor:**', `**Prototypes:**\n- prototype/${SCOPE}/a ${C1}\n- prototype/${SCOPE}/b ${C2}\n**Anchor:**`));
  const slices = JSON.stringify({ anchor: '#1 — proto', slices: [{ id: '01', issue: '#2', title: 'one', type: 'behavior' }, { id: '02', issue: '#3', title: 'two', type: 'docs' }] });
  const r = scope(['init', BRANCH, 'planned'], f.repo, slices);
  assert.strictEqual(r.status, 0, `init exits 0: ${r.stderr}`);
  const ledger = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.match(ledger, new RegExp(`\\*\\*Prototypes:\\*\\*\\n- prototype/${SCOPE}/a ${C1}\\n- prototype/${SCOPE}/b ${C2}\\n`), `keeps the header and its bullets: ${ledger}`);
  assert.match(ledger, /\| 02 \| #3 \| two /, 'writes the new slice table');
});

test('#publish-adopt: publish then adopt round-trips the header; a ledger with no header adopts as nothing pushed.', () => {
  const f = fixture({ ledger: LEDGER.replace('**Anchor:**', `**Prototypes:**\n- prototype/${SCOPE}/a ${C1}\n**Anchor:**`) });
  const published = scope(['publish', '--root', f.root], f.repo);
  assert.strictEqual(published.status, 0, published.stderr);
  const into = path.join(tmp('scope-proto-adopt-'), SCOPE);
  const r = scope(['adopt', '--root', into], f.repo, `# anchor\n\n${published.stdout}\n`);
  assert.strictEqual(r.status, 0, `adopt exits 0: ${r.stderr}`);
  assert.match(fs.readFileSync(path.join(into, 'ledger.md'), 'utf8'), new RegExp(`\\*\\*Prototypes:\\*\\*\\n- prototype/${SCOPE}/a ${C1}\\n`), 'restores the header');
  const bare = fixture();
  const none = path.join(tmp('scope-proto-adopt-'), SCOPE);
  const plain = scope(['adopt', '--root', none], bare.repo, scope(['publish', '--root', bare.root], bare.repo).stdout);
  assert.strictEqual(plain.status, 0, plain.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(none, 'ledger.md'), 'utf8'), /Prototypes/, 'no header adopts as nothing pushed');
});

test('#adopt-refuses: adopt refuses, naming the bullet, a branch of another scope, a short commit, a duplicate branch, and a second header line.', () => {
  const cases = [
    [`**Prototypes:**\n- prototype/other/a ${C1}`, `prototype/other/a ${C1}`],
    [`**Prototypes:**\n- prototype/${SCOPE}/a/b ${C1}`, `prototype/${SCOPE}/a/b`],
    [`**Prototypes:**\n- prototype/${SCOPE}/a abc123`, `prototype/${SCOPE}/a abc123`],
    [`**Prototypes:**\n- prototype/${SCOPE}/a ${C1.toUpperCase()}`, `prototype/${SCOPE}/a ${C1.toUpperCase()}`],
    [`**Prototypes:**\n- prototype/${SCOPE}/a ${C1}\n- prototype/${SCOPE}/a ${C2}`, `prototype/${SCOPE}/a`],
    [`**Prototypes:**\n- prototype/${SCOPE}/a ${C1}\n**Prototypes:**`, '**Prototypes:**'],
  ];
  for (const [header, named] of cases) {
    const f = fixture({ ledger: LEDGER.replace('**Anchor:**', `${header}\n**Anchor:**`) });
    const into = path.join(tmp('scope-proto-adopt-'), SCOPE);
    const r = scope(['adopt', '--root', into], f.repo, scope(['publish', '--root', f.root], f.repo).stdout);
    assert.strictEqual(r.status, 1, `refuses ${header}: ${r.stdout}`);
    assert.ok(r.stderr.includes(named), `names ${named}: ${r.stderr}`);
    assert.strictEqual(fs.existsSync(path.join(into, 'ledger.md')), false, 'writes no ledger');
  }
});

// `prototype push --delete` (ADR 0287, INV-0210): wrap-up's teardown of every branch the ledger records.
const protoDelete = (f, { remote = 'origin', env = {} } = {}) => {
  const result = spawnSync(
    process.execPath,
    [scopePath, 'prototype', 'push', '--delete', '--root', f.root, ...(remote ? ['--remote', remote] : [])],
    { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, ...env } }
  );
  assertSpawnDecided(result, 'scope.js prototype push --delete');
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const refAt = (repo, ref) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repo, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
// Both prototypes pushed and recorded, with their remote-tracking refs fetched.
const pushedBoth = () => {
  const f = fixture();
  assert.strictEqual(protoPush(f, ['prototype/a', 'prototype/b']).status, 0);
  git(['fetch', '-q', 'origin'], f.repo);
  return f;
};

test('#delete-both: removes both recorded remote branches, their tracking refs, and the matching local branches.', () => {
  const f = pushedBoth();
  const ledger = ledgerOf(f);
  assert.ok(refAt(f.repo, `refs/remotes/origin/prototype/${SCOPE}/a`), 'the fixture fetched a tracking ref');
  const r = protoDelete(f);
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  for (const slug of ['a', 'b']) {
    assert.match(r.out, new RegExp(`^remote deleted origin prototype/${SCOPE}/${slug}`, 'm'), `remote deleted for ${slug}: ${r.out}`);
    assert.match(r.out, new RegExp(`^local deleted prototype/${slug}`, 'm'), `local deleted for ${slug}: ${r.out}`);
    assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/${slug}`), null, `the remote branch ${slug} is gone`);
    assert.strictEqual(refAt(f.repo, `refs/remotes/origin/prototype/${SCOPE}/${slug}`), null, `the tracking ref of ${slug} is gone`);
    assert.strictEqual(refAt(f.repo, `refs/heads/prototype/${slug}`), null, `the local branch ${slug} is gone`);
  }
  assert.strictEqual(ledgerOf(f), ledger, 'writes nothing to the ledger');
  const again = protoDelete(f);
  assert.strictEqual(again.status, 0, `a second run exits 0: ${again.out}`);
  assert.strictEqual((again.out.match(/^remote gone /gm) || []).length, 2, `reads each remote branch gone: ${again.out}`);
  assert.strictEqual((again.out.match(/^local gone /gm) || []).length, 2, `reads each local branch gone: ${again.out}`);
});

test('#delete-moved: a remote branch advanced past its recorded commit is kept with its hand command, the other is still deleted, and the exit is the kept exit.', () => {
  const f = pushedBoth();
  const other = path.join(tmp('scope-proto-other-'), 'o');
  git(['clone', '-q', '-b', `prototype/${SCOPE}/a`, f.origin, other], f.repo);
  git(['config', 'user.email', 'test@example.com'], other);
  git(['config', 'user.name', 'test'], other);
  const moved = commit(other, 'more.md', 'more\n', 'more');
  git(['push', '-q', 'origin', `HEAD:refs/heads/prototype/${SCOPE}/a`], other);
  const r = protoDelete(f);
  assert.strictEqual(r.status, 4, `the kept exit: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^remote kept-moved origin prototype/${SCOPE}/a .*run by hand: git push --force-with-lease=`, 'm'), `kept with a hand command: ${r.out}`);
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/a`), moved, 'the moved branch stays');
  assert.ok(refAt(f.repo, `refs/remotes/origin/prototype/${SCOPE}/a`), 'its tracking ref stays beside it');
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/b`), null, 'the other branch is still deleted');
});

test('#delete-local-kept: a local prototype branch at another commit, or checked out in a worktree, prints local kept with its reason.', () => {
  const f = pushedBoth();
  git(['checkout', '-q', 'prototype/a'], f.repo);
  commit(f.repo, 'a3.md', 'a3\n', 'prototype: a moved on');
  git(['checkout', '-q', 'main'], f.repo);
  const wt = path.join(tmp('scope-proto-wt-'), 't');
  git(['worktree', 'add', '-q', wt, 'prototype/b'], f.repo);
  const r = protoDelete(f);
  assert.match(r.out, /^local kept prototype\/a: .*another commit/m, `a moved local branch is kept: ${r.out}`);
  assert.match(r.out, /^local kept prototype\/b: .*worktree/m, `a checked-out local branch is kept: ${r.out}`);
  assert.ok(refAt(f.repo, 'refs/heads/prototype/a') && refAt(f.repo, 'refs/heads/prototype/b'), 'both local branches stay');
  assert.strictEqual(r.status, 4, `the kept exit: ${r.out}`);
});

test('#delete-no-remote: with no remote resolved, nothing remote changes and each recorded branch prints its hand command.', () => {
  const f = pushedBoth();
  const r = protoDelete(f, { remote: null });
  for (const slug of ['a', 'b']) {
    assert.match(r.out, new RegExp(`^remote not-reached prototype/${SCOPE}/${slug}: .*run by hand: git push --force-with-lease=refs/heads/prototype/${SCOPE}/${slug}:[0-9a-f]{40} --delete <remote> refs/heads/prototype/${SCOPE}/${slug}`, 'm'), `prints the hand command: ${r.out}`);
    assert.ok(remoteTip(f, `prototype/${SCOPE}/${slug}`), `the remote branch ${slug} stays`);
  }
  assert.strictEqual(r.status, 4, `the kept exit: ${r.out} ${r.err}`);
});

test('#delete-nothing-recorded: a ledger with no **Prototypes:** header exits 0 having touched nothing.', () => {
  const f = fixture();
  const marker = path.join(tmp('scope-proto-mark-'), 'calls');
  const r = protoDelete(f, { env: markingGit(marker) });
  assert.strictEqual(r.status, 0, `exits 0: ${r.out} ${r.err}`);
  assert.match(r.out, /nothing is recorded/, `says nothing is recorded: ${r.out}`);
  assert.strictEqual(fs.existsSync(marker), false, 'starts no git process');
  assert.ok(refAt(f.repo, 'refs/heads/prototype/a'), 'the local branch stays');
});

test('#delete-bad-record: --delete refuses a recorded bullet of another scope, with a short commit, or named twice, with no git process started.', () => {
  const cases = [
    [`- prototype/other/a ${C1}`, `prototype/other/a ${C1}`],
    [`- prototype/${SCOPE}/a abc123`, `prototype/${SCOPE}/a abc123`],
    [`- prototype/${SCOPE}/a ${C1}\n- prototype/${SCOPE}/a ${C2}`, `prototype/${SCOPE}/a`],
  ];
  for (const [bulletText, named] of cases) {
    const f = fixture({ ledger: LEDGER.replace('**Anchor:**', `**Prototypes:**\n${bulletText}\n**Anchor:**`) });
    const marker = path.join(tmp('scope-proto-mark-'), 'calls');
    const r = protoDelete(f, { env: markingGit(marker) });
    assert.strictEqual(r.status, 1, `refuses ${bulletText}: ${r.out} ${r.err}`);
    assert.ok(r.err.includes(named), `names ${named}: ${r.err}`);
    assert.strictEqual(fs.existsSync(marker), false, `${bulletText} starts no git process`);
  }
});

test('#url-remote: a URL given as the remote appears in the output of neither prototype push, prototype push --delete, branch delete, nor scope.js push.', () => {
  const url = 'https://tok:SECRET-TOKEN@127.0.0.1:1/hidden-repo.git';
  const f = fixture({ ledger: LEDGER.replace('**Anchor:**', `**Prototypes:**\n- prototype/${SCOPE}/a ${C1}\n**Anchor:**`) });
  git(['branch', BRANCH, 'main'], f.repo);
  const run = (args) => {
    const r = spawnSync(process.execPath, [scopePath, ...args], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    assertSpawnDecided(r, `scope.js ${args.join(' ')}`);
    return r.stdout + r.stderr;
  };
  const outputs = [
    ['prototype push', run(['prototype', 'push', '--root', f.root, '--remote', url, 'prototype/a'])],
    ['prototype push --delete', run(['prototype', 'push', '--delete', '--root', f.root, '--remote', url])],
    ['scope.js push', run(['push', '--root', f.root, '--remote', url, '--base', 'main'])],
    ['branch delete', run(['branch', 'delete', '--root', f.root, '--base', 'main', '--remote', url])],
  ];
  for (const [label, text] of outputs) {
    assert.doesNotMatch(text, /SECRET-TOKEN|hidden-repo|:\/\//, `${label} prints no URL and no credential: ${text}`);
    assert.match(text, /<remote>/, `${label} names the remote as <remote>: ${text}`);
  }
});

test('#delete-refusals: --delete takes no branch argument.', () => {
  const f = pushedBoth();
  const r = spawnSync(process.execPath, [scopePath, 'prototype', 'push', '--delete', '--root', f.root, '--remote', 'origin', 'prototype/a'], { cwd: f.repo, encoding: 'utf8' });
  assert.strictEqual(r.status, 1, `a usage refusal: ${r.stdout} ${r.stderr}`);
  assert.ok(remoteTip(f, `prototype/${SCOPE}/a`), 'nothing deleted');
});

// The no-verdict reads (ADR 0290, INV-0009): a fake git ends one read with SIGKILL and runs every other call.
const { fakeGit: killGit } = require('./fake-git.js');

test('#push-no-verdict: a later slug whose read is killed stops the push; the slug pushed before it is printed and recorded, and --delete finds it.', () => {
  const f = fixture();
  const a = git(['rev-parse', 'prototype/a'], f.repo);
  const killed = killGit({ match: '^rev-parse --verify --quiet --end-of-options refs/heads/prototype/b' });
  const r = protoPush(f, ['prototype/a', 'prototype/b'], { env: { PATH: killed.env.PATH } });
  assert.notStrictEqual(r.status, 0, 'the push exits nonzero');
  assert.strictEqual(r.out, `pushed prototype/${SCOPE}/a ${a}\n`, `prints the slug it pushed: ${r.out}`);
  assert.deepStrictEqual(r.err.trim().split('\n'), ['git rev-parse was ended by signal SIGKILL — no verdict'], 'the refusal is its one stderr line');
  assert.deepStrictEqual(bullets(f), [`prototype/${SCOPE}/a ${a}`], 'records the pushed slug');
  assert.strictEqual(remoteTip(f, `prototype/${SCOPE}/b`), null, 'attempts no further slug');
  const d = protoDelete(f);
  assert.match(d.out, new RegExp(`^remote deleted origin prototype/${SCOPE}/a`, 'm'), `--delete finds the recorded slug: ${d.out}`);
});

test('#delete-no-verdict: a branch whose read is killed prints unknown, every other branch is tried, and the exit is 4.', () => {
  const f = pushedBoth();
  const killed = killGit({ match: '^rev-parse --verify --quiet --end-of-options refs/heads/prototype/a' });
  const r = protoDelete(f, { env: { PATH: killed.env.PATH } });
  assert.strictEqual(r.status, 4, `exits 4: ${r.out} ${r.err}`);
  assert.match(r.out, new RegExp(`^unknown prototype/${SCOPE}/a git rev-parse was ended by signal SIGKILL — no verdict$`, 'm'), r.out);
  assert.match(r.out, new RegExp(`^remote deleted origin prototype/${SCOPE}/b`, 'm'), `b is still deleted: ${r.out}`);
  assert.ok(remoteTip(f, `prototype/${SCOPE}/a`), 'the unread branch stays on the remote');
});
