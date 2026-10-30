'use strict';

// Suite for plugin/scripts/scope.js's checkout-relative verbs: `root` (the run-root path resolver, anchored to the
// main working tree, ADR 0080), `init`, `status`, and `staging` from a linked worktree, and `base` (the scope's
// range base, `references/scope-mode.md` `## The scope's range base`). Each case builds its own git repository,
// so the suite needs only `run` from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { run } = require('./scope-setup');

// --- root: the run-root path resolver, anchored to the main working tree (ADR 0080) -----------
{
  // `call` in tests/scope-setup.js fixes cwd at its temporary directory; `root` resolves relative to cwd, so it needs its own.
  const callIn = (argv, cwd, stdinJson) => {
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, cwd, stdinJson || '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  };
  function gitRoot(args, cwd) {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }

  // realpathSync: git resolves symlinks (e.g. macOS's /tmp -> /private/tmp) when it reports paths,
  // so the expectation below has to compare against the same resolved path.
  const mainRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-')));
  gitRoot(['init', '-q', '-b', 'main'], mainRepo);
  gitRoot(['config', 'user.email', 'test@example.com'], mainRepo);
  gitRoot(['config', 'user.name', 'test'], mainRepo);
  fs.writeFileSync(path.join(mainRepo, 'README.md'), 'x\n');
  gitRoot(['add', '.'], mainRepo);
  gitRoot(['commit', '-q', '-m', 'init'], mainRepo);

  const expectedRoot = path.join(mainRepo, '.superdev', 'scopes', 'demo');
  assert.strictEqual(
    callIn(['root', 'demo'], mainRepo).out,
    expectedRoot,
    'root resolves from the main working tree, which holds no linked worktree'
  );

  // A linked worktree (a scopetree or a slicetree) resolves the same run root.
  const worktreeDir = path.join(mainRepo, '..', path.basename(mainRepo) + '-wt');
  gitRoot(['worktree', 'add', '-q', '-b', 'feat/wt', worktreeDir], mainRepo);
  assert.strictEqual(
    callIn(['root', 'demo'], worktreeDir).out,
    expectedRoot,
    'root resolves the same path from a linked worktree'
  );
  fs.rmSync(worktreeDir, { recursive: true, force: true });

  // A subdirectory of the main working tree resolves the same run root.
  fs.mkdirSync(path.join(mainRepo, 'sub', 'deep'), { recursive: true });
  assert.strictEqual(
    callIn(['root', 'demo'], path.join(mainRepo, 'sub', 'deep')).out,
    expectedRoot,
    'root resolves the same path from a subdirectory'
  );

  // Inside a submodule the run root lives under the submodule's own checkout, never `.git/modules`.
  const subSource = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-subsrc-')));
  gitRoot(['init', '-q', '-b', 'main'], subSource);
  gitRoot(['config', 'user.email', 'test@example.com'], subSource);
  gitRoot(['config', 'user.name', 'test'], subSource);
  fs.writeFileSync(path.join(subSource, 'f.txt'), 'x\n');
  gitRoot(['add', '.'], subSource);
  gitRoot(['commit', '-q', '-m', 'init'], subSource);
  gitRoot(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subSource, 'vendor/lib'], mainRepo);
  const subCheckout = path.join(mainRepo, 'vendor', 'lib');
  assert.strictEqual(
    callIn(['root', 'demo'], subCheckout).out,
    path.join(subCheckout, '.superdev', 'scopes', 'demo'),
    'root resolves to the submodule checkout from inside a submodule'
  );
  fs.rmSync(subSource, { recursive: true, force: true });

  // Outside a git repository entirely.
  const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-nogit-'));
  const noGit = callIn(['root', 'demo'], noGitDir);
  assert.ok(!noGit.ok && /not inside a git repository/.test(noGit.err), 'root refuses outside a git repository: ' + (noGit.err || ''));
  fs.rmSync(noGitDir, { recursive: true, force: true });

  // A slug carrying a path separator or a leading dot.
  for (const bad of ['a/b', '../escape', '.hidden']) {
    const r2 = callIn(['root', bad], mainRepo);
    assert.ok(!r2.ok, `root refuses slug "${bad}"`);
  }

  // `init` and `status`, run from a linked worktree (a scopetree or a slicetree), resolve the same
  // run root `root` resolves from the main working tree — never one nested inside the worktree itself
  // (Important review finding 4, ADR 0080). This is the exact shape of `/superdev:plan` cutting the
  // scopetree under the main working tree while run init's own `init` call, made from inside it,
  // would otherwise write the ledger one level too deep.
  const wtRoot = path.join(mainRepo, '..', path.basename(mainRepo) + '-init-wt');
  gitRoot(['worktree', 'add', '-q', '-b', 'feat/init-wt', wtRoot], mainRepo);
  const initFromWt = callIn(
    ['init', 'feat/init-wt-scope', 'planned'],
    wtRoot,
    JSON.stringify({ anchor: '#1 — init from a worktree', slices: [] }),
  );
  assert.ok(initFromWt.ok, 'init from a linked worktree passes: ' + (initFromWt.err || ''));
  const expectedInitRoot = path.join(mainRepo, '.superdev', 'scopes', 'init-wt-scope');
  assert.ok(
    fs.existsSync(path.join(expectedInitRoot, 'ledger.md')),
    'init from a linked worktree writes the ledger under the main working tree, not the worktree itself',
  );
  assert.ok(
    !fs.existsSync(path.join(wtRoot, '.superdev', 'scopes', 'init-wt-scope', 'ledger.md')),
    'init from a linked worktree nests no run root inside the worktree',
  );
  assert.ok(
    callIn(['status'], mainRepo).out.includes('init-wt-scope'),
    'status from the main working tree sees the run root init wrote from the linked worktree',
  );
  assert.ok(
    callIn(['status'], wtRoot).out.includes('init-wt-scope'),
    'status from the linked worktree resolves the same scopes directory as the main working tree',
  );
  fs.rmSync(wtRoot, { recursive: true, force: true });

  // `staging <scope>` resolves a scope's staging directory in the main working tree from any
  // checkout, and `status` counts the pages staged there from a linked worktree too (ADR 0119,
  // INV-0121).
  const stagingWt = path.join(mainRepo, '..', path.basename(mainRepo) + '-staging-wt');
  gitRoot(['worktree', 'add', '-q', '-b', 'feat/staging-wt', stagingWt], mainRepo);
  const expectedStaging = path.join(mainRepo, '.superdev', 'kb-pending', 'demo');
  fs.mkdirSync(expectedStaging, { recursive: true });
  fs.writeFileSync(path.join(expectedStaging, 'page.md'), '---\ntitle: Page\naction: upsert\n---\nbody\n');
  assert.ok(
    callIn(['status'], stagingWt).out.includes('pending publish: 1 staged page — `/superdev:publish-kb demo`'),
    'status from a linked worktree reports the pages the main working tree holds',
  );
  const subDir = path.join(stagingWt, 'sub');
  fs.mkdirSync(subDir);
  for (const cwd of [mainRepo, stagingWt, subDir]) {
    assert.strictEqual(callIn(['staging', 'demo'], cwd).out, expectedStaging, `staging resolves the main working tree's directory from ${cwd}`);
  }
  assert.strictEqual(
    callIn(['staging', '_adhoc'], stagingWt).out,
    path.join(mainRepo, '.superdev', 'kb-pending', '_adhoc'),
    'staging accepts the ad-hoc scope',
  );
  for (const bad of [[], [''], ['a/b'], ['a\\b'], ['../escape'], ['.hidden']]) {
    const r3 = callIn(['staging', ...bad], stagingWt);
    assert.ok(!r3.ok && r3.out === '', `staging refuses ${JSON.stringify(bad)} with nothing on stdout`);
  }
  const stagingNoGit = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-staging-nogit-'));
  const ng = callIn(['staging', 'demo'], stagingNoGit);
  assert.ok(!ng.ok && ng.out === '' && /not inside a git repository/.test(ng.err), 'staging refuses outside a git repository: ' + (ng.err || ''));
  fs.rmSync(stagingNoGit, { recursive: true, force: true });
  fs.writeFileSync(path.join(expectedStaging, 'second.md'), 'x\n');
  fs.writeFileSync(path.join(expectedStaging, 'stray.txt'), 'x\n');
  assert.strictEqual(callIn(['staging', 'demo', '--count'], stagingWt).out, '2', '--count counts only the .md pages');
  assert.strictEqual(callIn(['staging', 'absent', '--count'], stagingWt).out, '0', '--count prints 0 for a missing directory');
  assert.ok(!fs.existsSync(path.join(mainRepo, '.superdev', 'scopes', 'absent')), 'staging needs and writes no run root');
  fs.rmSync(stagingWt, { recursive: true, force: true });

  fs.rmSync(mainRepo, { recursive: true, force: true });
}

