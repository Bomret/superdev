'use strict';

// Suite for plugin/scripts/scope.js's `dod-open` verb: a run's Definition-of-Done criteria listed by the note rule
// (INV-0190), the stage hold, the `docs` filter, and the refusals. The verb only reads, so every case shares one
// temporary directory of run roots.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-dod-open-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
let rootCount = 0;
// A run root holding `dod.md` with `body`.
const runRoot = (body) => {
  const root = path.join(dir, `run-${rootCount++}`);
  fs.mkdirSync(root);
  if (body !== undefined) fs.writeFileSync(path.join(root, 'dod.md'), body);
  return root;
};
const dodOpen = (body, ...extra) => call(['dod-open', '--root', runRoot(body), ...extra]);
// The listing's criterion lines, without the closing `stage-hold:` line.
const listing = (body, ...extra) => {
  const r = dodOpen(body, ...extra);
  assert.ok(r.ok, 'dod-open should pass: ' + (r.err || ''));
  return r.out.split('\n').filter((l) => !l.startsWith('stage-hold:'));
};
const T = '\t';
let fileCount = 0;
// A file holding `text`, the form `dod-line` reads its criterion and note from.
const matchFile = (text) => {
  const file = path.join(dir, `arg-${fileCount++}.txt`);
  fs.writeFileSync(file, text);
  return file;
};

// Each label with both checkbox states: the note decides open or settled, the box decides nothing.
{
  const lines = listing(
    [
      '## Definition of Done',
      '',
      '- [x] a — 01 — met: e',
      '- [ ] b — 01 — met: e',
      '- [x] c — 01 — accepted: r',
      '- [ ] d — 01 — accepted: r',
      '- [x] e — 01 — not met: r',
      '- [ ] f — 01 — not met: r',
      '- [x] g — 01 — ceiling: r',
      '- [ ] h — 01 — ceiling: r',
      '- [x] i — 01',
      '- [ ] j — 01',
      '',
    ].join('\n')
  );
  assert.deepEqual(
    lines,
    [
      ['settled', 'met', '01', '-', 'a'],
      ['settled', 'met', '01', '-', 'b'],
      ['settled', 'accepted', '01', '-', 'c'],
      ['settled', 'accepted', '01', '-', 'd'],
      ['open', 'not-met', '01', '-', 'e'],
      ['open', 'not-met', '01', '-', 'f'],
      ['open', 'ceiling', '01', '-', 'g'],
      ['open', 'ceiling', '01', '-', 'h'],
      ['open', 'none', '01', '-', 'i'],
      ['open', 'none', '01', '-', 'j'],
    ].map((f) => f.join(T)),
    'each label reads open or settled by its note, with either checkbox state'
  );
}

// Tags: single, several, a store ref, `scope`, `docs`, and none.
{
  const lines = listing(
    [
      '## Definition of Done',
      '- [ ] a — 01 — met: e',
      '- [ ] b — 01, 02 — met: e',
      '- [ ] c — #259 — met: e',
      '- [ ] d — scope — met: e',
      '- [ ] e — docs — not met: r',
      '- [ ] f — met: e',
      '- [ ] g — docs',
      '- [ ] h',
    ].join('\n')
  );
  assert.deepEqual(
    lines.map((l) => l.split(T)[2]),
    ['01', '01, 02', '#259', 'scope', 'docs', '-', 'docs', '-'],
    'the tag column carries the tag as written, and `-` where the line has none'
  );
}

// The repair citation: only a `not met:` note ending in the observed citation carries it.
{
  const lines = listing(
    [
      '## Definition of Done',
      '- [ ] a — 01 — not met: seen (observed)',
      '- [ ] b — 01 — not met: seen (observed; after #951, #957)',
      '- [ ] c — 01 — not met: written before merge',
      '- [ ] d — 01 — ceiling: partial (observed)',
      '- [x] e — 01 — met: ok (observed)',
    ].join('\n')
  );
  assert.deepEqual(
    lines.map((l) => l.split(T)[3]),
    ['repair-citation', 'repair-citation', '-', '-', '-'],
    'a `not met:` note with the observed citation carries repair-citation; any other note does not'
  );
}

