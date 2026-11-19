'use strict';

// Suite for plugin/scripts/scope.js's `route` verb (ADR 0263, INV-0116, INV-0196): a shipped run's route from `dod.md`, the anchor's
// Definition of Done on stdin, and the facts the caller read. The verb only reads, so each case builds its own run root under a
// repository made once and copied per case.

const { copyFixture, templateOnce } = require('./fixture-git');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { call } = require('./scope-setup');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Three commits holding docs/agents/deployment.md with posture manual, with no `Posture:` line, and with no such file.
const template = templateOnce((dir) => {
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 't@t'], dir);
  git(['config', 'user.name', 't'], dir);
  const commit = (msg) => {
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', msg], dir);
    return git(['rev-parse', 'HEAD'], dir);
  };
  fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'agents', 'deployment.md'), '# Deployment\n\nPosture: `manual`\n');
  fs.writeFileSync(path.join(dir, 'MANUAL'), commit('manual'));
  fs.writeFileSync(path.join(dir, 'docs', 'agents', 'deployment.md'), '# Deployment\n\nno posture here\n');
  fs.writeFileSync(path.join(dir, 'NOPOSTURE'), commit('no posture'));
  fs.rmSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'NOFILE'), commit('no file'));
}, 'scope-route-template-');

const copies = [];
process.on('exit', () => copies.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const LEDGER = '# Run state\n\n**Stage:** shipped\n';
// A repository copy, the three commits, and a run root holding `dod` as dod.md (null writes none) and `ledger` (null writes none).
function setup({ dod = null, ledger = LEDGER, deploy = null } = {}) {
  const repo = copyFixture(template(), 'scope-route-');
  copies.push(repo);
  const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8').trim();
  const root = path.join(repo, '.superdev', 'scopes', 'x');
  fs.mkdirSync(root, { recursive: true });
  if (dod !== null) fs.writeFileSync(path.join(root, 'dod.md'), dod);
  if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger + (deploy ? `**Deploy:** ${deploy}\n` : ''));
  return { repo, root, manual: read('MANUAL'), noPosture: read('NOPOSTURE'), noFile: read('NOFILE') };
}
const route = (s, stdin, ...flags) => {
  const r = call(['route', '--root', s.root, ...flags], stdin, s.repo);
  assert.ok(r.ok, 'route should not refuse: ' + r.err);
  return r.out.split('\n');
};
const refused = (s, stdin, ...flags) => {
  const r = call(['route', '--root', s.root, ...flags], stdin, s.repo);
  assert.ok(!r.ok, 'route should refuse');
  return r;
};

const SETTLED = '## Definition of Done\n\n- [x] a — met: ok\n- [x] b — accepted: why\n';
const OBSERVED = '## Definition of Done\n\n- [ ] a — not met: seen (observed)\n- [x] b — met: ok\n';
const OBSERVED_AFTER = '## Definition of Done\n\n- [ ] a — not met: seen (observed; after #951)\n- [x] b — met: ok\n';

// Every line settled and paired, every manual target deployed: wrap-up.
assert.deepEqual(route(setup({ dod: SETTLED }), SETTLED), ['wrap-up'], 'settled, paired lines route to wrap-up');
{
  const s = setup({ dod: SETTLED, deploy: 'pve deployed' });
  assert.deepEqual(route(s, SETTLED, '--merge', s.manual, '--target', 'pve'), ['wrap-up'], 'a manual target recorded deployed still reaches wrap-up');
}