// --- base: the scope's range base — the recorded merged base tip and the rule that picks the newest
// of it and merge-base(<base>, <branch>) (`references/scope-mode.md` `## The scope's range base`) ---
{
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const callIn = (argv, cwd, stdin) => {
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, cwd, stdin || '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  };
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-base-')));
  g(['init', '-q', '-b', 'main'], repo);
  g(['config', 'user.email', 'test@example.com'], repo);
  g(['config', 'user.name', 'test'], repo);
  const commit = (file, msg) => {
    fs.writeFileSync(path.join(repo, file), msg + '\n');
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', msg], repo);
    return g(['rev-parse', 'HEAD'], repo);
  };
  const A = commit('a.txt', 'a');
  g(['branch', 'remote'], repo);
  g(['checkout', '-q', 'remote'], repo);
  const T = commit('t.txt', 't');
  const T2 = commit('t2.txt', 't2');
  g(['checkout', '-q', 'main'], repo);
  g(['checkout', '-q', '-b', 'feat/base-demo'], repo);
  commit('own.txt', 'own');

  const sliceJson = JSON.stringify({
    anchor: '#1 — base record',
    slices: [{ id: '01', issue: '#2', title: 'x', type: 'behavior', 'depends-on': '—' }],
  });
  assert.ok(callIn(['init', 'feat/base-demo', 'planned'], repo, sliceJson).ok, 'init for the base fixture');
  const root = path.join(repo, '.superdev', 'scopes', 'base-demo');
  const RT = ['--root', root];
  const resolve = (base) => callIn(['base', 'resolve', '--branch', 'feat/base-demo', '--base', base, ...RT], repo);
  const ledger = () => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');

  // No record: the merge-base, today's behaviour.
  assert.strictEqual(resolve('main').out, A, 'no record prints merge-base(base, branch)');

  // base set writes the resolved full commit, overwrites rather than adding a second line.
  assert.ok(callIn(['base', 'set', T.slice(0, 8), ...RT], repo).ok, 'base set <short sha>');
  assert.ok(ledger().includes(`**Base:** ${T}`), 'ledger carries the full commit');
  assert.strictEqual((ledger().match(/\*\*Base:\*\*/g) || []).length, 1, 'one Base line');

  // Header order does not depend on write order: PR and Deploy written after Base sit after it.
  assert.ok(callIn(['pr', 'set', '#9', ...RT], repo).ok, 'pr set after base set');
  assert.ok(callIn(['deploy', 'set', 'pve', 'deployed', ...RT], repo).ok, 'deploy set after base set');
  const order = ['Base', 'PR', 'Deploy'].map((n) => ledger().indexOf(`**${n}:**`));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], 'Base, PR, Deploy in that order');

  // base set refuses a value that resolves to no commit, and writes nothing.
  const before = ledger();
  const bad = callIn(['base', 'set', 'not-a-real-sha', ...RT], repo);
  assert.ok(!bad.ok && /does not resolve to a commit/.test(bad.err), 'unresolvable sha refused');
  assert.strictEqual(ledger(), before, 'nothing written on refusal');

  // Record reachable from the branch, local base behind it: the record is newer.
  g(['merge', '-q', '--no-edit', T], repo);
  assert.strictEqual(resolve('main').out, T, 'a recorded tip ahead of the local base wins');

  // Record not reachable from the branch: the merge-base.
  assert.ok(callIn(['base', 'set', T2, ...RT], repo).ok, 'base set T2');
  assert.strictEqual(resolve('main').out, A, 'a record not reachable from the branch is ignored');

  // A record the repository cannot resolve (hand-edited ledger): the merge-base.
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger().replace(/\*\*Base:\*\* .*/, '**Base:** deadbeef'));
  assert.strictEqual(resolve('main').out, A, 'an unresolvable record is ignored');

  // Local base ahead of the record (pulled later): merge-base is newer.
  assert.ok(callIn(['base', 'set', T, ...RT], repo).ok, 'base set T again');
  g(['branch', '-f', 'main', T2], repo);
  g(['merge', '-q', '--no-edit', 'main'], repo);
  assert.strictEqual(resolve('main').out, T2, 'a local base ahead of the record wins');

  // Incomparable: the merge-base and the record both sit on the branch, neither holding the other.
  g(['checkout', '-q', '-b', 'side', A], repo);
  const R = commit('r.txt', 'r');
  g(['checkout', '-q', '-b', 'localbase', A], repo);
  const M = commit('m.txt', 'm');
  g(['checkout', '-q', '-b', 'feat/base-inc', M], repo);
  g(['merge', '-q', '--no-edit', R], repo);
  commit('own2.txt', 'own2');
  assert.ok(callIn(['base', 'set', R, ...RT], repo).ok, 'base set R');
  const inc = callIn(['base', 'resolve', '--branch', 'feat/base-inc', '--base', 'localbase', ...RT], repo);
  assert.strictEqual(inc.out, M, 'incomparable candidates print merge-base(base, branch)');

  // --base and --branch are required.
  assert.ok(!callIn(['base', 'resolve', '--branch', 'feat/base-demo', ...RT], repo).ok, 'resolve needs --base');
  assert.ok(!callIn(['base', 'resolve', '--base', 'main', ...RT], repo).ok, 'resolve needs --branch');

  // publish carries the Base line and adopt reconstructs it.
  assert.ok(callIn(['base', 'set', T, ...RT], repo).ok, 'base set for publish');
  const published = callIn(['publish', ...RT], repo).out;
  assert.ok(published.includes(`**Base:** ${T}`), 'publish carries the Base line');
  const adoptRoot = path.join(repo, 'adopt-check', 'base-demo');
  assert.ok(callIn(['adopt', '--root', adoptRoot], repo, `# Anchor\n\n${published}\n`).ok, 'adopt parses a Base-bearing snapshot');
  assert.ok(
    fs.readFileSync(path.join(adoptRoot, 'ledger.md'), 'utf8').includes(`**Base:** ${T}`),
    'adopt reconstructs the Base line'
  );
  fs.rmSync(repo, { recursive: true, force: true });
}
