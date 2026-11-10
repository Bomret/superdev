'use strict';

// test-runs.js: the test runs, reverts, and restores a Bash command holds (ADR 0117), classified against the configured verification commands, and the run-trace lines they produce.

const fs = require('fs');
const path = require('path');
const { cmdSegments, dirTracker, cdDir, cdCall, unwrapBuiltin, segWords, plain, readWord, gitBase, drivePath, gitSubcommand } = require('./bash-command.js');
const { locate, isTestPath, treeState, gitOut } = require('./run-tree.js');
const { verificationCommands } = require('./verification.js');
const { encodeArgs } = require('./trace-log.js');

// Commands that read, list, or edit files and never run them: a test path among their words is no run.
// simplicity: a fixed list; a runner wrapped in a shell function or script is seen only by its own words.
const NOT_RUNNERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'cat', 'sed', 'head', 'tail', 'wc', 'less', 'more', 'ls', 'echo', 'printf',
  'find', 'stat', 'file', 'tree', 'bat', 'awk', 'git', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'tee', 'vim', 'vi', 'nano', 'code', 'open',
  'diff', 'cmp', 'cd', 'chmod', 'ln', 'set', 'true', 'false', ':', 'exit', 'return', 'tr', 'sort', 'cut', 'uniq', 'jq',
  'basename', 'dirname', 'realpath']);
// The shell's own builtins `test` and `[` and its keywords `[[`, `for`, and `select` read nothing they run, and match only as a
// bare command word: a word with a `/` names a file, so `./test spec/a_spec.rb` is a runner script. A `[[`, `for`, or `select`
// is here because the scanner keeps it as a command word (ledger-guard reads a loop's list words), and it runs nothing.
const SHELL_READERS = new Set(['test', '[', '[[', 'for', 'select']);

// Whether `words` begin with the template's words. A `{paths}` word stands for one or more path words (not flags), after
// an optional `--`; a word embedding `{paths}` (`FILES={paths}`) matches one word with a path between its literal ends.
function beginsWith(words, tpl) {
  if (!tpl.length) return true;
  if (tpl[0] !== '{paths}') {
    const at = tpl[0].indexOf('{paths}');
    const [pre, post] = at < 0 ? [] : [tpl[0].slice(0, at), tpl[0].slice(at + 7)];
    const w = words[0] || '';
    const hit = at < 0 ? w === tpl[0] : w.length > pre.length + post.length && w.startsWith(pre) && w.endsWith(post);
    return hit && beginsWith(words.slice(1), tpl.slice(1));
  }
  const from = words[0] === '--' ? 1 : 0;
  for (let n = from + 1; n <= words.length && !words[n - 1].startsWith('-'); n++) if (beginsWith(words.slice(n), tpl.slice(1))) return true;
  return false;
}

// The kind of a verification command a segment runs (full, focused, whole): the segment's command words
// (after env assignments and wrappers) begin with the configured command's words, normalized the same way, so a quoted argument
// never matches and `bun run test:unit` is not `bun run test`. The longest match wins, ties to full over
// focused over whole. A full or whole match whose command words run past the template's (`bun run test --related a.js`) is a narrowed run,
// so it is `focused`, never `full` or `whole` (INV-0129); a redirect or pipe adds no word.
// `seg` is a segment, or the text of one command.
function verificationKind(seg, v) {
  const { cmd, args } = segWords(typeof seg === 'string' ? cmdSegments(seg)[0] || { ws: [] } : seg);
  const words = [cmd, ...args];
  let best = null;
  for (const kind of ['full', 'focused', 'whole']) {
    const c = v[kind];
    if (!c || cmdSegments(c).length !== 1) continue;
    const tpl = segWords(cmdSegments(c)[0]);
    if (!beginsWith(words, [tpl.cmd, ...tpl.args])) continue;
    if (!best || c.length > v[best].length) best = kind;
  }
  if ((best === 'full' || best === 'whole') && words.length > 1 + segWords(cmdSegments(v[best])[0]).args.length) return 'focused';
  return best;
}

