'use strict';

// Suite for plugin/scripts/scope.js's `config` verb (INV-0213, INV-0196, INV-0009, INV-0203): one configuration value of
// `docs/agents/*.md` per call, `remote`, `base`, `posture`, or `commands`, read from the working tree's top level or at a
// commit, printed as one line, `absent` for a missing document, line, or bullet, and a refusal with nothing on stdout for
// a document that exists but cannot be read, a commit git does not hold, or a git read a signal ended. Each case copies a
// repository built once.

const { test, after } = require('node:test');
const { copyFixture, templateOnce } = require('./fixture-git');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { call } = require('./scope-setup');
const { resolveRemote } = require('../plugin/lib/remote.js');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const CODE = '# Code host\n\n- **Remote:** `upstream`. Confirm with `git remote -v`.\n- **Base branch:** `trunk`.\n';
const DEPLOY = '# Deployment\n\n`/superdev:ship` reads the line that reads `Posture:` with a valid value.\n\nPosture: `manual`\n';
const VERIF = '# Verification\n\n```sh\nnode run-all.js\n```\n\n```sh\nnode run-some.js {paths}\n```\n';

// A repository whose first commit holds the three documents above and whose later commits change nothing in them.
const template = templateOnce((dir) => {
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 't@t'], dir);
  git(['config', 'user.name', 't'], dir);
  const agents = path.join(dir, 'docs', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'code-management.md'), CODE);
  fs.writeFileSync(path.join(agents, 'deployment.md'), DEPLOY);
  fs.writeFileSync(path.join(agents, 'verification.md'), VERIF);
  fs.mkdirSync(path.join(dir, 'plugin', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin', 'lib', 'keep'), '');
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'docs'], dir);
}, 'scope-config-template-');

