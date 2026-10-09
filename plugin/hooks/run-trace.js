#!/usr/bin/env node
'use strict';

// run-trace: deterministic PostToolUse hook that records every file edit of a superdev run into the
// run trace (ADR 0117), attributed to its run and slice and classified as test or implementation.
// Events: Edit/Write/NotebookEdit, and a Bash command writing a file through a redirect, `tee`,
// `sed -i`, `cp`/`mv`/`install`, `git mv`, or `git apply`; and a Bash command that runs tests (with
// outcome, commit, and tree state, on PostToolUse and PostToolUseFailure) or reverts or restores files.
// Any error exits 0 silently; the hook never blocks.
// simplicity: a write behind `bash -c`, a variable, or a substitution is not seen; a guardrail-grade
// parse of the model's normal output, like ledger-guard's. Known limits within grade: `sudo -u root cp`
// breaks command skip (flag after sudo); `git mv a dir/` with dir absent records dir (fs.statSync only
// checks target existence, not trailing-slash intent); a subshell `(bun run test)` is not seen as a test
// (its command word reads `(bun`). Edge cases; upgrade if they appear in real runs.

const fs = require('fs');
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

// One shell word, quoted/escaped forms included — the merge-guard ARG token, byte-identical (pinned by
// tests/run-trace.test.js and drift-check's arg-token contract).
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;
const ARG_WORDS = new RegExp(ARG, 'g');
const REDIR = /(>{1,2}\|?)(?!\()\s*/g; // not `>(`, a process substitution
const ARG_AT = new RegExp(ARG, 'y');

// A heredoc body is data, not a command: drop every body so prose in it never reads as a write. A
// run-trace carries its own quote-aware variant and ledger-guard keeps its own (hooks stay standalone). An error
// here only misreads a trace edit; ledger-guard's is the guard.
function stripHeredocs(cmd) {
  const out = [];
  const queue = []; // Queue of [delimiter, indented] pairs for pending heredocs
  let carry = ''; // The earlier lines of a quoted span still open, so a quote masks across newlines
  for (const line of cmd.split('\n')) {
    // If we're inside a heredoc body, check if this line closes the first pending heredoc
    if (queue.length > 0) {
      const [delim, indented] = queue[0];
      if ((indented ? line.trim() : line) === delim) {
        queue.shift(); // Matched delimiter line — skip it
      }
      // If still inside a heredoc body, skip this line
      if (queue.length > 0) continue;
      continue; // Also skip the delimiter line itself
    }

    out.push(line);
    // Mask quoted text, `$(( ))` arithmetic, and comments so a `<<` inside them is no opener; `<<<` is
    // a here-string. Comments are `#` not preceded by `$` (which would be `$#`, the arg count parameter)
    // through to end of line. Match either (non-$ character before #) or (# at line start).
    // A line that leaves a quote open joins the next lines to it: its `<<` text is data until the quote closes.
    const joined = carry ? carry + '\n' + line : line;
    const masked = joined.replace(/\\.|"(?:[^"\\]|\\.)*"|\$\$|\$'(?:[^'\\]|\\.)*'|'[^']*'|\$\(\([^)]*\)\)|(?:(?<!\$)#|^#)[^\n]*/g, (m) => '_'.repeat(m.length));
    if (/["']/.test(masked)) { carry = joined; continue; }
    carry = '';
    // Find all heredoc openers on this line
    const heredocRe = /(?<!<)<<(?!<)/g;
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = heredocRe.exec(masked)) !== null) {
      const at = match.index;
      const h = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?(\w+))/.exec(joined.slice(at));
      if (h) {
        queue.push([h[2] || h[3] || h[4], h[1] === '-']);
      }
    }
  }
  return out.join('\n');
}