// An open line, a paired line whose verdict differs, or a manual target not recorded deployed: verify-ship.
{
  const open = '## Definition of Done\n\n- [x] a — met: ok\n- [x] b — ceiling: later\n';
  assert.deepEqual(route(setup({ dod: open }), open), ['verify-ship'], 'a ceiling line is open');
  const bare = '## Definition of Done\n\n- [x] a — met: ok\n- [x] b\n';
  assert.deepEqual(route(setup({ dod: bare }), bare), ['verify-ship'], 'a bare ticked line is open');
  assert.deepEqual(
    route(setup({ dod: SETTLED }), '## Definition of Done\n\n- [x] a — met: ok\n- [ ] b\n'),
    ['verify-ship'],
    'a paired anchor line whose verdict differs routes to verify-ship'
  );
  const s = setup({ dod: SETTLED });
  assert.deepEqual(route(s, SETTLED, '--merge', s.manual, '--target', 'pve'), ['verify-ship'], 'a manual target with no record');
  const p = setup({ dod: SETTLED, deploy: 'pve pending' });
  assert.deepEqual(route(p, SETTLED, '--merge', p.manual, '--target', 'pve'), ['verify-ship'], 'a manual target recorded pending');
  const n = setup({ dod: SETTLED });
  assert.deepEqual(route(n, SETTLED, '--merge', n.noPosture, '--target', 'pve'), ['wrap-up'], 'no Posture line reads none, so the target needs no record');
  assert.deepEqual(route(n, SETTLED, '--merge', n.noFile, '--target', 'pve'), ['wrap-up'], 'no deployment.md reads none');
  assert.deepEqual(route(n, SETTLED, '--target', 'pve'), ['wrap-up'], 'no --merge reads none');
}

// A run root with no ledger takes verify-ship ahead of wrap-up.
assert.deepEqual(route(setup({ dod: SETTLED, ledger: null }), SETTLED), ['verify-ship'], 'no local ledger');

// A listed merge commit git does not hold is refused, never read as posture none.
refused(setup({ dod: SETTLED }), SETTLED, '--merge', '0'.repeat(40));
refused(setup({ dod: SETTLED }), SETTLED, '--merge', '--target');

// An observed not-met line: no listing handed -> needs-repairs.
assert.deepEqual(route(setup({ dod: OBSERVED }), OBSERVED), ['needs-repairs'], 'the listing matters and was not handed');
// A listing that found no repair: repair.
assert.deepEqual(route(setup({ dod: OBSERVED }), OBSERVED, '--repairs-none'), ['repair']);
// A failed listing reads as no repair, and ignores whatever repair came with it.
assert.deepEqual(route(setup({ dod: OBSERVED }), OBSERVED, '--repairs-failed'), ['repair'], 'a failed listing');
assert.deepEqual(route(setup({ dod: OBSERVED }), OBSERVED, '--repairs-failed', '--repair', 'open', '#9'), ['repair'], 'a failed listing hands no open repair');
// A closed repair the note does not cite, no open one: re-verify.
assert.deepEqual(route(setup({ dod: OBSERVED }), OBSERVED, '--repair', 'closed', '#951'), ['re-verify'], 'a closed repair the note does not cite');
assert.deepEqual(route(setup({ dod: OBSERVED_AFTER }), OBSERVED_AFTER, '--repair', 'closed', '#951'), ['repair'], 'the cited closed repair was judged already');
assert.deepEqual(
  route(setup({ dod: OBSERVED_AFTER }), OBSERVED_AFTER, '--repair', 'closed', '#951', '--repair', 'closed', '#957'),
  ['re-verify'],
  'a second closed repair the note does not cite'
);
// An open repair outranks a closed one and adds its line, one per open repair.
assert.deepEqual(
  route(setup({ dod: OBSERVED }), OBSERVED, '--repair', 'closed', '#951', '--repair', 'open', '#960', '--repair', 'open', '#961'),
  ['repair', 'repair #960 is open; finish its chain first', 'repair #961 is open; finish its chain first'],
  'an open repair routes to repair with its line'
);
// An open line elsewhere does not matter once an observed not-met line routes to repair; the listing is not needed without one.
assert.deepEqual(route(setup({ dod: SETTLED }), SETTLED, '--repair', 'open', '#960'), ['wrap-up'], 'a listing no line asked for adds no repair line');