// stage-hold: an open line other than `ceiling`, `accepted`, and `docs` holds the stage.
{
  const hold = (...criteria) =>
    dodOpen(['## Definition of Done', ...criteria].join('\n')).out.split('\n').pop();
  assert.equal(hold('- [x] a — 01 — met: e', '- [ ] b — 01 — accepted: r'), 'stage-hold: no', 'settled lines hold nothing');
  assert.equal(hold('- [ ] a — 01 — ceiling: r'), 'stage-hold: no', 'a ceiling line holds no stage');
  assert.equal(hold('- [ ] a — docs — not met: r', '- [x] b — docs'), 'stage-hold: no', 'docs lines hold no stage');
  assert.equal(hold('- [x] a — 01 — met: e', '- [ ] b — 01 — not met: r'), 'stage-hold: yes', 'a not met line holds the stage');
  assert.equal(hold('- [x] a — 01'), 'stage-hold: yes', 'a bare tick holds the stage');
  assert.equal(hold('- [ ] a — 01, docs'), 'stage-hold: yes', 'a line tagged `01, docs` is no docs line');
  assert.equal(hold('- [ ] a — scope — not met: r'), 'stage-hold: yes', 'a scope line holds the stage');
}

// --tag docs: every open docs line in either open shape, nothing else.
{
  const body = [
    '## Definition of Done',
    '- [ ] a — docs — not met: r',
    '- [x] b — docs',
    '- [ ] c — docs — met: e',
    '- [x] d — docs — ceiling: r',
    '- [ ] e — 01 — not met: r',
    '',
  ].join('\n');
  const r = dodOpen(body, '--tag', 'docs');
  assert.ok(r.ok, r.err);
  assert.equal(
    r.out,
    [['open', 'not-met', 'docs', '-', 'a'], ['open', 'none', 'docs', '-', 'b'], ['open', 'ceiling', 'docs', '-', 'd']]
      .map((f) => f.join(T))
      .join('\n'),
    'the docs filter prints each open docs line and no settled, other-tagged, or stage-hold line'
  );
}

// Only the Definition-of-Done section is read, and a fenced checkbox is no criterion.
{
  const lines = listing(
    ['- [ ] outside — 01', '## Definition of Done', '- [ ] a — 01 — met: e', '```', '- [ ] fenced — 01', '```', '## Next', '- [ ] after'].join('\n')
  );
  assert.deepEqual(lines, ['settled\tmet\t01\t-\ta'], 'a line outside the section or inside a fence is no criterion');
}

// Refusals and the no-criteria line.
{
  let r = call(['dod-open', '--root', runRoot()]);
  assert.ok(!r.ok && !r.exitCode && /dod\.md/.test(r.err) && r.out === '', 'a missing dod.md is refused: ' + r.err);
  r = call(['dod-open', '--root', path.join(dir, 'nope')]);
  assert.ok(!r.ok && r.out === '', 'a missing run root is refused');
  r = call(['dod-open']);
  assert.ok(!r.ok && /--root/.test(r.err), 'no --root is refused');
  r = dodOpen('## Definition of Done\n- [ ] a — 01\n```\nopen\n');
  assert.ok(!r.ok && /unterminated/.test(r.err) && r.out === '', 'a fence-broken dod.md is refused: ' + r.err);
  const unreadable = runRoot();
  fs.mkdirSync(path.join(unreadable, 'dod.md'));
  r = call(['dod-open', '--root', unreadable]);
  assert.ok(!r.ok && r.out === '', 'an unreadable dod.md is refused');
  r = dodOpen('## Definition of Done\n\nnothing\n');
  assert.ok(!r.ok && r.err === 'no criteria' && r.out === '', 'a dod.md with no criterion line says no criteria and fails');
  r = dodOpen('## Definition of Done\n- [ ] a\n', '--tag', 'scope');
  assert.ok(!r.ok, 'an unknown --tag is refused');
}