// The compound configured command (one holding `&&`, `||`, `;`, or `|`) that the segments from `i` on run, joiner for joiner:
// { kind, n } over `n` segments, or null. The longest match wins, ties to full over focused over whole; a full or whole run
// with a segment past its template's words is narrowed, so `focused` (INV-0129).
function compoundKind(segs, i, v) {
  let best = null;
  for (const kind of ['full', 'focused', 'whole']) {
    const tpls = v[kind] ? cmdSegments(v[kind]) : [];
    const n = tpls.length;
    if (n < 2 || i + n > segs.length || (best && best.n >= n)) continue;
    let narrowed = false;
    const hit = tpls.every((t, j) => {
      const { cmd: tc, args: ta } = segWords(t);
      const { cmd, args } = segWords(segs[i + j]);
      if (j < n - 1 && segs[i + j].sep !== t.sep) return false;
      if (!beginsWith([cmd, ...args], [tc, ...ta])) return false;
      narrowed = narrowed || args.length > ta.length;
      return true;
    });
    if (hit) best = { kind: kind !== 'focused' && narrowed ? 'focused' : kind, n };
  }
  return best;
}

const PASS_THROUGH = new Set(['tail', 'cat']);

// The tree a directory in no run tree classifies against: `outside` where the directory lies in it, else the directory's
// repository top, else the directory itself.
function outsideTree(dir, outside) {
  const rel = path.relative(outside, dir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return outside;
  const top = gitOut(dir, ['rev-parse', '--show-toplevel']);
  return top ? top.trim() : dir;
}

// The test runs of a Bash command: [{ at, kind, files, unknown, sole }]. `at` is the run's tree (from the
// effective directory at the segment: the last `cd` target, else `cwd`). `unknown` marks an exit status that
// does not reflect the test: a `!` negation anywhere in the command line (it may invert any command's status, so every segment reads negated), a pipe after it without `set -o pipefail`, a command after its pipeline, `||` after it, or a `;`/newline-separated
// command after it. `sole` marks a test whose failure is the command's failure: the command line is a plain list of simple
// commands (no compound structure the scanner dropped, no `!`, no function body, the run and the commands before it at the
// top level and not in a substitution or subshell), only `cd`/`set` before the run, nothing after it but a pipe's tail that
// ends the command, no `||` before or after it, no background `&`. Any other shape records `unknown`.
// `outside` names the tree to classify against where a segment's directory is in no run tree (`scope.js test --` refuses a
// non-test command there too): `outside` itself while the directory lies in it, and the `cd` target's repository top (else the
// target itself, resolved once per target) after a `cd` out of it.
// The runs it returns then carry that tree as `at`, with no run root, so a caller records nothing for them.
// A segment's words as one text, for the `set -o pipefail` read.
const segText = (s) => s.ws.join(' ');
// A segment's command word past `command` and `builtin` (`unwrapBuiltin`), for the `cd`/`set` reading below: `builtin cd a` is a `cd`.
const sceneCmd = (s) => { const { cmd, args } = segWords(s); return unwrapBuiltin(cmd, args)[0]; };
// The segments after index `last` that sit no deeper than `seg`: the commands of a substitution inside the segment's own
// command run before its status exists, so they are no later stage of its list.
const laterOf = (segs, last, seg) => segs.slice(last + 1).filter((s) => s.nest <= seg.nest);

// The `run` line's arguments field for a segment: the words after its command word, as the shell reads them (a word the scanner cannot
// read keeps its text), in the `encodeArgs` encoding.
const argsField = (seg) => encodeArgs(segWords(seg).args.map((w) => plain(w) ?? w));
// The same field for the last segment of a command's text, the segment that carries a compound command's test.
const commandArgs = (command) => {
  const segs = cmdSegments(command);
  return segs.length ? argsField(segs[segs.length - 1]) : '-';
};

function testRuns(command, cwd, outside) {
  return testRunsOf(cmdSegments(command), cwd, outside);
}

function testRunsOf(segs, cwd, outside, end) {
  const runs = [];
  const dirs = dirTracker(cwd, end);
  let pipefail = false;
  let spanEnd = -1;
  const outTrees = new Map();
  segs.forEach((first, i) => {
    // simplicity: a function body records nothing and a later call (`f`) is not followed; upgrade by reading the body at the call.
    if (i <= spanEnd || first.fn) return;
    const base = dirs.of(first);
    const { cmd, args, negated } = segWords(first);
    // The last `set -o pipefail` / `set +o pipefail` before the test wins; an option group (`-euo`) counts.
    if (/\bset\s/.test(segText(first))) for (const m of segText(first).matchAll(/([-+])[A-Za-z]*o\s+pipefail\b/g)) pipefail = m[1] === '-';
    let at = locate(path.join(base, 'x'));
    if (!at && outside) {
      if (!outTrees.has(base)) outTrees.set(base, outsideTree(base, outside));
      at = { tree: outTrees.get(base) };
    }
    // A configured command is tried first: a compound one may itself start with `cd` or a NOT_RUNNERS name, and a
    // single-segment one may end in one (`script/test`, INV-0129).
    const v = at ? verificationCommands(at.tree) : {};
    const compound = at ? compoundKind(segs, i, v) : null;
    if (!compound) {
      const cd = cdDir(...cdCall(first.words), base, dirs, first);
      if (cd) { dirs.set(first, cd); return; }
      if ((NOT_RUNNERS.has(path.basename(cmd)) || SHELL_READERS.has(cmd)) && !verificationKind(first, v)) return;
    }
    if (!at) return;
    const tree = at.tree;
    const last = compound ? i + compound.n - 1 : i;
    const seg = segs[last];
    spanEnd = last;
    // A `cd` inside a matched span still moves the base for what follows it.
    for (const s of segs.slice(i, last)) {
      if (s.fn) continue;
      const cd = cdDir(...cdCall(s.words), dirs.of(s), dirs, s);
      if (cd) dirs.set(s, cd);
    }
    const runDir = dirs.of(seg);
    let kind = compound ? compound.kind : verificationKind(seg, v);
    const files = [];
    if (!kind) {
      for (const w of [cmd, ...args]) {
        const p = !w.startsWith('-') && (w !== cmd || w.includes('/')) ? plain(w) : null;
        if (!p) continue;
        // A word counts only when its file part names a file or directory that exists (a note or a loop word names none). A
        // runner node id (`a.py::test_x`, `a.test.js:12`) counts by its file part; a glob word (`*`, `?`, `[`) keeps its reading.
        const file = /[*?[]/.test(p) ? null : p.replace(/::.*$/, '').replace(/:\d+$/, '');
        if (file !== null && !fs.existsSync(path.resolve(runDir, drivePath(file)))) continue;
        let rel = path.relative(tree, path.resolve(runDir, drivePath(p)));
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
        if (/\/$/.test(p)) rel += '/';
        if (isTestPath(tree, rel)) files.push(rel);
      }
      if (files.length) kind = 'path';
    }
    if (!kind) return;
    const stages = laterOf(segs, last, seg);
    const more = stages.length > 0;
    // A pipe's status is the pipeline's last segment, so a test piped into a tail stands only when the pipeline ends the command.
    // Under pipefail a later stage keeps the test's status only as a pass-through (`tail`, `cat`; `head` can SIGPIPE).
    const pipeEnds = seg.sep !== '|' || stages.every((s, j) => PASS_THROUGH.has(path.basename(segWords(s).cmd))
      && (j < stages.length - 1 ? s.sep === '|' : /^(?:|;|\n)$/.test(s.sep)));
    // Inside a compound configured command every joiner reads as it does in a direct run: a `;`, newline, or `||` hides the
    // status, a pipe keeps it only under pipefail into a pass-through stage, and a `!` on a later segment negates it.
    const inner = compound ? segs.slice(i, last + 1) : [];
    // Only a joiner at or after the segment carrying the run hides it; `cd`/`set` segments before it only set the scene, and
    // a `set -o pipefail` in any of them counts.
    const carrier = Math.max(0, inner.findIndex((s) => !/^(?:cd|set)$/.test(sceneCmd(s))));
    for (const s of inner.slice(1, carrier)) {
      if (/\bset\s/.test(segText(s))) for (const m of segText(s).matchAll(/([-+])[A-Za-z]*o\s+pipefail\b/g)) pipefail = m[1] === '-';
    }
    const innerHides = inner.some((s, j) => j >= carrier && j < inner.length - 1 && (/^(?:;|\n|\|\|)$/.test(s.sep)
      || (s.sep === '|' && !(pipefail && PASS_THROUGH.has(path.basename(segWords(inner[j + 1]).cmd))))))
      || inner.slice(1).some((s) => segWords(s).negated);
    // Every segment of a command line with a `!` negation reads negated (`cmdSegments`), so the run's status is unknown.
    const unknown = negated || segs.slice(0, i).some((s) => segWords(s).negated) || innerHides || (seg.sep === '|' && !pipefail) || !pipeEnds || seg.sep === '||' || ((seg.sep === ';' || seg.sep === '\n') && more);
    // Allow-list: pass or fail only for a plain list of simple commands. A line with dropped compound structure, a negation, or a
    // function body, or a run (or a command before it) read out of a substitution or subshell, has a status that is not the test's.
    const plainList = segs.slice(0, last + 1).every((s) => s.nest === 0 && !s.fn && !s.compound && !s.negated);
    const sole = plainList && segs.slice(0, i).every((s) => /^(?:cd|set)$/.test(sceneCmd(s)) &&/^(?:&&|;|\n)$/.test(s.sep))
      && seg.sep !== '&' && (!more || (seg.sep === '|' && pipeEnds));
    runs.push({ at, kind, files, unknown, sole, args: argsField(seg) });
  });
  return runs;
}

// `git restore` / `git checkout <rev> --` events of a Bash command: [{ kind: revert|restore, paths }].
// A source other than HEAD or the index reverts; the same files from HEAD restore.
function restoreEvents(command, cwd) {
  return restoreEventsOf(cmdSegments(command), cwd);
}

function restoreEventsOf(segs, cwd, end) {
  const events = [];
  const dirs = dirTracker(cwd, end);
  for (const seg of segs) {
    if (seg.fn) continue;
    const base = dirs.of(seg);
    const { cmd, args } = segWords(seg);
    const cd = cdDir(...cdCall(seg.words), base, dirs, seg);
    if (cd) { dirs.set(seg, cd); continue; }
    if (cmd !== 'git') continue;
    // git read through gitSubcommand (ADR 0160); a `-C` the hook cannot read leaves the restored paths nowhere it knows (INV-0161).
    const g = gitSubcommand([cmd, ...args]);
    const sub = g && g.subcommand;
    if (sub !== 'restore' && sub !== 'checkout') continue;
    const segBase = gitBase(g, base);
    if (segBase === null) continue;
    const i = g.index - 1;
    const at = locate(path.join(segBase, 'x'));
    if (!at) continue;
    const tree = at.tree;
    const rest = args.slice(i + 1).map((w) => plain(w));
    if (rest.includes(null)) continue;
    const dd = rest.indexOf('--');
    let source = null;
    let paths;
    if (sub === 'restore') {
      const operands = [];
      // `--staged` alone touches only the index, which no file edit reverts.
      const staged = rest.some((w) => w === '--staged' || /^-[A-Za-z]*S[A-Za-z]*$/.test(w));
      const worktree = rest.some((w) => w === '--worktree' || /^-[A-Za-z]*W[A-Za-z]*$/.test(w));
      if (staged && !worktree) continue;
      for (let j = 0; j < rest.length; j++) {
        const w = rest[j];
        if (w === '--') { operands.push(...rest.slice(j + 1)); break; }
        if (/^--source=/.test(w)) source = w.slice(9);
        else if (w === '--source' || w === '-s') source = rest[++j];
        else if (!w.startsWith('-')) operands.push(w);
      }
      paths = operands;
    } else {
      if (dd < 0) continue; // no `--`: a branch switch, not a file checkout
      const revs = rest.slice(0, dd).filter((w) => !w.startsWith('-'));
      source = revs[0] || null;
      paths = rest.slice(dd + 1);
    }
    // A glob path (an unquoted `*`, `?`, or `[` once quotes are gone) names no one file.
    const rels = paths.filter((p) => !/[*?[]/.test(p)).map((p) => {
      const rel = path.relative(tree, path.resolve(segBase, drivePath(p)));
      return rel === '' ? '.' : rel;
    });
    if (!rels.length) continue;
    events.push({ at, kind: source && !/^(?:HEAD|@)$/.test(source) ? 'revert' : 'restore', paths: rels.join(',') });
  }
  return events;
}

// The `scope.js test` calls in a Bash command, wrapped or piped: [{ i, at, words }], `i` the call's segment, `words` the words after
// `test`, and `at` the tree it records
// in, or null outside every run. `scope.js test` records its own run (ADR 0127), so the hook records none for that segment;
// every other segment of the command is recorded as usual.
const NODE_VALUE_OPTS = /^(?:-r|--require|--import|--loader)$/;
// A segment that runs `scope.js` under node: { args, j }, `j` the script word's index in node's args, or null.
function scopeCall(seg) {
  const { cmd, args } = segWords(seg);
  if (path.basename(cmd) !== 'node') return null;
  // The script is node's first word that is no option or option value; `-e`/`-p` run inline code and name no script.
  let j = 0;
  for (; j < args.length; j++) {
    if (/^(?:-e|-p|--eval|--print)$/.test(args[j])) return null;
    if (NODE_VALUE_OPTS.test(args[j])) j++;
    else if (!args[j].startsWith('-')) break;
  }
  // The script word may be quoted and may lead with a variable (`"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"`): only its basename matters.
  if (j >= args.length || !/(?:^|\/)scope\.js$/.test(readWord(args[j]).value || args[j])) return null;
  return { args, j };
}

function scopeTestCalls(segs, cwd, end) {
  const calls = [];
  const dirs = dirTracker(cwd, end);
  segs.forEach((seg, i) => {
    if (seg.fn) return;
    const base = dirs.of(seg);
    const cd = cdDir(...cdCall(seg.words), base, dirs, seg);
    if (cd) { dirs.set(seg, cd); return; }
    const call = scopeCall(seg);
    if (!call || call.args[call.j + 1] !== 'test') return;
    const { args, j } = call;
    // `test -- <command>` records in the tree of the run `testRuns` classifies, as the verb does (a `cd` in the command moves it).
    const free = args[j + 2] === '--' ? args.slice(j + 3) : [];
    const run = free.length ? testRuns(free.length === 1 ? plain(free[0]) || free[0] : free.join(' '), base)[0] : null;
    calls.push({ i, at: (run && run.at) || locate(path.join(base, 'x')) || null, words: args.slice(j + 2) });
  });
  return calls;
}

// A `run_in_background` call returns before the test has run, so its success names no outcome. Returns the trace lines the command
// produces as [runRoot, entry] pairs, written by the caller once every scanner call of the event has returned (INV-0159).
function recordBash(command, cwd, agent, failed, background, end) {
  const lines = [];
  // A `scope.js fail-to-pass` call writes its own control run line (ADR 0182): its segment records nothing here.
  let segs = cmdSegments(command).map((s) => {
    const call = !s.fn && scopeCall(s);
    return call && call.args[call.j + 1] === 'fail-to-pass' ? { ...s, ws: [':'], words: [], negated: false } : s;
  });
  if (/\bscope\.js["']?\s+test\b/.test(command)) {
    const calls = scopeTestCalls(segs, cwd, end).filter((c) => c.at);
    if (calls.length) {
      // The calls leave the command (`:` stands in), so the segments around them record as a direct run does.
      const skip = new Set(calls.map((c) => c.i));
      segs = segs.map((s, i) => (skip.has(i) ? { ...s, ws: [':'], words: [], negated: false } : s));
    }
  }
  for (const r of testRunsOf(segs, cwd, undefined, end)) {
    const [sha, clean] = treeState(r.at.tree);
    // The exit status names the test only where the command line is a plain list and the test is its sole command; any other shape reads unknown.
    const outcome = r.unknown || !r.sole || background ? 'unknown' : failed ? 'fail' : 'pass';
    lines.push([r.at.runRoot, { slice: r.at.slice, agent, kind: 'run', fields: [r.kind, outcome, sha, clean, r.files.join(','), '-', r.args] }]);
  }
  // A failed command did not (reliably) move files: only a successful one records a revert or restore.
  if (!failed) {
    for (const e of restoreEventsOf(segs, cwd, end)) lines.push([e.at.runRoot, { slice: e.at.slice, agent, kind: e.kind, fields: [e.paths] }]);
  }
  return lines;
}

module.exports = { testRuns, verificationKind, recordBash, scopeTestCalls, commandArgs };
