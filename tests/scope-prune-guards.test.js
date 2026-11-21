'use strict';

// Suite for plugin/hooks/scope-prune.js, its failure posture per loaded module (INV-0159): each case copies the hook
// away from the modules it loads and puts a stub that writes a marker file in a module's place, so the case confirms
// the stub loaded before it asserts what the hook did.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');
const { hookPath, TTL_MS, gitTest, makeRepo, makeScope, makeWorkBranch, makeConflictingSquashRepo } = require('./scope-prune-setup');

// A stub of the hook's `../lib/git-spawn.js` that loads the real module, so a case about another module keeps
// the hook's git calls working. Returns the marker file the stub writes when it loads.
function passThroughGitSpawn(libDir) {
  const marker = path.join(libDir, 'git-spawn-loaded');
  fs.writeFileSync(
    path.join(libDir, 'git-spawn.js'),
    `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\nmodule.exports = require(${JSON.stringify(require.resolve('../plugin/lib/git-spawn.js'))});\n`
  );
  return marker;
}

// A stub of the hook's `../lib/main-work-tree.js` that loads the real resolver, so a case about another module keeps
// the hook's run-root resolution working.
function passThroughMainWorkTree(libDir) {
  fs.writeFileSync(
    path.join(libDir, 'main-work-tree.js'),
    `module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/main-work-tree.js'))});\n`
  );
}

// A stub of the hook's `../lib/scope-branch.js` that loads the real module, so a case about another module keeps
// the hook's shape rule working.
function passThroughScopeBranch(libDir) {
  fs.writeFileSync(
    path.join(libDir, 'scope-branch.js'),
    `module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/scope-branch.js'))});\n`
  );
}

// #probe-unavailable: the containment module is absent from its place, throws on load, or carries no
// probe — a version-skewed install. The hook drops to the tree comparison alone, pruning what that test
// can prove and saying nothing, while its ledger module still loads (ADR 0022, ADR 0082). The hook is
// copied beside stub modules so the real `require`s resolve to them, and each case confirms its
// containment stub loaded.
for (const [skewName, containmentBody] of [
  ['carries no probe', 'module.exports = {};'],
  ['throws on load', "throw new Error('gone');"],
  ['absent from its place', null],
]) {
  const skewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-skew-'));
  fs.mkdirSync(path.join(skewDir, 'hooks'));
  fs.mkdirSync(path.join(skewDir, 'lib'));
  fs.copyFileSync(hookPath, path.join(skewDir, 'hooks', 'scope-prune.js'));
  const skewMarker = path.join(skewDir, 'stub-loaded');
  const ledgerMarker = path.join(skewDir, 'ledger-loaded');
  fs.writeFileSync(
    path.join(skewDir, 'lib', 'ledger.js'),
    `'use strict';\nrequire('fs').writeFileSync(${JSON.stringify(ledgerMarker)}, 'x');\nconst { readLedgerHeader } = require(${JSON.stringify(
      require.resolve('../plugin/lib/ledger.js')
    )});\nmodule.exports = { readLedgerHeader };\n`
  );
  if (containmentBody !== null) {
    fs.writeFileSync(
      path.join(skewDir, 'lib', 'containment.js'),
      `require('fs').writeFileSync(${JSON.stringify(skewMarker)}, 'x');\n${containmentBody}\n`
    );
  }
  passThroughMainWorkTree(path.join(skewDir, 'lib'));
  passThroughScopeBranch(path.join(skewDir, 'lib'));
  const gitSpawnMarker = passThroughGitSpawn(path.join(skewDir, 'lib'));
  const skewed = require(path.join(skewDir, 'hooks', 'scope-prune.js'));
  assert.equal(fs.existsSync(ledgerMarker), true, `the stub at ../lib/ledger.js loaded (${skewName})`);
  assert.equal(fs.existsSync(gitSpawnMarker), true, `the stub at ../lib/git-spawn.js loaded (${skewName})`);
  assert.equal(
    fs.existsSync(skewMarker),
    containmentBody !== null,
    `the stub at ../lib/containment.js loaded exactly when one exists (${skewName})`
  );

  const skewProbeRepo = makeConflictingSquashRepo('fix/skew-probe');
  const skewProbeScopeDir = makeScope(
    skewProbeRepo,
    'skew-probe',
    '**Stage:** closed\n**Branch:** fix/skew-probe\n'
  );
  const skewPlainRepo = makeRepo();
  makeWorkBranch(skewPlainRepo, 'fix/skew-plain', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'fix/skew-plain'], skewPlainRepo);
  gitTest(['commit', '-q', '-m', 'fix: skew-plain (#1)'], skewPlainRepo);
  const skewPlainScopeDir = makeScope(
    skewPlainRepo,
    'skew-plain',
    '**Stage:** closed\n**Branch:** fix/skew-plain\n'
  );
  skewed.main(skewProbeRepo);
  skewed.main(skewPlainRepo);
  assert.equal(
    fs.existsSync(skewProbeScopeDir),
    true,
    'with no probe available the hook leaves a conflicting scope standing, exactly as it did before'
  );
  assert.equal(
    fs.existsSync(skewPlainScopeDir),
    false,
    'and still prunes what the tree comparison alone can prove'
  );
  fs.rmSync(skewProbeRepo, { recursive: true, force: true });
  fs.rmSync(skewPlainRepo, { recursive: true, force: true });
  fs.rmSync(skewDir, { recursive: true, force: true });
}

