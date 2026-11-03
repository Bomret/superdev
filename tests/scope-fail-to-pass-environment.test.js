'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, ADR 0182): the environment a run reads, the test paths and
// the checkout it runs from, the hooks it never runs, and a command that cannot start. Every scenario writes only inside the
// fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { f2pFixture, verif } = require('./scope-setup');


{
  const { D, git, probe, CMD, scenario, checkout, leftover, hooked, done } = f2pFixture();
  try {
    const argsProbe = 'printf "%s|" "$@" >> "$F2P_LOG"; echo >> "$F2P_LOG"\n';

    // The test paths come from the tip, even where the range changed the verification file itself: a file only the tip's test
    // paths name stays as it is, and the command names it.
    let s = scenario({
      base: { 'src.txt': 'a\n', 'spec-files/x': 'one\n', 'docs/agents/verification.md': verif('sh tests/t.sh base') },
      tip: {
        'src.txt': 'b\n',
        'spec-files/x': 'two\n',
        'docs/agents/verification.md': verif('sh tests/t.sh tip', null, '\n## Test paths\n\n- `spec-files/`\n- `tests/`\n'),
        'tests/t.sh': argsProbe + 'cat spec-files/x >> "$F2P_LOG"\ngrep -q b src.txt\n',
      },
      cmd: 'sh tests/t.sh spec-files/x',
    });
    let r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.ran(), ['spec-files/x|', 'two', 'spec-files/x|', 'two'], 'the command runs twice, and a file the tip\'s test paths name stays as it is');

    // The configuration is read from the tree root, whatever directory the verb runs from: a subdirectory of the scopetree
    // finds the tip's `## Test paths`, where a cwd-relative read finds none. The command runs at the tree root.
    s = scenario({
      base: { 'src.txt': 'a\n', 'spec-files/x': 'one\n', 'docs/agents/verification.md': verif('sh tests/t.sh tip', null, '\n## Test paths\n\n- `spec-files/`\n- `tests/`\n') },
      tip: { 'src.txt': 'b\n', 'spec-files/x': 'two\n', 'tests/t.sh': argsProbe + 'cat spec-files/x >> "$F2P_LOG"\ngrep -q b src.txt\n' },
      cmd: 'sh tests/t.sh spec-files/x',
    });
    for (const sub of ['docs', 'docs/agents']) {
      fs.rmSync(s.log, { force: true });
      // An empty trace holds no control to reuse (ADR 0215), so each run runs both.
      fs.rmSync(path.join(s.root, 'trace.log'), { force: true });
      r = s.run(s.range, { cwd: path.join(s.tree, sub) });
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a run from ${sub} runs at the tree root: ${r.stderr}`);
      assert.deepEqual(s.ran(), ['spec-files/x|', 'two', 'spec-files/x|', 'two'], `a run from ${sub} reads the configured test paths`);
    }
    // The changed-path listing is the range's whole change set as well, where the operator's git config limits `git diff` to
    // the cwd (`diff.relative`).
    git(s.repo, ['config', 'diff.relative', 'true']);
    r = s.run(s.range, { cwd: path.join(s.tree, 'docs') });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a \`diff.relative\` config does not narrow the changed paths: ${r.stderr}`);

    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    let before = [checkout(s.repo), checkout(s.tree)];
    const sentinel = hooked(s);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.ok(!fs.existsSync(sentinel), 'creating, restoring in, and removing the worktree ran no hook: ' + (fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8') : ''));
    assert.deepEqual(leftover(s), [], 'an outcome leaves no worktree directory');
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its HEAD, branches, index, working tree, and worktrees');

    // An error after the worktree exists (the put-back fails) removes it too, and the checkout keeps its state. The scenario
    // above has the same base and tip, so it runs again with the shim; its earlier run left one trace line and two log lines.
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const shim = path.join(D, 'bin');
    fs.mkdirSync(shim, { recursive: true });
    fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = restore ] && { echo 'shim: restore refused' >&2; exit 1; }; done\nexec ${realGit} "$@"\n`, { mode: 0o755 });
    // An empty trace holds no control to reuse (ADR 0215), so the control runs.
    fs.rmSync(path.join(s.root, 'trace.log'), { force: true });
    const tracedBefore = s.trace();
    fs.rmSync(s.log, { force: true });
    r = s.run(s.range, { env: { PATH: shim + path.delimiter + process.env.PATH } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /could not put the files back/);
    assert.deepEqual(s.ran(), ['docs|src.txt|tests|'], 'the control ran and the second run did not');
    assert.deepEqual(s.trace(), tracedBefore, 'an error writes no outcome line');
    assert.deepEqual(leftover(s), [], 'an error leaves no worktree directory');
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout as it was');

    // Run from the repository's main checkout, outside every run tree, the verb runs and records nothing.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    r = s.run(s.range, { cwd: s.repo });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.trace(), [], 'no run root, no trace line');
    assert.deepEqual(fs.readdirSync(path.join(s.repo, '.superdev')), ['scopes'], 'and no worktree directory stays');

    // Outside a run root, in a repository that has no `.superdev/` yet and does not ignore it, the verb ignores it through the
    // repository's `info/exclude`, so the checkout's working tree stays byte for byte as it was, and removes the empty
    // directory it created.
    s = scenario({
      bare: true,
      base: { '.gitignore': 'node_modules/\n', 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    const ignoreFile = fs.readFileSync(path.join(s.repo, '.gitignore'), 'utf8');
    r = s.run(s.range, { cwd: s.repo });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.ok(!fs.existsSync(path.join(s.repo, '.superdev')), 'the `.superdev/` directory the verb created is removed');
    assert.equal(fs.readFileSync(path.join(s.repo, '.gitignore'), 'utf8'), ignoreFile, 'the checkout\'s `.gitignore` is as it was');
    assert.equal(git(s.repo, ['status', '--porcelain=v1', '-uall']), '', 'and its working tree is clean');
    assert.match(git(s.repo, ['check-ignore', '-v', '.superdev/x']), /info\/exclude:\d+:\.superdev\/\s+\.superdev\/x$/, '`.superdev/` is ignored through `info/exclude`');

    // The run against the changed code resolves dependencies as the scope's own worktrees do: through the main checkout.
    s = scenario({
      base: { '.gitignore': '.superdev/\nnode_modules/\n', 'src.txt': 'a\n', 'docs/agents/verification.md': verif('node tests/check.js', 'node tests/check.js') },
      tip: { 'src.txt': 'b\n', 'tests/check.js': "require('dep'); process.exit(require('fs').readFileSync('src.txt', 'utf8').includes('b') ? 0 : 1);\n" },
      cmd: 'node tests/check.js',
    });
    fs.mkdirSync(path.join(s.repo, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(s.repo, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', 'a module installed in the main checkout resolves from the worktree: ' + r.stderr);

    // A control that cannot start (here no shell on the PATH, so `sh -c <command>` cannot spawn) records `unknown` naming the
    // start failure, in one line with no stack trace, and leaves no worktree. Inside a run root the line reaches the trace;
    // outside one nothing is written. PATH holds one directory with a link to git alone.
    for (const bare of [false, true]) {
      s = scenario({
        bare,
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      });
      const gitOnly = path.join(s.dir, 'git-only');
      fs.mkdirSync(gitOnly);
      fs.symlinkSync(process.env.PATH.split(path.delimiter).map((d) => path.join(d, 'git')).find((p) => fs.existsSync(p)), path.join(gitOnly, 'git'));
      r = s.run(s.range, bare ? { cwd: s.repo, env: { PATH: gitOnly } } : { env: { PATH: gitOnly } });
      const where = bare ? 'outside a run root' : 'inside a run root';
      assert.equal(r.status, 0, `${where}: a start failure is an unknown outcome: ` + r.stderr.slice(0, 2000));
      assert.equal(r.stdout.trim(), 'unknown control=start-failed:ENOENT', `${where}: one unknown line naming the start failure`);
      assert.doesNotMatch(r.stderr, /\n\s+at /, `${where}: no stack trace`);
      const home = bare ? path.join(s.repo, '.superdev') : s.root;
      assert.deepEqual(fs.existsSync(home) ? fs.readdirSync(home).filter((f) => f.startsWith('fail-to-pass-')) : [], [], `${where}: no worktree left`);
      if (bare) assert.ok(!fs.existsSync(home), 'outside a run root nothing is written');
      else {
        assert.deepEqual(s.trace().map((l) => l.split(' ').slice(2, 5).join(' ')), [`fail-to-pass ${s.range} unknown`], 'the trace line reads unknown');
        assert.deepEqual(s.runLines(), [], 'a control that could not start writes no run line');
      }
    }

    // A second run that cannot start records `unknown` naming the put-back's start failure, in one line with no stack
    // trace, and leaves no worktree. The verb starts each run as `sh -c <command>`, so a missing script only exits 127;
    // what fails the start is the shell itself going missing. PATH holds one directory of links to the tools the verb
    // and the command use, and the control run deletes the `sh` link, so the second spawn finds no shell (ENOENT).
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      cmd: `${CMD}; rm -f "$F2P_DIR/bin/sh"`,
    });
    const bin = path.join(s.dir, 'bin');
    fs.mkdirSync(bin);
    for (const tool of ['sh', 'git', 'rm']) {
      const real = process.env.PATH.split(path.delimiter).map((d) => path.join(d, tool)).find((p) => fs.existsSync(p));
      fs.symlinkSync(real, path.join(bin, tool));
    }
    r = s.run(s.range, { env: { PATH: bin } });
    assert.equal(r.status, 0, 'a put-back start failure is an unknown outcome: ' + r.stderr.slice(0, 2000));
    assert.equal(r.stdout.trim(), 'unknown control=0,put-back=start-failed:ENOENT', 'one unknown line naming the put-back start failure');
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
    assert.deepEqual(fs.readdirSync(s.root).filter((f) => f.startsWith('fail-to-pass-')), [], 'no worktree left');
    assert.deepEqual(s.trace().map((l) => l.split(' ').slice(2, 5).join(' ')), [`fail-to-pass ${s.range} unknown`], 'the trace line reads unknown');
  } finally {
    done();
  }
}
