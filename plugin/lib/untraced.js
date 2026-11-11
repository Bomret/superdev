'use strict';

// untraced.js: the `untraced` verb, the paths a window's commits change that no `edit` line of the window names (ADR 0225).

const fs = require('fs');
const path = require('path');
const { readTrace, untraceField } = require('./trace-log.js');
const { gitSpawn } = require('./git-spawn.js');
const { fail } = require('./refusal.js');

const STATUS = { A: 'added', M: 'modified', T: 'modified', D: 'deleted', R: 'renamed', C: 'added' };
const slash = (p) => p.replace(/\\/g, '/');

// The first-parent, non-merge commits of `range`, oldest first, as { path, status, from? } changes in commit order. A merge commit
// carries the base's changes into the branch, so it is no write of the window; diff-tree reads each commit against its first parent.
function changesOf(range, cwd) {
  const revs = gitSpawn(['rev-list', '--first-parent', '--no-merges', '--reverse', range], cwd, { maxBuffer: 1 << 30 });
  if (revs.status !== 0) fail(`untraced: git cannot read the range "${range}"`);
  const changes = [];
  for (const sha of revs.stdout.split('\n').filter(Boolean)) {
    const tree = gitSpawn(['diff-tree', '-r', '-z', '--name-status', '-M', '--no-commit-id', sha], cwd, { maxBuffer: 1 << 30 });
    if (tree.status !== 0) fail(`untraced: git cannot read commit ${sha}`);
    const f = tree.stdout.split('\0');
    for (let i = 0; i + 1 < f.length; ) {
      const status = STATUS[f[i][0]];
      if (f[i][0] === 'R' || f[i][0] === 'C') {
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

// Prints `<status>\t<path>` once per path the commits of `<base>..<tip>` change, with `renamed\t<new>\t<old>` for a rename, where the
// trace holds no `edit` line of `--slice` whose time lies in [`--from`, `--until`) and whose path equals it. The window flags take
// the ISO times of the trace's own lines; none means the slice's whole trace. Lines come out sorted by path.
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
  const root = take('--root');
  const slice = take('--slice');
  const from = take('--from');
  const until = take('--until');
  if (!root) fail('untraced needs --root <run-root>');
  if (!slice) fail('untraced needs --slice <id|scope>');
  if (rest.length !== 1) fail('untraced needs one <base>..<tip> range');
  const changes = changesOf(rest[0], cwd);

  let raw = '';
  try { raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const traced = new Set(
    readTrace(raw)
      .filter((e) => e.kind === 'edit' && e.slice === slice && e.fields[1] !== undefined && (!from || e.ts >= from) && (!until || e.ts < until))
      .map((e) => slash(path.posix.normalize(slash(untraceField(e.fields[1]))))),
  );

  // One entry per path, in commit order: a path added and then modified stays added, a renamed one stays renamed, and any
  // other later change replaces the earlier status.
  const net = new Map();
  for (const c of changes) {
    const before = net.get(c.path);
    if (before && c.status === 'modified' && (before.status === 'added' || before.status === 'renamed')) continue;
    net.set(c.path, c);
  }
  const lines = [...net.values()]
    .filter((c) => !traced.has(c.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((c) => [c.status, c.path, ...(c.from ? [c.from] : [])].join('\t'));
  if (lines.length) console.log(lines.join('\n'));
}

module.exports = { verbUntraced };