// #probe-throws: the containment module loads but its probe throws on the conflicting-squash setup. The
// throw leaves `main` and the hook's entry guard takes it: the run prunes nothing, exits 0, and says nothing.
{
  const throwDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-probe-throws-'));
  fs.mkdirSync(path.join(throwDir, 'hooks'));
  fs.mkdirSync(path.join(throwDir, 'lib'));
  fs.copyFileSync(hookPath, path.join(throwDir, 'hooks', 'scope-prune.js'));
  fs.writeFileSync(
    path.join(throwDir, 'lib', 'ledger.js'),
    `module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/ledger.js'))});\n`
  );
  const probeMarker = path.join(throwDir, 'probe-called');
  passThroughMainWorkTree(path.join(throwDir, 'lib'));
  passThroughScopeBranch(path.join(throwDir, 'lib'));
  const throwGitSpawnMarker = passThroughGitSpawn(path.join(throwDir, 'lib'));
  fs.writeFileSync(
    path.join(throwDir, 'lib', 'containment.js'),
    `module.exports = { patchInBaseHistory() { require('fs').writeFileSync(${JSON.stringify(probeMarker)}, 'x'); throw new Error('boom'); } };\n`
  );
  const throwRepo = makeConflictingSquashRepo('fix/probe-throws');
  const throwScopeDir = makeScope(throwRepo, 'probe-throws', '**Stage:** closed\n**Branch:** fix/probe-throws\n');
  // A second closed scope the tree comparison alone proves contained (its branch sits at HEAD). It tells
  // "the whole run aborts" from "only the throwing scope is skipped".
  gitTest(['branch', 'fix/probe-plain'], throwRepo);
  const plainScopeDir = makeScope(throwRepo, 'zz-probe-plain', '**Stage:** closed\n**Branch:** fix/probe-plain\n');
  const throwProbeRun = spawnSync(process.execPath, [path.join(throwDir, 'hooks', 'scope-prune.js')], {
    input: JSON.stringify({ cwd: throwRepo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(throwProbeRun, 'spawning scope-prune.js with a throwing probe');
  assert.equal(throwProbeRun.status, 0, 'a hook whose probe throws still exits 0');
  assert.equal(throwProbeRun.stdout, '', 'and prints nothing');
  assert.equal(fs.existsSync(throwGitSpawnMarker), true, 'the stub at ../lib/git-spawn.js loaded');
  assert.equal(fs.existsSync(probeMarker), true, 'the throwing probe was called');
  assert.equal(fs.existsSync(throwScopeDir), true, 'a scope whose probe throws is left standing');
  assert.equal(
    fs.existsSync(plainScopeDir),
    true,
    'and so is every other prunable scope of that Stop, because the throw aborts the whole run'
  );
  fs.rmSync(throwRepo, { recursive: true, force: true });
  fs.rmSync(throwDir, { recursive: true, force: true });
}

// #reader-unavailable: the hook cannot load the shared reader → it prunes nothing and says nothing.
// A copy of this file outside the plugin cannot resolve `../lib/ledger.js`, which is exactly the
// failure being tested. This proves the fail-closed property holds when the reader is unavailable — not
// that the explicit `if (!readLedgerHeader) return;` guard in main() is what causes it: `readHeader`'s
// own try/catch already yields null for every header in that case, and a null stage is never prunable
// either way. The guard stays as explicit intent. Fail-closed is the same direction the hook already
// takes on a git error: a hook that cannot read a stage must never conclude a scope is finished.
{
  const cp = require('node:child_process');
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-orphan-'));
  fs.copyFileSync(hookPath, path.join(away, 'scope-prune.js'));

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-orphan-repo-'));
  const g = (args) => cp.execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  g(['add', '.']);
  g(['commit', '-q', '-m', 'init']);
  const doomed = path.join(repo, '.superdev', 'scopes', 'gone');
  fs.mkdirSync(doomed, { recursive: true });
  const led = path.join(doomed, 'ledger.md');
  fs.writeFileSync(led, '# ledger\n\n**Stage:** closed\n');
  const past = new Date(Date.now() - TTL_MS - 1000);
  fs.utimesSync(led, past, past);

  const orphan = cp.spawnSync(process.execPath, [path.join(away, 'scope-prune.js')], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(orphan, 'spawning scope-prune.js with an unavailable reader');
  assert.equal(orphan.status, 0, 'a hook that cannot load the reader still exits 0');
  assert.equal(orphan.stdout, '', 'and prints nothing');
  assert.equal(
    fs.existsSync(doomed),
    true,
    'a scope that would otherwise be pruned survives when the shared reader is unavailable'
  );
  // The same with a stub at the hook's own `../lib/ledger.js` that marks its load and throws.
  const stubbed = path.join(away, 'stubbed');
  fs.mkdirSync(path.join(stubbed, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(stubbed, 'lib'));
  fs.copyFileSync(hookPath, path.join(stubbed, 'hooks', 'scope-prune.js'));
  const stubMarker = path.join(stubbed, 'stub-loaded');
  passThroughMainWorkTree(path.join(stubbed, 'lib'));
  passThroughScopeBranch(path.join(stubbed, 'lib'));
  const stubbedGitSpawnMarker = passThroughGitSpawn(path.join(stubbed, 'lib'));
  fs.writeFileSync(path.join(stubbed, 'lib', 'ledger.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); throw new Error('gone');`);
  const loadedContainmentMarker = path.join(stubbed, 'containment-loaded');
  fs.writeFileSync(path.join(stubbed, 'lib', 'containment.js'), `require('fs').writeFileSync(${JSON.stringify(loadedContainmentMarker)}, 'x'); module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/containment.js'))});`);
  const stubRun = cp.spawnSync(process.execPath, [path.join(stubbed, 'hooks', 'scope-prune.js')], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(stubRun, 'spawning scope-prune.js with a throwing ledger module');
  assert.equal(fs.existsSync(loadedContainmentMarker), true, 'the containment stub beside the throwing ledger module loaded');
  assert.equal(fs.existsSync(stubbedGitSpawnMarker), true, 'the git-spawn stub beside the throwing ledger module loaded');
  assert.equal(stubRun.status, 0, 'a hook whose ledger module throws on load still exits 0');
  assert.equal(stubRun.stdout, '', 'and prints nothing');
  assert.equal(fs.existsSync(stubMarker), true, 'the stub at ../lib/ledger.js loaded');
  assert.equal(fs.existsSync(doomed), true, 'a scope that would otherwise be pruned survives when the ledger module throws on load');
  // A ledger module that loads but whose reader throws, beside a containment module that loads: nothing prunes.
  fs.rmSync(stubMarker);
  fs.rmSync(loadedContainmentMarker);
  const containmentMarker = path.join(stubbed, 'containment-reader-loaded');
  fs.writeFileSync(path.join(stubbed, 'lib', 'ledger.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); module.exports = { readLedgerHeader() { throw new Error('boom'); } };`);
  fs.writeFileSync(path.join(stubbed, 'lib', 'containment.js'), `require('fs').writeFileSync(${JSON.stringify(containmentMarker)}, 'x'); module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/containment.js'))});`);
  const throwRun = cp.spawnSync(process.execPath, [path.join(stubbed, 'hooks', 'scope-prune.js')], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(throwRun, 'spawning scope-prune.js with a throwing ledger reader');
  assert.equal(throwRun.status, 0, 'a hook whose ledger reader throws still exits 0');
  assert.equal(throwRun.stdout, '', 'and prints nothing');
  assert.equal(fs.existsSync(stubMarker), true, 'the ledger stub with a throwing reader loaded');
  assert.equal(fs.existsSync(containmentMarker), true, 'the containment stub beside it loaded');
  assert.equal(fs.existsSync(doomed), true, 'a scope that would otherwise be pruned survives when the ledger reader throws');
  fs.rmSync(away, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
}

// #git-spawn-posture: the hook takes `gitSpawn`, `gitThrow`, `parseBranchList`, and `resolveCommit` from
// `../lib/git-spawn.js` (INV-0159). With the module unloadable, with one of the four missing, or with one of the
// four throwing, the hook prunes nothing, exits 0, and says nothing. Each case runs beside a pass-through control
// stub that prunes the same fixture, and confirms its own stub loaded before it asserts. A git whose `merge-tree`
// fails shims the pre-2.38 path, so each of the first three functions is reached on every run. `resolveCommit`
// serves only the `--write-tree` path, so its throwing case and a control of its own run on the real git. Each
// case copies the hook to its own path, because `require` caches by path.
{
  const realGitSpawn = JSON.stringify(require.resolve('../plugin/lib/git-spawn.js'));
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-posture-shim-'));
  const realGitPath = require('node:child_process').execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(
    path.join(shimDir, 'git'),
    `#!/bin/sh\nif [ "$1" = "merge-tree" ]; then exit 129; fi\nexec "${realGitPath}" "$@"\n`,
    { mode: 0o755 }
  );

  // Runs the hook copied beside stubs, `gitSpawnBody` standing in for `../lib/git-spawn.js` (null: absent).
  // Returns whether the stub loaded, whether the function it overrides was called, and whether the scope stands.
  // `shimmed` false runs the real git, whose `merge-tree --write-tree` reaches the containment test.
  function run(caseName, gitSpawnBody, shimmed = true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-posture-'));
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.copyFileSync(hookPath, path.join(dir, 'hooks', 'scope-prune.js'));
    for (const mod of ['ledger.js', 'containment.js', 'main-work-tree.js', 'scope-branch.js']) {
      fs.writeFileSync(
        path.join(dir, 'lib', mod),
        `module.exports = require(${JSON.stringify(require.resolve(`../plugin/lib/${mod}`))});\n`
      );
    }
    const loaded = path.join(dir, 'loaded');
    const called = path.join(dir, 'called');
    if (gitSpawnBody !== null) {
      fs.writeFileSync(
        path.join(dir, 'lib', 'git-spawn.js'),
        `const fs = require('fs');\nfs.writeFileSync(${JSON.stringify(loaded)}, 'x');\nconst CALLED = ${JSON.stringify(called)};\nconst real = require(${realGitSpawn});\n${gitSpawnBody}\n`
      );
    }
    const repo = makeRepo();
    makeWorkBranch(repo, 'fix/posture', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--ff-only', 'fix/posture'], repo);
    const scopeDir = makeScope(repo, 'posture', '**Stage:** closed\n**Branch:** fix/posture\n');
    const ran = spawnSync(process.execPath, [path.join(dir, 'hooks', 'scope-prune.js')], {
      input: JSON.stringify({ cwd: repo }),
      encoding: 'utf8',
      timeout: 15000,
      env: shimmed ? { ...process.env, PATH: shimDir + path.delimiter + process.env.PATH } : process.env,
    });
    assertSpawnDecided(ran, `spawning scope-prune.js (${caseName})`);
    assert.equal(ran.status, 0, `the hook exits 0 (${caseName})`);
    assert.equal(ran.stdout, '', `and prints nothing (${caseName})`);
    const result = {
      loaded: fs.existsSync(loaded),
      called: fs.existsSync(called),
      stands: fs.existsSync(scopeDir),
    };
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  }

  const control = run('control', 'module.exports = real;');
  assert.equal(control.loaded, true, 'the control stub at ../lib/git-spawn.js loaded');
  assert.equal(control.stands, false, 'the control prunes the fixture scope, so a surviving scope below is the posture');

  const absent = run('git-spawn absent', null);
  assert.equal(absent.loaded, false, 'no stub sits at ../lib/git-spawn.js when the module is absent');
  assert.equal(absent.stands, true, 'a hook that cannot load git-spawn prunes nothing');

  const unloadable = run('git-spawn throws on load', "throw new Error('gone');");
  assert.equal(unloadable.loaded, true, 'the stub at ../lib/git-spawn.js loaded before it threw');
  assert.equal(unloadable.stands, true, 'a hook whose git-spawn throws on load prunes nothing');

  for (const fn of ['gitSpawn', 'gitThrow', 'parseBranchList']) {
    const missing = run(`${fn} missing`, `const m = { ...real };\ndelete m.${fn};\nmodule.exports = m;`);
    assert.equal(missing.loaded, true, `the stub missing ${fn} loaded`);
    assert.equal(missing.stands, true, `a hook whose git-spawn carries no ${fn} prunes nothing`);

    const throwing = run(
      `${fn} throws`,
      `module.exports = { ...real, ${fn}() { fs.writeFileSync(CALLED, 'x'); throw new Error('boom'); } };`
    );
    assert.equal(throwing.loaded, true, `the stub whose ${fn} throws loaded`);
    assert.equal(throwing.called, true, `the throwing ${fn} was called`);
    assert.equal(throwing.stands, true, `a hook whose ${fn} throws prunes nothing`);
  }

  const noResolve = run('resolveCommit missing', 'const m = { ...real };\ndelete m.resolveCommit;\nmodule.exports = m;');
  assert.equal(noResolve.loaded, true, 'the stub missing resolveCommit loaded');
  assert.equal(noResolve.stands, true, 'a hook whose git-spawn carries no resolveCommit prunes nothing');

  const realControl = run('control on the real git', 'module.exports = real;', false);
  assert.equal(realControl.stands, false, 'on the real git the control prunes the fixture scope through the containment test');

  const resolveThrows = run(
    'resolveCommit throws',
    "module.exports = { ...real, resolveCommit() { fs.writeFileSync(CALLED, 'x'); throw new Error('boom'); } };",
    false
  );
  assert.equal(resolveThrows.loaded, true, 'the stub whose resolveCommit throws loaded');
  assert.equal(resolveThrows.called, true, 'the throwing resolveCommit was called');
  assert.equal(resolveThrows.stands, true, 'a hook whose resolveCommit throws prunes nothing');
  fs.rmSync(shimDir, { recursive: true, force: true });
}

// #resolver-unavailable: the hook takes the main working tree from `../lib/main-work-tree.js`. With the module absent,
// throwing on load, carrying no `mainWorkTree`, or resolving nothing, it prunes nothing, exits 0, and says nothing. A
// control beside a pass-through stub prunes the same fixture, and each case confirms its own stub loaded first.
{
  const realResolver = JSON.stringify(require.resolve('../plugin/lib/main-work-tree.js'));
  function runResolver(caseName, resolverBody) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-resolver-'));
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.copyFileSync(hookPath, path.join(dir, 'hooks', 'scope-prune.js'));
    for (const mod of ['ledger.js', 'containment.js', 'git-spawn.js', 'scope-branch.js']) {
      fs.writeFileSync(
        path.join(dir, 'lib', mod),
        `module.exports = require(${JSON.stringify(require.resolve(`../plugin/lib/${mod}`))});\n`
      );
    }
    const loaded = path.join(dir, 'loaded');
    if (resolverBody !== null) {
      fs.writeFileSync(
        path.join(dir, 'lib', 'main-work-tree.js'),
        `require('fs').writeFileSync(${JSON.stringify(loaded)}, 'x');\nconst real = require(${realResolver});\n${resolverBody}\n`
      );
    }
    const repo = makeRepo();
    const scopeDir = makeScope(repo, 'resolver', '**Stage:** closed\n');
    const ran = spawnSync(process.execPath, [path.join(dir, 'hooks', 'scope-prune.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(ran, `spawning scope-prune.js (${caseName})`);
    assert.equal(ran.status, 0, `the hook exits 0 (${caseName})`);
    assert.equal(ran.stdout, '', `and prints nothing (${caseName})`);
    const result = { loaded: fs.existsSync(loaded), stands: fs.existsSync(scopeDir) };
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  }

  const control = runResolver('control', 'module.exports = real;');
  assert.equal(control.loaded, true, 'the control stub at ../lib/main-work-tree.js loaded');
  assert.equal(control.stands, false, 'the control prunes the fixture run, so a surviving run below is the posture');
  const absent = runResolver('resolver absent', null);
  assert.equal(absent.stands, true, 'a hook with no resolver module prunes nothing');
  for (const [name, body] of [
    ['throws on load', "throw new Error('gone');"],
    ['carries no mainWorkTree', 'module.exports = {};'],
    ['resolves nothing', 'module.exports = { mainWorkTree() { return null; } };'],
  ]) {
    const result = runResolver(`resolver ${name}`, body);
    assert.equal(result.loaded, true, `the resolver stub that ${name} loaded`);
    assert.equal(result.stands, true, `a hook whose resolver ${name} prunes nothing`);
  }

  // A session directory outside any repository resolves no main working tree, through the real resolver.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-outside-'));
  const outsideScope = makeScope(outside, 'resolver', '**Stage:** closed\n');
  const outsideRun = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ cwd: outside }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(outsideRun, 'spawning scope-prune.js outside a repository');
  assert.equal(outsideRun.status, 0, 'a session outside any repository exits 0');
  assert.equal(outsideRun.stdout, '', 'and prints nothing');
  assert.equal(fs.existsSync(outsideScope), true, 'and prunes no run root of its own cwd');
  fs.rmSync(outside, { recursive: true, force: true });
}

// #shape-rule-unavailable: the hook takes the shape rule from `../lib/scope-branch.js` (INV-0159, INV-0068). With the module
// absent, throwing on load, or carrying no `shapeMatches` or no `parseBranchRefs`, the hook prunes nothing, exits 0, and says nothing. Each case
// runs beside a pass-through control that prunes the same fixture: a closed, stale scope with no `**Branch:**` line whose
// contained `feat/shaperule` branch only the shape scan can name.
{
  const real = JSON.stringify(require.resolve('../plugin/lib/scope-branch.js'));
  function runCase(caseName, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-shape-'));
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.copyFileSync(hookPath, path.join(dir, 'hooks', 'scope-prune.js'));
    for (const mod of ['ledger.js', 'containment.js', 'main-work-tree.js', 'git-spawn.js']) {
      fs.writeFileSync(path.join(dir, 'lib', mod), `module.exports = require(${JSON.stringify(require.resolve(`../plugin/lib/${mod}`))});\n`);
    }
    const loaded = path.join(dir, 'loaded');
    if (body !== null) {
      fs.writeFileSync(path.join(dir, 'lib', 'scope-branch.js'), `require('fs').writeFileSync(${JSON.stringify(loaded)}, 'x');\n${body}\n`);
    }
    const repo = makeRepo();
    makeWorkBranch(repo, 'feat/shaperule', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--ff-only', 'feat/shaperule'], repo);
    const scopeDir = makeScope(repo, 'shaperule', '**Stage:** closed\n');
    const ran = spawnSync(process.execPath, [path.join(dir, 'hooks', 'scope-prune.js')], { input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000 });
    assertSpawnDecided(ran, `spawning scope-prune.js (${caseName})`);
    assert.equal(ran.status, 0, `the hook exits 0 (${caseName})`);
    assert.equal(ran.stdout, '', `and prints nothing (${caseName})`);
    const result = { loaded: fs.existsSync(loaded), stands: fs.existsSync(scopeDir) };
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  }
  const control = runCase('control', `module.exports = require(${real});`);
  assert.equal(control.loaded, true, 'the control stub at ../lib/scope-branch.js loaded');
  assert.equal(control.stands, false, 'the control prunes the fixture scope, so a surviving scope below is the posture');
  assert.equal(runCase('scope-branch absent', null).stands, true, 'a hook that cannot load the shape rule prunes nothing');
  const throwing = runCase('scope-branch throws on load', "throw new Error('gone');");
  assert.equal(throwing.loaded, true, 'the throwing stub loaded');
  assert.equal(throwing.stands, true, 'a hook whose shape rule throws on load prunes nothing');
  const bare = runCase('shapeMatches missing', 'module.exports = {};');
  assert.equal(bare.loaded, true, 'the stub without shapeMatches loaded');
  assert.equal(bare.stands, true, 'a hook whose shape rule module carries no shapeMatches prunes nothing');
  const old = runCase('parseBranchRefs missing', `module.exports = { shapeMatches: require(${real}).shapeMatches };`);
  assert.equal(old.loaded, true, 'the stub without parseBranchRefs loaded');
  assert.equal(old.stands, true, 'a hook whose shape rule module carries no parseBranchRefs prunes nothing');
}

console.log('scope-prune-guards tests ok');
