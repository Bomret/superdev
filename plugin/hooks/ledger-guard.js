#!/usr/bin/env node
'use strict';

// ledger-guard: deterministic PreToolUse guard for the ledger write path (ADR 0022) and the run trace
// (ADR 0117). scripts/scope.js is the only sanctioned writer of .superdev/scopes/*/ledger.md, and the
// hooks and scope.js's appendTrace the only writers of .superdev/scopes/*/trace.log, so an
// Edit/Write tool call targeting a ledger, or a Bash shell write into one (redirect, tee, an in-place
// sed, gsed, perl, ruby, ed, ex, awk -i inplace, sort -o, truncate -s or -r, dd of=, cp/mv/install, ln, patch, rsync), is denied with a
// message naming scope.js. Reads pass; scope.js invocations pass
// (they never name ledger.md — the CLI takes --root, the run-root directory).
//
// An in-place edit is refused when either of two checks fires, so a wrapper one check does not unwrap is
// still caught by the other:
//  - the word-level check reads each tool's own flags (the INPLACE table, which also holds the write verbs tee, cp, install, mv, ln, rsync and patch
//    and the operands they write) after the leading `\`, `NAME=value`
//    words, and the openers `(`, `$(`, a backtick and `{`, and reads the commands inside a `sh -c`/`bash -c`
//    string, inside the command string of `su -c`, `flock FILE -c` and `env -S`, inside the value of `rg --pre`, and inside
//    every `$( )` or backtick substitution outside single quotes. A string is read as the shell reads it: `\"` is a quote;
//  - the segment-wide check (SED_SEGMENT) refuses any segment that names `sed`, a run-state file and ` -i`,
//    whatever the wrapper. A segment whose command word is a read-only searcher (grep, egrep, fgrep, rg) is exempt, so
//    `grep -i sed <ledger>` reads, unless it holds a process substitution (`<(`, `>(`), whose command may edit, or `--pre`,
//    whose command rg runs on every file it searches (the word-level check reads that command). The check stays fail-closed otherwise: `sed -n "s/ -i//p" <ledger>` is refused.
// A prefix wrapper (sudo, env, xargs, nice, nohup, command, time, timeout, exec, doas, stdbuf, builtin) is skipped before the
// command word is read, with its options, a long option's separate value and a short cluster read as getopt reads it (`sudo -iu bob` takes the next word, `sudo -uroot` carries its value)
// included, and a path prefix (`/usr/bin/tee`) is dropped from the command word. This word-level read covers every tool of
// the INPLACE table, so tee, cp, mv, install, ln, rsync and patch behind a wrapper are refused too, and a file copied or moved into the
// run root under a run-state name (`cp -t <run-root> /tmp/ledger.md`) counts as a write of it. `cp <ledger> /tmp/x` and
// `tee /tmp/x < <ledger>` only read it and pass; `mv` and `ln` change every operand, so they refuse any run-state operand, and so does `cp` under `-s`, `-l`, `--symbolic-link` or `--link`, which make a second
// name for a source. `rsync` writes its destination (`rsync <ledger> /tmp/x` reads) and `patch` any run-state operand, but not a `<` redirect source (`patch -p1 < <ledger>` reads the ledger as patch input; `patch <ledger> < p` writes it).
// `truncate` writes its file operands, so `truncate -r REF <ledger>` is refused and `truncate -r <ledger> /tmp/x` passes. A redirect is `>`, `>>`, `>|`, or `>&`.
// Ceiling: a command built at run time (a variable, an `eval` of assembled text, a wrapper script), a path produced only when the
// command runs (`find … -exec sed -i …`, `xargs` stdin, a glob, a patch file's own header, a recursive copy into a run root), a wrapper this list does not
// name, an rsync option whose value is a separate word after the destination, and a command word spelled by obfuscation (split quotes `"e"d L`, a backslash inside the word `e\d L`, `pe\rl -pi …`) are not
// read; this is a guardrail against the model's normal output, not a sandbox.