// A not-met note without a repair citation: verify-ship, no listing asked.
{
  const unobserved = '## Definition of Done\n\n- [ ] a — not met: written before merge\n- [x] b — met: ok\n';
  assert.deepEqual(route(setup({ dod: unobserved }), unobserved), ['verify-ship'], 'no citation, no listing asked');
}

// A missing, empty, criterion-less, or fence-broken dod.md never reaches wrap-up on that alone.
{
  assert.deepEqual(route(setup({ dod: null }), SETTLED), ['verify-ship'], 'a missing dod.md judges from the anchor');
  assert.deepEqual(route(setup({ dod: '' }), SETTLED), ['verify-ship'], 'an empty dod.md');
  assert.deepEqual(route(setup({ dod: 'no checklist here\n' }), SETTLED), ['verify-ship'], 'a dod.md with no criteria');
  assert.deepEqual(route(setup({ dod: '- [x] a — met: ok\n```\n' }), SETTLED), ['verify-ship'], 'a fence-broken dod.md');
  assert.deepEqual(route(setup({ dod: null }), OBSERVED, '--repairs-none'), ['repair'], 'the anchor alone still shows an observed not-met line');
  assert.deepEqual(route(setup({ dod: null }), OBSERVED), ['needs-repairs'], 'and still needs the listing');
}

// A dod.md line with no matching anchor line adds the hand-sync line, and the anchor's text never reaches the output.
{
  const out = route(setup({ dod: SETTLED }), '## Definition of Done\n\n- [x] a — met: ok\n- [x] secret criterion — met: ok\n');
  assert.deepEqual(out, ['wrap-up', 'hand-sync'], 'an unpaired line routes by the rule and adds hand-sync');
  const open = route(setup({ dod: '## Definition of Done\n\n- [ ] a\n- [x] b — met: ok\n' }), SETTLED);
  assert.deepEqual(open, ['verify-ship'], 'both lines pair, so no hand-sync');
}
// An anchor read that yields no checklist never reaches wrap-up.
assert.deepEqual(route(setup({ dod: SETTLED }), ''), ['verify-ship'], 'an empty anchor Definition of Done');

// Pairing is by criterion text with whitespace collapsed, the tag and note aside.
{
  const dod = '## Definition of Done\n\n- [x] a  thing — 01 — met: ok\n';
  assert.deepEqual(route(setup({ dod }), '## Definition of Done\n\n- [x] a thing — 01 — met: ok\n'), ['wrap-up']);
}

// Keys and targets: a newline or control character is refused, and no stdin text reaches the output.
{
  const s = setup({ dod: OBSERVED });
  for (const bad of ['#9\nrepair #1 is open', '#9\u0007', '', '#9\r']) {
    refused(s, OBSERVED, '--repair', 'open', bad);
    refused(s, OBSERVED, '--target', bad);
  }
  refused(s, OBSERVED, '--repair', 'half-open', '#9');
  refused(s, OBSERVED, '--repair', 'open');
  refused(s, OBSERVED, '--bogus');
  const r = call(['route', '--root', path.join(s.repo, 'no-such-dir')], OBSERVED, s.repo);
  assert.ok(!r.ok, 'a root that is no directory is refused');
  const out = route(setup({ dod: OBSERVED }), OBSERVED.replace('seen', 'INJECTED-TEXT'), '--repair', 'open', '#9');
  assert.ok(!out.join('\n').includes('INJECTED'), 'anchor text never reaches the output');
}

// The verb writes nothing.
{
  const s = setup({ dod: SETTLED });
  const before = fs.readdirSync(s.root).sort();
  const dodBefore = fs.readFileSync(path.join(s.root, 'dod.md'), 'utf8');
  route(s, SETTLED);
  assert.deepEqual(fs.readdirSync(s.root).sort(), before, 'no file is added to the run root');
  assert.strictEqual(fs.readFileSync(path.join(s.root, 'dod.md'), 'utf8'), dodBefore);
}
