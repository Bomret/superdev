'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, the dirty mark of a run line and the suite reuse it backs
// (ADR 0127, INV-0117, ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture, scopePath } = require('./scope-setup');

const { D, root, S, verif, sh, cli, bash, verb, lines, reset, end } = testVerbFixture();
try {
  // A run during which the tree dirties, or HEAD moves, records dirty; a start commit stays the start commit.
  reset();
  verif('touch made-dirty.txt', 'true');
  verb(['full']);
  assert.match(lines()[0], / run full pass [0-9a-f]{40} dirty - touch\\x20made-dirty\.txt \.$/, 'a tree dirtied during the run is dirty');
  fs.rmSync(path.join(S, 'made-dirty.txt'));
  reset();
  const gate = path.join(D, 'gate');
  fs.mkdirSync(gate);
  verif(`touch ${gate}/started; while [ ! -f ${gate}/go ]; do sleep 0.05; done`, 'true');
  let sha = sh(S, ['rev-parse', 'HEAD']);
  bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started ]; do sleep 0.05; done;` +
    ` git -c user.name=t -c user.email=t@t commit -q --allow-empty -m moved; touch ${gate}/go; wait $V`);
  assert.equal(lines().length, 1);
  assert.match(lines()[0], new RegExp(`^03 main run full pass ${sha} dirty - touch`), 'a background run records at its end, with its start commit, dirty for the moved HEAD');
  // Suite reuse: a clean run line at HEAD backs a green record (the control); the dirty line of a moved-HEAD run does not,
  // even with HEAD back on the start commit; and a dirty tree alone, at an unmoved HEAD, does not either.
  const reuse = () => {
    const head = sh(S, ['rev-parse', 'HEAD']);
    assert.equal(cli(['suite', 'set', 'green', head, '--root', root]).status, 0);
    return cli(['suite', 'reusable', '--branch', 'HEAD', '--root', root]);
  };
  sh(S, ['reset', '-q', '--hard', sha]);
  reset();
  verif('true', 'true');
  assert.equal(verb(['full']).status, 0);
  assert.equal(reuse().status, 0, 'control: a clean run line at HEAD backs reuse');
  reset();
  verif('touch made-dirty.txt', 'true');
  verb(['full']);
  fs.rmSync(path.join(S, 'made-dirty.txt'));
  assert.match(reuse().stderr, /dirty tree/, 'a run that dirtied an unmoved tree does not back reuse');
  reset();
  verif(`touch ${gate}/started2; while [ ! -f ${gate}/go2 ]; do sleep 0.05; done`, 'true');
  sha = sh(S, ['rev-parse', 'HEAD']);
  bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started2 ]; do sleep 0.05; done;` +
    ` git -c user.name=t -c user.email=t@t commit -q --allow-empty -m moved2; touch ${gate}/go2; wait $V`);
  sh(S, ['reset', '-q', '--hard', sha]);
  assert.match(lines()[0], new RegExp(`^03 main run full pass ${sha} dirty - touch`));
  assert.match(reuse().stderr, /dirty tree/, 'a moved-HEAD run line does not back reuse, with HEAD back on its start commit');
  // An edit the run trace records during the run, reverted before the run ends, still records dirty: the tree changed.
  reset();
  verif(`touch ${gate}/started3; while [ ! -f ${gate}/go3 ]; do sleep 0.05; done`, 'true');
  sha = sh(S, ['rev-parse', 'HEAD']);
  const editInput = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: S, tool_input: { file_path: path.join(S, 'transient.txt') } });
  bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started3 ]; do sleep 0.05; done;` +
    ` echo x > transient.txt; printf '%s' '${editInput}' | node ${path.join(__dirname, '..', 'plugin', 'hooks', 'run-trace.js')}; rm transient.txt;` +
    ` touch ${gate}/go3; wait $V`);
  assert.match(lines().find((l) => / run /.test(l)) || '', new RegExp(`^03 main run full pass ${sha} dirty - touch`), 'an edit made and reverted during the run records dirty');
  assert.match(reuse().stderr, /dirty tree/, 'and that run line does not back reuse');
  // A trace an older release wrote holds `revert` and `restore` lines (ADR 0227): the run reads them without error, and they
  // mark nothing, since the tree state alone names a change no edit line records.
  sh(S, ['reset', '-q', '--hard', sha]);
  reset();
  verif(`touch ${gate}/started4; while [ ! -f ${gate}/go4 ]; do sleep 0.05; done`, 'true');
  sha = sh(S, ['rev-parse', 'HEAD']);
  const traceFile = path.join(root, 'trace.log');
  bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started4 ]; do sleep 0.05; done;` +
    ` printf '%s\\n' '2026-01-01T00:00:00Z 03 main revert src/a.js' '2026-01-01T00:00:01Z 03 main restore src/b.js' >> ${traceFile};` +
    ` touch ${gate}/go4; wait $V`);
  assert.match(lines().find((l) => / run /.test(l)) || '', new RegExp(`^03 main run full pass ${sha} clean - touch`), 'revert and restore lines read without error and mark nothing');
} finally {
  end();
}
