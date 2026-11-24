'use strict';

// Suite for `scope.js contained <base> <branch> [--remote <remote>]` (ADR 0053, ADR 0065, INV-0195): the verb prints
// the containment verdict of `plugin/lib/containment.js`, then the base it judged against, the remote, and how it
// judged. Real git repositories and a real bare remote throughout. Each case copies one fixture built once per process.

const { test, after } = require('node:test');
require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath, fetchBound, writeOperatorConfig } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { shq } = require('./spawn-verdict');

after(() => {
  process.on('exit', () => {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  });
});

const made = [];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function commit(repo, file, body, msg) {
  fs.writeFileSync(path.join(repo, file), body);
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', msg], repo);
}

// `main` pushed to a bare `origin`; `docs/agents/code-management.md` names the remote; three branches cut from `main`:
// `fix/squashed` (squash-merged onto `main`), `fix/merged` (merged with a merge commit), and `fix/open` (not merged).
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
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '- **Remote:** `origin` (GitHub). Confirm with `git remote -v`.\n');
  commit(repo, 'README.md', 'x\n', 'init');
  git(['remote', 'add', 'origin', origin], repo);
  for (const [branch, file] of [['fix/squashed', 'a.txt'], ['fix/merged', 'b.txt'], ['fix/open', 'c.txt']]) {
    git(['checkout', '-q', '-b', branch, 'main'], repo);
    commit(repo, file, `${branch}\n`, `work on ${branch}`);
  }
  git(['checkout', '-q', 'main'], repo);
  git(['merge', '-q', '--squash', 'fix/squashed'], repo);
  git(['commit', '-q', '-m', 'fix: squashed (#1)'], repo);
  git(['merge', '-q', '--no-ff', '-m', 'merge', 'fix/merged'], repo);
  git(['push', '-q', 'origin', 'main'], repo);
}, 'scope-contained-template-');

