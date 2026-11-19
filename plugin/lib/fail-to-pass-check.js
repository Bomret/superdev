'use strict';

// fail-to-pass-check.js: the `fail-to-pass-check` verb, a commit range's mechanical fail-to-pass verdict read from the run trace and
// git, with no test run and no write (ADR 0260, INV-0117, INV-0195, INV-0196).

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { gitSpawn, resolveCommit, fileAt } = require('./git-spawn.js');
const { isTestPath } = require('./verification.js');
const { readRunTrace, sliceOf, windowIndexes } = require('./trace-window.js');
const { netChanges } = require('./untraced.js');
const { outcomeOf } = require('./fail-to-pass.js');

// The verdicts, a closed set the reviewer prose reads (`references/fail-to-pass.md`):
//   fail-to-pass <range> <command>      the latest deciding outcome line covering the range reads fail-to-pass (settled-from-trace included)
//   pass-to-pass <range> <command>      it reads pass-to-pass, and no later fail-to-pass line closes it
//   closed <range> <command>            it reads pass-to-pass, and a later fail-to-pass line from its base to its tip or a newer one closes it
//   unknown <reason> [<range> <command>]  only unknown lines cover the range, or a gap: `no-trace`, `no-change`
//   missing                             the range changes a test-path file, not only by deletion, and another file, and no outcome line covers it
//   test-only                           the range changes only test-path files, and no outcome line covers it
//   no-test-change                      it changes other files and no test-path file, or deletes test-path files only, and no outcome line covers it
// An outcome line covers the range when its tip is the range's tip and its base is the range's base or an ancestor of it, so an
// outcome from the slice's base covers a fix cycle's range.

function verbFailToPassCheck(cwd, args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    if (!['--slice', '--window', '--root'].includes(a)) fail(`fail-to-pass-check: unrecognized argument "${a}"`);
    const v = args[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) fail(`fail-to-pass-check: ${a} needs a value`);
    if (a in flags) fail(`fail-to-pass-check: ${a} given twice`);
    flags[a] = v;
    i++;
  }
  const root = flags['--root'];
  const slice = flags['--slice'];
  if (!root) fail('fail-to-pass-check needs --root <run-root>');
  if (!slice) fail('fail-to-pass-check needs --slice <id|scope>');
  if (positional.length !== 1) fail('fail-to-pass-check needs one <base>..<tip> range');
  const range = positional[0];
  if (range.includes('...')) fail(`fail-to-pass-check: "${range}" is a ... range; give <base>..<tip>`);
  const [baseRef, tipRef, ...more] = range.split('..');
  if (!baseRef || !tipRef || more.length) fail(`fail-to-pass-check: "${range}" is no <base>..<tip> range`);
  const base = resolveCommit(baseRef, cwd);
  if (!base) fail(`fail-to-pass-check: "${baseRef}" does not resolve to a commit`);
  const tip = resolveCommit(tipRef, cwd);
  if (!tip) fail(`fail-to-pass-check: "${tipRef}" does not resolve to a commit`);
  const ancestor = (a, b) => a === b || gitSpawn(['merge-base', '--is-ancestor', a, b], cwd).status === 0;
  if (!ancestor(base, tip)) fail(`fail-to-pass-check: "${baseRef}" is not an ancestor of "${tipRef}"`);
  if (!fs.existsSync(path.join(root, 'ledger.md'))) fail(`fail-to-pass-check: "${root}" holds no ledger.md, so it is no run root`);

  const { events } = readRunTrace(root);
  const inWindow = flags['--window'] === undefined ? null : windowIndexes(events, flags['--window'], slice, (m) => fail(`fail-to-pass-check: ${m}`));
  const mine = events.filter((e, i) => sliceOf(e) === slice && (inWindow === null || inWindow.has(i)));
  const changes = netChanges(`${base}..${tip}`, cwd, 'fail-to-pass-check');
  if (!mine.length) return console.log(`unknown no-trace: the run trace holds no line of slice ${slice}${inWindow ? ` in window ${flags['--window']}` : ''}`);
  if (!changes.length) return console.log('unknown no-change: the range\'s first-parent commits change no file');

  const resolved = new Map();
  const commitOf = (ref) => {
    if (!resolved.has(ref)) resolved.set(ref, resolveCommit(ref, cwd));
    return resolved.get(ref);
  };
  const outcomes = mine.map(outcomeOf).filter((o) => o !== null).map((o) => ({ ...o, b: commitOf(o.base), t: commitOf(o.tip) }));
  const covers = (o) => o.t === tip && o.b !== null && ancestor(o.b, base);
  const line = (verdict, o) => console.log(`${verdict} ${o.base}..${o.tip} ${o.command}`);

  const decidingAt = outcomes.findLastIndex((o) => (o.outcome === 'fail-to-pass' || o.outcome === 'pass-to-pass') && covers(o));
  if (decidingAt >= 0) {
    const d = outcomes[decidingAt];
    if (d.outcome === 'fail-to-pass') return line('fail-to-pass', d);
    const closing = outcomes.slice(decidingAt + 1).find((o) => o.outcome === 'fail-to-pass' && o.b === d.b && o.t !== null && ancestor(d.t, o.t));
    return closing ? line('closed', closing) : line('pass-to-pass', d);
  }
  const unknown = outcomes.findLast((o) => o.outcome === 'unknown' && covers(o));
  if (unknown) return console.log(`unknown ${unknown.reason} ${unknown.base}..${unknown.tip} ${unknown.command}`);

  const config = fileAt(tip, 'docs/agents/verification.md', cwd);
  if (config === null) fail("fail-to-pass-check: git could not read the tip's verification configuration");
  const tests = changes.filter((c) => isTestPath(config, c.path));
  const others = changes.length - tests.length;
  if (!others) return console.log('test-only');
  if (!tests.length || tests.every((c) => c.status === 'deleted')) return console.log('no-test-change');
  return console.log('missing');
}

module.exports = { verbFailToPassCheck };
