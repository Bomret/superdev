#!/usr/bin/env node
'use strict';

// run-trace: deterministic PostToolUse hook that records every file edit of a superdev run into the
// run trace (ADR 0117), attributed to its run and slice and classified as test or implementation.
// Events: Edit/Write/NotebookEdit, and a Bash command writing a file through a redirect, `tee`,
// `sed -i`, `cp`/`mv`/`install`, `git mv`, or `git apply`; and a Bash command that runs tests (with
// outcome, commit, and tree state, on PostToolUse and PostToolUseFailure) or reverts or restores files.
// And every subagent dispatch and its end with an outcome (ADR 0140): PreToolUse on Agent, then PostToolUse, PostToolUseFailure,
// or PermissionDenied on Agent, SubagentStop, PostToolUse on TaskStop, or the main session's Stop, UserPromptSubmit, or SessionEnd.
// PreToolUse on SendMessage reopens an ended dispatch (`dispatch-resume`), and the resumed run ends again the same ways.
// PreToolUse on Bash only stashes the directory the command starts in, which its PostToolUse resolves the command from (ADR 0159).
// Any error exits 0 silently; the hook never blocks.
// simplicity: a write behind `bash -c` or a variable is not seen (a write inside `$( … )`, backticks, or a heredoc body a known
// shell reads on stdin, such as `bash <<E`, is); a guardrail-grade
// parse of the model's normal output, like ledger-guard's. Known limits within grade: `sudo -u root cp`
// breaks command skip (flag after sudo); `git mv a dir/` with dir absent records dir (fs.statSync only
// checks target existence, not trailing-slash intent). Edge cases; upgrade if they appear in real runs.
// The writers ledger-guard alone reads (a vi/vim script, `curl -o`, `wget -O`, `ditto`, `xxd`, `tar -x`, an interpreter's script, a
// here-string or echo text a shell reads) record no edit here.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// scope.js owns the trace writer and the ledger row reader (ADR 0022, ADR 0117). The same fail-silent
// require as scope-prune: no reader, no recording.
let appendTrace = null;
let untraceField = null;
let inProgressSlices = null;
let readTrace = null;
let sliceType = null;
let verificationCommands = null;
let SLUG_RE = null;
let mainWorkTree = null;
let testPathOf = null;
try {
  ({ appendTrace, untraceField, inProgressSlices, readTrace, sliceType, verificationCommands, SLUG_RE, mainWorkTree, isTestPath: testPathOf } = require('../scripts/scope.js'));
} catch {
  // left null: main() records nothing
}
// The shared shell scanner (ADR 0135). The same fail-silent require: no scanner, no recording.
let scan = null;
let WRAPPER = null;
let optionWords = null;
let drivePath = null;
try {
  ({ scan, WRAPPER, optionWords, drivePath } = require('./shell-words.js'));
} catch {
  // left null: record() records nothing
}

