'use strict';

// Suite for plugin/lib/main-work-tree.js's `mainWorkTree` under the local-read bound (ADR 0290, INV-0009): a read a signal
// ended refuses as no verdict, a real exit and a spawn that never started keep their answers, a caller's own `timeout`
// replaces the bound, and opts that carry no `timeout` keep it. A fake git (`tests/fake-git.js`) ends the chosen call.
// The suite takes over 60 s: one case waits out the real local-read bound, since shipped code carries no seam that
// shortens it (ADR 0154).

const { test, after } = require('node:test');
require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitThrow } = require('../plugin/lib/git-spawn.js');
const { mainWorkTree } = require('../plugin/lib/main-work-tree.js');
const { fakeGit } = require('./fake-git.js');

const made = [];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'main-work-tree-')));
made.push(repo);
gitThrow(['init', '-q', '-b', 'main'], repo);

const noVerdict = (verb, signal = 'SIGKILL') => (e) =>
  e.isRefusal === true && e.noVerdict.verb === verb && e.noVerdict.signal === signal && e.message.includes('no verdict');

test('mainWorkTree refuses as no verdict when either of its reads is killed', () => {
  assert.throws(() => fakeGit({ match: '^rev-parse --git-common-dir' }).withPath(() => mainWorkTree(repo)), noVerdict('rev-parse'), 'a killed rev-parse refuses');
  assert.throws(() => fakeGit({ match: '^config' }).withPath(() => mainWorkTree(repo)), noVerdict('config'), 'a killed config read refuses');
});

test('mainWorkTree keeps its answers on a real exit and on a spawn that never started', () => {
  assert.equal(mainWorkTree(repo), repo, 'a checkout answers its main working tree');
  const plain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'main-work-tree-plain-')));
  made.push(plain);
  assert.equal(mainWorkTree(plain), null, 'a directory outside any repository answers null');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'main-work-tree-nogit-'));
  made.push(empty);
  assert.equal(mainWorkTree(repo, { env: { ...process.env, PATH: empty } }), null, 'a git that cannot start answers null, as a Spawn failure');
});

test("a caller's own timeout replaces the bound", () => {
  const slow = fakeGit({ match: '^rev-parse --git-common-dir', sleep: 120 });
  assert.throws(() => mainWorkTree(repo, { env: slow.env, timeout: 300 }), noVerdict('rev-parse'), 'the caller bound ends the read and its kill is SIGKILL');
});

test('opts that carry no timeout keep the 60 s bound, and the bound ends a hung read with its signal named', () => {
  // The read sleeps past the bound; the case asserts the refusal and its signal, never the elapsed time (ADR 0086).
  const hung = fakeGit({ match: '^rev-parse --git-common-dir', sleep: 120 });
  assert.throws(() => mainWorkTree(repo, { env: hung.env, timeout: undefined }), noVerdict('rev-parse'), 'the bound kills the hung read with SIGKILL');
});
