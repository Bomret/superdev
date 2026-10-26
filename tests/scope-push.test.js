'use strict';

// Suite for `scope.js push` (ADR 0167, INV-0169): how the verb puts a run's scope branch on the remote, decided
// from the remote tip it fetched. Real git repositories and a real bare remote throughout: the git plumbing and
// the lease are the thing under test, not a stub over them. Each case builds its own fixture.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');

const BRANCH = 'feat/push-me';
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

// A repository with `main` pushed to a bare `origin`, the scope branch cut from `main` carrying one commit, and a
// run root whose ledger names the branch.
// The repository and its remote are built once into a template and copied for each case.
const template = templateOnce((dir) => {
  const repo = path.join(dir, 'repo');
  const origin = path.join(dir, 'origin');
  fs.mkdirSync(repo);
  fs.mkdirSync(origin);
  git(['init', '-q', '--bare', '-b', 'main'], origin);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'test'], repo);
  commit(repo, 'README.md', 'x\n', 'init');
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main'], repo);
  git(['checkout', '-q', '-b', BRANCH], repo);
  commit(repo, 'design.md', 'plan\n', 'docs: plan');
  git(['checkout', '-q', 'main'], repo);
}, 'scope-push-template-');

function fixture({ ledger = `# Ledger — push-me\n\n**Stage:** planned\n**Branch:** ${BRANCH}\n` } = {}) {
  const copy = copyFixture(template(), 'scope-push-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  const root = tmp('scope-push-root-');
  if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger);
  return { repo, origin, root };
}

function push(f, extra = [], env = {}) {
  const result = spawnSync(
    process.execPath,
    [scopePath, 'push', '--root', f.root, '--remote', 'origin', '--base', 'main', ...extra],
    { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, ...env } }
  );
  assertSpawnDecided(result, 'scope.js push');
  return { status: result.status, out: result.stdout, err: result.stderr, word: result.stdout.split(/\s/)[0] };
}

