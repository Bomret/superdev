'use strict';

// Selftest suite: the scanners over the shipped executables' source text (`scanners/shell-spawn.js`) —
// hook ledger-header parsers and shell-starting spawn forms. Run by ./index.js.

const { scanHookLedgerParsers, scanShellSpawn } = require('../scanners');

module.exports = ({ assert, path, fixture }) => {
  // --- no-second-reader: no hook carries a ledger-header regex of its own (ADR 0022) ---

  for (const [label, src] of [
    ['a template literal', 'const m = text.match(new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*[^\\\\S\\\\n]*(\\\\S+)`));'],
    ['a single-quoted string', "const re = new RegExp('^\\\\*\\\\*' + name + ':\\\\*\\\\*\\\\s*(.*)$');"],
  ]) {
    const gaps = scanHookLedgerParsers(fixture({ 'hooks/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags a hook parsing a header with ${label}`);
    assert.equal(gaps[0].source, path.join('hooks', 'rogue.js'), 'names the hook');
  }
  assert.equal(
    scanHookLedgerParsers(
      fixture({
        'hooks/good.js':
          "const { readLedgerHeader } = require('../lib/ledger.js');\n" +
          "// reads the ledger's **Stage:** line through lib/ledger.js\n",
      }),
    ).length,
    0,
    'a hook using the shared reader, and naming a header in prose, is clean',
  );
  assert.equal(
    scanHookLedgerParsers(fixture({ 'lib/ledger.js': 'const re = new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*`);' })).length,
    0,
    'lib/ledger.js, the module that owns the reader, holds the header regex',
  );
  const libGaps = scanHookLedgerParsers(fixture({ 'lib/rogue.js': 'const re = new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*`);' }));
  assert.equal(libGaps.length, 1, 'flags a module under lib parsing a header');
  assert.equal(libGaps[0].source, path.join('lib', 'rogue.js'), 'names the module');
  assert.equal(scanHookLedgerParsers(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks dir holds nothing to scan');

  // --- shell-spawn: no shipped executable starts a shell against INV-0153 (ADR 0150) ---

  for (const [form, src] of [
    ['execSync', "const { execSync } = require('node:child_process');\nexecSync('x');"],
    ['exec', "const cp = require('node:child_process');\ncp.exec('x');"],
    ['absolute path', "spawnSync('/bin/sh', ['-c', cmd]);"],
    ['absolute path', 'execFileSync("/usr/bin/env", []);'],
    ['bash', "spawn('bash', ['-c', cmd]);"],
    ['shell option', "spawnSync('git', [], { shell: true });"],
    ['shell option', "spawnSync('git', [], { shell: process.platform === 'win32' });"],
    ['exec', "require('child_process').exec('x');"],
    ['execSync', "require('node:child_process').execSync('x');"],
    ['exec', "const { exec } = require('child_process');\nexec('x');"],
    ['exec', "const { exec: run } = require('child_process');\nrun('x');"],
    ['exec', "import { exec } from 'node:child_process';\nexec('x');"],
    ['exec', "import { exec as run } from 'child_process';\nrun('x');"],
    // Comment-like text inside a string or a `//` comment must not delete the live code after it.
    ['absolute path', "const g = 'docs/*.md';\nspawnSync('/bin/sh', ['-c', cmd]);\nconst e = '*/';"],
    ['absolute path', "// slice/* branches\nspawnSync('/bin/sh', ['-c', cmd]);\n// done */"],
    ['absolute path', "const s = 'a // b'; spawnSync('/bin/sh', []);"],
    ['exec', "const run = util.promisify(require('child_process').exec);"],
    ['execSync', "const run = wrap(require('node:child_process').execSync);"],
    ['exec', "const { exec } = await import('node:child_process');\nexec('x');"],
    ['execSync', "const { execSync: run } = await import('child_process');\nrun('x');"],
    ['shell option', "spawnSync('git', [], {\n  shell: true,\n});"],
    ['exec', "const cp = require('child_process');\nconst run = promisify(cp.exec);"],
    ['execSync', "const cp = require('node:child_process');\nwrap(cp.execSync);"],
    ['exec', "const { exec } = require('child_process');\nconst run = promisify(exec);"],
    ['exec', "const { exec: x } = require('child_process');\nconst run = promisify(x);"],
    ['exec', "import('child_process').then(({ exec }) => exec('x'));"],
    ['shell option', "spawnSync('git', [], { cwd, shell });"],
    ['shell option', "spawnSync('git', [], {\n  cwd: dir,\n  shell,\n});"],
  ]) {
    const gaps = scanShellSpawn(fixture({ 'scripts/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags ${form}: ${src}`);
    assert.equal(gaps[0].source, path.join('scripts', 'rogue.js'), `names the file for ${form}`);
    assert.ok(gaps[0].expectation.includes(`(${form})`), `names the form ${form}`);
  }
  assert.equal(scanShellSpawn(fixture({ 'hooks/rogue.mjs': "execSync('x');" })).length, 1, 'scans .mjs under hooks');
  const libSpawn = scanShellSpawn(fixture({ 'lib/rogue.js': "execSync('x');" }));
  assert.equal(libSpawn.length, 1, 'scans the modules under lib');
  assert.equal(libSpawn[0].source, path.join('lib', 'rogue.js'), 'names the module under lib');
  assert.equal(
    scanShellSpawn(
      fixture({
        'hooks/good.js':
          "spawnSync('sh', ['-c', cmd]);\nspawnSync('git', ['status']);\nspawn(process.execPath, [a]);\n" +
          "spawnSync('taskkill', ['/pid', '1']);\nconst m = re.exec(text);\nconst n = /x/.exec(text);\n" +
          "const node = { shell: undefined };\nspawnSync('git', []); // was execSync(x) once\n" +
          "const { exec: run } = require('child_process');\nconst other = 1;\n" +
          "const pick = ok ? shell : other;\nf(a, shell, b);\nconst { shell } = opts;\nconst cp = require('child_process');\ncp.spawnSync('git', []);\n" +
          "const o = { exec: 1 };\nobj.exec(x);\nconst t = 'a // b'; // trailing\n",
      }),
    ).length,
    0,
    'sh -c, git, process.execPath, taskkill, RegExp exec, `shell: undefined`, a trailing comment, an uncalled alias, and a `shell` ternary are clean',
  );
  assert.equal(scanShellSpawn(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks or scripts dir holds nothing to scan');
};
