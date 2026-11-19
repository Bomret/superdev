'use strict';

// untraced.js: the `untraced` verb, the paths a window's commits change that no `edit` line of the window names (ADR 0227).

const fs = require('fs');
const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { lazyToplevel } = require('./run-tree.js');
const { readRunTrace, sliceOf, editPath, windowIndexes } = require('./trace-window.js');
const { fail } = require('./refusal.js');

const STATUS = { A: 'added', M: 'modified', T: 'modified', D: 'deleted', R: 'renamed' };

// The first-parent, non-merge commits of `range`, oldest first, as { path, status, from? } changes in commit order. A merge commit
// carries the base's changes into the branch, so it is no write of the window; diff-tree reads each commit against its first parent.
function changesOf(range, cwd, verb) {
  const revs = gitSpawn(['rev-list', '--first-parent', '--no-merges', '--reverse', range], cwd, { maxBuffer: 1 << 30 });
  if (revs.status !== 0) fail(`${verb}: git cannot read the range "${range}"`);
  const changes = [];
  for (const sha of revs.stdout.split('\n').filter(Boolean)) {
    const tree = gitSpawn(['diff-tree', '-r', '-z', '--name-status', '-M', '--no-commit-id', sha], cwd, { maxBuffer: 1 << 30 });
    if (tree.status !== 0) fail(`${verb}: git cannot read commit ${sha}`);
    const f = tree.stdout.split('\0');
    for (let i = 0; i + 1 < f.length; ) {
      const status = STATUS[f[i][0]];
      if (f[i][0] === 'R') {
        changes.push({ path: f[i + 2], status, from: f[i + 1] });
        i += 3;
      } else {
        changes.push({ path: f[i + 1], status });
        i += 2;
      }
    }
  }
  return changes;
}

// The net changes of `range`'s first-parent, non-merge commits as [{ path, status, from? }]; `verb` names the caller in a refusal.
function netChanges(range, cwd, verb) {
  const changes = changesOf(range, cwd, verb);
  // The range's net change per path, in commit order, keyed by the path as it stands now: a path added and then modified stays
  // added, one added and then deleted drops out, one deleted and then added is modified, one modified or renamed and then renamed is one rename from its original path,
  // and a rename's old path is no entry of its own.
  const net = new Map();
  for (const c of changes) {
    const before = net.get(c.path);
    if (c.status === 'renamed') {
      const old = net.get(c.from);
      net.delete(c.from);
      if (old && old.status === 'added') net.set(c.path, { path: c.path, status: 'added' });
      else net.set(c.path, { path: c.path, status: 'renamed', from: old && old.from ? old.from : c.from });
    } else if (c.status === 'deleted') {
      if (before && before.status === 'added') net.delete(c.path);
      else if (before && before.status === 'renamed') {
        net.delete(c.path);
        net.set(before.from, { path: before.from, status: 'deleted' });
      } else net.set(c.path, c);
    } else if (c.status === 'added' && before && before.status === 'deleted') {
      net.set(c.path, { path: c.path, status: 'modified' });
    } else if (!(before && (before.status === 'added' || before.status === 'renamed') && c.status === 'modified')) {
      net.set(c.path, c);
    }
  }
  return [...net.values()];
}

// Prints `<status>\t<path>` once per path the commits of `<base>..<tip>` change, with `renamed\t<new>\t<old>` for a rename, where the
// trace holds no `edit` line of `--slice` naming it, compared root-relative. `--window <dispatch id>` keeps only the edit lines every
// run of that implementer dispatch covers (`trace-window.js`); none means the slice's whole trace. Lines come out sorted by path.
function verbUntraced(cwd, args) {
  const rest = args.slice();
  const take = (flag) => {
    const i = rest.indexOf(flag);
    if (i < 0) return undefined;
    const v = rest[i + 1];
    if (!v || v.startsWith('--')) fail(`untraced: ${flag} needs a value`);
    rest.splice(i, 2);
    return v;
  };
  for (const flag of ['--from', '--until']) if (rest.includes(flag)) fail(`untraced: ${flag} is no flag of untraced; name the window by its dispatch with --window <dispatch id>`);
  const root = take('--root');
  const slice = take('--slice');
  const window = take('--window');
  if (!root) fail('untraced needs --root <run-root>');
  if (!slice) fail('untraced needs --slice <id|scope>');
  if (rest.length !== 1) fail('untraced needs one <base>..<tip> range');
  if (!rest[0].includes('..') || rest[0].includes('...')) fail(`untraced: "${rest[0]}" is no <base>..<tip> range`);
  if (!fs.existsSync(path.join(root, 'ledger.md'))) fail(`untraced: "${root}" holds no ledger.md, so it is no run root`);
  const net = netChanges(rest[0], cwd, 'untraced');

  const { events } = readRunTrace(root);
  const inWindow = window === undefined ? null : windowIndexes(events, window, slice, (m) => fail(`untraced: ${m}`));
  const top = lazyToplevel(cwd);
  const traced = new Set(
    events
      .filter((e, i) => sliceOf(e) === slice && (inWindow === null || inWindow.has(i)))
      .map((e) => editPath(e, top))
      .filter((p) => p !== null),
  );

  const lines = net
    .filter((c) => !traced.has(c.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((c) => [c.status, c.path, ...(c.from ? [c.from] : [])].join('\t'));
  if (lines.length) console.log(lines.join('\n'));
}

module.exports = { verbUntraced, netChanges };