const remoteTip = (f) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`], { cwd: f.origin, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const localTip = (f) => git(['rev-parse', BRANCH], f.repo);

try {
  // #no-remote-branch: the remote holds no such branch, so a plain push puts the local tip there with an upstream.
  {
    const f = fixture();
    const r = push(f);
    assert.strictEqual(r.status, 0, `push exits 0: ${r.err}`);
    assert.strictEqual(r.word, 'pushed', `prints the outcome: ${r.out}`);
    assert.strictEqual(remoteTip(f), localTip(f), 'the remote holds the local tip');
    assert.strictEqual(git(['rev-parse', '--abbrev-ref', `${BRANCH}@{upstream}`], f.repo), `origin/${BRANCH}`, 'an upstream is set');
  }

  // #ancestor-and-equal-tip: a remote tip equal to the local tip, then one the local tip descends from, each
  // pushes by fast-forward.
  {
    const f = fixture();
    git(['push', '-q', 'origin', BRANCH], f.repo);
    const equal = push(f);
    assert.strictEqual(equal.status, 0, `an equal tip exits 0: ${equal.err}`);
    assert.strictEqual(equal.word, 'pushed', `an equal tip prints pushed: ${equal.out}`);
    git(['checkout', '-q', BRANCH], f.repo);
    commit(f.repo, 'more.md', 'append\n', 'docs: append');
    git(['checkout', '-q', 'main'], f.repo);
    const ahead = push(f);
    assert.strictEqual(ahead.status, 0, `a descendant tip exits 0: ${ahead.err}`);
    assert.strictEqual(ahead.word, 'pushed', `a descendant tip prints pushed: ${ahead.out}`);
    assert.strictEqual(remoteTip(f), localTip(f), 'the remote holds the new local tip');
  }

  // A remote copy left by a squash-merged run under the same label: base holds its content, and the local branch
  // was re-pointed to base, so the remote tip is no ancestor of the local one.
  const staleRemote = () => {
    const f = fixture();
    git(['push', '-q', 'origin', BRANCH], f.repo);
    const stale = localTip(f);
    git(['merge', '-q', '--squash', BRANCH], f.repo);
    git(['commit', '-q', '-m', 'feat: squashed (#1)'], f.repo);
    git(['push', '-q', 'origin', 'main'], f.repo);
    git(['branch', '-q', '-f', BRANCH, 'main'], f.repo);
    return { f, stale };
  };

  // #contained-remote-tip: the verb overwrites the remote through a lease on that exact tip.
  {
    const { f } = staleRemote();
    const r = push(f);
    assert.strictEqual(r.status, 0, `a contained tip exits 0: ${r.err}`);
    assert.strictEqual(r.word, 'overwritten', `a contained tip prints overwritten: ${r.out}`);
    assert.strictEqual(remoteTip(f), localTip(f), 'the remote holds the re-pointed local tip');
  }

  // #remote-moved-before-the-push: a pre-push hook moves the remote after the verb's fetch, so the lease no
  // longer matches, the push is rejected, and the remote keeps the newer tip.
  {
    const { f, stale } = staleRemote();
    const other = tmp('scope-push-other-');
    git(['clone', '-q', '-b', BRANCH, f.origin, other], f.repo);
    git(['config', 'user.email', 'test@example.com'], other);
    git(['config', 'user.name', 'test'], other);
    const newer = commit(other, 'theirs.md', 'theirs\n', 'docs: theirs');
    const hook = path.join(f.repo, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(hook, `#!/bin/sh\ngit -C '${other}' push -q origin ${BRANCH} >/dev/null 2>&1\nexit 0\n`);
    fs.chmodSync(hook, 0o755);
    const r = push(f);
    assert.notStrictEqual(r.status, 0, `a rejected lease push exits nonzero: ${r.out}`);
    assert.notStrictEqual(r.status, 1, 'a rejected push is no usage refusal');
    assert.strictEqual(r.word, 'push-failed', `a rejected lease push prints push-failed: ${r.out}`);
    assert.notStrictEqual(newer, stale, 'the fixture moved the remote');
    assert.strictEqual(remoteTip(f), newer, 'the remote keeps the newer tip');
    assert.match(r.out, new RegExp(`git push -u origin ${BRANCH}`), 'names the command to run by hand');
  }

  // #foreign-remote-tip: the remote branch carries content base does not hold, so the verb pushes nothing and
  // lists the remote tip's commits ahead of base.
  const foreignRemote = () => {
    const f = fixture();
    const other = tmp('scope-push-other-');
    git(['clone', '-q', f.origin, other], f.repo);
    git(['config', 'user.email', 'test@example.com'], other);
    git(['config', 'user.name', 'test'], other);
    git(['checkout', '-q', '-b', BRANCH], other);
    const foreign = commit(other, 'foreign.md', 'someone else\n', 'docs: a foreign plan');
    git(['push', '-q', 'origin', BRANCH], other);
    return { f, foreign };
  };
  {
    const { f, foreign } = foreignRemote();
    const r = push(f);
    assert.strictEqual(r.status, 3, `a refusal exits 3: ${r.out} ${r.err}`);
    assert.strictEqual(r.word, 'refused', `prints refused: ${r.out}`);
    assert.strictEqual(remoteTip(f), foreign, 'the remote keeps its tip');
    assert.match(r.out, /docs: a foreign plan/, 'lists the remote tip commits ahead of base');
    assert.doesNotMatch(r.out, /--force/, 'offers no overwriting command');
  }

  // #stale-local-base: the remote base gained a commit the local base lacks, and the foreign remote tip sits on top
  // of it; the refusal lists only the commits the fetched base does not hold.
  {
    const f = fixture();
    const other = tmp('scope-push-other-');
    git(['clone', '-q', f.origin, other], f.repo);
    git(['config', 'user.email', 'test@example.com'], other);
    git(['config', 'user.name', 'test'], other);
    commit(other, 'landed.md', 'landed\n', 'feat: landed on base');
    git(['push', '-q', 'origin', 'main'], other);
    git(['checkout', '-q', '-b', BRANCH], other);
    commit(other, 'foreign.md', 'someone else\n', 'docs: a foreign plan');
    git(['push', '-q', 'origin', BRANCH], other);
    const r = push(f);
    assert.strictEqual(r.word, 'refused', `prints refused: ${r.out}`);
    assert.match(r.out, /docs: a foreign plan/, 'lists the commit base does not hold');
    assert.doesNotMatch(r.out, /feat: landed on base/, `omits the commit the fetched base holds: ${r.out}`);
  }

  // #local-namesake: a local branch of the same name that base holds does not make a foreign remote tip read
  // contained — the verb judges the remote tip itself.
  {
    const { f, foreign } = foreignRemote();
    git(['branch', '-q', '-f', BRANCH, 'main'], f.repo);
    const r = push(f);
    assert.strictEqual(r.word, 'refused', `a foreign tip behind a contained namesake is refused: ${r.out}`);
    assert.strictEqual(remoteTip(f), foreign, 'the remote keeps its tip');
  }

  // A fetch that cannot answer: each case reports its own outcome, exits 3, pushes nothing, and leaves the ledger
  // as it was.
  const undecided = (label, f, word, env) => {
    const ledger = fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8');
    const before = remoteTip(f);
    const r = push(f, [], env);
    assert.strictEqual(r.word, word, `${label} prints ${word}: ${r.out} ${r.err}`);
    assert.strictEqual(r.status, 3, `${label} exits 3`);
    assert.strictEqual(remoteTip(f), before, `${label} pushes nothing`);
    assert.strictEqual(fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8'), ledger, `${label} leaves the ledger unchanged`);
    assert.match(r.out, new RegExp(`git push -u origin ${BRANCH}`), `${label} names the command to run by hand`);
    return r;
  };

  // #unreachable-remote: the remote's URL names no repository.
  {
    const f = fixture();
    git(['remote', 'set-url', 'origin', path.join(f.origin, 'gone')], f.repo);
    undecided('an unreachable remote', f, 'unreachable');
  }

  // #credential-rejected: a git on PATH that answers the fetch the way a host rejecting the credential does, and
  // forwards every other call to the real git.
  {
    const f = fixture();
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const bin = tmp('scope-push-bin-');
    fs.writeFileSync(
      path.join(bin, 'git'),
      `#!/bin/sh\nif [ "$1" = fetch ]; then echo "fatal: Authentication failed for 'https://example.invalid/r.git/'" >&2; exit 128; fi\nexec '${realGit}' "$@"\n`
    );
    fs.chmodSync(path.join(bin, 'git'), 0o755);
    undecided('a rejected credential', f, 'credential-rejected', { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  }

  // #fetch-bound: an upload-pack that stalls past the verb's own bound; the killed fetch carries no verdict.
  {
    const f = fixture();
    git(['config', 'remote.origin.uploadpack', 'sleep 3;'], f.repo);
    undecided('a fetch its bound ended', f, 'timed-out', { SUPERDEV_PUSH_TIMEOUT_MS: '500' });
  }

  // A git on PATH whose fetch of base runs `action` and forwards every other call, the branch fetch included, to
  // the real git: the remote tip is fetched, and only the containment test's refetch of base fails.
  const baseFetchGit = (action) => {
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const bin = tmp('scope-push-bin-');
    fs.writeFileSync(
      path.join(bin, 'git'),
      `#!/bin/sh\nif [ "$1" = fetch ]; then for a; do last="$a"; done; if [ "$last" = main ]; then ${action}; fi; fi\nexec '${realGit}' "$@"\n`
    );
    fs.chmodSync(path.join(bin, 'git'), 0o755);
    return { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  };

  // #refetch-bound: the containment test's refetch of base, ended by the verb's own bound, carries no verdict —
  // never a refusal the verb did not make.
  {
    const { f } = foreignRemote();
    const r = undecided('a refetch its bound ended', f, 'timed-out', { ...baseFetchGit('exec sleep 8'), SUPERDEV_PUSH_TIMEOUT_MS: '1500' });
    // The branch fetch's bound names the branch; only the refetch of base names main, so a branch fetch
    // ended under load fails here instead of passing on timed-out alone.
    assert.match(r.out, /the fetch of origin main was ended by its own bound/, `names the refetch of base as the call its bound ended: ${r.out}`);
  }

  // #refetch-failed: a refetch of base that fails leaves the remote tip undecided, never refused.
  {
    const { f } = foreignRemote();
    undecided('a refetch that failed', f, 'unreachable', baseFetchGit("echo 'fatal: unable to access base' >&2; exit 128"));
  }

  // #refetch-credential: a refetch of base the host rejects the credential of reads as credential-rejected, never unreachable.
  {
    const { f } = foreignRemote();
    undecided('a refetch with a rejected credential', f, 'credential-rejected', baseFetchGit("echo \"fatal: Authentication failed for 'https://example.invalid/r.git/'\" >&2; exit 128"));
  }

  // #refetch-locale: the refetch of base runs under the C locale, so its stderr is git's own English text: a git that
  // words the rejection in another language under any other locale still reads as credential-rejected.
  {
    const { f } = foreignRemote();
    const action = "if [ \"$LC_ALL\" != C ]; then echo 'fatal: Authentifizierung fehlgeschlagen' >&2; exit 128; fi; echo 'fatal: Authentication failed' >&2; exit 128";
    undecided('a refetch read under the C locale', f, 'credential-rejected', { ...baseFetchGit(action), LC_ALL: 'de_DE.UTF-8' });
  }

  // #push-bound: a push its own bound ended reports the bound, never a rejection it did not see.
  {
    const f = fixture();
    const hook = path.join(f.repo, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(hook, '#!/bin/sh\nsleep 5\n');
    fs.chmodSync(hook, 0o755);
    const r = push(f, [], { SUPERDEV_PUSH_TIMEOUT_MS: '1500' });
    assert.strictEqual(r.word, 'timed-out', `a push its bound ended prints timed-out: ${r.out}`);
    assert.match(r.out, /push/, 'names the push as the call its bound ended');
    assert.strictEqual(r.status, 3, 'exits 3');
  }

  // #option-shaped-values: a remote or branch shaped like an option reaches git as a name, never as an option.
  {
    const f = fixture();
    const marker = path.join(f.root, 'ran');
    const asRemote = spawnSync(
      process.execPath,
      [scopePath, 'push', '--root', f.root, '--remote', `--upload-pack=touch ${marker}`, '--base', 'main'],
      { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' }
    );
    assertSpawnDecided(asRemote, 'scope.js push with an option-shaped remote');
    assert.strictEqual(asRemote.status, 3, `an option-shaped remote pushes nothing: ${asRemote.stdout}`);
    assert.strictEqual(fs.existsSync(marker), false, 'the option-shaped remote never ran as --upload-pack');
    fs.writeFileSync(path.join(f.root, 'ledger.md'), `**Stage:** planned\n**Branch:** --upload-pack=touch ${marker}\n`);
    const asBranch = push(f);
    assert.notStrictEqual(asBranch.status, 0, 'an option-shaped branch pushes nothing');
    assert.strictEqual(fs.existsSync(marker), false, 'the option-shaped branch never ran as --upload-pack');
    assert.strictEqual(remoteTip(f), null, 'the remote holds no branch');
  }

  // #no-ledger and #no-branch-line: a usage refusal, exit 1, and nothing pushed.
  {
    const f = fixture({ ledger: null });
    const r = push(f);
    assert.strictEqual(r.status, 1, 'a run root with no ledger refuses with exit 1');
    assert.match(r.err, /no ledger/, `names the missing ledger: ${r.err}`);
    assert.strictEqual(remoteTip(f), null, 'nothing pushed');
    const g = fixture({ ledger: '# Ledger\n\n**Stage:** planned\n' });
    const s = push(g);
    assert.strictEqual(s.status, 1, 'a ledger with no Branch line refuses with exit 1');
    assert.match(s.err, /Branch/, `names the missing line: ${s.err}`);
    assert.strictEqual(remoteTip(g), null, 'nothing pushed');
  }

  // #branch-is-base: a ledger whose Branch line names the base branch refuses with exit 1 and pushes nothing to
  // base, even a local base ahead of the remote one.
  {
    const f = fixture({ ledger: '# Ledger\n\n**Stage:** planned\n**Branch:** main\n' });
    commit(f.repo, 'unpushed.md', 'local only\n', 'chore: unpushed on base');
    const before = git(['rev-parse', 'main'], f.origin);
    const r = push(f);
    assert.strictEqual(r.status, 1, `a Branch line naming base refuses with exit 1: ${r.out} ${r.err}`);
    assert.match(r.err, /base/, `names the base: ${r.err}`);
    assert.strictEqual(git(['rev-parse', 'main'], f.origin), before, 'the remote base is unchanged');
  }

  // #help: `scope.js --help` lists the verb.
  {
    const r = spawnSync(process.execPath, [scopePath, '--help'], { encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    assertSpawnDecided(r, 'scope.js --help');
    assert.match(r.stdout, /push --root <run-root> --remote <remote> --base <base-ref>/, 'the usage lists push');
  }
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}

console.log('scope-push: ok');
