'use strict';

// bash-writes.js: the files a Bash command writes (a redirect, `tee`, `sed -i`, `cp`/`mv`/`install`, `git mv`, `git apply`), resolved against the directory each runs in.

const fs = require('fs');
const path = require('path');
const { scan, dirTracker, cdDir, cdCall, markMoves, segWords, unquote, gitBase, drivePath, gitSubcommand } = require('./bash-command.js');
const { locate } = require('./run-tree.js');

// The files `git apply <args>` writes, run in `dir`. The patch is its own input only: its operand files, or else its heredoc,
// here-string, or `<` file. Each `+++ <path>` names a file under the worktree top, past `-p<n>` leading components (1 by default)
// and under `--directory`. A check, a stat, a summary, or `--cached` alone writes no file; `--build-fake-ancestor` writes its file.
const APPLY_VALUE_OPTS = new Set(['-p', '-C', '--directory', '--exclude', '--include', '--whitespace', '--build-fake-ancestor']);
function applyTargets(args, redirects, dir) {
  const out = [];
  const operands = [];
  const flags = new Set();
  let strip = 1;
  let root = '';
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    const eq = w.indexOf('=');
    const name = w.startsWith('--') && eq > 0 ? w.slice(0, eq) : w;
    const value = w.startsWith('--') && eq > 0 ? w.slice(eq + 1) : APPLY_VALUE_OPTS.has(w) ? args[++i] : /^-p\d+$/.test(w) ? w.slice(2) : null;
    if (!w.startsWith('-')) operands.push(w);
    else if (name === '-p' || /^-p\d+$/.test(w)) strip = Number(value);
    else if (name === '--directory') root = value === undefined ? null : unquote(value);
    else if (name === '--build-fake-ancestor') {
      const f = value === undefined ? null : unquote(value);
      if (f) out.push(path.resolve(dir, drivePath(f)));
    } else flags.add(name);
  }
  const reads = ['--check', '--stat', '--numstat', '--summary'].some((f) => flags.has(f)) && !flags.has('--apply');
  if (reads || (flags.has('--cached') && !flags.has('--index')) || root === null || !Number.isInteger(strip)) return out;
  let text = '';
  const files = operands.length ? operands : redirects.filter((r) => r.op === '<').map((r) => r.target.raw);
  for (const w of files) {
    const f = unquote(w);
    // The catch is for an unreadable patch file only: a `drivePath` throw propagates and `main()` drops the event.
    const file = f ? path.resolve(dir, drivePath(f)) : null;
    try { if (file) text += fs.readFileSync(file, 'utf8') + '\n'; } catch { /* unreadable patch: no file */ }
  }
  if (!operands.length) for (const r of redirects) text += (r.op === '<<<' ? r.target.value : r.body || '') + '\n';
  const at = locate(path.join(dir, 'x'));
  const top = at ? at.tree : dir;
  for (const m of text.matchAll(/^\+\+\+ (\S+)/gm)) {
    const parts = m[1].split('/');
    if (m[1] === '/dev/null' || parts.length <= strip) continue;
    out.push(path.resolve(top, root, parts.slice(strip).join('/')));
  }
  return out;
}