function fixture() {
  const copy = copyFixture(template(), 'scope-contained-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  git(['remote', 'set-url', 'origin', path.join(copy, 'origin')], repo);
  return repo;
}

function contained(repo, args, env = {}) {
  const r = spawnSync(process.execPath, [scopePath, 'contained', ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120000,
    killSignal: 'SIGKILL',
    env: { ...process.env, ...env },
  });
  assertSpawnDecided(r, `scope.js contained ${args.join(' ')}`);
  return { status: r.status, lines: r.stdout.split('\n').filter(Boolean), out: r.stdout, err: r.stderr };
}

test('#verdicts: each verdict, its exit status, and the lines after it.', () => {
  const repo = fixture();
  const mainTip = git(['rev-parse', 'main'], repo);

  const squashed = contained(repo, ['main', 'fix/squashed']);
  assert.deepStrictEqual(squashed.lines, ['contained', `base ${mainTip}`, 'remote origin', 'judged local'], `a squash-merged branch: ${squashed.out}`);
  assert.strictEqual(squashed.status, 0, 'contained exits 0');

  const open = contained(repo, ['main', 'fix/open']);
  assert.deepStrictEqual(open.lines, ['not-contained', `base ${mainTip}`, 'remote origin', 'judged refetched'], `an unmerged branch: ${open.out}`);
  assert.strictEqual(open.status, 3, 'not-contained exits 3');

  const missing = contained(repo, ['main', 'fix/does-not-exist']);
  assert.deepStrictEqual(missing.lines, ['could-not-resolve', `base ${mainTip}`, 'remote origin', 'judged local'], `a branch naming no ref: ${missing.out}`);
  assert.strictEqual(missing.status, 4, 'could-not-resolve exits 4');
});

test('#remote: `--remote` wins; the default is code-management.md\'s `Remote:` value; with neither the verb refuses.', () => {
  const repo = fixture();
  git(['remote', 'rename', 'origin', 'upstream'], repo);
  const named = contained(repo, ['main', 'fix/open', '--remote', 'upstream']);
  assert.strictEqual(named.lines[2], 'remote upstream', `--remote names the remote: ${named.out}`);
  assert.strictEqual(named.status, 3, 'the named remote answers');

  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '- **Remote**: `upstream`\n');
  const fromDoc = contained(repo, ['main', 'fix/open']);
  assert.strictEqual(fromDoc.lines[2], 'remote upstream', `the default comes from code-management.md: ${fromDoc.out}`);
  // A call from a subdirectory reads the document at the repository's top level.
  const sub = path.join(repo, 'docs', 'agents');
  const fromSub = spawnSync(process.execPath, [scopePath, 'contained', 'main', 'fix/open'], { cwd: sub, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
  assertSpawnDecided(fromSub, 'scope.js contained from a subdirectory');
  assert.strictEqual(fromSub.stdout.split('\n')[2], 'remote upstream', `a subdirectory call finds the Remote: value: ${fromSub.stdout}${fromSub.stderr}`);

});

// A configured `origin` is never contacted: it points at an unreachable URL, and no FETCH_HEAD and no refetch mark
// appear.
test('#no-remote: with no --remote and no Remote: value the verb judges against the local base, fetches from no remote, and prints `remote none`.', () => {
  const repo = fixture();
  fs.rmSync(path.join(repo, 'docs', 'agents', 'code-management.md'));
  git(['remote', 'set-url', 'origin', 'https://unreachable.invalid/x.git'], repo);
  const fetchHead = path.join(repo, '.git', 'FETCH_HEAD');
  fs.rmSync(fetchHead, { force: true });
  const mainTip = git(['rev-parse', 'main'], repo);

  const squashed = contained(repo, ['main', 'fix/squashed']);
  assert.deepStrictEqual(squashed.lines, ['contained', `base ${mainTip}`, 'remote none', 'judged local'], `a squash-merged branch with no remote: ${squashed.out}${squashed.err}`);
  assert.strictEqual(squashed.status, 0, 'contained with no remote exits 0');

  const open = contained(repo, ['main', 'fix/open']);
  assert.deepStrictEqual(open.lines, ['not-contained', `base ${mainTip}`, 'remote none', 'judged local'], `an unmerged branch with no remote: ${open.out}${open.err}`);
  assert.strictEqual(open.status, 3, 'not-contained with no remote exits 3');
  assert.ok(!fs.existsSync(fetchHead), 'no remote was fetched: no FETCH_HEAD');
});

// A refetch that failed, or that its bound ended, leaves the local not-contained answer standing, marked so a caller
// never reads it as evidence about the branch (INV-0009).
test('#refetch: a refetch that brought the base reads `judged refetched` with the fetched commit as the base, and a squash-merge only the remote holds reads contained.', () => {
  const repo = fixture();
  // The remote gains a squash of `fix/open` that the local `main` lacks.
  const other = path.join(path.dirname(repo), 'other');
  git(['clone', '-q', path.join(path.dirname(repo), 'origin'), other], repo);
  git(['config', 'user.email', 'test@example.com'], other);
  git(['config', 'user.name', 'test'], other);
  commit(other, 'c.txt', 'fix/open\n', 'fix: open (#2)');
  git(['push', '-q', 'origin', 'main'], other);
  const remoteTip = git(['rev-parse', 'HEAD'], other);
  const r = contained(repo, ['main', 'fix/open']);
  assert.deepStrictEqual(r.lines, ['contained', `base ${remoteTip}`, 'remote origin', 'judged refetched'], `a base only the remote holds: ${r.out}`);
  assert.strictEqual(r.status, 0, 'contained exits 0');
});

test('A refetch from a remote that does not exist fails, and the local answer stands with exit 3', () => {
  const repo = fixture();
  const failed = contained(repo, ['main', 'fix/open', '--remote', 'nowhere']);
  assert.deepStrictEqual(failed.lines.slice(0, 1).concat(failed.lines.slice(2)), ['not-contained', 'remote nowhere', 'judged local', 'refetch failed'], `a refetch that failed: ${failed.out}`);
  assert.strictEqual(failed.status, 3, 'the local answer stands with exit 3');
});

test('A remote whose upload-pack never answers, under the bound the operator configuration sets: this run\'s `fetchBound()`.', () => {
  const repo = fixture();
  const bound = fetchBound();
  writeOperatorConfig(repo, { 'code-host': { pushTimeoutMs: bound } });
  const hang = path.join(repo, '..', 'hang.sh');
  fs.writeFileSync(hang, `#!/bin/sh\nexec sleep ${Math.ceil(bound / 1000) + 4}\n`, { mode: 0o755 });
  git(['config', 'remote.origin.uploadpack', shq(hang)], repo);
  const r = contained(repo, ['main', 'fix/open']);
  assert.strictEqual(r.lines[0], 'not-contained', `a refetch its bound ended keeps the local verdict: ${r.out}`);
  assert.strictEqual(r.lines[3], 'judged local', 'the local base judged');
  assert.strictEqual(r.lines[4], 'refetch timed-out', `the marker names the bound: ${r.out}`);
  assert.strictEqual(r.status, 3, 'exits 3');
});


test('#fallback: a git without `--write-tree` judges by ancestry and says so.', () => {
  const repo = fixture();
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-contained-oldgit-'));
  made.push(shim);
  fs.writeFileSync(
    path.join(shim, 'git'),
    `#!/bin/sh\nif [ "$1" = "merge-tree" ] && [ "$2" = "--write-tree" ]; then exit 129; fi\nexec ${shq(realGit)} "$@"\n`,
    { mode: 0o755 }
  );
  const r = contained(repo, ['main', 'fix/merged'], { PATH: shim + path.delimiter + process.env.PATH });
  assert.strictEqual(r.lines[0], 'contained', `a merge commit reads contained by ancestry: ${r.out}`);
  assert.strictEqual(r.lines[4], 'fallback ancestor', `the fallback is marked: ${r.out}`);
  assert.strictEqual(contained(repo, ['main', 'fix/merged']).lines.includes('fallback ancestor'), false, 'no marker where --write-tree ran');
});

test('#option-shaped: an option-shaped base or branch is an operand, never an option of the verb or of git.', () => {
  const repo = fixture();
  const marker = path.join(repo, '..', 'ran');
  const payload = `--upload-pack=touch ${marker}`;
  const asBranch = contained(repo, ['main', payload]);
  assert.strictEqual(asBranch.lines[0], 'could-not-resolve', `an option-shaped branch names no ref: ${asBranch.out}`);
  assert.strictEqual(asBranch.status, 4, 'exits 4');
  const asBase = contained(repo, [payload, 'fix/open']);
  assert.notStrictEqual(asBase.status, 1, `an option-shaped base is no usage refusal: ${asBase.err}`);
  assert.strictEqual(asBase.lines[0], 'not-contained', `an option-shaped base never holds the branch: ${asBase.out}`);
  assert.strictEqual(fs.existsSync(marker), false, 'neither operand ran as --upload-pack');
});

// It writes tree objects, fetched objects, and `FETCH_HEAD` in git, and nothing else. The remote has moved, so one
// call refetches.
test('#read-only: the verb changes no ref, index, or working tree, and creates no run state.', () => {
  const repo = fixture();
  const other = path.join(path.dirname(repo), 'other');
  git(['clone', '-q', path.join(path.dirname(repo), 'origin'), other], repo);
  git(['config', 'user.email', 'test@example.com'], other);
  git(['config', 'user.name', 'test'], other);
  commit(other, 'moved.txt', 'moved\n', 'fix: moved (#3)');
  git(['push', '-q', 'origin', 'main'], other);
  const snapshot = () => [
    git(['for-each-ref'], repo),
    git(['rev-parse', 'HEAD'], repo),
    git(['ls-files', '-s'], repo),
    git(['status', '--porcelain'], repo),
  ].join('\n--\n');
  const before = snapshot();
  contained(repo, ['main', 'fix/open']);
  contained(repo, ['main', 'fix/squashed']);
  assert.strictEqual(snapshot(), before, 'no ref (remote-tracking included), HEAD, index, or working tree changed');
  assert.strictEqual(fs.existsSync(path.join(repo, '.superdev')), false, 'no run state was created');
});