// One shell word, quoted/escaped forms included — the merge-guard ARG token.
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;

// A word references a scopes ledger or run trace when, unquoted/unescaped, it carries
// `.superdev/scopes/…/ledger.md` or `…/trace.log` (relative or under any absolute prefix).
function refsLedger(word) {
  const plain = word.replace(/\\(.)/g, '$1').replace(/["']/g, '');
  return /\.superdev\/scopes\/.*(?:ledger\.md|trace\.log)/.test(plain);
}

// The shell write shapes the spec names. The redirect scans capture their target word(s); the write verbs (tee, cp, mv, install,
// ln) are read per `[;&|\n]`-delimited segment, so a `cp`/`mv`/`tee` elsewhere never swallows a later command's pure ledger read
// into its target scan.
// Every write scan reads its words with both tokens (`words`). RAW_ARG reads `$(`, `${` and a backtick as
// plain characters and splits at every unquoted space. A target blocks when either reading names a ledger:
// ARG catches a ledger path behind a balanced substitution holding spaces, RAW_ARG one behind a
// substitution ARG cannot balance (`$((1+(2)))/…`).
// A redirect reads one word after `>`, so a target whose unbalanced substitution holds a space still
// passes (triage #814).
const RAW_ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
const ARG_WORDS = new RegExp(ARG, 'g');
const RAW_ARG_WORDS = new RegExp(RAW_ARG, 'g');
const words = (t) => [...(t.match(ARG_WORDS) || []), ...(t.match(RAW_ARG_WORDS) || [])];
// `>|` is the clobber redirect and `>&` the stdout-and-stderr one: the target is the word after the `|` or `&`.
const REDIR = new RegExp('>{1,2}[|&]?\\s*(' + ARG + ')', 'g');
const REDIR_RAW = new RegExp('>{1,2}[|&]?\\s*(' + RAW_ARG + ')', 'g');
const SED_SEGMENT = /(^|[;&|\n])([^;&|\n]*\bsed\b[^;&|\n]*)/gm;
const INPLACE_TOOL = /\b(?:sed|gsed|perl|ruby|ed|ex|awk|gawk|sort|truncate|dd|tee|cp|mv|install|ln|rsync|patch)\b/;
// The segments of a command line: the text between `;`, `&`, `|` and newline separators that sit outside quotes, so a
// quoted `sh -c 'for f in L; do perl -pi -e x $f; done'` stays one segment. A quote with no closing partner is a plain character.
function splitSegments(text) {
  const segs = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') i += /["'\\]/.test(text[i + 1] || '') ? 2 : 1;
    else if (c === "'") {
      const j = text.indexOf("'", i + 1);
      i = j < 0 ? i + 1 : j + 1;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      i = j < text.length ? j + 1 : i + 1;
    } else if (';&|\n'.includes(c)) {
      segs.push(text.slice(start, i));
      start = ++i;
    } else i++;
  }
  segs.push(text.slice(start));
  return segs;
}
// The in-place flag of each editor, read from the words after the tool's own name: sed and gsed `-i`, a short
// cluster holding `i` (`-Ei`, `-i.bak`) or `--in-place[=SUFFIX]`; perl and ruby `-i[EXT]` after flags that
// take no argument (`-pi`, `-0777pi`, never `-Mstrict`, whose `i` is part of a module name). `ed` and `ex`
// edit the named file with no flag at all, so any argument counts.
const SED_FLAG = /^(?:-[a-zA-Z]*i|--in-(?:p(?:l(?:a(?:c(?:e)?)?)?)?)?(?:=|$))/;
const PERL_FLAG = /^-[0-9acflnpsStTuUwWX]*i/;
const anyWord = (re) => (args) => args.some((w) => re.test(w));
const sedLike = anyWord(SED_FLAG);
const perlLike = anyWord(PERL_FLAG);
const anyArg = anyWord(/./);
// gawk edits in place through its `inplace` extension: `-i inplace`, `-iinplace`, `--include inplace`, `--include=inplace`.
// An option counts only before the program text (the first word that is no option or option value), so `awk '/ -i inplace/' f` reads.
const AWK_VALUE_OPT = new Set(['-i', '--include', '-f', '--file', '-v', '--assign', '-F', '-e', '--source', '-E', '--exec', '-l', '--load', '-W']);
function awkLike(args) {
  for (let i = 0; i < args.length && args[i].startsWith('-'); i++) {
    const w = args[i];
    if (/^(?:-i|--include=?)inplace\b/.test(w)) return true;
    if (AWK_VALUE_OPT.has(w)) {
      if ((w === '-i' || w === '--include') && /^inplace\b/.test(args[i + 1] || '')) return true;
      i++;
    }
  }
  return false;
}
// truncate writes its file operands whenever it gets a size (`-s`, a short cluster holding `s`, `--size[=N]`) or a reference
// file (`-r`, a cluster holding `r`, `--reference[=FILE]`); the reference file and the size are only read. It returns the
// operands, so `truncate -r L /tmp/x` reads L and `truncate -r REF L` writes it. With neither option it writes nothing.
function truncateTargets(args) {
  const out = [];
  let sized = false;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === '--') {
      out.push(...args.slice(i + 1));
      break;
    }
    if (/^--(?:size|reference)(?:=|$)/.test(w) || /^-[a-zA-Z]*[sr]/.test(w)) {
      sized = true;
      if (/^-[a-zA-Z]*[sr]$/.test(w) || /^--(?:size|reference)$/.test(w)) i++;
    } else if (!w.startsWith('-')) out.push(w);
  }
  return sized ? out : [];
}
// sort and dd write the named output, which may be a ledger or a harmless file, so they return the written
// words and only a ledger among them blocks: sort `-o FILE`, `-oFILE`, a cluster ending in `o`, `--output[=]FILE`;
// dd `of=FILE`.
function sortTargets(args) {
  const out = [];
  args.forEach((w, i) => {
    let m;
    if (w === '--output' || /^-[a-zA-Z]*o$/.test(w)) out.push(args[i + 1] || '');
    else if ((m = /^--output=(.*)$/.exec(w) || /^-[a-zA-Z]*?o(.+)$/.exec(w))) out.push(m[1]);
  });
  return out;
}
const ddTargets = (args) => args.filter((w) => w.startsWith('of=')).map((w) => w.slice(3));
// tee, cp, mv, install, ln, and rsync write the files they name. Their operands are the words that are no option and no redirection
// (`tee /tmp/x < L` reads L); `-t DIR`, `-tDIR`, a cluster ending in `t`, and `--target-directory[=]DIR` name the directory every
// other operand lands in. With `plainT` (rsync), `-t` is an ordinary flag, rsync's times, not a target directory.
function operandsOf(args, plainT) {
  const ops = [];
  let dir = null;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    let m;
    if (w === '--') {
      ops.push(...args.slice(i + 1));
      break;
    }
    if (/^\d*[<>]/.test(w)) {
      if (/^\d*(?:<<<|<<|<|>>|>[|&]?)$/.test(w)) i++;
    } else if (w === '--target-directory' || (!plainT && /^-[a-zA-Z]*t$/.test(w))) dir = args[++i] || '';
    else if ((m = /^--target-directory=(.*)$/.exec(w) || (!plainT && /^-[a-zA-Z]*?t(.+)$/.exec(w)))) dir = m[1];
    else if (!w.startsWith('-')) ops.push(w);
  }
  return { ops, dir };
}
// The words cp, install, mv, ln, and rsync write. cp, install, and rsync write their destination (the last operand, or DIR); mv removes its
// source and ln makes a second name for it, so `all` adds every operand. `plainT` is operandsOf's: rsync passes it. A file copied into a directory keeps its name, so each
// source also counts as `DIR/<source name>`: that is how a copy of `ledger.md` into the run root is seen.
const copyTargets = (all, plainT) => (args) => {
  const { ops, dir } = operandsOf(args, plainT);
  const into = dir === null ? ops.pop() : dir;
  if (into === undefined) return [];
  const under = ops.map((w) => into.replace(/\/+$/, '') + '/' + w.replace(/\/+$/, '').replace(/^.*\//, ''));
  return [into, ...under, ...(all ? ops : [])];
};
// cp makes a second name for each source, as ln does, under `-s`, `-l`, `--symbolic-link`, or `--link` (or a GNU unique prefix).
const cpTargets = (args) => copyTargets(args.some((w) => /^(?:-[a-zA-Z]*[sl]|--(?:sy|l)[a-z-]*$)/.test(w)))(args);
const teeTargets = (args) => operandsOf(args).ops;
// patch writes every word it names except a `<` redirect source, which it only reads as patch input (`patch -p1 < L`).
function patchTargets(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (/^\d*<{1,3}$/.test(args[i])) i++;
    else if (!/^\d*</.test(args[i])) out.push(args[i]);
  }
  return out;
}
// Per tool: whether the words after its name edit a file in place. `true` means the edited file is any word of
// the command, an array the words it writes.
const INPLACE = { sed: sedLike, gsed: sedLike, perl: perlLike, ruby: perlLike, ed: anyArg, ex: anyArg, awk: awkLike, gawk: awkLike, truncate: truncateTargets, sort: sortTargets, dd: ddTargets,
  tee: teeTargets, cp: cpTargets, install: copyTargets(false), mv: copyTargets(true), ln: copyTargets(true), rsync: copyTargets(false, true), patch: patchTargets };
const TOOL = /^(?:sed|gsed|perl|ruby|ed|ex|awk|gawk|sort|truncate|dd|tee|cp|mv|install|ln|rsync|patch)$/;
const SHELL = /^(?:sh|bash|zsh|dash|ksh|eval)$/;
// `ed`/`ex` and the write verbs are real words in read-only commands (`grep ed file`), so they count only in command position.
const COMMAND_ONLY = new Set(['ed', 'ex', 'tee', 'cp', 'mv', 'install', 'ln', 'rsync', 'patch']);

// A word without its leading backslash (the alias-bypass escape) and its leading `(`, `$(`, `<(`, `>(`, backtick and `{` openers.
const bare = (w) => w.replace(/^(?:[$<>]\(|[(`{])+/, '').replace(/^\\/, '');
// Words that open a command inside a compound statement (`do perl -pi …`), skipped like an environment prefix.
const KEYWORD = /^(?:do|then|else|elif|if|while|until|time|!)$/;
const SEARCHER = /^(?:grep|egrep|fgrep|rg)$/;
// Prefix wrappers: each runs the command that follows its own options. The value is the set of options, short and long, that
// take a separate value. `time` is a KEYWORD here. run-trace.js keeps its own copy of the shared names (hooks stay standalone)
// in WRAPPERS, and tests/ledger-guard.test.js pins that every name there is known here and takes the same value options. This
// list adds `xargs`, `doas`, `stdbuf`, and `builtin`: run-trace records no test run behind those, and this guard must see an
// editor behind them.
const WRAPPER = new Map([
  ['sudo', new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-T', '-U', '-D', '-R', '--user', '--group', '--host', '--prompt', '--role', '--type',
    '--other-user', '--close-from', '--chdir', '--chroot', '--login-class'])],
  ['env', new Set(['-u', '-C', '-S', '-a', '--unset', '--chdir', '--split-string', '--argv0'])],
  ['xargs', new Set(['-n', '-I', '-P', '-L', '-d', '-a', '-s', '-E', '--max-args', '--max-procs', '--max-lines', '--max-chars', '--delimiter',
    '--arg-file', '--process-slot-var'])],
  ['nice', new Set(['-n', '--adjustment'])],
  ['nohup', new Set()],
  ['command', new Set()],
  ['timeout', new Set(['-s', '-k', '--signal', '--kill-after'])],
  ['exec', new Set(['-a'])],
  ['doas', new Set(['-u', '-C'])],
  ['stdbuf', new Set(['-i', '-o', '-e', '--input', '--output', '--error'])],
  ['builtin', new Set()],
]);
// The words an option word takes, read as getopt reads it: a long option takes the next word when it is a value option. A short
// cluster is walked left to right to its first value option, whose value is the characters after it (`sudo -uroot`, one word) or,
// when it ends the cluster (`sudo -iu bob`), the next word.
function optionWords(w, valueOpts) {
  if (w.startsWith('--')) return valueOpts.has(w) ? 2 : 1;
  const at = [...w.slice(1)].findIndex((c) => valueOpts.has('-' + c));
  return at < 0 || at + 2 < w.length ? 1 : 2;
}
// The index of the command word in a bared word list: past `NAME=value` words, compound keywords, and every prefix wrapper with its options.
function commandIndex(bared) {
  let i = 0;
  while (i < bared.length) {
    const w = bared[i];
    if (/^\w+=/.test(w) || KEYWORD.test(w)) {
      i++;
      continue;
    }
    const name = w.replace(/^.*\//, '');
    const valueOpts = WRAPPER.get(name);
    if (!valueOpts) break;
    i++;
    while (i < bared.length && bared[i].startsWith('-')) i += optionWords(bared[i], valueOpts);
    if (name === 'timeout' && /^\d/.test(bared[i] || '')) i++;
  }
  return i;
}
// A word's content with each quoted span replaced by what the span holds, `$'…'` and `$"…"` included. A double-quoted
// span loses the backslash of `\"`, `\\`, `\$` and a backtick escape, as the shell reads it.
function unquote(w) {
  return w.replace(/\$(?=["'])/g, '').replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (m, dq, sq) => (sq === undefined ? dq.replace(/\\([$`"\\])/g, '$1') : sq));
}
// The tools that take a whole command line as one string, and the option that carries it: `su -c`, `flock FILE -c`, `env -S`,
// alone or ending a short cluster (`su -lc`, `flock -xc`, `env -iS`).
const STRING_FLAG = new Map([['su', /^(?:-[a-zA-Z]*?c|--command=?)/], ['flock', /^(?:-[a-zA-Z]*?c|--command=?)/], ['env', /^(?:-[a-zA-Z]*?S|--split-string=?)/]]);
// The command lines such an option carries, in one pass: the option counts from the nearest such tool before it.
function stringCommands(raw) {
  const out = [];
  let flag = null;
  raw.forEach((w, i) => {
    const f = STRING_FLAG.get(bare(w.replace(/["']/g, '')).replace(/^.*\//, ''));
    if (f) flag = f;
    const m = !f && flag && flag.exec(w);
    if (m) out.push(unquote(w.slice(m[0].length) || raw[i + 1] || ''));
  });
  return out;
}
// The command word of a word list: past `NAME=value` words, and inside the first command string of a shell wrapper.
function commandWord(list) {
  const w = list.map(bare).filter(Boolean);
  const i = w.findIndex((x) => !/^\w+=/.test(x));
  if (i < 0) return '';
  const c = w[i].replace(/^.*\//, '');
  if (!SHELL.test(c)) return c;
  const inner = w.slice(i + 1).find((x) => /\s/.test(x));
  return inner ? commandWord(inner.trim().split(/\s+/)) : c;
}

// Whether a word list runs an in-place editor, as `true`, `false`, or the written words (see INPLACE). `strict` lists (the contents of a quoted word, as in
// `sh -c "sed -i …"`) read the tool only in command position.
function runsInplaceEditor(words, strict) {
  // Leading `NAME=value` words are an environment prefix, so the command word follows them. A leading
  // backslash (`\sed`, the alias-bypass escape) or opener (`(sed`) names the same tool.
  const bared = words.map(bare).filter(Boolean);
  const argv = bared.slice(commandIndex(bared));
  const at = argv.findIndex((w) => TOOL.test(w.replace(/^.*\//, '')));
  if (at < 0) return false;
  const tool = argv[at].replace(/^.*\//, '');
  if ((strict || COMMAND_ONLY.has(tool)) && at !== 0) return false;
  return INPLACE[tool](argv.slice(at + 1));
}
// The command text inside each `$( )`, `<( )`, `>( )` and backtick substitution of a word, wherever it sits: after `NAME=`, inside double
// quotes, but never inside single quotes, which the shell does not expand. Nested substitutions come out of the recursion in inplaceHits.
function substitutions(word) {
  const out = [];
  let i = 0;
  let dq = false;
  while (i < word.length) {
    const c = word[i];
    if (c === '\\') i += 2;
    else if (c === "'" && !dq) {
      const j = word.indexOf("'", i + 1);
      i = j < 0 ? word.length : j + 1;
    } else if (c === '"') {
      dq = !dq;
      i++;
    } else if (c === '`') {
      let j = i + 1;
      while (j < word.length && word[j] !== '`') j += word[j] === '\\' ? 2 : 1;
      out.push(word.slice(i + 1, j));
      i = j + 1;
    } else if ((c === '$' || c === '<' || c === '>') && word[i + 1] === '(') {
      let depth = 0;
      let q = null;
      let j = i + 1;
      for (; j < word.length; j++) {
        const d = word[j];
        if (d === '\\') j++;
        else if (q) {
          if (d === q) q = null;
        } else if (d === "'" || d === '"') q = d;
        else if (d === '(') depth++;
        else if (d === ')' && --depth === 0) break;
      }
      out.push(word.slice(i + 2, j));
      i = j + 1;
    } else i++;
  }
  return out;
}
// rg runs the command `--pre CMD` (or `--pre=CMD`) on every file it searches, so its value is a command line.
function preCommands(raw) {
  return raw.flatMap((w, i) => (w === '--pre' ? [unquote(raw[i + 1] || '')] : w.startsWith('--pre=') ? [unquote(w.slice(6))] : []));
}
// The in-place hits (see runsInplaceEditor) of a segment's text, and of the command lines inside it: a quoted word
// holding whitespace after a shell (`sh -c "sed -i …"`), and every `$( )`, `<( )`, `>( )` or backtick substitution (read from the text,
// whose nested quotes the word tokens cannot balance). A line is split into segments again, each read with the tool in
// command position. ponytail: nesting deeper than 8 levels is not read.
function inplaceHits(text, strict, depth = 0) {
  const raw = text.match(ARG_WORDS) || [];
  const argv = raw.map((w) => w.replace(/["']/g, ''));
  const shell = argv.findIndex((w) => SHELL.test(bare(w).replace(/^.*\//, '')));
  const inner = [
    ...(shell < 0 ? [] : raw.slice(shell + 1).filter((w) => /\s/.test(w.replace(/["']/g, ''))).map(unquote)),
    ...preCommands(raw),
    ...stringCommands(raw),
    ...substitutions(text),
  ];
  const nested = depth >= 8 ? [] : inner.flatMap((line) => splitSegments(line).flatMap((seg) => inplaceHits(seg, true, depth + 1)));
  return [runsInplaceEditor(argv, strict), ...nested].filter((h) => (Array.isArray(h) ? h.length : h));
}

// A heredoc body is data, not a command: drop every body (and its closing delimiter line) so prose in it
// that names `cp`, `tee`, or a ledger path is never scanned. The command line carrying `<<` stays.
function stripHeredocs(cmd) {
  const out = [];
  const queue = []; // Queue of [delimiter, indented] pairs for pending heredocs
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
    const masked = line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|\$\(\([^)]*\)\)|(?:(?<!\$)#|^#).*$/g, (m) => '_'.repeat(m.length));
    // Find all heredoc openers on this line
    const heredocRe = /(?<!<)<<(?!<)/g;
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = heredocRe.exec(masked)) !== null) {
      const at = match.index;
      const h = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?(\w+))/.exec(line.slice(at));
      if (h) {
        queue.push([h[2] || h[3] || h[4], h[1] === '-']);
      }
    }
  }
  return out.join('\n');
}

function bashWritesLedger(command) {
  const cmd = stripHeredocs(command);
  let m;
  for (const re of [REDIR, REDIR_RAW]) {
    re.lastIndex = 0;
    while ((m = re.exec(cmd))) {
      if (refsLedger(m[1])) return true;
    }
  }
  for (const seg of splitSegments(cmd)) {
    if (!INPLACE_TOOL.test(seg)) continue;
    // Flags are read only from the words after the first tool name, so `grep -i sed ledger.md` passes.
    // The segment is read with both tokens, so a target behind a substitution ARG cannot balance still counts.
    const rawArgv = (seg.match(RAW_ARG_WORDS) || []).map((w) => w.replace(/["']/g, ''));
    const hits = [...inplaceHits(seg, false), runsInplaceEditor(rawArgv, false)].filter((h) => (Array.isArray(h) ? h.length : h));
    if (!hits.length) continue; // a plain read passes
    // A tool that names its output (sort, dd, tee, cp, ...) blocks only when that output is a ledger; the others, when any word is.
    for (const word of hits.includes(true) ? words(seg) : hits.flat().flatMap((w) => [w, ...words(w)])) {
      if (refsLedger(word)) return true;
    }
  }
  // The segment-wide backstop: a segment naming `sed` and ` -i` that names a run-state file is refused, whatever wraps it.
  SED_SEGMENT.lastIndex = 0;
  while ((m = SED_SEGMENT.exec(cmd))) {
    const seg = m[2];
    if (!/\s-i/.test(seg) || (!/[<>]\(|--pre(?![\w-])/.test(seg) && SEARCHER.test(commandWord((seg.match(ARG_WORDS) || []).map((w) => w.replace(/["']/g, '')))))) continue;
    for (const word of words(seg)) {
      if (refsLedger(word)) return true;
    }
  }
  return false;
}
// simplicity: same ceiling as merge-guard — honest/common forms only. A `cd` into the scopes
// dir followed by a bare `> ledger.md`, an interpreter wrapper (`bash -c "…"`) around anything but an in-place editor or a write verb,
// or a `cp`/`mv`/`install` invoked through a variable or a wrapper script, slips past; this is a guardrail
// against the model's normal output, not a sandbox.

function decide(input) {
  const ti = (input && input.tool_input) || {};
  const reason =
    'superdev: ledger.md is written only through scripts/scope.js (init/stage/slice/degraded/unresolved/deferred/docs/pr/deploy/suite/base/adopt verbs) — ' +
    'run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js <verb> …` instead of editing the ledger directly. ' +
    'The run trace (trace.log) is hook-written and no agent writes it. (ledger-guard)';

  if (typeof ti.file_path === 'string') {
    // Edit/Write shape. Deny only the scopes ledger and run trace themselves; dod.md, run.lock,
    // .superdev/brainstorm/* and everything else pass.
    if (/\.superdev\/scopes\/[^/]+\/(?:ledger\.md|trace\.log)$/.test(ti.file_path.replace(/\\/g, '/'))) {
      return { block: true, reason };
    }
    return { block: false };
  }

  if (typeof ti.command === 'string') {
    if (bashWritesLedger(ti.command)) return { block: true, reason };
    return { block: false };
  }

  return { block: false };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0); // not our shape → never block
    }
    const { block, reason } = decide(input);
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = { decide, ARG };