// The files a Bash command writes, as absolute paths resolved against the `cd`/`git -C` target, else cwd. The shared scanner
// reads the command (ADR 0135): quoted text stays data, and a command it cannot read to its end records nothing.
function bashTargets(command, cwd, end) {
  const targets = [];
  const add = (base, word) => {
    const w = word === null ? null : unquote(word);
    if (w && !w.startsWith('&') && !w.startsWith('/dev/') && !w.startsWith('~')) targets.push(path.resolve(base, drivePath(w)));
  };
  const scanned = scan(command); // a scanner throw propagates: `main()` drops the event
  if (!scanned.readable) return [];
  // A `cd` inside a subshell, a substitution, a pipeline stage, an `&` job, or a coprocess moves nothing outside that instance.
  const dirs = dirTracker(cwd, end);
  // Each function body's own tracker, by `fnId`: the body's shell and every instance nested in it, started where the body is defined.
  // A nested body's tracker starts from, and falls back to, its enclosing body's tracker (the scan's `fnUp`), so the enclosing
  // body's instances stay in that body's tracker. A command read out of a backtick group or a heredoc body a shell reads, inside a
  // function body, carries no body id: it resolves against the directory outside the body, never the body's `cd` (ADR 0160).
  const bodyDirs = new Map();
  const bodyTracker = (id, cmdLine) => {
    if (!bodyDirs.has(id)) {
      const upId = scanned.fnUp[id];
      const up = upId === undefined ? dirs : bodyTracker(upId, cmdLine);
      bodyDirs.set(id, dirTracker(up.of(cmdLine), dirs.end, up));
    }
    return bodyDirs.get(id);
  };
  // The scanner lists a backtick group's commands after the whole text; `at` puts them back in the order bash runs them.
  for (const cmdLine of markMoves(scanned)) {
    // simplicity: a function body's writes record at its definition, whether or not a call follows (`f() { echo x > out; }; f`
    // records `out`), past the body's own `cd`; that `cd` moves nothing outside the body, and a call moves as an unreadable `cd`
    // does (`cdDir`). Upgrade by reading the body at the call.
    const { redirects } = cmdLine;
    // A process substitution (`>(cmd)`, `<(cmd)`) is a word of the scanner, and no operand.
    const words = cmdLine.words.filter((w) => !/^[<>]\(/.test(w.raw));
    const ws = words.map((w) => w.raw);
    // A function body runs where it is called: its literal `cd` moves the body's later commands (`fnId`) in the instance the `cd`
    // runs in, the way the outer tracker scopes a move by `inst`, and nothing outside the body.
    const body = cmdLine.fn && cmdLine.fnId !== undefined ? cmdLine.fnId : null;
    const tracker = body !== null ? bodyTracker(body, cmdLine) : dirs;
    const base = tracker.of(cmdLine);
    // `cd <dir>` re-bases the commands after it.
    const cd = cdDir(...cdCall(words), base, tracker, cmdLine);
    if (cd && (body !== null || !cmdLine.fn)) tracker.set(cmdLine, cd);
    // A file write is `>`, `>>`, `>|`, `<>`, `&>`, `&>>`, or `>&` onto a file; `>&2` and `>&-` duplicate a descriptor.
    // The redirects of a `cd` or a call still write, against the directory before it: bash opens them before the command runs.
    for (const { op, target } of redirects) {
      if (!/^(?:>>?|>\||<>|&>>?|>&)$/.test(op)) continue;
      if (op === '>&' && /^(?:\d+|-)$/.test(target.raw)) continue;
      if (/^[<>]\(/.test(target.raw)) continue; // a process substitution is a command, no file
      add(base, target.raw);
    }
    if (cd && !cmdLine.calls) continue;
    // The command word and its arguments past assignments and every wrapper, as the run classifier reads them (segWords, ADR 0160).
    let { cmd, args } = segWords({ ws });
    if (!/^(?:tee|sudoedit|sed|cp|mv|install|git)$/.test(cmd)) continue;
    let segBase = base;
    // git's subcommand and global options read through gitSubcommand (ADR 0160): `git mv` is `mv` on the words after it, and
    // `git apply` writes the files its patch names.
    if (cmd === 'git') {
      const g = gitSubcommand([cmd, ...args]);
      if (!g || (g.subcommand !== 'mv' && g.subcommand !== 'apply')) continue;
      segBase = gitBase(g, base);
      // A `-C` the hook cannot read leaves the operands nowhere it knows: they record nothing (INV-0161).
      if (segBase === null) continue;
      cmd = g.subcommand;
      args = args.slice(g.index);
      if (cmd === 'apply') {
        targets.push(...applyTargets(args, cmdLine.redirects, segBase));
        continue;
      }
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
      } else if (cmd !== 'tee' && cmd !== 'sudoedit' && w === '-t' && args[i + 1]) tDir = args[++i];
      else if (cmd !== 'tee' && cmd !== 'sudoedit' && /^--target-directory=/.test(w)) tDir = w.slice(w.indexOf('=') + 1);
      else if (!/^-/.test(w)) operands.push(w);
    }
    if (cmd === 'tee' || cmd === 'sudoedit') operands.forEach((w) => add(segBase, w));
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
    }
  }
  return [...new Set(targets)];
}

module.exports = { bashTargets };