// A shell word as text, or null where it holds a variable, substitution, or glob (a named limit).
function unquote(word) {
  if (/[$`*?]/.test(word.replace(/'[^']*'/g, '').replace(/\\./g, ''))) return null;
  return word.replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"|\\(.)/g, (_, a, b, c) => (a !== undefined ? a : b !== undefined ? b.replace(/\\(.)/g, '$1') : c));
}

// Splits a shell word at its first redirect operator, found with quoted spans and escapes masked (a quoted or escaped `>` is
// data): { head, bare }. `head` is the operand before the operator, empty when the operator opens the word or only an fd
// number or `&` precedes it. `bare` is set when the operator ends the word, so the next word is its target or delimiter.
// Null where the word holds no redirect. bashTargets and segWords share it, so the two read redirects alike.
function splitRedirect(w) {
  const masked = w.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|\\./g, (q) => '_'.repeat(q.length));
  const at = masked.search(/[<>]/);
  if (at < 0) return null;
  const op = /^[<>]+[&|]?-?/.exec(masked.slice(at))[0];
  const head = w.slice(0, at);
  return { head: /^(?:\d+|&)$/.test(head) ? '' : head, bare: at + op.length === w.length };
}

// The files a Bash command writes, as absolute paths resolved against the `cd`/`git -C` target, else cwd.
function bashTargets(command, cwd) {
  const targets = [];
  const add = (base, word) => {
    const w = word === null ? null : unquote(word);
    if (w && !w.startsWith('&') && !w.startsWith('/dev/') && !w.startsWith('~')) targets.push(path.resolve(base, w));
  };
  let base = cwd;
  for (const { text: seg } of segments(command)) {
    // Redirect words (`2>/dev/null`, `>out`, a bare `>` with its target) are not operands.
    const ws = [];
    let skipNext = false;
    for (const w of seg.match(ARG_WORDS) || []) {
      if (skipNext) { skipNext = false; continue; }
      const r = splitRedirect(w);
      if (!r) { ws.push(w); continue; }
      if (r.head) ws.push(r.head);
      skipNext = r.bare;
    }
    let segBase = base;
    // `git -C <dir>` re-bases its own segment; `cd <dir>` re-bases the segments after it.
    const gi = ws.indexOf('-C');
    if (ws[0] === 'git' && gi > 0 && ws[gi + 1]) {
      const d = unquote(ws[gi + 1]);
      if (d) segBase = path.resolve(base, d);
    }
    if (ws[0] === 'cd' && ws[1]) {
      const d = unquote(ws[1]);
      if (d) base = path.resolve(base, d);
      continue;
    }
    // Redirects are found with quoted spans masked, so a quoted `>` is data; the target is read unmasked.
    const masked = seg.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|\\./g, (q) => '_'.repeat(q.length));
    let m;
    REDIR.lastIndex = 0;
    while ((m = REDIR.exec(masked))) {
      ARG_AT.lastIndex = REDIR.lastIndex;
      const t = ARG_AT.exec(seg);
      if (t) add(segBase, t[0]);
    }
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
      const destAbs = path.resolve(segBase, dest);
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
        try { if (f) text += '\n' + fs.readFileSync(path.resolve(segBase, f), 'utf8'); } catch { /* unreadable patch: heredoc text only */ }
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
  'diff', 'cmp', 'cd', 'chmod', 'ln', 'set', 'true', 'false', ':']);
// The wrappers a test run sits behind (`timeout` and `env` have their own option parsing below). ledger-guard.js keeps its own,
// wider list: every name here is also known there (tests/ledger-guard.test.js), which adds `xargs`, `doas`, `stdbuf`, and `builtin`.
// `rtk` is RTK's output filter: its PreToolUse hook rewrites `bun run test` to `rtk bun run test`, PostToolUse sees the rewritten
// command, and `rtk` passes the exit status through (docs/known-issues.md). segWords also skips rtk's `proxy` subcommand; its other
// subcommands that run a command (`err`, `run`, `summary`, `test`) read as the command, so they record no configured-command run
// (a named test file still records a `path` run; triage #941).
const WRAPPERS = /^(?:sudo|command|env|time|exec|nohup|nice|rtk)$/;
// A wrapper's leading option words are skipped, with the value of the options that take one. `command` has none: its options
// (`-v`, `-V`) look a command up, and no run follows. ledger-guard.js keeps its own copy of these sets and of `optionEnd` (as
// `WRAPPER` and `optionWords`; hooks stay standalone), and tests/ledger-guard.test.js pins that the two agree.
const WRAPPER_VALUE_OPTS = new Map([
  ['sudo', new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-T', '-U', '-D', '-R', '--user', '--group', '--host', '--prompt', '--role', '--type',
    '--other-user', '--close-from', '--chdir', '--chroot', '--login-class'])],
  ['nice', new Set(['-n', '--adjustment'])],
  ['exec', new Set(['-a'])],
  ['time', new Set()],
  ['nohup', new Set()],
  ['rtk', new Set()],
]);
// The index of the last word of the option at `ws[i]` and its value, read as getopt reads it: a long option takes the next word
// when it is a value option, and a short cluster takes it when its first value option ends the cluster (`sudo -iu bob`; `-uroot` is one word).
function optionEnd(ws, i, valueOpts) {
  const w = ws[i];
  if (w.startsWith('--')) return valueOpts.has(w) ? i + 1 : i;
  const at = [...w.slice(1)].findIndex((c) => valueOpts.has('-' + c));
  return at < 0 || at + 2 < w.length ? i : i + 1;
}

// The bound on each `git` call a run line needs; a call past it records `unknown` for its field (INV-0009).
const GIT_BOUND_MS = Number(process.env.RUN_TRACE_GIT_BOUND_MS) || 1500;

function gitOut(tree, args) {
  const r = spawnSync('git', args, { cwd: tree, encoding: 'utf8', timeout: GIT_BOUND_MS, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.error || r.signal || r.status !== 0 ? null : r.stdout;
}

// A command as segments joined by `&&`, `||`, `;`, `|`, `|&`, a lone `&`, or a newline: [{ text, sep }], where `sep` is the
// separator that follows the segment. Quoted spans are masked, so a quoted separator stays data; the `|` of a `>|` redirect is no pipe.
function segments(command) {
  const cmd = stripHeredocs(command);
  const masked = cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => '_'.repeat(q.length));
  const out = [];
  let at = 0;
  for (const m of masked.matchAll(/&&|\|\||\|&|[;\n]|(?<!>)\||(?<![<>&|])&(?![&>])/g)) {
    out.push({ text: cmd.slice(at, m.index), sep: m[0] === '|&' ? '|' : m[0] });
    at = m.index + m[0].length;
  }
  out.push({ text: cmd.slice(at), sep: '' });
  return out.filter((s) => s.text.trim() || s.sep);
}

// Shell keywords and group openers that precede a command at command position.
const LEAD = /^(?:if|then|elif|else|do|while|until|!|\(|\{)$/;
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;

// The words of a segment after redirects, group openers, keywords, env assignments, and wrappers (`timeout [opts] <duration> [--]`
// and `env [opts] [--]` included): { cmd, args, negated }. `negated` marks a leading `!`, which inverts the exit status. A `)`
// closing a subshell is dropped from the segment's last word; an escaped `\)` stays.
function segWords(text) {
  // Redirects go by word, outside quotes: a bare operator takes the next word with it (`> out.txt`), and a word's tail from
  // its operator on goes (`>out.txt`, `2>&1`); a `>` inside a quoted word is data.
  const ws = [];
  let skip = false;
  for (const w of text.match(ARG_WORDS) || []) {
    if (skip) { skip = false; continue; }
    const r = splitRedirect(w);
    if (!r) { ws.push(w); continue; }
    if (r.head) ws.push(r.head);
    skip = r.bare;
  }
  if (ws.length) ws[0] = ws[0].replace(/^\(+/, '');
  if (ws.length) ws[ws.length - 1] = ws[ws.length - 1].replace(/(?<!\\)((?:\\\\)*)\)+$/, '$1');
  let i = 0;
  let negated = false;
  for (; i < ws.length; i++) {
    const w = ws[i];
    if (w === '!') negated = true;
    if (w === 'env') {
      while (/^-/.test(ws[i + 1] || '')) {
        i++;
        if (/^(?:-u|--unset)$/.test(ws[i])) i++;
        else if (ws[i] === '--') break;
      }
      continue;
    }
    // Ahead of the WRAPPER_VALUE_OPTS check, whose `continue` would skip it: the map's `rtk` entry then skips only the options
    // after `proxy`, and stays for ledger-guard's parity pin.
    if (w === 'rtk') {
      while (/^-/.test(ws[i + 1] || '')) i++;
      if (ws[i + 1] === 'proxy') i++;
    }
    if (WRAPPER_VALUE_OPTS.has(w)) {
      while (/^-/.test(ws[i + 1] || '')) {
        i++;
        if (ws[i] === '--') break;
        i = optionEnd(ws, i, WRAPPER_VALUE_OPTS.get(w));
      }
      continue;
    }
    if (w === '' || LEAD.test(w) || /^[A-Za-z_]\w*=/.test(w) || WRAPPERS.test(w)) continue;
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
function verificationKind(text, v) {
  const { cmd, args } = segWords(text);
  const words = [cmd, ...args];
  let best = null;
  for (const kind of ['full', 'focused', 'whole']) {
    const c = v[kind];
    if (!c || segments(c).length > 1) continue;
    const tpl = segWords(c);
    if (!beginsWith(words, [tpl.cmd, ...tpl.args])) continue;
    if (!best || c.length > v[best].length) best = kind;
  }
  if ((best === 'full' || best === 'whole') && words.length > 1 + segWords(v[best]).args.length) return 'focused';
  return best;
}

// The compound configured command (one holding `&&`, `||`, `;`, or `|`) that the segments from `i` on run, joiner for joiner:
// { kind, n } over `n` segments, or null. The longest match wins, ties to full over focused over whole; a full or whole run
// with a segment past its template's words is narrowed, so `focused` (INV-0129).
function compoundKind(segs, i, v) {
  let best = null;
  for (const kind of ['full', 'focused', 'whole']) {
    const tpls = v[kind] ? segments(v[kind]) : [];
    const n = tpls.length;
    if (n < 2 || i + n > segs.length || (best && best.n >= n)) continue;
    let narrowed = false;
    const hit = tpls.every((t, j) => {
      const { cmd: tc, args: ta } = segWords(t.text);
      const { cmd, args } = segWords(segs[i + j].text);
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
// does not reflect the test: a leading `!`, a pipe after it without `set -o pipefail`, a command after its pipeline, `||` after it, or a `;`/newline-separated
// command after it. `sole` marks a test whose failure is the command's failure: only `cd`/`set` before it,
// nothing after it but a pipe's tail that ends the command, no `||` before or after it, no background `&`.
// `outside` names the tree to classify against where a segment's directory is in no run tree (`scope.js test --` refuses a
// non-test command there too): `outside` itself while the directory lies in it, and the `cd` target's repository top (else the
// target itself, resolved once per target) after a `cd` out of it.
// The runs it returns then carry that tree as `at`, with no run root, so a caller records nothing for them.
function testRuns(command, cwd, outside) {
  const segs = segments(command);
  const runs = [];
  let base = cwd;
  let pipefail = false;
  let spanEnd = -1;
  const outTrees = new Map();
  segs.forEach((first, i) => {
    if (i <= spanEnd) return;
    const { cmd, args, negated } = segWords(first.text);
    // The last `set -o pipefail` / `set +o pipefail` before the test wins; an option group (`-euo`) counts.
    if (/\bset\s/.test(first.text)) for (const m of first.text.matchAll(/([-+])[A-Za-z]*o\s+pipefail\b/g)) pipefail = m[1] === '-';
    let at = locate(path.join(base, 'x'));
    if (!at && outside) {
      if (!outTrees.has(base)) outTrees.set(base, outsideTree(base, outside));
      at = { tree: outTrees.get(base) };
    }
    // A configured compound command is tried first: it may itself start with `cd` or a NOT_RUNNERS name.
    const v = at ? verificationCommands(at.tree) : {};
    const compound = at ? compoundKind(segs, i, v) : null;
    if (!compound) {
      if (cmd === 'cd' && args[0] && plain(args[0])) { base = path.resolve(base, plain(args[0])); return; }
      if (NOT_RUNNERS.has(path.basename(cmd))) return;
    }
    if (!at) return;
    const tree = at.tree;
    const last = compound ? i + compound.n - 1 : i;
    const seg = segs[last];
    spanEnd = last;
    // A `cd` inside a matched span still moves the base for what follows it.
    for (const s of segs.slice(i, last)) {
      const w = segWords(s.text);
      if (w.cmd === 'cd' && w.args[0] && plain(w.args[0])) base = path.resolve(base, plain(w.args[0]));
    }
    let kind = compound ? compound.kind : verificationKind(seg.text, v);
    const files = [];
    if (!kind) {
      for (const w of [cmd, ...args]) {
        const p = !w.startsWith('-') && (w !== cmd || w.includes('/')) ? plain(w) : null;
        if (!p) continue;
        let rel = path.relative(tree, path.resolve(base, p));
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
        if (/\/$/.test(p)) rel += '/';
        if (isTestPath(tree, rel)) files.push(rel);
      }
      if (files.length) kind = 'path';
    }
    if (!kind) return;
    const more = segs.slice(last + 1).some((s) => s.text.trim());
    // A pipe's status is the pipeline's last segment, so a test piped into a tail stands only when the pipeline ends the command.
    // Under pipefail a later stage keeps the test's status only as a pass-through (`tail`, `cat`; `head` can SIGPIPE).
    const stages = segs.slice(last + 1).filter((s) => s.text.trim());
    const pipeEnds = seg.sep !== '|' || stages.every((s, j) => PASS_THROUGH.has(path.basename(segWords(s.text).cmd))
      && (j < stages.length - 1 ? s.sep === '|' : /^(?:|;|\n)$/.test(s.sep)));
    // Inside a compound configured command every joiner reads as it does in a direct run: a `;`, newline, or `||` hides the
    // status, a pipe keeps it only under pipefail into a pass-through stage, and a `!` on a later segment negates it.
    const inner = compound ? segs.slice(i, last + 1) : [];
    // Only a joiner at or after the segment carrying the run hides it; `cd`/`set` segments before it only set the scene, and
    // a `set -o pipefail` in any of them counts.
    const carrier = Math.max(0, inner.findIndex((s) => !/^(?:cd|set)$/.test(segWords(s.text).cmd)));
    for (const s of inner.slice(1, carrier)) {
      if (/\bset\s/.test(s.text)) for (const m of s.text.matchAll(/([-+])[A-Za-z]*o\s+pipefail\b/g)) pipefail = m[1] === '-';
    }
    const innerHides = inner.some((s, j) => j >= carrier && j < inner.length - 1 && (/^(?:;|\n|\|\|)$/.test(s.sep)
      || (s.sep === '|' && !(pipefail && PASS_THROUGH.has(path.basename(segWords(inner[j + 1].text).cmd))))))
      || inner.slice(1).some((s) => segWords(s.text).negated);
    const unknown = negated || innerHides || (seg.sep === '|' && !pipefail) || !pipeEnds || seg.sep === '||' || ((seg.sep === ';' || seg.sep === '\n') && more);
    const sole = segs.slice(0, i).every((s) => /^(?:cd|set)$/.test(segWords(s.text).cmd) && /^(?:&&|;|\n)$/.test(s.sep))
      && seg.sep !== '&' && (!more || (seg.sep === '|' && pipeEnds));
    runs.push({ at, kind, files, unknown, sole });
  });
  return runs;
}

// `git restore` / `git checkout <rev> --` events of a Bash command: [{ kind: revert|restore, paths }].
// A source other than HEAD or the index reverts; the same files from HEAD restore.
function restoreEvents(command, cwd) {
  const events = [];
  let base = cwd;
  for (const seg of segments(command)) {
    const { cmd, args } = segWords(seg.text);
    if (cmd === 'cd' && args[0] && plain(args[0])) { base = path.resolve(base, plain(args[0])); continue; }
    if (cmd !== 'git') continue;
    let i = 0;
    let segBase = base;
    while (i < args.length && args[i].startsWith('-')) {
      if (args[i] === '-C' && plain(args[i + 1] || '')) segBase = path.resolve(base, plain(args[i + 1]));
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
    const rels = paths.map((p) => {
      const rel = path.relative(tree, path.resolve(segBase, p));
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
function scopeTestCalls(command, cwd) {
  const calls = [];
  let base = cwd;
  segments(command).forEach((seg, i) => {
    const { cmd, args } = segWords(seg.text);
    if (cmd === 'cd' && args[0] && plain(args[0])) { base = path.resolve(base, plain(args[0])); return; }
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
function recordBash(command, cwd, agent, failed, triggers, background) {
  if (/\bscope\.js["']?\s+test\b/.test(command)) {
    const calls = scopeTestCalls(command, cwd).filter((c) => c.at);
    if (calls.length) {
      if (!failed && !background) for (const c of calls) triggers.push(c.at);
      // The calls leave the command (`:` stands in), so the segments around them record as a direct run does.
      const skip = new Set(calls.map((c) => c.i));
      command = segments(command).map((s, i) => (skip.has(i) ? ':' : s.text) + s.sep).join('');
    }
  }
  for (const r of testRuns(command, cwd)) {
    const [sha, clean] = treeState(r.at.tree);
    // The exit status names the test only where the test is the command's sole command; any other shape reads unknown.
    const outcome = r.unknown || !r.sole || background ? 'unknown' : failed ? 'fail' : 'pass';
    appendTrace(r.at.runRoot, { slice: r.at.slice, agent, kind: 'run', fields: [r.kind, outcome, sha, clean, r.files.join(',')] });
    if (outcome === 'pass') triggers.push(r.at);
  }
  // A failed command did not (reliably) move files: only a successful one records a revert or restore.
  if (!failed) {
    for (const e of restoreEvents(command, cwd)) appendTrace(e.at.runRoot, { slice: e.at.slice, agent, kind: e.kind, fields: [e.paths] });
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
  appendTrace([...roots][0], { slice: ids.size === 1 ? [...ids][0] : 'scope', agent: 'main', kind: 'dispatch', fields: [ti.subagent_type, input.tool_use_id, ti.description] });
}

// The run whose trace holds a `dispatch` line, found among the scopes dir's runs: by its `tool_use_id`, or (`viaAgent`) by the
// `dispatch-bind` line that tied an `agentId` to one. Returns { runRoot, d } or undefined.
function findDispatch(cwd, key, viaAgent) {
  const m = /^(.*?\/\.superdev)\/scopes\//.exec(cwd.replace(/\\/g, '/'));
  // The main working tree holds the scopes dir, whatever checkout or subdirectory the controller stands in.
  const main = m ? null : mainWorkTree(cwd, { timeout: GIT_BOUND_MS }) || cwd;
  const scopes = path.join(m ? m[1] : path.join(main, '.superdev'), 'scopes');
  for (const name of fs.readdirSync(scopes)) {
    const runRoot = path.join(scopes, name);
    let events;
    try {
      fs.readFileSync(path.join(runRoot, 'ledger.md'));
      events = readTrace(fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8'));
    } catch { continue; }
    let id = key;
    if (viaAgent) {
      const bind = events.find((e) => e.kind === 'dispatch-bind' && e.fields[2] !== undefined && untraceField(e.fields[2]) === key);
      id = bind && untraceField(bind.fields[1]);
    }
    const d = id && events.find((e) => e.kind === 'dispatch' && e.fields[1] !== undefined && untraceField(e.fields[1]) === id);
    if (d) return { runRoot, d, events };
  }
}

// PostToolUse on Agent: `completed` ends the dispatch; `async_launched` binds its `agentId` for the SubagentStop that ends it.
// A denied, failed (PostToolUseFailure), or interrupted dispatch never reaches here, so it gets no end.
function recordAgentResult(input, cwd) {
  const r = input.tool_response;
  if (!r || typeof r !== 'object' || typeof input.tool_use_id !== 'string') return;
  const f = r.status === 'completed' || r.status === 'async_launched' ? findDispatch(cwd, input.tool_use_id) : null;
  if (!f) return;
  const fields = [untraceField(f.d.fields[0]), input.tool_use_id];
  if (r.status === 'completed') appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-end', fields });
  else if (typeof r.agentId === 'string' && r.agentId) appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-bind', fields: [...fields, r.agentId] });
}

// SubagentStop: ends the dispatch whose `agentId` was bound, once: a stop another hook blocks fires again.
function recordSubagentStop(input, cwd) {
  const f = findDispatch(cwd, input.agent_id, true);
  if (!f || f.events.some((e) => e.kind === 'dispatch-end' && e.fields[1] !== undefined && untraceField(e.fields[1]) === untraceField(f.d.fields[1]))) return;
  appendTrace(f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-end', fields: [untraceField(f.d.fields[0]), untraceField(f.d.fields[1])] });
}

function record(input) {
  if (!appendTrace || !untraceField || !inProgressSlices || !readTrace || !sliceType || !verificationCommands || !SLUG_RE || !mainWorkTree || !testPathOf || !input || typeof input !== 'object') return null;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (input.tool_name === 'Agent') {
    if (input.hook_event_name === 'PreToolUse') recordDispatch(input);
    else if (input.hook_event_name === 'PostToolUse') recordAgentResult(input, cwd);
    return null;
  }
  if (input.hook_event_name === 'SubagentStop') {
    if (typeof input.agent_id === 'string' && input.agent_id) recordSubagentStop(input, cwd);
    return null;
  }
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const agent = typeof input.agent_id === 'string' && input.agent_id ? input.agent_id : 'main';
  const triggers = [];
  if (typeof ti.command === 'string') recordBash(ti.command, cwd, agent, failed, triggers, ti.run_in_background === true);
  if (failed) return null;
  let targets = [];
  if (typeof ti.file_path === 'string') targets = [path.resolve(cwd, ti.file_path)];
  else if (typeof ti.notebook_path === 'string') targets = [path.resolve(cwd, ti.notebook_path)];
  else if (typeof ti.command === 'string') targets = bashTargets(ti.command, cwd);
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
module.exports = { record, bashTargets, verificationKind, ARG, stripHeredocs, locate, testRuns, treeState };