// dod-open and dod-line agree on every line of the mod's fixtures.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'dod-fixtures.ts'), 'utf8');
  const pinned = (name) => JSON.parse(src.slice(src.indexOf(`/* ${name}:start */`) + name.length + 12, src.indexOf(`/* ${name}:end */`)));
  const open = src.slice(src.indexOf('DOD_OPEN_LINES'));
  const openLines = [...open.matchAll(/^\s*'(- \[.*)',?$/gm)].map((m) => m[1]);
  const all = [...pinned('dod'), ...pinned('dod-lookalike'), ...openLines];
  assert.equal(openLines.length, 4, 'the fixture file holds its open lines');
  for (const line of all) {
    const got = listing(`## Definition of Done\n${line}\n`)[0].split(T);
    // dod-line judges the same line with a note it writes itself; both read the criterion, the tag, and the label alike.
    const verdict = got[1] === 'not-met' ? 'not-met' : got[1];
    if (verdict === 'none') continue;
    const reading = require('../plugin/lib/dod-line.js').parseDodLineReadings(line)[0];
    assert.equal(got[4], reading.criterion, 'criterion agrees for ' + line);
    assert.equal(got[2], reading.tag || '-', 'tag agrees for ' + line);
    const rewritten = call(['dod-line', '--match-file', matchFile(reading.criterion), '--verdict', verdict, '--note-file', matchFile('x')], line);
    assert.ok(rewritten.ok, rewritten.err);
    assert.equal(listing(`## Definition of Done\n${rewritten.out.trimEnd()}\n`)[0].split(T)[1], got[1], 'label survives a dod-line rewrite of ' + line);
  }
  // The settled lines are the `met`/`accepted` ones, as parse.ts counts them.
  const settled = all.filter((l) => /^\S+ \[.\] .*(met|accepted): /.test(l) && listing(`## Definition of Done\n${l}\n`)[0].startsWith('settled'));
  assert.ok(settled.length >= 4, 'settled fixture lines read settled');
  assert.deepEqual(
    listing(`## Definition of Done\n${openLines.join('\n')}\n`).map((l) => l.split(T)[0]),
    ['open', 'open', 'open', 'open'],
    'the open fixture lines read open'
  );
  assert.deepEqual(
    listing(`## Definition of Done\n${pinned('dod-lookalike').join('\n')}\n`).map((l) => l.split(T)[1]),
    ['not-met', 'not-met', 'met', 'met'],
    'a look-alike label inside the note leaves the leftmost label'
  );
}

// The verb writes nothing: the run root and the git state stay as they were.
{
  const { execFileSync } = require('node:child_process');
  const root = runRoot('## Definition of Done\n- [ ] a — 01\n');
  fs.writeFileSync(path.join(root, 'ledger.md'), 'Stage: implement\n');
  const snap = () => JSON.stringify(fs.readdirSync(dir, { recursive: true }).sort().map((f) => [f, fs.statSync(path.join(dir, f)).isFile() ? fs.readFileSync(path.join(dir, f), 'utf8') : '']));
  const before = snap();
  const repoDir = path.join(__dirname, '..');
  const git = () => execFileSync('git', ['status', '--porcelain'], { cwd: repoDir, encoding: 'utf8' });
  const gitBefore = git();
  call(['dod-open', '--root', root]);
  call(['dod-open', '--root', root, '--tag', 'docs']);
  assert.equal(snap(), before, 'no ledger, trace, digest, or dod.md byte changes');
  assert.equal(git(), gitBefore, 'the git state is unchanged');
  assert.ok(!fs.existsSync(path.join(root, 'trace.log')), 'no trace line is written');
}

console.log('scope-dod-open tests passed');
