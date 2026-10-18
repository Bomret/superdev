'use strict';

// Suite for plugin/scripts/scope.js's exported containment test, `testContainment`, and the probe
// `baseHistoryHasPatch` (ADR 0053, ADR 0065, ADR 0082). Real git repositories throughout: the git plumbing is the
// thing under test, not a stub over it. Each case builds its own repository, so the suite needs only the `scope.js`
// path from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath } = require('./scope-setup');
const { testContainment, baseHistoryHasPatch } = require(scopePath);

// --- testContainment: the exported containment test (ADR 0053, ADR 0065) ---------------------
//
// No CLI verb — a sibling script `require`s this directly, the same shape `readLedgerHeader` already
// gives `hooks/scope-prune.js`. Real git repositories throughout, the same way tests/scope-prune-containment.test.js's
// own containment fixtures do: the git plumbing is the thing under test, not a stub over it.
{
  function gitTest(args, cwd) {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }

  function makeRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-'));
    gitTest(['init', '-q', '-b', 'main'], dir);
    gitTest(['config', 'user.email', 'test@example.com'], dir);
    gitTest(['config', 'user.name', 'test'], dir);
    fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
    gitTest(['add', '.'], dir);
    gitTest(['commit', '-q', '-m', 'init'], dir);
    return dir;
  }

  function makeWorkBranch(repoDir, branch, file, body) {
    gitTest(['checkout', '-q', '-b', branch], repoDir);
    fs.writeFileSync(path.join(repoDir, file), body);
    gitTest(['add', '.'], repoDir);
    gitTest(['commit', '-q', '-m', `work on ${branch}`], repoDir);
    gitTest(['checkout', '-q', 'main'], repoDir);
  }

  // #squash-merged: ancestry never lists this branch, since its commits were rewritten into one new
  // commit on main — the exact gap ADR 0053 closed.
  const squashRepo = makeRepo();
  makeWorkBranch(squashRepo, 'fix/squashed', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'fix/squashed'], squashRepo);
  gitTest(['commit', '-q', '-m', 'fix: squashed (#1)'], squashRepo);
  assert.strictEqual(
    testContainment(squashRepo, 'main', 'fix/squashed'),
    'contained',
    'a squash-merged branch reads contained'
  );
  fs.rmSync(squashRepo, { recursive: true, force: true });

  // #genuinely-unmerged-with-remote: the branch's content lives nowhere base can reach, not locally
  // and not on the remote either — so a refetch cannot flip the answer. The verdict must still only
  // land after the refetch actually ran (ADR 0065's second pass is not skipped just because the first
  // pass already looked conclusive): FETCH_HEAD carries whatever that fetch wrote, and its presence is
  // the one observable trace of the attempt.
  const unmergedRepo = makeRepo();
  const unmergedOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
  gitTest(['init', '-q', '--bare', '-b', 'main'], unmergedOrigin);
  gitTest(['remote', 'add', 'origin', unmergedOrigin], unmergedRepo);
  gitTest(['push', '-q', 'origin', 'main'], unmergedRepo);
  makeWorkBranch(unmergedRepo, 'fix/unmerged', 'app.txt', 'v2\n');
  assert.strictEqual(
    fs.existsSync(path.join(unmergedRepo, '.git', 'FETCH_HEAD')),
    false,
    'no fetch has run yet in this fixture'
  );
  assert.strictEqual(
    testContainment(unmergedRepo, 'main', 'fix/unmerged'),
    'not-contained',
    'content living only on the branch reads not contained'
  );
  assert.strictEqual(
    fs.existsSync(path.join(unmergedRepo, '.git', 'FETCH_HEAD')),
    true,
    'a not-contained local verdict triggers the refetch before answering'
  );
  fs.rmSync(unmergedRepo, { recursive: true, force: true });
  fs.rmSync(unmergedOrigin, { recursive: true, force: true });

  // #remote-only-branch: the local branch is gone (a host that squash-merges and never deletes the
  // remote-tracking ref) but `origin/fix/onremote-squashed` still names the exact commit — a bare
  // `merge-tree`/`merge-base` call never checks that qualified shape on its own (ADR 0053 Important
  // 3), so without qualifyBranch this reads could-not-resolve however completely base holds the work.
  const remoteOnlyRepo = makeRepo();
  const remoteOnlyOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
  gitTest(['init', '-q', '--bare', '-b', 'main'], remoteOnlyOrigin);
  gitTest(['remote', 'add', 'origin', remoteOnlyOrigin], remoteOnlyRepo);
  gitTest(['checkout', '-q', '-b', 'fix/onremote-squashed'], remoteOnlyRepo);
  fs.writeFileSync(path.join(remoteOnlyRepo, 'remote-squash.txt'), 'z\n');
  gitTest(['add', '.'], remoteOnlyRepo);
  gitTest(['commit', '-q', '-m', 'work on the remote branch'], remoteOnlyRepo);
  gitTest(['push', '-q', 'origin', 'fix/onremote-squashed'], remoteOnlyRepo);
  gitTest(['checkout', '-q', 'main'], remoteOnlyRepo);
  gitTest(['merge', '--squash', 'fix/onremote-squashed'], remoteOnlyRepo);
  gitTest(['commit', '-q', '-m', 'fix: onremote-squashed (#1)'], remoteOnlyRepo);
  gitTest(['branch', '-q', '-D', 'fix/onremote-squashed'], remoteOnlyRepo); // local gone, remote-tracking stays
  assert.strictEqual(
    testContainment(remoteOnlyRepo, 'main', 'fix/onremote-squashed'),
    'contained',
    'a branch gone locally but present as a remote-tracking ref is resolved and tested, not reported unresolvable'
  );
  fs.rmSync(remoteOnlyRepo, { recursive: true, force: true });
  fs.rmSync(remoteOnlyOrigin, { recursive: true, force: true });

  // #no-write-tree: a git that rejects `merge-tree --write-tree` falls back to `git merge-base
  // --is-ancestor` (scope-mode `## Containment`) rather than erroring. A shell wrapper on PATH stands
  // in for git 2.37 and earlier — it rejects only that one flag combination and forwards every other
  // call to the real git, exactly what an old git's own `merge-tree` does (three tree-ish arguments,
  // nonzero on `--write-tree`).
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const fakeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-oldgit-'));
  fs.writeFileSync(
    path.join(fakeGitDir, 'git'),
    '#!/bin/sh\n' +
      'if [ "$1" = "merge-tree" ] && [ "$2" = "--write-tree" ]; then exit 129; fi\n' +
      `exec "${realGit}" "$@"\n`,
    { mode: 0o755 }
  );
  const oldGitRepo = makeRepo();
  makeWorkBranch(oldGitRepo, 'fix/mergecommit', 'app.txt', 'v2\n');
  gitTest(['merge', '-q', '--no-ff', '-m', 'merge', 'fix/mergecommit'], oldGitRepo);
  const savedPath = process.env.PATH;
  process.env.PATH = fakeGitDir + path.delimiter + savedPath;
  try {
    assert.strictEqual(
      testContainment(oldGitRepo, 'main', 'fix/mergecommit'),
      'contained',
      'a git without --write-tree falls back to the ancestry test rather than erroring'
    );
  } finally {
    process.env.PATH = savedPath;
  }
  fs.rmSync(oldGitRepo, { recursive: true, force: true });
  fs.rmSync(fakeGitDir, { recursive: true, force: true });

  // #unresolvable: a branch name naming no ref anywhere in the repository — a typo, or a scope whose
  // branch was renamed by hand — reads could-not-resolve, distinct from not-contained: a consumer
  // reading "not contained" as "hasn't landed yet" would warn about the wrong thing for a branch that
  // never existed at all.
  const noBranchRepo = makeRepo();
  assert.strictEqual(
    testContainment(noBranchRepo, 'main', 'fix/does-not-exist'),
    'could-not-resolve',
    'a branch naming no ref at all reports could-not-resolve'
  );
  fs.rmSync(noBranchRepo, { recursive: true, force: true });

  // #no-remote: no remote configured at all, and the branch is genuinely not contained — the fetch
  // ADR 0065 wants can't even be attempted, and the local verdict must stand rather than throw. This
  // is an ordinary, expected refetch failure (no bound ever ran), not the #591 case — the diagnostic
  // must stay silent here rather than printing a "finding" about a bound that was never in play.
  const noRemoteRepo = makeRepo();
  makeWorkBranch(noRemoteRepo, 'fix/noremote', 'app.txt', 'v2\n');
  const origNoRemoteStderrWrite = process.stderr.write;
  const noRemoteStderr = [];
  process.stderr.write = (chunk) => {
    noRemoteStderr.push(String(chunk));
    return true;
  };
  let noRemoteVerdict;
  try {
    noRemoteVerdict = testContainment(noRemoteRepo, 'main', 'fix/noremote');
  } finally {
    process.stderr.write = origNoRemoteStderrWrite;
  }
  assert.strictEqual(
    noRemoteVerdict,
    'not-contained',
    'a repository with no remote configured answers from the local base without erroring'
  );
  assert.strictEqual(
    noRemoteStderr.length,
    0,
    `an unkilled refetch failure prints no diagnostic, got: ${noRemoteStderr.join('')}`
  );
  fs.rmSync(noRemoteRepo, { recursive: true, force: true });

  // #unreachable-host: a dropped VPN or a firewalled host is ordinary, not exotic, and the refetch
  // must still degrade to the local verdict rather than leaving `git fetch` blocked on a connect that
  // never resolves. 192.0.2.1 is TEST-NET-1 (RFC 5737): reserved and never routed anywhere, so the
  // connect attempt stalls the way a genuinely black-holed remote would, unlike `#no-remote` above,
  // which fails fast because there is no remote to dial at all.
  //
  // The assertion is on the seam ADR 0086 names, not a clock: a duration only ever reports the
  // scheduler, which is what flaked this same case at 118965ms under load with the bound intact
  // (ADR 0086). `spawnSync`'s `signal` is the discriminator — set exactly when the refetch's own
  // `timeout`/`killSignal` ended it, absent when `git` exited on its own — so the refetch's outcome is
  // read off stderr, the only surface `testContainment` exposes it on, instead of off elapsed time. A
  // recurrence of #591 would show up here as no diagnostic line at all — the write only fires when
  // `fetched.signal` is set, so a bound that silently stopped catching the kill leaves this assertion
  // failing on a missing line, which is what makes it self-diagnosing rather than a duration to eyeball.
  const unreachableRepo = makeRepo();
  makeWorkBranch(unreachableRepo, 'fix/unreachable', 'app.txt', 'v2\n');
  gitTest(['remote', 'add', 'origin', 'http://192.0.2.1/nowhere.git'], unreachableRepo);
  const origStderrWrite = process.stderr.write;
  const capturedStderr = [];
  process.stderr.write = (chunk) => {
    capturedStderr.push(String(chunk));
    return true;
  };
  let unreachableVerdict;
  try {
    unreachableVerdict = testContainment(unreachableRepo, 'main', 'fix/unreachable');
  } finally {
    process.stderr.write = origStderrWrite;
  }
  assert.strictEqual(
    unreachableVerdict,
    'not-contained',
    'an unreachable host still degrades to the local verdict'
  );
  assert.ok(
    capturedStderr.some((line) => line.includes('ended by its own bound')),
    `expected the refetch outcome on stderr, got: ${capturedStderr.join('')}`
  );
  fs.rmSync(unreachableRepo, { recursive: true, force: true });

  // #argument-injection-base: `base` shaped like a git option must never reach `spawnSync` as one —
  // `git fetch <remote> <base>` carries no separator, so `base = '--upload-pack=<script>'` runs that
  // script as the (fake) remote's upload-pack before `git` ever complains about the ref. `branch` here
  // is an ordinary, genuinely not-contained branch so the call reaches the vulnerable fetch line
  // rather than exiting early on an unresolved branch.
  const injectionRepo = makeRepo();
  makeWorkBranch(injectionRepo, 'fix/injected', 'app.txt', 'v2\n');
  const injectionOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
  gitTest(['init', '-q', '--bare', '-b', 'main'], injectionOrigin);
  gitTest(['remote', 'add', 'origin', injectionOrigin], injectionRepo);
  const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-payload-'));
  const markerFile = path.join(payloadDir, 'marker');
  const payloadScript = path.join(payloadDir, 'evil.sh');
  fs.writeFileSync(payloadScript, `#!/bin/sh\ntouch "${markerFile}"\n`, { mode: 0o755 });
  const injectionVerdict = testContainment(
    injectionRepo,
    `--upload-pack=${payloadScript}`,
    'fix/injected',
    'origin'
  );
  assert.strictEqual(
    fs.existsSync(markerFile),
    false,
    'an option-shaped base never runs as an argument to git fetch'
  );
  assert.notStrictEqual(injectionVerdict, 'contained', 'an option-shaped base never reads contained');
  fs.rmSync(injectionRepo, { recursive: true, force: true });
  fs.rmSync(injectionOrigin, { recursive: true, force: true });
  fs.rmSync(payloadDir, { recursive: true, force: true });

  // #argument-injection-branch: an option-shaped `branch` must resolve safely too, through
  // `qualifyBranch`/`refResolves` (both `rev-parse` calls) — could-not-resolve, never a crash and
  // never contained.
  const injectionBranchRepo = makeRepo();
  const injectionBranchVerdict = testContainment(injectionBranchRepo, 'main', '-C/tmp');
  assert.notStrictEqual(
    injectionBranchVerdict,
    'contained',
    'an option-shaped branch never reads contained'
  );
  fs.rmSync(injectionBranchRepo, { recursive: true, force: true });

  // #real-conflict: the branch and base edit the same line differently — `git merge-tree` exits 1 on
  // a genuine conflict, the other cause besides an unresolved ref (scope-mode `## Containment`). Must
  // read not-contained, never crash and never contained — the wrong-direction failure this slice's
  // brief names explicitly.
  const conflictRepo = makeRepo();
  fs.writeFileSync(path.join(conflictRepo, 'README.md'), 'base change\n');
  gitTest(['commit', '-q', '-am', 'base edits the shared line'], conflictRepo);
  makeWorkBranch(conflictRepo, 'fix/conflicting', 'README.md', 'branch change\n');
  assert.strictEqual(
    testContainment(conflictRepo, 'main', 'fix/conflicting'),
    'not-contained',
    'a real conflict between branch and base reads not-contained, not a crash'
  );
  fs.rmSync(conflictRepo, { recursive: true, force: true });

  // The second tier (ADR 0082): where the tree comparison conflicts, ask whether base's history
  // already took the branch's patch. Fixtures below share one shape — a branch squash-merged onto
  // main, after which main edits the same line again, so `merge-tree` conflicts on a branch base
  // holds in full.
  function makeConflictingSquashRepo() {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nl2\nl3\n');
    gitTest(['add', '.'], dir);
    gitTest(['commit', '-q', '-m', 'app'], dir);
    makeWorkBranch(dir, 'fix/took-it', 'app.txt', 'l1\nB2\nl3\n');
    gitTest(['merge', '--squash', 'fix/took-it'], dir);
    gitTest(['commit', '-q', '-m', 'fix: took-it (#1)'], dir);
    fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nB2 revised\nl3\n');
    gitTest(['commit', '-q', '-am', 'base revises the same line'], dir);
    return dir;
  }

  // A fake git on PATH, standing in for a condition a real fixture cannot cheaply build — the same
  // wrapper shape `#no-write-tree` above already uses. `body` is shell, run before the real git.
  function withFakeGit(body, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-fakegit-'));
    fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\n${body}\nexec "${realGit}" "$@"\n`, {
      mode: 0o755,
    });
    const saved = process.env.PATH;
    process.env.PATH = dir + path.delimiter + saved;
    try {
      return fn(dir);
    } finally {
      process.env.PATH = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // #conflicting-squash: the case ADR 0082 measured. The tree comparison exits 1, and base's history
  // carries a commit whose diff is the branch's own cumulative diff, so the probe answers contained.
  const tookItRepo = makeConflictingSquashRepo();
  assert.strictEqual(
    testContainment(tookItRepo, 'main', 'fix/took-it'),
    'contained',
    'a squash-merged branch whose files base edited afterward reads contained'
  );
  fs.rmSync(tookItRepo, { recursive: true, force: true });

  // #probe-large-diff: the probe's `git diff` call carries no `maxBuffer`, so it inherits
  // `spawnSync`'s 1 MiB default — a cumulative diff past that reports `ENOBUFS`, which the probe
  // reads as a failed call and answers not-contained. Same shape as #conflicting-squash, but the
  // branch also appends a large, purely-additive block so the mergeBase..branch diff exceeds 1 MiB.
  const largeDiffRepo = makeRepo();
  fs.writeFileSync(path.join(largeDiffRepo, 'app.txt'), 'l1\nl2\nl3\n');
  gitTest(['add', '.'], largeDiffRepo);
  gitTest(['commit', '-q', '-m', 'app'], largeDiffRepo);
  const bulk = Array.from({ length: 80000 }, (_, i) => `bulk-line-${i}`).join('\n') + '\n';
  makeWorkBranch(largeDiffRepo, 'fix/took-it-large', 'app.txt', `l1\nB2\nl3\n${bulk}`);
  gitTest(['merge', '--squash', 'fix/took-it-large'], largeDiffRepo);
  gitTest(['commit', '-q', '-m', 'fix: took-it-large (#1)'], largeDiffRepo);
  fs.writeFileSync(path.join(largeDiffRepo, 'app.txt'), `l1\nB2 revised\nl3\n${bulk}`);
  gitTest(['commit', '-q', '-am', 'base revises the same line'], largeDiffRepo);
  assert.strictEqual(
    testContainment(largeDiffRepo, 'main', 'fix/took-it-large'),
    'contained',
    'a cumulative diff past 1 MiB still reads contained, not the ENOBUFS not-contained'
  );
  fs.rmSync(largeDiffRepo, { recursive: true, force: true });

  // #probe-exports: slice 2 (`hooks/scope-prune.js`) calls the probe directly, so it is exported
  // beside `testContainment`, takes the checkout plus two refs, and answers a boolean.
  const probeRepo = makeConflictingSquashRepo();
  assert.strictEqual(
    baseHistoryHasPatch(probeRepo, 'main', 'fix/took-it'),
    true,
    'the exported probe answers true for work base history took'
  );
  fs.rmSync(probeRepo, { recursive: true, force: true });

  // #probe-rejects-unheld-work: a conflicting branch base never took. No patch id matches, so the
  // first tier's not-contained verdict stands.
  const unheldRepo = makeRepo();
  fs.writeFileSync(path.join(unheldRepo, 'app.txt'), 'l1\nl2\nl3\n');
  gitTest(['add', '.'], unheldRepo);
  gitTest(['commit', '-q', '-m', 'app'], unheldRepo);
  makeWorkBranch(unheldRepo, 'fix/unheld', 'app.txt', 'l1\nBRANCH\nl3\n');
  fs.writeFileSync(path.join(unheldRepo, 'app.txt'), 'l1\nBASE\nl3\n');
  gitTest(['commit', '-q', '-am', 'base writes its own line'], unheldRepo);
  assert.strictEqual(
    baseHistoryHasPatch(unheldRepo, 'main', 'fix/unheld'),
    false,
    'the probe answers false for work base history never took'
  );
  assert.strictEqual(
    testContainment(unheldRepo, 'main', 'fix/unheld'),
    'not-contained',
    'a conflicting branch carrying work base does not hold still reads not-contained'
  );
  fs.rmSync(unheldRepo, { recursive: true, force: true });

  // #commit-cap: past the cap the scan is skipped entirely. A real fixture would need the cap's worth
  // of commits, so the fake git reports the count instead and marks any `git log` that runs — the
  // assertion is that none does.
  const cappedRepo = makeConflictingSquashRepo();
  const capMarker = path.join(cappedRepo, 'log-ran');
  const capVerdict = withFakeGit(
    'if [ "$1" = "rev-list" ]; then echo 999999; exit 0; fi\n' +
      `if [ "$1" = "log" ]; then touch "${capMarker}"; fi`,
    () => testContainment(cappedRepo, 'main', 'fix/took-it')
  );
  assert.strictEqual(capVerdict, 'not-contained', 'a range past the commit cap reads not-contained');
  assert.strictEqual(fs.existsSync(capMarker), false, 'a range past the cap walks no patches');
  fs.rmSync(cappedRepo, { recursive: true, force: true });

  // #probe-on-the-ancestry-path: a git without `--write-tree` answers no on `--is-ancestor` for a
  // squash-merged branch, and reaches the probe from there.
  const oldGitProbeRepo = makeConflictingSquashRepo();
  assert.strictEqual(
    withFakeGit(
      'if [ "$1" = "merge-tree" ] && [ "$2" = "--write-tree" ]; then exit 129; fi',
      () => testContainment(oldGitProbeRepo, 'main', 'fix/took-it')
    ),
    'contained',
    'a git without --write-tree reaches the probe and reads contained for a squash-merged branch'
  );
  fs.rmSync(oldGitProbeRepo, { recursive: true, force: true });

  // #probe-fails-closed: INV-0003. Every git call the probe makes is a step that can fail, and each
  // failure answers not-contained rather than throwing.
  for (const failing of ['merge-base', 'diff', 'patch-id', 'rev-list', 'log']) {
    const failRepo = makeConflictingSquashRepo();
    const verdict = withFakeGit(`if [ "$1" = "${failing}" ]; then exit 3; fi`, () =>
      testContainment(failRepo, 'main', 'fix/took-it')
    );
    assert.strictEqual(
      verdict,
      'not-contained',
      `a failing git ${failing} on a probe step reads not-contained rather than throwing`
    );
    fs.rmSync(failRepo, { recursive: true, force: true });
  }

  // #probe-argument-injection: an option-shaped `base` reaches the probe, because the tree comparison
  // it follows cannot resolve one either. No probe call may run it as a git option.
  const probeInjectionRepo = makeConflictingSquashRepo();
  const probePayloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-payload-'));
  const probeMarker = path.join(probePayloadDir, 'marker');
  const probePayload = path.join(probePayloadDir, 'evil.sh');
  fs.writeFileSync(probePayload, `#!/bin/sh\ntouch "${probeMarker}"\n`, { mode: 0o755 });
  assert.strictEqual(
    baseHistoryHasPatch(probeInjectionRepo, `--upload-pack=${probePayload}`, 'fix/took-it'),
    false,
    'an option-shaped base never reads as a probe match'
  );
  assert.strictEqual(
    baseHistoryHasPatch(probeInjectionRepo, 'main', `--upload-pack=${probePayload}`),
    false,
    'an option-shaped branch never reads as a probe match'
  );
  assert.strictEqual(
    fs.existsSync(probeMarker),
    false,
    'no probe call runs an option-shaped ref as a git option'
  );
  fs.rmSync(probeInjectionRepo, { recursive: true, force: true });
  fs.rmSync(probePayloadDir, { recursive: true, force: true });
}
