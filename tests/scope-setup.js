'use strict';

// Shared setup of the scope suites (`tests/scope*.test.js`): the temporary directory the CLI runs in, the
// console-capture `call` helper, the `init` payload, and the `verification.md` text builder. Each suite requires
// it, so each suite runs on its own. It is no suite. `tmp` is created on first read, so a suite that needs only
// `verif` creates no directory.

require('./fixture-git');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('../plugin/scripts/scope.js');
const scopePath = require.resolve('../plugin/scripts/scope.js');

let dir;
const tmpDir = () => (dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-')));

// Capture console.log output per call, plus a direct process.stdout.write (dod-line's body mode
// writes its exact bytes that way, rather than through console.log's own added trailing newline).
const call = (argv, stdinJson) => {
  const logged = [];
  const orig = console.log;
  const origWrite = process.stdout.write;
  console.log = (s) => logged.push(String(s));
  process.stdout.write = (s) => {
    logged.push(String(s));
    return true;
  };
  try {
    run(argv, tmpDir(), stdinJson || '');
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
    process.stdout.write = origWrite;
  }
};

const sliceJson = JSON.stringify({
  anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
  slices: [
    { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—' },
    { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
  ],
});

// `verification.md` text: the first fence is the full command, the second the focused one, `extra` a trailing section.
const verif = (full, focused, extra = '') =>
  `# V\n\n\`\`\`sh\n${full}\n\`\`\`\n` + (focused ? `\n\`\`\`sh\n${focused}\n\`\`\`\n` : '') + extra;

const cleanup = () => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
};

module.exports = {
  get tmp() {
    return tmpDir();
  },
  call,
  sliceJson,
  verif,
  scopePath,
  run,
  cleanup,
};
