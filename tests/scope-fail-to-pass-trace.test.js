'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, ADR 0182): the slice a trace line names, and the outcome
// line's place beside the suite record. Every scenario writes only inside the fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { f2pFixture, verif, scopePath } = require('./scope-setup');

const { appendTrace } = require(scopePath);


{
  const { git, probe, CMD, scenario, done } = f2pFixture();
  try {
    // The line names the slice the verb runs for: the slice a slicetree holds, the one in-progress slice a scopetree has,
    // and `scope` where none or several are in progress.
    let s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    git(s.repo, ['worktree', 'add', '-q', '-b', 'slice/07', path.join(s.root, 'slicetrees', '07'), s.tipSha]);
    s.run(s.range, { cwd: path.join(s.root, 'slicetrees', '07') });
    assert.deepEqual(s.trace(), [`07 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'a slicetree names its slice');
    assert.equal(s.runLines()[0].split(' ')[0], s.trace()[0].split(' ')[0], 'and the control run line names the same slice');
    const slice = spawnSync(process.execPath, [scopePath, 'slice', '01', 'merged', '--root', s.root], { cwd: s.repo, encoding: 'utf8' });
    assert.equal(slice.status, 0, slice.stderr);
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range);
    assert.deepEqual(s.trace(), [`scope main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'a scopetree with no slice in progress names `scope`');
    assert.equal(s.runLines()[0].split(' ')[0], s.trace()[0].split(' ')[0], 'and the control run line names the same slice');
    // The slice whose ledger row records exactly this range owns the line, from any directory, whatever form the row's commits
    // take: a run from the scopetree after the merge, with no slice in progress, still names it.
    const short = `${s.baseSha.slice(0, 8)}..${s.tipSha.slice(0, 8)}`;
    const recorded = spawnSync(process.execPath, [scopePath, 'slice', '01', 'merged', '--range', short, '--root', s.root], { cwd: s.repo, encoding: 'utf8' });
    assert.equal(recorded.status, 0, 'a range is recorded on a row that is merged already: ' + recorded.stderr);
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'the scopetree line names the slice that recorded the range');
    assert.equal(s.runLines()[0].split(' ')[0], s.trace()[0].split(' ')[0], 'and the control run line names that slice too');
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range, { cwd: path.join(s.root, 'slicetrees', '07') });
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'and so does a line from another slicetree');
    assert.equal(s.runLines()[0].split(' ')[0], s.trace()[0].split(' ')[0], 'and so does the control run line');

    // A fix cycle's range, and the range from a slice's base to a tip a fix cycle moved on, match no ledger row, so the line names
    // `scope` from a scopetree with no slice in progress. `/superdev:review`'s fix loop and run handoff's fix loop run the verb
    // there for the cycle itself and for the run that closes a Pass-to-pass finding (ADR 0134).
    fs.writeFileSync(path.join(s.tree, 'src.txt'), 'c\n');
    fs.writeFileSync(path.join(s.tree, 'tests', 't.sh'), probe + 'grep -q c src.txt\n');
    git(s.tree, ['add', '-A']);
    git(s.tree, ['commit', '-q', '-m', 'fix']);
    const fixSha = git(s.tree, ['rev-parse', 'HEAD']);
    for (const [label, range] of [['a fix cycle', `${s.tipSha}..${fixSha}`], ["a merged slice's base to the tip a fix cycle moved on", `${s.baseSha}..${fixSha}`]]) {
      fs.rmSync(path.join(s.root, 'trace.log'));
      const r = s.run(range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.deepEqual(s.trace(), [`scope main fail-to-pass ${range} fail-to-pass control=0,put-back=1`], `${label} names \`scope\``);
    }

    // An outcome line is no test run: it is no `run` line, never backs a suite record, and `suite reusable` answers as before.
    // The control's `path` run line backs no suite record either: it ran the range's test files, not the suite (ADR 0182).
    // The scenario above has the same base and tip, so it runs here from an empty trace, its branch back at the tip.
    git(s.tree, ['reset', '-q', '--hard', s.tipSha]);
    fs.rmSync(path.join(s.root, 'trace.log'));
    const cli = (sc, argv) => {
      const out = spawnSync(process.execPath, [scopePath, ...argv, '--root', sc.root], { cwd: sc.repo, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(out, 'scope.js ' + argv.join(' '));
      return out;
    };
    assert.equal(cli(s, ['suite', 'set', 'green', s.tipSha]).status, 0);
    const unbacked = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.equal(unbacked.status, 1, 'a suite record no run line backs is not reusable: ' + unbacked.stdout);
    appendTrace(s.root, { slice: '01', kind: 'fail-to-pass', fields: [s.range, 'fail-to-pass', 'control=0,put-back=1'] });
    const afterOutcome = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.deepEqual([afterOutcome.status, afterOutcome.stderr], [unbacked.status, unbacked.stderr], 'the outcome line backs nothing');
    assert.equal(s.run(s.range).status, 0);
    const afterControl = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.equal(afterControl.status, 1, 'the control run\'s path line backs no suite record: ' + afterControl.stdout);
    assert.equal(s.run(s.range).status, 0);
    assert.equal(s.runLines().length, 1, 'the first control run writes one run line, the second call reuses it (ADR 0215), and no outcome line is a run line');
    // `trace` prints the outcome line like any other, which is what `/superdev:status --trace` shows.
    const timeline = cli(s, ['trace']).stdout.split('\n');
    assert.ok(timeline.some((l) => new RegExp(` 01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1 sh\\\\x20tests/t\\.sh$`).test(l)), 'trace prints the outcome line, the command last');
    assert.ok(cli(s, ['trace', '--slice', '01']).stdout.includes(' fail-to-pass '), 'and the slice filter keeps it');
  } finally {
    done();
  }
}
