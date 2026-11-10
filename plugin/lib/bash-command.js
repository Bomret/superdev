'use strict';

// bash-command.js: the command-reading layer every Bash reader of the run trace shares (ADR 0160): a word as bash reads it, a command's segments,
// the command word past wrappers, and the directory each segment runs in.

const path = require('path');

// The shared shell scanner (ADR 0135). One that will not load, or lacks a name this layer reads, fails this require, so a hook that
// loads the layer under a guard records nothing.
const { scan, WRAPPER, optionWords, drivePath, gitSubcommand, ASSIGN_WORD } = require('./shell-words.js');
if (![scan, WRAPPER, optionWords, drivePath, gitSubcommand, ASSIGN_WORD].every(Boolean)) throw new Error('shell-words.js lacks a name the command reader uses');

// One shell word as bash reads it, through the shared scanner's spans (ADR 0160): `value` its text once quotes and escapes are
// gone; `literal` that text, or null where an unquoted or double-quoted part holds a variable or a substitution; `path` the
// literal, or null where an unquoted part also holds a glob (`*`, `?`, `[`), a brace expansion (`{a,b}`, `{1..3}`), or a leading
// `~`. A process substitution is no word, so all three are null. `w` is the scanner's Word, read as it is, or a raw word, scanned
// first; a reader that holds the Word passes it, so no word is scanned twice.
function readWord(w) {
  const none = { value: null, literal: null, path: null };
  let word = typeof w === 'string' ? null : w;
  if (/^[<>]\(/.test(word ? word.raw : w)) return none;
  if (!word) {
    const scanned = scan(w); // a scanner throw propagates: `main()` drops the event
    const c =scanned.readable && scanned.commands.length === 1 ? scanned.commands[0] : null;
    if (!c || c.words.length !== 1 || c.redirects.length) return none;
    word = c.words[0];
  }
  const { value, spans } = word;
  const expands = spans.some((sp) => sp.quote !== 'single' && sp.quote !== 'escape' && /[$`]/.test(sp.text));
  // A brace-free `{…}` whose text holds `,` or `..`: matched first, then tested, so an unclosed `{` costs linear time.
  const braces = (t) => [...t.matchAll(/\{([^{}]*)\}/g)].some((m) => /,|\.\./.test(m[1]));
  const globs = spans.some((sp) => sp.quote === null && (/[*?[]/.test(sp.text) || braces(sp.text)))
    || (spans[0].quote === null && spans[0].text.startsWith('~'));
  return { value, literal: expands ? null : value, path: expands || globs ? null : value };
}
// A word as a path, or null where bash expands it (`readWord`).
const unquote = (word) => readWord(word).path;

// The scanned commands in the order bash runs them (`at`, stable sort), marked for how they move the directory (`cdDir`).
// `calls` marks a call of a function that moves the directory: a command, in a function body at any depth or outside every one, whose command word, past
// env assignments and unquoted (`"f"` and `\f` call `f`), names a function the line defines, after a `cd`, `pushd`, or `popd` in a
// function body, its word read as `cdCall` reads it (`\cd`, `'cd'`, `eval cd`, `eval "cd …"`), also behind `command` or `builtin` (`unwrapBuiltin`). A function body runs in the shell that calls it, so its `cd` moves that shell.
// simplicity: a call of any defined function counts once any function body holds a `cd`, since the scanner names no body's
// function; a call that moves nothing then only resolves as an unreadable `cd` does. Upgrade by naming each body's function.
function markMoves(scanned) {
  const cmds = [...scanned.commands].sort((a, b) => a.at - b.at);
  let moves = false;
  for (const c of cmds) {
    const ws = c.words.map((w) => w.raw);
    const at = ws.findIndex((w) => !ASSIGN_WORD.test(w));
    const word = at < 0 ? undefined : ws[at];
    c.calls = moves && word !== undefined && scanned.fns.has(readWord(c.words[at]).path);
    if (c.fn) moves = moves || /^(?:cd|pushd|popd)$/.test(unwrapBuiltin(...cdCall(c.words))[0]);
  }
  return cmds;
}

// The raw words of a command's simple commands, one segment each, read through the shared scanner (ADR 0135):
// [{ ws, words, sep, nest, group, inst, negated, fn, calls, compound }], in the order bash runs them (a backtick body's commands first, by `at`;
// `inst` the scanner's shell instance, `calls` from `markMoves`). `compound` is true for every segment when the line holds compound structure the
// scanner drops. A function header with a bare compound body (`fnBare`) leaves no segments. `negated` is true for every segment when the command line holds an unquoted `!` negation
// anywhere. `fn` marks a command inside a function body: it stays a segment (it still ends the commands before it) but records
// no run, restore, or `scope.js test` call, since a definition runs nothing. `ws` holds the words after redirects (a process substitution is no word), `sep` the
// operator that follows the segment (`|&` reads as `|`). A command the scanner cannot read to its end has no segments, so
// it records nothing. A command read out of a quoted word is no segment: quoted text is data.
function cmdSegments(command) {
  const scanned = scan(command); // a scanner throw propagates: `main()` drops the event
  // A function header with a bare compound body: the definition runs nothing, and the body's commands are unmarked, so none records.
  if (!scanned.readable || scanned.fnBare) return [];
  // The scanner lists a backtick group's commands after the whole text; `at` (stable sort) puts them back in the order bash runs them.
  return markMoves(scanned).filter((c) => c.level === 0).map((c) => {
    const words = c.words.filter((w) => !/^[<>]\(/.test(w.raw));
    return {
      ws: words.map((w) => w.raw),
      // The same words as the scanner's Word objects, which `cdCall` reads without scanning them again.
      words,
      sep: c.sep === '|&' ? '|' : c.sep,
      // The segment's redirects as the scanner reads them ({ op, fd, target }); a process substitution target is no file.
      redirects: c.redirects || [],
      nest: c.nest,
      group: c.group,
      inst: c.inst,
      // A `!` anywhere in the command line may negate any command of it, so it marks every segment (INV-0017).
      negated: c.negated || scanned.negation === true,
      fn: c.fn === true,
      calls: c.calls === true,
      // Compound structure the scanner dropped (`case`, `if`, `{ }`, `( )`, `[[`, a function header) anywhere in the line.
      compound: scanned.compound === true,
    };
  });
}

// The directory each segment runs in. A `cd` re-bases its own shell instance (`inst`, the scanner's chain: a subshell, a
// substitution, a pipeline stage, an `&` job, a coprocess) and the segments after it in that instance; the segments outside it keep their
// directory. An instance starts in the directory of the one around it, read when its first segment runs; null is the outer shell.
// `end` is the directory the outer shell ended in: a `cd` the hook cannot read moves there. In the outer shell it also sets
// `lost`, after which a relative `cd` of the outer shell moves to `end` too (`cdDir`). A move in a nested instance or a function
// body leaves `lost` alone, since `end` holds none of them; an outer call of a function whose body holds a `cd` sets it, since the
// body runs in the outer shell. A function body's tracker names the tracker of the shell it is defined in as `up`, the outer
// tracker or its enclosing body's: an instance it has not met takes the directory of the first instance either tracker knows, its
// own first, so a body walks no instance its `up` tracker already met.
function dirTracker(cwd, end = cwd, up = null) {
  const dirs = new Map();
  let outer = cwd;
  return {
    end,
    lost: false,
    // Each instance is set once when first met, so the walks of all segments cost time linear in the instances.
    of({ inst }) {
      const fresh = [];
      let n = inst;
      for (; n && !dirs.has(n.id) && !(up && up.has(n.id)); n = n.up) fresh.push(n);
      const dir = !n ? outer : dirs.has(n.id) ? dirs.get(n.id) : up.get(n.id);
      for (const f of fresh) dirs.set(f.id, dir);
      return dir;
    },
    set({ inst }, dir) {
      if (inst) dirs.set(inst.id, dir);
      else outer = dir;
    },
    has: (id) => dirs.has(id),
    get: (id) => dirs.get(id),
  };
}

// The command `command` and `builtin` run, as [cmd, args]: `command cd a` and `builtin cd a` run `cd a`, past `command -p` and a
// `--`. `command -v` and `-V` look the name up and run nothing, so they give an empty command. Any other command gives itself.
// The command word after a wrapper reads as bash reads it (`command \cd a` runs `cd a`); one longer than any command name is none.
function unwrapBuiltin(cmd, args) {
  // One index walks the whole chain, and the arguments are copied once at the end, so a chain reads in linear time.
  let i = 0;
  let wrapped = false;
  while (cmd === 'command' || cmd === 'builtin') {
    for (; cmd === 'command' && /^-[pvV]+$/.test(args[i] || ''); i++) if (/[vV]/.test(args[i])) return ['', []];
    if (args[i] === '--') i++;
    cmd = args[i] === undefined || args[i].length > 64 ? '' : readWord(args[i]).value || '';
    i++;
    wrapped = true;
  }
  return [cmd, wrapped ? args.slice(i) : args];
}

// The command a segment's words run in the current shell, as [cmd, args], for the `cd` readers: past assignments, with the command
// word read as bash reads it (`\\cd` and `'cd'` are `cd`). The scanner drops the `time` keyword. An `eval` whose first argument's
// value, past one leading `--`, starts with the word `cd`, `pushd`, or `popd` (`eval cd …`, `eval "cd …"`, `eval -- cd …`) gives a `cd` with no target the hook reads
// (ADR 0160); any other `eval` gives `eval`. Any other wrapper runs its command in a child, which moves no directory of the shell.
function cdCall(words) {
  let i = 0;
  while (i < words.length && ASSIGN_WORD.test(words[i].raw)) i++;
  // A word longer than any command name is no `cd`; its value is never built.
  const word = (w) => (w === undefined || w.raw.length > 64 ? '' : readWord(w).value || '');
  const cmd = word(words[i]);
  if (cmd === 'eval') {
    // The first argument's value as bash reads it, quotes gone (`eval "cd /x"`), past one leading `--`, which bash's eval skips.
    if (word(words[i + 1]) === '--') i++;
    const arg = words[i + 1] === undefined ? '' : readWord(words[i + 1]).value || '';
    return /^\s*(?:cd|pushd|popd)(?:[\s;&|]|$)/.test(arg) ? ['cd', []] : ['eval', []];
  }
  return [cmd, words.slice(i + 1).map((w) => w.raw)];
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

// The directory git runs in: `base` moved by every `-C` in order, or null where one cannot be read (ADR 0160, INV-0161).
function gitBase(g, base) {
  let dir = base;
  for (const { name, value } of g.options) {
    if (name !== '-C') continue;
    const d = value === null ? null : unquote(value);
    if (!d || dir === null) return null;
    dir = path.resolve(dir, drivePath(d));
  }
  return dir;
}

// The wrappers a test run and a write sit behind (`timeout` has its own option parsing below). shell-words.js's WRAPPER table,
// which ledger-guard.js skips, is wider: it adds `xargs`, `doas`, `stdbuf`, `builtin`, `eval`, `arch`, `caffeinate`, `flock`,
// `chronic`, `unbuffer`, `ionice`, and `taskset`, behind which no run and no write is recorded.
// `rtk` is RTK's output filter: its PreToolUse hook rewrites `bun run test` to `rtk bun run test`, PostToolUse sees the rewritten
// command, and `rtk` passes the exit status through (docs/known-issues.md). segWords also skips rtk's `proxy` subcommand; its other
// subcommands that run a command (`err`, `run`, `summary`, `test`) read as the command, so they record no configured-command run
// (a named test file still records a `path` run; triage #941).
const WRAPPERS = /^(?:sudo|command|env|time|exec|nohup|nice|rtk)$/;
// A wrapper's leading option words are skipped, with the value of the options that take one, as shell-words.js's WRAPPER table and
// optionWords read them. `command` skips only `-p` and a `--` (segWords): its options `-v` and `-V`, alone or in a cluster such as
// `-pv`, look a command up, so segWords gives an empty command and no run follows.
const SKIPS_OPTIONS = (w) => w !== 'command' && WRAPPERS.test(w);

const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;

// The wrapper options after which the hook reads no operand: `--help` and `--version` on any wrapper, `sudo`'s list, version,
// validate, and reset modes, and `env -S`, whose string holds the command line the hook does not read, run none. `sudo -D`, `-R`, and
// `-i` and `env -C` run it in a directory the hook cannot know (ADR 0160, INV-0161). A short cluster is read the getopt way, up to
// its first value option: `sudo -uD` is user `D`.
const RUNS_NONE = {
  sudo: { short: 'lVvKDRi', long: ['--list', '--validate', '--remove-timestamp', '--chdir', '--chroot', '--login'] },
  env: { short: 'SC', long: ['--split-string', '--chdir'] },
};
// Whether a short-option cluster `w` holds a letter of `letters`, read the getopt way up to the cluster's first value option (`opts`).
function clusterHas(w, letters, opts) {
  for (const c of w.slice(1)) {
    if (letters.includes(c)) return true;
    if (opts.has('-' + c)) return false;
  }
  return false;
}
// Whether a `sudo` option word asks for sudoedit (`-e`, `--edit`).
function sudoEdits(w, opts) {
  return w.startsWith('--') ? w === '--edit' : clusterHas(w, 'e', opts);
}
function runsNone(wrapper, w, opts) {
  if (/^--(?:help|version)$/.test(w)) return true;
  const none = RUNS_NONE[wrapper];
  if (!none) return false;
  return w.startsWith('--') ? none.long.includes(w.split('=')[0]) : clusterHas(w, none.short, opts);
}

// The command word and arguments of a segment after env assignments and wrappers (`timeout [opts] <duration> [--]` included),
// the one command-word reader every Bash reader takes (ADR 0160): { cmd, args, negated }. A wrapper option that runs no operand
// (`runsNone`) gives an empty command, and `sudo -e` gives `sudoedit` with the files it edits. `negated` marks a segment of a command line that holds a `!` negation, which may invert the exit status.
function segWords({ ws, negated: neg }) {
  let i = 0;
  let negated = neg === true;
  for (; i < ws.length; i++) {
    const w = ws[i];
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
        if (runsNone(w, ws[i], opts)) return { cmd: '', args: [], negated };
        // `sudo -e` is sudoedit: its operands are the files it edits.
        if (w === 'sudo' && sudoEdits(ws[i], opts)) return { cmd: 'sudoedit', args: ws.slice(i + optionWords(ws[i], opts)).filter((a) => !a.startsWith('-')), negated };
        i += optionWords(ws[i], opts) - 1;
      }
      continue;
    }
    if (w === '' || ASSIGN_WORD.test(w) || WRAPPERS.test(w)) continue;
    if (w !== 'timeout') break;
    while (/^-/.test(ws[i + 1] || '')) {
      i++;
      if (runsNone(w, ws[i], WRAPPER.get(w))) return { cmd: '', args: [], negated };
      if (/^(?:-[ks]|--(?:kill-after|signal))$/.test(ws[i])) i++;
    }
    if (DURATION.test(ws[i + 1] || '')) i++;
    if (ws[i + 1] === '--') i++;
  }
  return { cmd: ws[i] || '', args: ws.slice(i + 1), negated };
}

// A word as literal text, or null where it holds a variable or a substitution; a glob keeps its characters (`readWord`).
const plain = (w) => readWord(w).literal;

// `scan`, `drivePath`, and `gitSubcommand` are the scanner's own, re-exported so every reader takes the scanner through this layer's check.
// Whether a redirect opens a file: `<`, `>`, `>>`, `>|`, `<>`, `&>`, `&>>`, or `>&` onto a file. A descriptor duplication (`>&2`, `>&-`), a heredoc,
// a here-string, and a process substitution (`>(cmd)`, `<(cmd)`) open none.
function isFileRedirect(op, target) {
  return /^(?:<|>>?|>\||<>|&>>?|>&)$/.test(op) && !/^[<>]\(/.test(target.raw) && !(op === '>&' && /^(?:\d+|-)$/.test(target.raw));
}
module.exports = { isFileRedirect, scan, drivePath, gitSubcommand, readWord, unquote, plain, markMoves, cmdSegments, dirTracker, unwrapBuiltin, cdCall, cdDir, gitBase, segWords };