// A shell word as text, or null where it holds a variable, substitution, or glob (a named limit).
function unquote(word) {
  if (/[$`*?]/.test(word.replace(/'[^']*'/g, '').replace(/\\./g, ''))) return null;
  return word.replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"|\\(.)/g, (_, a, b, c) => (a !== undefined ? a : b !== undefined ? b.replace(/\\(.)/g, '$1') : c));
}

// The scanned commands in the order bash runs them (`at`, stable sort), marked for how they move the directory (`cdDir`).
// `calls` marks a call of a function that moves the directory: a command outside every function body whose command word, past
// env assignments and unquoted (`"f"` and `\f` call `f`), names a function the line defines, after a `cd`, `pushd`, or `popd` in a
// function body, also behind `command` or `builtin` (`unwrapBuiltin`). A function body runs in the shell that calls it, so its `cd` moves that shell.
// simplicity: a call of any defined function counts once any function body holds a `cd`, since the scanner names no body's
// function; a call that moves nothing then only resolves as an unreadable `cd` does. Upgrade by naming each body's function.
function markMoves(scanned) {
  const cmds = [...scanned.commands].sort((a, b) => a.at - b.at);
  let moves = false;
  for (const c of cmds) {
    const ws = c.words.map((w) => w.raw);
    const at = ws.findIndex((w) => !/^[A-Za-z_]\w*=/.test(w));
    const word = at < 0 ? undefined : ws[at];
    if (c.fn) moves = moves || /^(?:cd|pushd|popd)$/.test(at < 0 ? '' : unwrapBuiltin(word, ws.slice(at + 1))[0]);
    else c.calls = moves && word !== undefined && scanned.fns.has(unquote(word));
  }
  return cmds;
}

// The raw words of a command's simple commands, one segment each, read through the shared scanner (ADR 0135):
// [{ ws, sep, nest, group, inst, negated, fn, calls, compound }], in the order bash runs them (a backtick body's commands first, by `at`;
// `inst` the scanner's shell instance, `calls` from `markMoves`). `compound` is true for every segment when the line holds compound structure the
// scanner drops. A function header with a bare compound body (`fnBare`) leaves no segments. `negated` is true for every segment when the command line holds an unquoted `!` negation
// anywhere. `fn` marks a command inside a function body: it stays a segment (it still ends the commands before it) but records
// no run, restore, or `scope.js test` call, since a definition runs nothing. `ws` holds the words after redirects (a process substitution is no word), `sep` the
// operator that follows the segment (`|&` reads as `|`). A command the scanner cannot read to its end has no segments, so
// it records nothing. A command read out of a quoted word is no segment: quoted text is data.
function cmdSegments(command) {
  let scanned;
  try { scanned = scan(command); } catch { return []; }
  // A function header with a bare compound body: the definition runs nothing, and the body's commands are unmarked, so none records.
  if (!scanned.readable || scanned.fnBare) return [];
  // The scanner lists a backtick group's commands after the whole text; `at` (stable sort) puts them back in the order bash runs them.
  return markMoves(scanned).filter((c) => c.level === 0).map((c) => ({
    ws: c.words.map((w) => w.raw).filter((w) => !/^[<>]\(/.test(w)),
    sep: c.sep === '|&' ? '|' : c.sep,
    nest: c.nest,
    group: c.group,
    inst: c.inst,
    // A `!` anywhere in the command line may negate any command of it, so it marks every segment (INV-0017).
    negated: c.negated || scanned.negation === true,
    fn: c.fn === true,
    calls: c.calls === true,
    // Compound structure the scanner dropped (`case`, `if`, `{ }`, `( )`, `[[`, a function header) anywhere in the line.
    compound: scanned.compound === true,
  }));
}

// The directory each segment runs in. A `cd` re-bases its own shell instance (`inst`, the scanner's chain: a subshell, a
// substitution, a pipeline stage, an `&` job, a coprocess) and the segments after it in that instance; the segments outside it keep their
// directory. An instance starts in the directory of the one around it, read when its first segment runs; null is the outer shell.
// `end` is the directory the outer shell ended in: a `cd` the hook cannot read moves there. In the outer shell it also sets
// `lost`, after which a relative `cd` of the outer shell moves to `end` too (`cdDir`). A move in a nested instance or a function
// body leaves `lost` alone, since `end` holds none of them; an outer call of a function whose body holds a `cd` sets it, since the
// body runs in the outer shell.
function dirTracker(cwd, end = cwd) {
  const dirs = new Map();
  let outer = cwd;
  return {
    end,
    lost: false,
    // Each instance is set once when first met, so the walks of all segments cost time linear in the instances.
    of({ inst }) {
      const fresh = [];
      let n = inst;
      for (; n && !dirs.has(n.id); n = n.up) fresh.push(n);
      const dir = n ? dirs.get(n.id) : outer;
      for (const f of fresh) dirs.set(f.id, dir);
      return dir;
    },
    set({ inst }, dir) {
      if (inst) dirs.set(inst.id, dir);
      else outer = dir;
    },
  };
}

// The command `command` and `builtin` run, as [cmd, args]: `command cd a` and `builtin cd a` run `cd a`, past `command -p` and a
// `--`. `command -v` and `-V` look the name up and run nothing, so they give an empty command. Any other command gives itself.
function unwrapBuiltin(cmd, args) {
  while (cmd === 'command' || cmd === 'builtin') {
    let i = 0;
    for (; cmd === 'command' && /^-[pvV]+$/.test(args[i] || ''); i++) if (/[vV]/.test(args[i])) return ['', []];
    if (args[i] === '--') i++;
    cmd = args[i] || '';
    args = args.slice(i + 1);
  }
  return [cmd, args];
}

// The directory a `cd`, `pushd`, or `popd` in segment `seg` moves to, also behind `command` or `builtin` (`unwrapBuiltin`): a literal target resolves against `base`. A target the
// hook cannot read (a variable, `~`, `-`, none, or a stack move) gives `dirs.end`, the directory the command ended in (ADR 0159).
// In the outer shell (no `inst`, outside a function body) it also marks the tracker lost: every later relative move of the outer
// shell then gives `dirs.end` too, since the end already holds that move. A nested instance (a subshell, a substitution, a
// pipeline stage, an `&` job, a coprocess) resolves its relative moves against its own base, `dirs.end` included, because the end holds none
// of its moves. An absolute target resolves to itself. A call of a function whose body holds a `cd` (`seg.calls`, `markMoves`)
// moves as an unreadable `cd` does. Null for any other command. `pushd -n` and `popd -n` move no directory: they give `base`.
function cdDir(cmd, args, base, dirs, seg) {
  const outer = !seg.inst && !seg.fn;
  if (seg.calls) {
    dirs.lost = dirs.lost || outer;
    return dirs.end;
  }
  [cmd, args] = unwrapBuiltin(cmd, args);
  if (cmd !== 'cd' && cmd !== 'pushd' && cmd !== 'popd') return null;
  let i = 0;
  let stay = false;
  for (; /^-[LPe@]+$/.test(args[i] || '') || (cmd !== 'cd' && args[i] === '-n'); i++) stay = stay || args[i] === '-n';
  if (stay) return base;
  if (args[i] === '--') i++;
  const d = cmd === 'popd' || !args[i] ? null : unquote(args[i]);
  if (!d || d === '-' || d.startsWith('~') || /^[+-]\d+$/.test(d)) dirs.lost = dirs.lost || outer;
  else if (path.isAbsolute(drivePath(d)) || !(outer && dirs.lost)) return path.resolve(base, drivePath(d));
  return dirs.end;
}

// The files a Bash command writes, as absolute paths resolved against the `cd`/`git -C` target, else cwd. The shared scanner
// reads the command (ADR 0135): quoted text stays data, and a command it cannot read to its end records nothing.
function bashTargets(command, cwd, end) {
  const targets = [];
  const add = (base, word) => {
    const w = word === null ? null : unquote(word);
    if (w && !w.startsWith('&') && !w.startsWith('/dev/') && !w.startsWith('~')) targets.push(path.resolve(base, drivePath(w)));
  };
  let scanned;
  try { scanned = scan(command); } catch { return []; }
  if (!scanned.readable) return [];
  // A `cd` inside a subshell, a substitution, a pipeline stage, an `&` job, or a coprocess moves nothing outside that instance.
  const dirs = dirTracker(cwd, end);
  // The scanner lists a backtick group's commands after the whole text; `at` puts them back in the order bash runs them.
  for (const cmdLine of markMoves(scanned)) {
    // simplicity: a function body's writes record at its definition, whether or not a call follows (`f() { echo x > out; }; f`
    // records `out`); a `cd` in the body moves nothing at the definition, and a call moves as an unreadable `cd` does (`cdDir`).
    // Upgrade by reading the body at the call.
    const { words, redirects } = cmdLine;
    // A process substitution (`>(cmd)`, `<(cmd)`) is a word of the scanner, and no operand.
    const ws = words.map((w) => w.raw).filter((w) => !/^[<>]\(/.test(w));
    const base = dirs.of(cmdLine);
    let segBase = base;
    // `git -C <dir>` among git's own leading options re-bases its own command; `cd <dir>` re-bases the commands after it.
    if (ws[0] === 'git') {
      for (let i = 1; i < ws.length && ws[i].startsWith('-'); i += /^(?:-C|-c|--git-dir|--work-tree)$/.test(ws[i]) ? 2 : 1) {
        const d = ws[i] === '-C' && ws[i + 1] ? unquote(ws[i + 1]) : null;
        if (d) segBase = path.resolve(base, drivePath(d));
      }
    }
    const cd = cdDir(ws[0], ws.slice(1), base, dirs, cmdLine);
    if (cd && !cmdLine.fn) dirs.set(cmdLine, cd);
    // A file write is `>`, `>>`, `>|`, `<>`, `&>`, `&>>`, or `>&` onto a file; `>&2` and `>&-` duplicate a descriptor.
    // The redirects of a `cd` or a call still write, against the directory before it: bash opens them before the command runs.
    for (const { op, target } of redirects) {
      if (!/^(?:>>?|>\||<>|&>>?|>&)$/.test(op)) continue;
      if (op === '>&' && /^(?:\d+|-)$/.test(target.raw)) continue;
      add(segBase, target.raw);
    }
    if (cd && !cmdLine.calls) continue;
    // The command word is the first word after leading env assignments and `sudo`/`command`/`env`/`time`.
    let cmdAt = 0;
    while (cmdAt < ws.length && (/^[A-Za-z_]\w*=/.test(ws[cmdAt]) || /^(?:sudo|command|env|time)$/.test(ws[cmdAt]))) cmdAt++;
    let cmd = ws[cmdAt];
    if (!/^(?:tee|sed|cp|mv|install|git)$/.test(cmd || '')) continue;
    let args = ws.slice(cmdAt + 1);
    // `git mv` is `mv` on the words after it. Skip git global options (-C, -c, etc.) to find the subcommand.
    if (cmd === 'git') {
      let subcmdAt = 0;
      while (subcmdAt < args.length && args[subcmdAt].startsWith('-')) {
        // Options like -C, -c, --git-dir, --work-tree take an argument; skip the next word.
        if (/^(?:-C|-c|--(?:git-dir|work-tree))(?:=|$)/.test(args[subcmdAt])) {
          if (!args[subcmdAt].includes('=')) subcmdAt += 2;
          else subcmdAt += 1;
        } else subcmdAt += 1;
      }
      if (args[subcmdAt] === 'mv') { cmd = 'mv'; args = args.slice(subcmdAt + 1); }
    }
    // Operands are the non-flag words; `-t DIR` / `--target-directory=DIR` is split out for cp/mv/install,
    // and sed's script words (`-e`/`-f` values) are dropped from its operands.
    const operands = [];
    let inPlace = false, hasScript = false, tDir = null;
    for (let i = 0; i < args.length; i++) {
      const w = args[i];
      if (cmd === 'sed' && /^-[ef]$/.test(w)) { hasScript = true; i++; }
      else if (cmd === 'sed' && /^--(?:expression|file)=/.test(w)) hasScript = true;
      else if (cmd === 'sed' && /^(?:-i|--in-place)/.test(w)) {
        inPlace = true;
        if (w === '-i' && /^(?:''|"")$/.test(args[i + 1])) i++;
      } else if (cmd !== 'tee' && w === '-t' && args[i + 1]) tDir = args[++i];
      else if (cmd !== 'tee' && /^--target-directory=/.test(w)) tDir = w.slice(w.indexOf('=') + 1);
      else if (!/^-/.test(w)) operands.push(w);
    }
    if (cmd === 'tee') operands.forEach((w) => add(segBase, w));
    else if (cmd === 'sed' && inPlace) (hasScript ? operands : operands.slice(1)).forEach((w) => add(segBase, w));
    else if (cmd === 'cp' || cmd === 'mv' || cmd === 'install') {
      const destWord = tDir !== null ? tDir : operands[operands.length - 1];
      const dest = destWord && unquote(destWord);
      if (!dest) continue;
      const srcs = tDir !== null ? operands : operands.slice(0, -1);
      const destAbs = path.resolve(segBase, drivePath(dest));
      let isDir = tDir !== null;
      try { isDir = fs.statSync(destAbs).isDirectory(); } catch { /* absent: a plain file target */ }
      if (isDir) {
        for (const src of srcs) {
          const s = unquote(src);
          if (s) targets.push(path.join(destAbs, path.basename(s)));
        }
      } else targets.push(destAbs);
    } else if (cmd === 'git' && args.includes('apply')) {
      // The patch names its targets: `+++ b/<path>` lines, from the patch file or an inline heredoc.
      let text = command;
      for (const w of operands.slice(operands.indexOf('apply') + 1)) {
        const f = unquote(w);
        try { if (f) text += '\n' + fs.readFileSync(path.resolve(segBase, drivePath(f)), 'utf8'); } catch { /* unreadable patch: heredoc text only */ }
      }
      for (const pm of text.matchAll(/^\+\+\+ b\/(\S+)/gm)) targets.push(path.resolve(segBase, pm[1]));
    }
  }
  return [...new Set(targets)];
}

// The test-path classifier lives in scope.js (ADR 0128), which also reads it from a commit; the hook
// reads its tree's own file. No file reads as no section: the defaults apply.
function isTestPath(tree, rel) {
  let text = '';
  try { text = fs.readFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), 'utf8'); } catch {}
  return testPathOf(text, rel);
}

// Where an absolute path lands: { runRoot, tree, rel, slice } under a run root's slicetree or
// scopetree, else null. A run root is a `.superdev/scopes/<slug>` directory holding a readable ledger.
function locate(abs) {
  const m = /^(.*?\/\.superdev\/scopes\/[^/]+)\/(?:slicetrees\/([^/]+)|(scopetree))\/(.+)$/.exec(abs.replace(/\\/g, '/'));
  if (!m) return null;
  const [, runRoot, id, scopetree, rel] = m;
  let ledger;
  try { ledger = fs.readFileSync(path.join(runRoot, 'ledger.md'), 'utf8'); } catch { return null; }
  let slice = id;
  let tree = path.join(runRoot, 'slicetrees', id || '');
  if (scopetree) {
    const open = inProgressSlices(ledger);
    slice = open.length === 1 ? open[0] : 'scope';
    tree = path.join(runRoot, 'scopetree');
  }
  return { runRoot, tree, rel, slice };
}

// ---- test runs, reverts, restores (ADR 0117) ----

// Commands that read, list, or edit files and never run them: a test path among their words is no run.
// simplicity: a fixed list; a runner wrapped in a shell function or script is seen only by its own words.
const NOT_RUNNERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'cat', 'sed', 'head', 'tail', 'wc', 'less', 'more', 'ls', 'echo', 'printf',
  'find', 'stat', 'file', 'tree', 'bat', 'awk', 'git', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'tee', 'vim', 'vi', 'nano', 'code', 'open',
  'diff', 'cmp', 'cd', 'chmod', 'ln', 'set', 'true', 'false', ':', 'exit', 'return', 'tr', 'sort', 'cut', 'uniq', 'jq',
  'basename', 'dirname', 'realpath']);
// The shell's own builtins `test` and `[` and its keywords `[[`, `for`, and `select` read nothing they run, and match only as a
// bare command word: a word with a `/` names a file, so `./test tests/a.test.js` is a runner script. A `[[`, `for`, or `select`
// is here because the scanner keeps it as a command word (ledger-guard reads a loop's list words), and it runs nothing.
const SHELL_READERS = new Set(['test', '[', '[[', 'for', 'select']);
// The wrappers a test run sits behind (`timeout` and `env` have their own option parsing below). shell-words.js's WRAPPER table,
// which ledger-guard.js skips, is wider: it adds `xargs`, `doas`, `stdbuf`, `builtin`, `eval`, `arch`, `caffeinate`, `flock`,
// `chronic`, `unbuffer`, `ionice`, and `taskset`, behind which no run is recorded.
// `rtk` is RTK's output filter: its PreToolUse hook rewrites `bun run test` to `rtk bun run test`, PostToolUse sees the rewritten
// command, and `rtk` passes the exit status through (docs/known-issues.md). segWords also skips rtk's `proxy` subcommand; its other
// subcommands that run a command (`err`, `run`, `summary`, `test`) read as the command, so they record no configured-command run
// (a named test file still records a `path` run; triage #941).
const WRAPPERS = /^(?:sudo|command|env|time|exec|nohup|nice|rtk)$/;
// A wrapper's leading option words are skipped, with the value of the options that take one, as shell-words.js's WRAPPER table and
// optionWords read them. `command` skips only `-p` and a `--` (segWords): its options `-v` and `-V`, alone or in a cluster such as
// `-pv`, look a command up, so segWords gives an empty command and no run follows.
const SKIPS_OPTIONS = (w) => w !== 'command' && WRAPPERS.test(w);

// The bound on each `git` call a run line needs; a call past it records `unknown` for its field (INV-0009).
const GIT_BOUND_MS = Number(process.env.RUN_TRACE_GIT_BOUND_MS) || 1500;

function gitOut(tree, args) {
  const r = spawnSync('git', args, { cwd: tree, encoding: 'utf8', timeout: GIT_BOUND_MS, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.error || r.signal || r.status !== 0 ? null : r.stdout;
}

const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;

// The command word and arguments of a segment after env assignments and wrappers (`timeout [opts] <duration> [--]` and
// `env [opts] [--]` included): { cmd, args, negated }. `negated` marks a segment of a command line that holds a `!` negation, which may invert the exit status.
function segWords({ ws, negated: neg }) {
  let i = 0;
  let negated = neg === true;
  for (; i < ws.length; i++) {
    const w = ws[i];
    if (w === 'env') {
      while (/^-/.test(ws[i + 1] || '')) {
        i++;
        if (/^(?:-u|--unset)$/.test(ws[i])) i++;
        else if (ws[i] === '--') break;
      }
      continue;
    }
    // Ahead of the option skip below, whose `continue` would skip it: the table's `rtk` entry then skips only the options
    // after `proxy`.
    if (w === 'rtk') {
      while (/^-/.test(ws[i + 1] || '')) i++;
      if (ws[i + 1] === 'proxy') i++;
    }
    if (w === 'command') {
      while (/^-[pvV]+$/.test(ws[i + 1] || '')) if (/[vV]/.test(ws[++i])) return { cmd: '', args: [], negated };
      if (ws[i + 1] === '--') i++;
      continue;
    }
    if (SKIPS_OPTIONS(w)) {
      const opts = WRAPPER.get(w);
      while (/^-/.test(ws[i + 1] || '')) {
        i++;
        if (ws[i] === '--') break;
        i += optionWords(ws[i], opts) - 1;
      }
      continue;
    }
    if (w === '' || /^[A-Za-z_]\w*=/.test(w) || WRAPPERS.test(w)) continue;
    if (w !== 'timeout') break;
    while (/^-/.test(ws[i + 1] || '')) {
      i++;
      if (/^(?:-[ks]|--(?:kill-after|signal))$/.test(ws[i])) i++;
    }
    if (DURATION.test(ws[i + 1] || '')) i++;
    if (ws[i + 1] === '--') i++;
  }
  return { cmd: ws[i] || '', args: ws.slice(i + 1), negated };
}

const plain = (w) => (/[$`]/.test(w) ? null : w.replace(/^(['"])(.*)\1$/, '$2'));

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
      const cd = cdDir(cmd, args, base, dirs, first);
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
      const w = segWords(s);
      const cd = cdDir(w.cmd, w.args, dirs.of(s), dirs, s);
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
    runs.push({ at, kind, files, unknown, sole });
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
    const cd = cdDir(cmd, args, base, dirs, seg);
    if (cd) { dirs.set(seg, cd); continue; }
    if (cmd !== 'git') continue;
    let i = 0;
    let segBase = base;
    while (i < args.length && args[i].startsWith('-')) {
      if (args[i] === '-C' && plain(args[i + 1] || '')) segBase = path.resolve(base, drivePath(plain(args[i + 1])));
      i += /^(?:-C|-c|--git-dir|--work-tree)$/.test(args[i]) ? 2 : 1;
    }
    const sub = args[i];
    if (sub !== 'restore' && sub !== 'checkout') continue;
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

// The `<sha> <clean|dirty|unknown>` of a tree, each under a time bound.
function treeState(tree) {
  const sha = (gitOut(tree, ['rev-parse', 'HEAD']) || '').trim();
  const st = gitOut(tree, ['--no-optional-locks', 'status', '--porcelain']);
  return [/^[0-9a-f]{40,64}$/.test(sha) ? sha : 'unknown', st === null ? 'unknown' : st.trim() ? 'dirty' : 'clean'];
}

// The Missing RED note (ADR 0117): after an implementation edit or a passing run of a `behavior` slice, a
// note when its latest test edit has no failing run since and no note yet. The trace is the only state.
// Returns the note text, or null. An implementation edit before the first test edit gets none (ADR 0030).
// simplicity: the trace read and the note append take no lock, so two parallel tool calls can both send the
// note; upgrade: an exclusive-create lock file around the read and append, if a duplicate note bites.
function missingRedNote({ runRoot, tree, slice }, agent) {
  if (slice === 'scope') return null;
  const v = verificationCommands(tree);
  if (!v.full && !v.focused && !v.whole) return null;
  let ledger;
  let events;
  try {
    ledger = fs.readFileSync(path.join(runRoot, 'ledger.md'), 'utf8');
    events = readTrace(fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8'));
  } catch { return null; }
  if (sliceType(ledger, slice) !== 'behavior') return null;
  const mine = events.filter((e) => e.slice === slice);
  const at = mine.map((e) => e.kind === 'edit' && e.fields[0] === 'test').lastIndexOf(true);
  if (at < 0) return null;
  const since = mine.slice(at + 1);
  if (since.some((e) => (e.kind === 'run' && e.fields[1] === 'fail') || e.kind === 'note')) return null;
  const file = untraceField(mine[at].fields[1]);
  appendTrace(runRoot, { slice, agent, kind: 'note', fields: [file] });
  return `Missing RED: ${file} was edited, and no failing test run has followed it. Run the test and watch it fail before the implementation goes on.`;
}

// The `scope.js test` calls in a Bash command, wrapped or piped: [{ i, at }], `i` the call's segment and `at` the tree it records
// in, or null outside every run. `scope.js test` records its own run (ADR 0127), so the hook records none for that segment and
// lets only the Missing RED note follow; every other segment of the command is recorded as usual.
const NODE_VALUE_OPTS = /^(?:-r|--require|--import|--loader)$/;
function scopeTestCalls(segs, cwd, end) {
  const calls = [];
  const dirs = dirTracker(cwd, end);
  segs.forEach((seg, i) => {
    if (seg.fn) return;
    const base = dirs.of(seg);
    const { cmd, args } = segWords(seg);
    const cd = cdDir(cmd, args, base, dirs, seg);
    if (cd) { dirs.set(seg, cd); return; }
    // The script word may be quoted and may lead with a variable (`"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"`): only its basename matters.
    if (path.basename(cmd) !== 'node') return;
    // The script is node's first word that is no option or option value; `-e`/`-p` run inline code and name no script.
    let j = 0;
    for (; j < args.length; j++) {
      if (/^(?:-e|-p|--eval|--print)$/.test(args[j])) return;
      if (NODE_VALUE_OPTS.test(args[j])) j++;
      else if (!args[j].startsWith('-')) break;
    }
    if (j >= args.length || !/(?:^|\/)scope\.js$/.test(args[j].replace(/^(['"])(.*)\1$/, '$2')) || args[j + 1] !== 'test') return;
    // `test -- <command>` records in the tree of the run `testRuns` classifies, as the verb does (a `cd` in the command moves it).
    const free = args[j + 2] === '--' ? args.slice(j + 3) : [];
    const run = free.length ? testRuns(free.length === 1 ? plain(free[0]) || free[0] : free.join(' '), base)[0] : null;
    calls.push({ i, at: (run && run.at) || locate(path.join(base, 'x')) || null });
  });
  return calls;
}

// A `run_in_background` call returns before the test has run, so its success names no outcome.
function recordBash(command, cwd, agent, failed, triggers, background, end) {
  let segs = cmdSegments(command);
  if (/\bscope\.js["']?\s+test\b/.test(command)) {
    const calls = scopeTestCalls(segs, cwd, end).filter((c) => c.at);
    if (calls.length) {
      if (!failed && !background) for (const c of calls) triggers.push(c.at);
      // The calls leave the command (`:` stands in), so the segments around them record as a direct run does.
      const skip = new Set(calls.map((c) => c.i));
      segs = segs.map((s, i) => (skip.has(i) ? { ...s, ws: [':'], negated: false } : s));
    }
  }
  for (const r of testRunsOf(segs, cwd, undefined, end)) {
    const [sha, clean] = treeState(r.at.tree);
    // The exit status names the test only where the command line is a plain list and the test is its sole command; any other shape reads unknown.
    const outcome = r.unknown || !r.sole || background ? 'unknown' : failed ? 'fail' : 'pass';
    appendTrace(r.at.runRoot, { slice: r.at.slice, agent, kind: 'run', fields: [r.kind, outcome, sha, clean, r.files.join(',')] });
    if (outcome === 'pass') triggers.push(r.at);
  }
  // A failed command did not (reliably) move files: only a successful one records a revert or restore.
  if (!failed) {
    for (const e of restoreEventsOf(segs, cwd, end)) appendTrace(e.at.runRoot, { slice: e.at.slice, agent, kind: e.kind, fields: [e.paths] });
  }
}

// ---- subagent dispatches (ADR 0117, ADR 0127) ----
// PreToolUse on Agent: the one run root named in the prompt (counted only with a readable ledger) and the one slice id
// named under it (`slicetrees/<id>` or `reports/<id>/`), else `scope`. No run root or two records nothing. The dispatch
// is keyed by the call's `tool_use_id`: the platform sends SubagentStart no prompt, and a dispatch has no agent id yet.
function recordDispatch(input) {
  const ti = input.tool_input || {};
  const prompt = typeof ti.prompt === 'string' ? ti.prompt.replace(/\\/g, '/') : '';
  const roots = new Set();
  const ids = new Set();
  const slug = SLUG_RE.source.replace(/^\^|\$$/g, ''); // one slug definition: scope.js's
  const re = new RegExp(`((?:/[^\\s"'\`<>()]*?)?/\\.superdev/scopes/${slug})(?:/(?:slicetrees/([\\w-]+)|reports/([\\w-]+)/))?`, 'g');
  for (let m; (m = re.exec(prompt));) {
    try { fs.readFileSync(path.join(m[1], 'ledger.md')); } catch { continue; }
    roots.add(m[1]);
    if (m[2] || m[3]) ids.add(m[2] || m[3]);
  }
  if (roots.size !== 1) return;
  // The session id is the last field: the boundary close (`closeSession`) matches a dispatch to the session that made it.
  appendTrace([...roots][0], { slice: ids.size === 1 ? [...ids][0] : 'scope', agent: 'main', kind: 'dispatch', fields: [ti.subagent_type, input.tool_use_id, ti.description, typeof input.session_id === 'string' ? input.session_id : undefined] });
}

// The runs under the scopes dir of cwd's repository, as { runRoot, events }: each run with a readable ledger and trace.
function runsOf(cwd) {
  const m = /^(.*?\/\.superdev)\/scopes\//.exec(cwd.replace(/\\/g, '/'));
  // The main working tree holds the scopes dir, whatever checkout or subdirectory the controller stands in.
  const main = m ? null : mainWorkTree(cwd, { timeout: GIT_BOUND_MS }) || cwd;
  const scopes = path.join(m ? m[1] : path.join(main, '.superdev'), 'scopes');
  const runs = [];
  for (const name of fs.readdirSync(scopes)) {
    const runRoot = path.join(scopes, name);
    try {
      fs.readFileSync(path.join(runRoot, 'ledger.md'));
      runs.push({ runRoot, events: readTrace(fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8')) });
    } catch { continue; }
  }
  return runs;
}

// The run whose trace holds a `dispatch` line, found among the scopes dir's runs: by its `tool_use_id`, or (`viaAgent`) by the
// `dispatch-bind` line that tied an `agentId` to one. Returns { runRoot, d, events } or undefined.
function findDispatch(cwd, key, viaAgent) {
  for (const { runRoot, events } of runsOf(cwd)) {
    let id = key;
    if (viaAgent) {
      const bind = events.find((e) => e.kind === 'dispatch-bind' && e.fields[2] !== undefined && untraceField(e.fields[2]) === key);
      id = bind && untraceField(bind.fields[1]);
    }
    const d = id && events.find((e) => e.kind === 'dispatch' && e.fields[1] !== undefined && untraceField(e.fields[1]) === id);
    if (d) return { runRoot, d, events };
  }
}

// Whether a trace holds an event of `kind` whose first-keyed field (index `at`) names the dispatch `tu`.
const holds = (events, kind, at, tu) => events.some((e) => e.kind === kind && e.fields[at] !== undefined && untraceField(e.fields[at]) === tu);

// The last line that opened or closed a run of the dispatch `tu`: its `dispatch`, a `dispatch-resume` (whose first field is
// the `tool_use_id`), or a `dispatch-end`. The dispatch is running unless that line is an end.
function lastRunLine(events, tu) {
  let last;
  for (const e of events) {
    const at = e.kind === 'dispatch-resume' ? 0 : 1;
    if ((e.kind === 'dispatch' || e.kind === 'dispatch-resume' || e.kind === 'dispatch-end') && e.fields[at] !== undefined && untraceField(e.fields[at]) === tu) last = e;
  }
  return last;
}

// Ends the run of the dispatch line `d` with `outcome`. The first end of a run wins (INV-0145): a run that already has one
// gets nothing, and a resumed run (`dispatch-resume`) has its own.
function endDispatch(runRoot, events, d, outcome) {
  const tu = untraceField(d.fields[1]);
  const last = lastRunLine(events, tu);
  if (last && last.kind === 'dispatch-end') return;
  appendTrace(runRoot, { slice: untraceField(d.slice), agent: 'main', kind: 'dispatch-end', fields: [untraceField(d.fields[0]), tu, outcome] });
}

// A `dispatch-end` line finishes its dispatch only when it reads `completed`; an end with no outcome field, written before
// outcomes, reads `completed`.
const completedEnd = (e) => e.kind === 'dispatch-end' && (e.fields[2] === undefined || untraceField(e.fields[2]) === 'completed');

// PostToolUse on Agent: both statuses carry the subagent's `agentId`, and the first one seen binds it to the dispatch
// (one `dispatch-bind` per dispatch) for the SubagentStop, TaskStop, and SendMessage that name the agent. `completed`
// ends the dispatch; an `async_launched` one ends on its SubagentStop. A foreground run's own SubagentStop fires before
// this event, while no bind names it yet, so its one end is this one.
// A failed (PostToolUseFailure) or denied (PermissionDenied) call ends it through `recordAgentEnd`.
function recordAgentResult(input, cwd) {
  const r = input.tool_response;
  if (!r || typeof r !== 'object' || typeof input.tool_use_id !== 'string') return;
  const f = r.status === 'completed' || r.status === 'async_launched' ? findDispatch(cwd, input.tool_use_id) : null;
  if (!f) return;
  if (typeof r.agentId === 'string' && r.agentId && !holds(f.events, 'dispatch-bind', 1, input.tool_use_id)) appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-bind', fields: [untraceField(f.d.fields[0]), input.tool_use_id, r.agentId] });
  if (r.status === 'completed') {
    // A foreground review's report rides on `tool_response.handbackReport`: the verdict line lands before the end.
    // Claude Code carries it as `{ text }`; a plain string is read too.
    const report = r.handbackReport && typeof r.handbackReport === 'object' ? r.handbackReport.text : r.handbackReport;
    if (typeof report === 'string') recordVerdict(f, report);
    endDispatch(f.runRoot, f.events, f.d, 'completed');
  }
}

// PostToolUseFailure and PermissionDenied on Agent: the call's `tool_use_id` names the dispatch it ends.
function recordAgentEnd(input, cwd, outcome) {
  if (typeof input.tool_use_id !== 'string') return;
  const f = findDispatch(cwd, input.tool_use_id);
  if (f) endDispatch(f.runRoot, f.events, f.d, outcome);
}

// PostToolUse on TaskStop: `task_id` is the stopped subagent's agent id, which a `dispatch-bind` tied to its dispatch.
function recordTaskStop(input, cwd) {
  const id = input.tool_input && input.tool_input.task_id;
  if (typeof id !== 'string' || !id) return;
  const f = findDispatch(cwd, id, true);
  if (f) endDispatch(f.runRoot, f.events, f.d, 'stopped');
}

// PreToolUse on SendMessage: `to` is the agent id the message resumes (the probe saw `SubagentStart` and a second
// `SubagentStop` follow). An ended, bound dispatch is running again, so its `dispatch-resume` line (the dispatch's
// `tool_use_id`, the agent id, the resuming session, and the `SendMessage` call's own `tool_use_id`) reopens it on its slice.
// A running dispatch or an unbound agent id writes nothing.
function recordSendMessage(input, cwd) {
  const to = input.tool_input && input.tool_input.to;
  if (typeof to !== 'string' || !to) return;
  const f = findDispatch(cwd, to, true);
  const tu = f && untraceField(f.d.fields[1]);
  const last = f && lastRunLine(f.events, tu);
  if (!last || last.kind !== 'dispatch-end') return;
  appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-resume', fields: [tu, to, typeof input.session_id === 'string' ? input.session_id : undefined, typeof input.tool_use_id === 'string' ? input.tool_use_id : undefined] });
}

// PostToolUseFailure and PermissionDenied on SendMessage: a message that failed or was denied reaches no subagent, so the
// run its `dispatch-resume` opened ends with `outcome`. Only the call whose `tool_use_id` the open resume line carries ends
// it: a later message to the still-running resumed dispatch opened no run, so its failure leaves the live run alone.
function recordSendMessageEnd(input, cwd, outcome) {
  const to = input.tool_input && input.tool_input.to;
  if (typeof to !== 'string' || !to || typeof input.tool_use_id !== 'string') return;
  const f = findDispatch(cwd, to, true);
  const last = f && lastRunLine(f.events, untraceField(f.d.fields[1]));
  if (last && last.kind === 'dispatch-resume' && last.fields[3] !== undefined && untraceField(last.fields[3]) === input.tool_use_id) endDispatch(f.runRoot, f.events, f.d, outcome);
}

// Stop, UserPromptSubmit, and SessionEnd of the main session end the session's dispatches that no event named: a dispatch
// with no `dispatch-bind` and no end is a foreground or blocked call that cannot outlive its turn (`unknown`; a foreground
// one is bound only by the PostToolUse that ends it), and at SessionEnd a bound one still open ends `session-end`. A background dispatch is left open at a turn boundary. A dispatch
// line with no session id, written before ids, matches no session. These events fire on every turn of every session, so
// a payload this cannot read, or a repository with no run, records nothing.
function closeSession(input, cwd) {
  const sid = input.session_id;
  if (typeof sid !== 'string' || !sid || sid === '-' || input.agent_id) return;
  for (const { runRoot, events } of runsOf(cwd)) {
    for (const d of events) {
      if (d.kind !== 'dispatch') continue;
      // The session of the open run: the dispatch's own, or the one that resumed it.
      const last = lastRunLine(events, untraceField(d.fields[1]));
      const at = last.kind === 'dispatch-resume' ? 2 : 3;
      if (last.kind === 'dispatch-end' || last.fields[at] === undefined || untraceField(last.fields[at]) !== sid) continue;
      const bound = holds(events, 'dispatch-bind', 1, untraceField(d.fields[1]));
      if (!bound) endDispatch(runRoot, events, d, 'unknown');
      else if (input.hook_event_name === 'SessionEnd') endDispatch(runRoot, events, d, 'session-end');
    }
  }
}

// ---- review verdicts (ADR 0136, INV-0142) ----
// The last `Verdict:` line of a slice-reviewer's report: ✅ or ❌ after `specification`, and the word after `quality`.
// A part it cannot read is `unknown`.
function parseVerdict(text) {
  const line = typeof text === 'string' ? text.split('\n').filter((l) => /Verdict:/.test(l)).pop() : undefined;
  const spec = line && /specification\W*?(✅|❌)/u.exec(line);
  const quality = line && /quality\W*(approved|changes-needed)\b/.exec(line);
  return { spec: spec ? (spec[1] === '✅' ? 'pass' : 'fail') : 'unknown', quality: quality ? quality[1] : 'unknown' };
}

// The last `Ready to merge?` line of a final-reviewer's report: yes, no, or with-fixes; `unknown` when unreadable.
function parseFinalVerdict(text) {
  const line = typeof text === 'string' ? text.split('\n').filter((l) => /Ready to merge\?/.test(l)).pop() : undefined;
  const m = line && /Ready to merge\?\W*(yes|no|with[-\s]+fixes)\b/i.exec(line);
  return m ? m[1].toLowerCase().replace(/[-\s]+/, '-') : 'unknown';
}

// A review's report (a background one's hand-back or its stop's last message, a foreground one's `handbackReport`): one
// `verdict` line for a slice-reviewer, one `final-verdict` line for a final-reviewer, each once per dispatch. The slice-reviewer's line is on its dispatch's
// slice. The cycle counts the slice's reviewer dispatches that completed before this one was dispatched; the reviewed
// implementer is the slice's last one to complete before it. A final-reviewer records only inside an open `review` step; its
// cycle counts the final-reviewer dispatches that completed inside that window before it (INV-0146).
// `f` is the dispatch `findDispatch` found, by `agentId` or by `tool_use_id`.
function recordVerdict(f, text) {
  try {
    if (!f) return;
    const tu = untraceField(f.d.fields[1]);
    if (untraceField(f.d.fields[0]) === 'superdev:final-reviewer') {
      const before = f.events.slice(0, f.events.indexOf(f.d));
      if (holds(f.events, 'final-verdict', 0, tu)) return;
      // The review step is open from its `step set review` line to the first line that ends it: a `step clear`, a
      // `step block` (a stopped review), a `step set` of another step. A stage write that removes the ledger's step mirrors a `step clear` line, so
      // step lines alone carry the window.
      let open = false;
      // A resumed reviewer ends once per run, so the cycle counts distinct dispatches (`tool_use_id`).
      let done = new Set();
      for (const e of before) {
        if (e.kind === 'ledger' && e.fields[0] === 'step') {
          open = e.fields[1] === 'set' && e.fields[2] === 'review';
          done = new Set();
        } else if (open && completedEnd(e) && untraceField(e.fields[0]) === 'superdev:final-reviewer') done.add(untraceField(e.fields[1]));
      }
      if (!open) return;
      appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'final-verdict', fields: [tu, parseFinalVerdict(text), String(done.size)] });
      return;
    }
    if (untraceField(f.d.fields[0]) !== 'superdev:slice-reviewer') return;
    if (holds(f.events, 'verdict', 0, tu)) return;
    const slice = untraceField(f.d.slice);
    const reviewed = new Set(); // distinct dispatches: a resumed reviewer ends once per run
    let impl = '';
    for (const e of f.events.slice(0, f.events.indexOf(f.d))) {
      if (!completedEnd(e) || untraceField(e.slice) !== slice) continue;
      const type = untraceField(e.fields[0]);
      if (type === 'superdev:slice-reviewer') reviewed.add(untraceField(e.fields[1]));
      else if (type === 'superdev:implementer') impl = untraceField(e.fields[1]);
    }
    const v = parseVerdict(text);
    appendTrace(f.runRoot, { slice, agent: 'main', kind: 'verdict', fields: [tu, v.spec, v.quality, String(reviewed.size), impl] });
  } catch {
    // records nothing
  }
}

// The starting-directory stash (ADR 0159): a Bash call's PostToolUse `cwd` is the directory the command ended in, so its
// PreToolUse writes the `cwd` it started in to a file named by the call's `tool_use_id`, and the PostToolUse reads it once.
// The directory is per user: on a shared /tmp another account's 0700 directory is unusable. Windows has no uid, and its
// temporary directory is per user already.
const STASH_DIR = process.getuid ? `superdev-run-trace-${process.getuid()}` : 'superdev-run-trace';
const stashPath = (id) => (typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? path.join(os.tmpdir(), STASH_DIR, id) : null);
// The stash directory is the hook's own only as a real directory owned by this user: `mkdirSync` accepts one already there,
// and on a shared /tmp another account can create that predictable name first, or a symlink at it. Windows has no uid to check.
function ownDir(dir) {
  try {
    const st = fs.lstatSync(dir);
    return st.isDirectory() && (!process.getuid || st.uid === process.getuid());
  } catch { return false; }
}

// Writes the stash and nothing else: no trace line, no ledger, git, or verification read. Every failure passes (INV-0160).
// The exclusive create never writes through a file or symlink already at the path.
function stashStart(input) {
  const p = stashPath(input.tool_use_id);
  if (!p || typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    if (!ownDir(path.dirname(p))) return;
    fs.writeFileSync(p, input.cwd, { flag: 'wx' });
  } catch { /* no stash: the PostToolUse resolves against its own cwd */ }
}

// The stashed starting directory, removed once read; null for none, a symlink, a directory not the hook's own, or content
// that is no absolute path.
function takeStart(id) {
  const p = stashPath(id);
  if (!p || !ownDir(path.dirname(p))) return null;
  let dir = null;
  try {
    const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try { dir = fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
  } catch { /* unreadable or a symlink */ }
  try { fs.unlinkSync(p); } catch { /* none there */ }
  return dir && path.isAbsolute(dir) ? dir : null;
}

function record(input) {
  if (input && typeof input === 'object' && input.tool_name === 'Bash' && input.hook_event_name === 'PreToolUse') {
    stashStart(input);
    return null;
  }
  // Every other Bash event takes the stash, before any guard below can return, so no path leaves it behind.
  const stashed = input && typeof input === 'object' && input.tool_name === 'Bash' ? takeStart(input.tool_use_id) : null;
  if (!appendTrace || !untraceField || !inProgressSlices || !readTrace || !sliceType || !verificationCommands || !SLUG_RE || !mainWorkTree || !testPathOf || !scan || !input || typeof input !== 'object') return null;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (input.tool_name === 'Agent') {
    if (input.hook_event_name === 'PreToolUse') recordDispatch(input);
    else if (input.hook_event_name === 'PostToolUse') recordAgentResult(input, cwd);
    else if (input.hook_event_name === 'PostToolUseFailure') recordAgentEnd(input, cwd, 'failed');
    else if (input.hook_event_name === 'PermissionDenied') recordAgentEnd(input, cwd, 'denied');
    return null;
  }
  if (input.tool_name === 'SendMessage') {
    if (input.hook_event_name === 'PreToolUse') {
      try { recordSendMessage(input, cwd); } catch { /* no scopes dir or an unreadable run: nothing to reopen */ }
    } else if (input.hook_event_name === 'PostToolUseFailure' || input.hook_event_name === 'PermissionDenied') {
      try { recordSendMessageEnd(input, cwd, input.hook_event_name === 'PermissionDenied' ? 'denied' : 'failed'); } catch { /* no scopes dir or an unreadable run: nothing to end */ }
    }
    return null;
  }
  if (input.tool_name === 'TaskStop') {
    if (input.hook_event_name === 'PostToolUse') recordTaskStop(input, cwd);
    return null;
  }
  if (input.hook_event_name === 'Stop' || input.hook_event_name === 'UserPromptSubmit' || input.hook_event_name === 'SessionEnd') {
    try { closeSession(input, cwd); } catch { /* no scopes dir or an unreadable run: nothing to end */ }
    return null;
  }
  if (input.tool_name === 'SubagentHandback') {
    if (input.hook_event_name === 'PostToolUse' && typeof input.agent_id === 'string' && input.agent_id && typeof ti.message === 'string') {
      let f;
      try { f = findDispatch(cwd, input.agent_id, true); } catch { return null; }
      recordVerdict(f, ti.message);
    }
    return null;
  }
  if (input.hook_event_name === 'SubagentStop') {
    if (typeof input.agent_id === 'string' && input.agent_id) {
      // One lookup serves both: the verdict line lands before the dispatch-end.
      const f = findDispatch(cwd, input.agent_id, true);
      recordVerdict(f, input.last_assistant_message);
      // A stop another hook blocks fires again: endDispatch ends the dispatch once.
      if (f) endDispatch(f.runRoot, f.events, f.d, 'completed');
    }
    return null;
  }
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const agent = typeof input.agent_id === 'string' && input.agent_id ? input.agent_id : 'main';
  const triggers = [];
  // A Bash command resolves from where it started; `cwd` is where it ended (ADR 0159).
  const start = stashed || cwd;
  if (typeof ti.command === 'string') recordBash(ti.command, start, agent, failed, triggers, ti.run_in_background === true, cwd);
  if (failed) return null;
  let targets = [];
  if (typeof ti.file_path === 'string') targets = [path.resolve(cwd, ti.file_path)];
  else if (typeof ti.notebook_path === 'string') targets = [path.resolve(cwd, ti.notebook_path)];
  else if (typeof ti.command === 'string') targets = bashTargets(ti.command, start, cwd);
  for (const abs of targets) {
    const at = locate(abs);
    if (!at) continue;
    const kind = isTestPath(at.tree, at.rel) ? 'test' : 'impl';
    appendTrace(at.runRoot, { slice: at.slice, agent, kind: 'edit', fields: [kind, at.rel] });
    if (kind === 'impl') triggers.push(at);
  }
  const notes = [];
  for (const t of triggers) {
    const n = missingRedNote(t, agent);
    if (n) notes.push(n);
  }
  return notes.join('\n') || null;
}

function main() {
  // A hook that cannot finish lets the tool call through: exit 0 at the bound.
  setTimeout(() => process.exit(0), 5000).unref();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const note = record(JSON.parse(raw || '{}'));
      if (note) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } }));
    } catch {
      // never block the tool call
    }
    process.exit(0);
  });
}

if (require.main === module) main();

// `locate`, `testRuns`, and `treeState` are also `scope.js test`'s classifier and tree reader (ADR 0127): the verb and the hook never disagree.
module.exports = { record, parseVerdict, parseFinalVerdict, bashTargets, verificationKind, locate, testRuns, treeState };
