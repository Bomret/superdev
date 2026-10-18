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
  const throwGitSpawnMarker = passThroughGitSpawn(path.join(throwDir, 'lib'));
  fs.writeFileSync(
    path.join(throwDir, 'lib', 'containment.js'),
    `module.exports = { baseHistoryHasPatch() { require('fs').writeFileSync(${JSON.stringify(probeMarker)}, 'x'); throw new Error('boom'); } };\n`
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

// #git-spawn-posture: the hook takes `gitSpawn`, `gitThrow`, and `parseBranchList` from `../lib/git-spawn.js`
// (INV-0159). With the module unloadable, with one of the three missing, or with one of them throwing, the
// hook prunes nothing, exits 0, and says nothing. Each case runs beside a pass-through control stub that prunes
// the same fixture, and confirms its own stub loaded before it asserts. A git whose `merge-tree` fails shims the
// pre-2.38 path, so every one of the three functions is reached on every run. Each case copies the hook to its
// own path, because `require` caches by path.
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
  function run(caseName, gitSpawnBody) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-posture-'));
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.copyFileSync(hookPath, path.join(dir, 'hooks', 'scope-prune.js'));
    for (const mod of ['ledger.js', 'containment.js']) {
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
      env: { ...process.env, PATH: shimDir + path.delimiter + process.env.PATH },
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
  fs.rmSync(shimDir, { recursive: true, force: true });
}

console.log('scope-prune-guards tests ok');