const copies = [];
after(() => copies.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function repo() {
  const r = copyFixture(template(), 'scope-config-');
  copies.push(r);
  return r;
}
const doc = (r, name) => path.join(r, 'docs', 'agents', name);
const write = (r, name, text) => fs.writeFileSync(doc(r, name), text);

// The one line the verb prints, asserting it did not refuse.
const value = (cwd, ...args) => {
  const res = call(['config', ...args], '', cwd);
  assert.ok(res.ok, `config ${args.join(' ')} should not refuse: ${res.err}`);
  assert.equal(res.out.split('\n').length, 1, 'exactly one line');
  return res.out;
};

test('Each key prints its configured value from the top level and from a subdirectory.', () => {
  const r = repo();
  const sub = path.join(r, 'plugin', 'lib');
  for (const cwd of [r, sub]) {
    assert.equal(value(cwd, 'remote'), 'upstream', 'remote');
    assert.equal(value(cwd, 'base'), 'trunk', 'base');
    assert.equal(value(cwd, 'posture'), 'manual', 'posture');
    assert.equal(value(cwd, 'commands'), 'full focused', 'commands');
  }
  assert.equal(value(sub, 'remote'), resolveRemote(sub), 'config remote prints what resolveRemote returns (INV-0203)');
});

test('Both bullet spellings and CRLF line ends read the same values.', () => {
  const r = repo();
  write(r, 'code-management.md', '# Code host\r\n\r\n- **Remote**: `upstream`. Confirm.\r\n- **Base branch**: `trunk`.\r\n');
  write(r, 'deployment.md', DEPLOY.replace(/\n/g, '\r\n'));
  write(r, 'verification.md', VERIF.replace(/\n/g, '\r\n'));
  assert.equal(value(r, 'remote'), 'upstream', 'the colon-outside-bold remote spelling, CRLF');
  assert.equal(value(r, 'base'), 'trunk', 'the colon-outside-bold base spelling, CRLF');
  assert.equal(value(r, 'posture'), 'manual', 'posture, CRLF');
  assert.equal(value(r, 'commands'), 'full focused', 'commands, CRLF');
  assert.equal(value(r, 'remote'), resolveRemote(r), 'the same remote resolveRemote reads');
});

test('Each key prints absent with no document and with a document lacking its line or bullet.', () => {
  const r = repo();
  fs.rmSync(path.join(r, 'docs'), { recursive: true });
  for (const key of ['remote', 'base', 'posture', 'commands']) assert.equal(value(r, key), 'absent', `${key} with no document`);
  const s = repo();
  write(s, 'code-management.md', '# Code host\n\nno bullets here.\n');
  write(s, 'deployment.md', '# Deployment\n\nThe line that reads `Posture:` sets it.\n\nPosture: `manaul`\n');
  write(s, 'verification.md', '# Verification\n\nno fences here.\n');
  assert.equal(value(s, 'remote'), 'absent', 'remote with no Remote bullet');
  assert.equal(value(s, 'base'), 'absent', 'base with no Base branch bullet');
  assert.equal(value(s, 'posture'), 'absent', 'posture with no valid Posture line');
  assert.equal(value(s, 'commands'), 'none', 'commands with no test fence');
});

test('base reads absent for the seeds\' unfilled prose value and for an empty span; a value that strips to empty is absent.', () => {
  const r = repo();
  write(r, 'code-management.md', '- **Remote:** ``.\n- **Base branch**: the branch the scope branch was cut from (default `main`; confirm per repo).\n');
  assert.equal(value(r, 'base'), 'absent', 'the GitHub seed\'s unfilled value');
  assert.equal(value(r, 'remote'), 'absent', 'an empty remote span');
  write(r, 'code-management.md', '- **Base branch**: the branch the scope branch was cut from (default `main`).\n- **Base branch:** `main`.\n');
  assert.equal(value(r, 'base'), 'absent', 'the Forgejo seed\'s unfilled value, the first bullet deciding');
  write(r, 'code-management.md', '- **Base branch:** ` `.\n');
  assert.equal(value(r, 'base'), 'absent', 'a span holding only space');
});

test('commands counts no Prepare-command or CI fence and no unclosed fence, and an empty first fence leaves only focused.', () => {
  const r = repo();
  write(r, 'verification.md', '# V\n\n## Prepare command\n\n```sh\nnpm ci\n```\n\n## CI\n\n```\nbuild\n```\n');
  assert.equal(value(r, 'commands'), 'none', 'Prepare-command and CI fences are no test command');
  write(r, 'verification.md', '# V\n\n```sh\nnode run-all.js\n```\n\n```sh\nnode run-some.js\n');
  assert.equal(value(r, 'commands'), 'full', 'an unclosed second fence holds no block');
  write(r, 'verification.md', '# V\n\n```sh\n```\n\n```sh\nnode run-some.js\n```\n');
  assert.equal(value(r, 'commands'), 'focused', 'an empty first fence followed by a command');
  write(r, 'verification.md', '# V\n\n## Prepare command\n\n```sh\nnpm ci\n```\n\n## Test\n\n```sh\nnode run-all.js\n```\n');
  assert.equal(value(r, 'commands'), 'full', 'a fence after the Prepare-command section counts');
});

test('--at <commit> prints the value the document held at that commit, for a branch name and a SHA, and absent where it did not exist.', () => {
  const r = repo();
  const first = git(['rev-parse', 'HEAD'], r);
  git(['branch', 'old'], r);
  write(r, 'code-management.md', '- **Remote:** `fork`.\n- **Base branch:** `develop`.\n');
  git(['rm', '-q', 'docs/agents/deployment.md'], r);
  git(['commit', '-qam', 'change'], r);
  write(r, 'code-management.md', '- **Remote:** `worktree`.\n');
  write(r, 'deployment.md', 'Posture: `auto`\n');
  for (const at of ['old', first]) {
    assert.equal(value(r, 'remote', '--at', at), 'upstream', `remote at ${at}`);
    assert.equal(value(r, 'base', '--at', at), 'trunk', `base at ${at}`);
    assert.equal(value(r, 'posture', '--at', at), 'manual', `posture at ${at}`);
    assert.equal(value(r, 'commands', '--at', at), 'full focused', `commands at ${at}`);
  }
  assert.equal(value(r, '--at', 'HEAD', 'remote'), 'fork', 'the flag before the key, at HEAD, not the working tree');
  assert.equal(value(r, 'base', '--at', 'main'), 'develop', 'a branch name');
  assert.equal(value(r, 'posture', '--at', 'HEAD'), 'absent', 'a document the commit does not hold');
  assert.equal(value(r, 'posture'), 'auto', 'the working tree still reads its own document');
  assert.equal(value(path.join(r, 'plugin', 'lib'), 'remote', '--at', 'old'), 'upstream', 'from a subdirectory');
});

// The refusal of one call: exit 1 (a refusal), a message, and nothing on stdout.
const refusal = (cwd, ...args) => {
  const res = call(['config', ...args], '', cwd);
  assert.ok(!res.ok, `config ${args.join(' ')} should refuse`);
  assert.equal(res.exitCode, undefined, 'a refusal exits 1');
  assert.equal(res.out, '', 'nothing on stdout');
  return res.err;
};

test('An unreadable document, an unheld commit, an option-shaped commit, remote, or base, and a bad argument each refuse with nothing on stdout.', () => {
  const r = repo();
  for (const name of ['code-management.md', 'deployment.md', 'verification.md']) {
    fs.rmSync(doc(r, name));
    fs.mkdirSync(doc(r, name));
  }
  for (const key of ['remote', 'base', 'posture', 'commands']) assert.match(refusal(r, key), /cannot be read/, `${key}: a document that exists but cannot be read`);
  const s = repo();
  assert.match(refusal(s, 'remote', '--at', '0'.repeat(40)), /not in this repository/, 'an unheld commit');
  assert.match(refusal(s, 'posture', '--at', 'no-such-branch'), /not in this repository/, 'an unknown branch name');
  assert.match(refusal(s, 'base', '--at', '--output=x'), /starts with "-"/, 'an --at value starting with -');
  assert.match(refusal(s, 'base', '--at', '-'), /starts with "-"/, 'a bare - as --at');
  write(s, 'code-management.md', '- **Remote:** `--upload-pack=x`.\n- **Base branch:** `-main`.\n');
  assert.match(refusal(s, 'remote'), /starts with "-"/, 'a configured remote starting with -');
  assert.match(refusal(s, 'base'), /starts with "-"/, 'a configured base starting with -');
  assert.match(refusal(s, 'branch'), /unknown key/, 'an unknown key');
  assert.match(refusal(s), /needs a key/, 'a missing key');
  assert.match(refusal(s, 'remote', 'base'), /unrecognized argument/, 'an extra argument');
  assert.match(refusal(s, 'remote', '--root', s), /unrecognized argument/, 'an unknown flag');
  assert.match(refusal(s, 'remote', '--at'), /needs a commit/, '--at with no value');
  assert.match(refusal(s, 'remote', '--at', 'HEAD', '--at', 'HEAD'), /given twice/, '--at twice');
});

test('A document git cannot read at a held commit refuses, never reads as absent.', () => {
  const r = repo();
  const blob = git(['rev-parse', 'HEAD:docs/agents/code-management.md'], r);
  fs.rmSync(path.join(r, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  assert.match(refusal(r, 'remote', '--at', 'HEAD'), /git cannot read docs\/agents\/code-management\.md at HEAD/);
});

test('A git read a signal ended refuses with no value printed (INV-0009).', () => {
  const { fakeGit } = require('./fake-git.js');
  const r = repo();
  const top = fakeGit({ match: '^rev-parse --show-toplevel' });
  assert.match(top.withPath(() => refusal(r, 'remote')), /no verdict/, 'a killed top-level read');
  const verify = fakeGit({ match: '^rev-parse --verify' });
  assert.match(verify.withPath(() => refusal(r, 'base', '--at', 'HEAD')), /no verdict/, 'a killed commit resolve');
  const show = fakeGit({ match: '^show' });
  assert.match(show.withPath(() => refusal(r, 'posture', '--at', 'HEAD')), /git cannot read/, 'a killed show');
});

test('At a full-SHA merge commit, route routes by the posture config posture --at prints, and both refuse the same commits and documents.', () => {
  const r = repo();
  const root = path.join(r, '.superdev', 'scopes', 'x');
  fs.mkdirSync(root, { recursive: true });
  const SETTLED = '## Definition of Done\n\n- [x] a — met: ok\n';
  fs.writeFileSync(path.join(root, 'dod.md'), SETTLED);
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Run state\n\n**Stage:** shipped\n');
  const route = (sha) => call(['route', '--root', root, '--merge', sha, '--target', 'pve'], SETTLED, r);
  const manual = git(['rev-parse', 'HEAD'], r);
  write(r, 'deployment.md', '# Deployment\n\nno posture\n');
  git(['commit', '-qam', 'no posture'], r);
  const none = git(['rev-parse', 'HEAD'], r);
  assert.equal(value(r, 'posture', '--at', manual), 'manual');
  assert.equal(route(manual).out, 'verify-ship', 'manual with the target not recorded deployed');
  assert.equal(value(r, 'posture', '--at', none), 'absent');
  assert.equal(route(none).out, 'wrap-up', 'absent reads as none');
  const unheld = 'f'.repeat(40);
  refusal(r, 'posture', '--at', unheld);
  assert.ok(!route(unheld).ok, 'route refuses the unheld commit config refuses');
  const blob = git(['rev-parse', `${manual}:docs/agents/deployment.md`], r);
  fs.rmSync(path.join(r, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  assert.match(refusal(r, 'posture', '--at', manual), /git cannot read docs\/agents\/deployment\.md/);
  const res = route(manual);
  assert.ok(!res.ok, 'route refuses the document config cannot read');
  assert.match(res.err, /git cannot read docs\/agents\/deployment\.md/, 'with the same reason');
});

test('config --help lists the verb, its keys, --at, and the absent and refusal rules.', () => {
  const cp = require('node:child_process');
  const res = cp.spawnSync(process.execPath, [require('./scope-setup').scopePath, 'config', '--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(res.status, 0, res.stderr);
  const out = res.stdout;
  assert.match(out, /^ {2}config <remote\|base\|posture\|commands> \[--at <commit>\]/m, 'the verb, its keys, and --at');
  assert.doesNotMatch(out, /^ {2}route /m, 'only the config entry');
  for (const word of ['absent', 'full focused', 'starts with -', 'cannot be read', 'not held', 'signal']) assert.ok(out.includes(word), `the help names ${word}`);
});
