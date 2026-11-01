'use strict';

// ledger-writes.js: reads a Bash command line and says whether it writes a scopes ledger or run trace, through the per-tool write-target
// table (INPLACE) and the shared scanner; the ledger-guard hook loads it and decides what to do with the answer.
// The ledger write path is ADR 0022 and the run trace ADR 0117. scripts/scope.js is the only sanctioned writer of .superdev/scopes/*/ledger.md, and the
// hooks and lib/trace-log.js's appendTrace the only writers of .superdev/scopes/*/trace.log, so a
// Bash shell write into one (redirect, tee, an in-place
// sed, gsed, perl, ruby, ed, ex, awk -i inplace, sort -o, truncate -s or -r, dd of=, cp/mv/install, ln, patch, rsync, a vi/vim/nvim script,
// curl -o, wget -O, ditto, xxd's output operand, tar extraction, a recursive copy or extraction into a run root, an rm, unlink, or find -delete of
// one or of a directory at or above a run root (ADR 0208), or an interpreter's inline or
// stdin script that names a ledger), is a write. Reads pass, except an interpreter script naming a ledger (fail closed); scope.js invocations pass
// (they never name ledger.md — the CLI takes --root, the run-root directory).
//
// A Bash command is read through the shared scanner, ../lib/shell-words.js (ADR 0135): every simple command it returns,
// nested substitutions, subshells, the text of every quoted or backslash-escaped word (INV-0141), and a heredoc body a known shell reads on stdin
// (`bash <<E`, `cat <<E | sh`, and through `xargs sh -c`, an alias or function that runs a shell, `exec 3<<E; sh <&3`, `sh -c "$(cat)"`,
// or a `>( … )` it is written into) included,
// is read as words and redirects. A heredoc body any other program reads stays data, prose naming a run-state path piped into
// `cat`, `git commit -F -`, or `scope.js … -` included, except on a line running an interpreter that reads its script from stdin
// (`python`/`python3`, `node`, `perl`, `ruby`, matched by basename, reading stdin when the script operand is absent, `-`, `/dev/stdin`,
// `/dev/fd/0`, `/proc/self/fd/0`, or holds no `.` or `/`, and always with an inline script): there a heredoc body, here-string, or
// `echo`/`printf` word naming a ledger is denied, wherever it sits on the line (`cat <<E | python3`, `echo "…" | node -`), because the
// interpreter may run it. Two fail-closed false positives are accepted: a script operand held in a variable (`node "$S" … -`) holds no
// `.` or `/`, so its piped body is judged; and the rule reads the whole line, so text naming a ledger is denied beside a stdin interpreter.
// A here-string and the text an `echo` or `printf` writes are read as command lines when a known shell reads them on stdin
// (`bash <<<'echo x > L'`, `echo cp a L | sh`, `printf 'true\ncp a L' | sh`).
// An in-place edit is refused when either of two checks fires, so a wrapper one check does not unwrap is
// still caught by the other:
//  - the word-level check reads each tool's own flags (the INPLACE table, which also holds the write verbs tee, cp, install, mv, ln, rsync and patch
//    and the operands they write) after the leading `\`, `NAME=value`
//    words, and the compound keywords, and reads the command lines inside the command string of `su -c`, `flock FILE -c` and `env -S`,
//    and inside the value of `rg --pre`;
//  - the command-wide check refuses any command that names `sed`, a run-state file and ` -i`,
//    whatever the wrapper. A command whose command word is a read-only searcher (grep, egrep, fgrep, rg) is exempt, so
//    `grep -i sed <ledger>` reads, unless it holds `--pre`,
//    whose command rg runs on every file it searches (the word-level check reads that command). The check stays fail-closed otherwise: `sed -n "s/ -i//p" <ledger>` is refused.
// A prefix wrapper of shell-words.js's WRAPPER table (sudo, env, xargs, nice, nohup, command, time, timeout, exec, doas, stdbuf, builtin, eval, rtk,
// arch, caffeinate, flock with its lock file, chronic, unbuffer, ionice, taskset with its CPU mask) is skipped before the
// command word is read by shell-words.js's commandStart, with rtk's run-anything subcommand (`rtk proxy cp …`) and its options, a long option's separate value and a short cluster read as getopt reads it (`sudo -iu bob` takes the next word, `sudo -uroot` carries its value)
// included, and a path prefix (`/usr/bin/tee`) is dropped from the command word. This word-level read covers every tool of
// the INPLACE table, so tee, cp, mv, install, ln, rsync and patch behind a wrapper are refused too, and a file copied or moved into the
// run root under a run-state name (`cp -t <run-root> /tmp/ledger.md`) counts as a write of it. `cp <ledger> /tmp/x` and
// `tee /tmp/x < <ledger>` only read it and pass; `mv` and `ln` change every operand, so they refuse any run-state operand, and so does `cp` under `-s`, `-l`, `--symbolic-link` or `--link`, which make a second
// name for a source. `rsync` writes its destination (`rsync <ledger> /tmp/x` reads) and `patch` any run-state operand, but not a `<` redirect source (`patch -p1 < <ledger>` reads the ledger as patch input; `patch <ledger> < p` writes it).
// `truncate` writes its file operands, so `truncate -r REF <ledger>` is refused and `truncate -r <ledger> /tmp/x` passes. A redirect is `>`, `>>`, `>|`, `>&`, `&>`, `&>>`, or `<>`.
// A command the scanner cannot read to its end is refused only when its text names a ledger or run trace path. A quoted text that reads
// as no command line is refused only when it names one and holds a write form (WRITE_FORM), so a commit message that mentions a ledger passes.
// dash runs `((…))` as nested subshells where bash reads arithmetic, so a command is read twice, as written and as dash reads it (shell-words.js's dashReading, which spreads `\(\(` too)
// and a ledger write in either reading is refused; the scanner reads every quoted text it re-reads both ways too: `((cp a L))`, `eval "((cp a L))"`, `echo "((cp a L))" | dash`, and `dash -c \(\(cp\ a\ L\)\)` are refused, `grep "((" L` reads.
// The raw-text tests (the unreadable-command rule and the ledger-name gate) share one normalizer, `plainText`, that drops every backslash and quote character and lower-cases the text, adds a line with each backslash read as `/`, and also reads each path with its doubled slashes, `.` segments, and `<name>/..` segments collapsed. When the scanner cannot be loaded or
// throws, or this module cannot be loaded, the hook refuses every Bash call (INV-0140, INV-0159): the guard has no reader of its own to fall back on.
// Ceiling: a command built at run time (a variable, an `eval` of assembled text, a wrapper script), a path produced only when the
// command runs (`find … -exec sed -i …`, `xargs` stdin, a glob, a patch file's own header, an archive extracted without `-C` in the run root), a
// script file an interpreter runs (`python3 w.py L`), a ledger named only as an interpreter's operand, a file piped to a shell, a wrapper this list does not
// name, an rsync option whose value is a separate word after the destination, and a command word spelled by obfuscation (split quotes `"e"d L`, a backslash inside the word `e\d L`, `pe\rl -pi …`) are not
// read; this is a guardrail against the model's normal output, not a sandbox.

// A load failure propagates to the hook, which refuses every Bash call.
const { scan, commandStart, optionWords, dashReading } = require('./shell-words.js');

// A word references a scopes ledger or run trace when, unquoted/unescaped, it carries
// `.superdev/scopes/…/ledger.md` or `…/trace.log` (relative or under any absolute prefix).
// The one normalizer for raw text: a backslash-newline joins the halves of a word, every backslash and quote character is dropped, and the text is lower-cased
// whatever the nesting depth, so a text that passes through several shells (`dash -c "…"`, `eval`), each undoing one level of quoting
// (`led\\ger.md`), still spells the path. It over-matches, which is fail closed: it only affects a text that spells a ledger path.
// A text holding a path spelled with a doubled slash, a `.` segment, or a `<name>/..` segment (#1030) gets a second line, each
// such path collapsed lexically (`.superdev//scopes`, `./.superdev/./scopes`, `.superdev/kb-pending/../scopes`), so every test
// reads both spellings and denies when either names a run-state path. A symlink `<name>` makes the collapse over-match, which denies.
const plainText = (text) => {
  // Lower-cased (NTFS and APFS fold letter case), with a second line that reads each backslash as `/` (a Windows separator, INV-0141).
  const joined = text.replace(/\\\n/g, '');
  const plain = joined.replace(/[\\"']/g, '').toLowerCase() + '\n' + joined.replace(/\\/g, '/').replace(/["']/g, '').toLowerCase();
  if (!/\/\/|(?:^|\/)\.\.?(?:\/|$)/m.test(plain)) return plain;
  return plain + '\n' + plain.replace(/\S+/g, (w) => (w.includes('/') ? collapsePath(w) : w));
};
// One word's path segments, collapsed with a stack in one pass: an empty segment is dropped unless it leads (an absolute path) or
// ends the word (a trailing `/`), a `.` segment is dropped, and `..` drops the segment before it unless that is `..` or none.
function collapsePath(word) {
  const segs = word.split('/');
  const out = [];
  segs.forEach((s, i) => {
    if (s === '' && i > 0 && i < segs.length - 1) return;
    if (s === '.' && segs.length > 1) return;
    if (s === '..' && out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '') { out.pop(); return; }
    out.push(s);
  });
  return out.join('/');
}
// The ledger or trace name must follow the run-state directory on the same line. Only the first directory of each line is looked
// up, the one that leaves the most text after it, so a line of many directory prefixes is read once, in linear time.
const RUN_STATE = '.superdev/scopes/';
function refsLedger(word) {
  // A line ends at each character `.` does not match (a line terminator).
  return plainText(word).split(/(?!.)[^]/).some((line) => {
    const i = line.indexOf(RUN_STATE);
    return i >= 0 && /ledger\.md|trace\.log/.test(line.slice(i + RUN_STATE.length));
  });
}
// A looser test on a whole command text, ahead of any reading: every deny needs the run-state directory and a ledger or trace
// name in its words, in either order (`cp /tmp/ledger.md .superdev/scopes/x/` copies into the run root). A text that fails it needs no further reading.
// A recursive copy or an archive extracted into a run root writes its ledger without naming it (`cp -r d/. .superdev/scopes/x/`), so the
// run-state directory alone is enough to read on.
// A delete or move at or above a run root removes its ledger without naming it (`rm -rf .superdev`, `mv .superdev x`), so a text holding a delete word reads on
// `.superdev` or a glob character alone; every other text still needs the run-state directory.
const DELETE_WORD = /(?:^|[^\w.-])(?:rm|unlink|find|mv)(?![\w.-])/;
const textMentionsLedger = (text) => {
  const plain = plainText(text);
  return plain.includes('.superdev/scopes/') || ((plain.includes('.superdev') || /[*?[{]/.test(plain)) && DELETE_WORD.test(plain));
};

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
// vi, vim, and nvim edit the named file from a script: `-e`/`-s` (ex and silent mode, a cluster holding either), `-c CMD`, `+CMD`,
// `--cmd`, or `--headless`. Without one they are interactive, which a Bash call cannot drive.
const vimLike = anyWord(/^(?:-[a-zA-Z]*[esc]|\+|--cmd|--headless)/);
// wget writes `-O FILE`, `-OFILE`, a cluster ending in `O`, or `--output-document[=]FILE`.
function wgetTargets(args) {
  const out = [];
  args.forEach((w, i) => {
    let m;
    if (w === '--output-document' || /^-[a-zA-Z]*O$/.test(w)) out.push(args[i + 1] || '');
    else if ((m = /^--output-document=(.*)$/.exec(w) || /^-[a-zA-Z]*?O(.+)$/.exec(w))) out.push(m[1]);
  });
  return out;
}
// xxd writes its second operand (`xxd -r hex L`, `xxd in out`); `-` is an operand (stdin), and these options take a value.
const XXD_VALUE = new Set(['-c', '-cols', '-g', '-groupsize', '-l', '-len', '-s', '-seek', '-o', '-n', '-name']);
function xxdTargets(args) {
  const ops = [];
  for (let i = 0; i < args.length; i++) {
    if (XXD_VALUE.has(args[i])) i++;
    else if (args[i] === '-' || !args[i].startsWith('-')) ops.push(args[i]);
  }
  return ops.slice(1, 2);
}
// A directory that is a run root (`.superdev/scopes/<scope>`, with a trailing `/` or `/.`) holds the ledger, so a recursive copy or an
// archive extracted into it can write the ledger: the target is read as `<dir>/ledger.md`.
const isRunRoot = (w) => /\.superdev\/scopes\/[^/\n]+(?:\/\.?)?$/m.test(plainText(w));
const ledgerIn = (dir) => dir.replace(/\/\.?$/, '') + '/ledger.md';
// tar extracting (`-x`, a cluster holding `x`, `--extract`, `--get`, or an old-style first word such as `xf`) writes every member it
// names and the run root a `-C DIR` or `--directory[=]DIR` points it into.
function tarTargets(args) {
  if (!args.some((w, i) => /^-[a-zA-Z]*x|^--(?:extract|get)$/.test(w) || (i === 0 && /^[a-zA-Z]*x[a-zA-Z]*$/.test(w)))) return [];
  const out = [];
  args.forEach((w, i) => {
    let m;
    const dir = w === '-C' || w === '--directory' ? args[i + 1] || '' : (m = /^--directory=(.*)$/.exec(w)) ? m[1] : null;
    if (dir !== null && isRunRoot(dir)) out.push(ledgerIn(dir));
    if (!w.startsWith('-')) out.push(w);
  });
  return out;
}
// A recursive copy (cp `-r`/`-R`/`-a` or a cluster holding one, `--recursive`, `--archive`; rsync `-r`/`-a`; ditto always) into a
// run root counts as a write of its ledger, whatever the sources hold.
const RECURSIVE = /^(?:-[a-zA-Z]*[rRa]|--recursive$|--archive$)/;
const intoRunRoot = (targets, recursive) => (args) => {
  const out = targets(args);
  const { ops, dir } = operandsOf(args, targets === rsyncTargets);
  const into = dir === null ? ops[ops.length - 1] : dir;
  return recursive(args) && into !== undefined && isRunRoot(into) ? [...out, ledgerIn(into)] : out;
};
const rsyncTargets = copyTargets(false, true);
// A delete removes run state (ADR 0208, INV-0181) when an operand's last path segments match the ledger or run trace, or, under a
// recursive delete, a run root, `.superdev/scopes`, or `.superdev`. Each operand is read in every spelling plainText gives, as glob
// segments (`*`, `?`, `[…]` match text within a segment, after brace expansion), so a glob that could match run state counts too (fail closed).
// The scope segment matches any name. A matching operand is returned as a ledger path, the word refsLedger denies.
const FILE_PROBES = [['.superdev', 'scopes', null, 'ledger.md'], ['.superdev', 'scopes', null, 'trace.log']];
const TREE_PROBES = [...FILE_PROBES, ['.superdev'], ['.superdev', 'scopes'], ['.superdev', 'scopes', null]];
const globSegment = (seg) =>
  new RegExp('^' + seg.replace(/\{[^}]*\}|\[[^\]]*\]|[*?]|[^*?[{]+|./g, (t) => (t === '*' || t[0] === '{' ? '[^/]*' : t === '?' || t[0] === '[' ? '[^/]' : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) + '$');
// A segment's brace expansion (`{.superdev,x}` gives `.superdev` and `x`), innermost group first. The command reader strips a word's
// leading `{`, so a segment holding a `}` before any `{` gets it back. Past 64 alternatives the segment stays unexpanded, and its
// brace then matches any text, a leading `.` included (fail closed).
function expandBraces(seg) {
  if (/^[^{]*\}/.test(seg)) seg = '{' + seg;
  let out = [seg];
  for (let m; out.length <= 64 && (m = /\{([^{}]*)\}/.exec(out[0])); ) {
    out = out.flatMap((s) => {
      const g = /\{([^{}]*)\}/.exec(s);
      return g ? g[1].split(',').map((alt) => s.slice(0, g.index) + alt + s.slice(g.index + g[0].length)) : [s];
    });
  }
  return out.length > 64 ? [seg] : out;
}
// A shell glob matches a leading `.` only literally (no dotglob), so `dist/*` matches no `.superdev`; an alternative opening with `.`
// may, and so may an unexpanded brace.
const matchesSegment = (seg, want) => expandBraces(seg).some((alt) => (want[0] !== '.' || alt[0] === '.' || alt[0] === '{') && globSegment(alt).test(want));
function removesRunState(operand, recursive) {
  return plainText(operand).split('\n').some((line) => {
    const segs = line.split('/').filter((x) => x !== '' && x !== '.');
    return (recursive ? TREE_PROBES : FILE_PROBES).some((probe) => {
      if (segs.length < probe.length) return false;
      const tail = segs.slice(segs.length - probe.length);
      return probe.every((want, k) => want === null || matchesSegment(tail[k], want));
    });
  });
}
const RUN_STATE_WORD = RUN_STATE + 'x/ledger.md';
const deleteTargets = (ops, recursive) => (ops.some((w) => removesRunState(w, recursive)) ? [RUN_STATE_WORD] : []);
// rm: its operands, recursive under `-r`, `-R`, a cluster holding either, or `--recursive`; unlink: its one operand.
const rmTargets = (args) => deleteTargets(operandsOf(args, true).ops, args.some((w) => /^(?:-[a-zA-Z]*[rR]|--recursive$)/.test(w)));
const unlinkTargets = (args) => deleteTargets(operandsOf(args, true).ops, false);
// mv removes each source from where it stood, so a source at or above a run root removes run state as a recursive delete does.
function mvTargets(args) {
  const { ops, dir } = operandsOf(args);
  return [...copyTargets(true)(args), ...deleteTargets(dir === null ? ops.slice(0, -1) : ops, true)];
}
// find deletes under its start paths (the words before the first expression word) with `-delete`, or with `-exec`, `-execdir`,
// `-ok`, or `-okdir` running rm or unlink.
function findTargets(args) {
  let i = 0;
  while (i < args.length && /^-[HLP]+$/.test(args[i])) i++;
  const starts = [];
  while (i < args.length && !/^[-(!]/.test(args[i])) starts.push(args[i++]);
  const deletes = args.slice(i).some((w, k, rest) => w === '-delete' || (/^-(?:exec|execdir|ok|okdir)$/.test(w) && /^(?:rm|unlink)$/.test((rest[k + 1] || '').replace(/^.*\//, ''))));
  return deletes ? deleteTargets(starts, true) : [];
}
// Per tool: whether the words after its name edit a file in place. `true` means the edited file is any word of
// the command, an array the words it writes.
const INPLACE = { sed: sedLike, gsed: sedLike, perl: perlLike, ruby: perlLike, ed: anyArg, ex: anyArg, awk: awkLike, gawk: awkLike, truncate: truncateTargets, sort: sortTargets, dd: ddTargets,
  tee: teeTargets, cp: intoRunRoot(cpTargets, anyWord(RECURSIVE)), install: copyTargets(false), mv: mvTargets, ln: copyTargets(true),
  rsync: intoRunRoot(rsyncTargets, anyWord(/^(?:-[a-zA-Z]*[ra]|--recursive$|--archive$)/)), patch: patchTargets,
  vi: vimLike, vim: vimLike, nvim: vimLike, curl: sortTargets, wget: wgetTargets, ditto: intoRunRoot(copyTargets(false), () => true), xxd: xxdTargets, tar: tarTargets,
  rm: rmTargets, unlink: unlinkTargets, find: findTargets };
const TOOL = /^(?:sed|gsed|perl|ruby|ed|ex|awk|gawk|sort|truncate|dd|tee|cp|mv|install|ln|rsync|patch|vi|vim|nvim|curl|wget|ditto|xxd|tar|rm|unlink|find)$/;
const SHELL = /^(?:sh|bash|zsh|dash|ksh|eval)$/;
// `ed`/`ex` and the write verbs are real words in read-only commands (`grep ed file`), so they count only in command position.
const COMMAND_ONLY = new Set(['ed', 'ex', 'tee', 'cp', 'mv', 'install', 'ln', 'rsync', 'patch', 'vi', 'vim', 'nvim', 'curl', 'wget', 'ditto', 'xxd', 'tar', 'rm', 'unlink', 'find']);
// An interpreter whose inline script (`python3 -c`, `node -e`/`-p`/`--eval`/`--print`, `perl -e`/`-E`, `ruby -e`) or stdin script (a heredoc or
// here-string) names a ledger in its text is refused, a read included: telling its writes from its reads would need the language's own
// parser. A ledger named only as an operand (`perl -ne 'print' L`) is no script text. Per interpreter: the short flags that carry the script,
// read lazily in a cluster (`perl -ne CODE`, `python3 -cCODE`), the long ones, and the options that take a value, short (alone, or
// ending a cluster: `ruby -wI ./lib`) or long (`node --require ./a.js`), which are read past when the script operand is located.
const INTERPRETERS = [
  [/^python[0-9.]*$/, /^-[a-zA-Z]*?c([^]*)$/, null, new Set(['-c', '-m', '-W', '-X', '-Q'])],
  [/^node$/, /^-[a-zA-Z]*?[ep]([^]*)$/, /^--(?:eval|print)(?:=([^]*))?$/,
    new Set(['-r', '-e', '-p', '-C', '--require', '--import', '--loader', '--experimental-loader', '--eval', '--print', '--conditions', '--input-type'])],
  [/^perl$/, /^-[a-zA-Z]*?[eE]([^]*)$/, null, new Set(['-I', '-M', '-m', '-e', '-E'])],
  [/^ruby$/, /^-[a-zA-Z]*?e([^]*)$/, null, new Set(['-I', '-r', '-e', '-C', '-E'])],
];
// The operands that name stdin itself: an interpreter given one reads its script from stdin.
const STDIN_OPERANDS = new Set(['-', '/dev/stdin', '/dev/fd/0', '/proc/self/fd/0']);
// The script operand of an interpreter's arguments: the first word that is no option and no option's value (getopt's reading,
// shell-words.js's optionWords), or the word after `--`; undefined when none.
function scriptOperand(args, valueOpts) {
  for (let k = 0; k < args.length; k++) {
    const w = args[k];
    if (w === '--') return args[k + 1];
    if (w === '-' || !w.startsWith('-')) return w;
    k += optionWords(w, valueOpts) - 1;
  }
  return undefined;
}
// The script texts an interpreter's arguments carry.
function inlineScripts(args, short, long) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    const m = (args[k].startsWith('--') ? long && long.exec(args[k]) : short.exec(args[k])) || null;
    if (m) out.push(m[1] ? m[1] : args[k + 1] || '');
  }
  return out;
}
// No tool name, wrapper, or `--pre` flag is longer than this, so a longer word (a nested substitution holds every
// command below it) is never read for one: the read of a command stays linear in the command's length.
const NAME_MAX = 4096;

// A word without its leading backslash (the alias-bypass escape) and its leading `(`, `$(`, `<(`, `>(`, backtick and `{` openers.
const bare = (w) => w.replace(/^(?:[$<>]\(|[(`{])+/, '').replace(/^\\/, '');
// Words that open a command inside a compound statement (`do perl -pi …`), skipped like an environment prefix.
const KEYWORD = /^(?:do|then|else|elif|if|while|until|time|!)$/;
const SEARCHER = /^(?:grep|egrep|fgrep|rg)$/;
// The index of the command word in a bared word list: past compound keywords, and past what shell-words.js's commandStart skips
// (`NAME=value` words, every prefix wrapper with its options, and `rtk` with a run-anything subcommand), shared with merge-guard.js.
function commandIndex(bared) {
  let i = 0;
  for (;;) {
    while (i < bared.length && bared[i].length <= NAME_MAX && KEYWORD.test(bared[i])) i++;
    const next = commandStart(bared, i);
    if (next === i) return i;
    i = next;
  }
}
// The tools that take a whole command line as one string, and the option that carries it: `su -c`, `flock FILE -c`, `env -S`,
// alone or ending a short cluster (`su -lc`, `flock -xc`, `env -iS`).
const STRING_FLAG = new Map([['su', /^(?:-[a-zA-Z]*?c|--command=?)/], ['flock', /^(?:-[a-zA-Z]*?c|--command=?)/], ['env', /^(?:-[a-zA-Z]*?S|--split-string=?)/]]);
// The command lines such an option carries, in one pass: the option counts from the nearest such tool before it.
function stringCommands(words) {
  const out = [];
  let flag = null;
  words.forEach((w, i) => {
    const f = w.length <= NAME_MAX && STRING_FLAG.get(bare(w).replace(/^.*\//, ''));
    if (f) flag = f;
    const m = !f && flag && w.length <= NAME_MAX && flag.exec(w);
    if (m) out.push(w.slice(m[0].length) || words[i + 1] || '');
  });
  return out;
}
// rg runs the command `--pre CMD` (or `--pre=CMD`) on every file it searches, so its value is a command line.
function preCommands(words) {
  return words.flatMap((w, i) => (w === '--pre' ? [words[i + 1] || ''] : w.startsWith('--pre=') && w.length <= NAME_MAX ? [w.slice(6)] : []));
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
  // backslash (`\sed`, the alias-bypass escape) names the same tool.
  const bared = words.map((w) => (w.length > NAME_MAX ? w : bare(w))).filter(Boolean);
  const argv = bared.slice(commandIndex(bared));
  const at = argv.findIndex((w) => w.length <= NAME_MAX && TOOL.test(w.replace(/^.*\//, '')));
  if (at < 0) return false;
  const tool = argv[at].replace(/^.*\//, '');
  if ((strict || COMMAND_ONLY.has(tool)) && at !== 0) return false;
  return INPLACE[tool](argv.slice(at + 1));
}

// The write redirects: `>`, `>>`, `>|`, `>&`, `&>`, `&>>`, and `<>`, which opens its target for reading and writing
// (`exec 3<> L; echo x >&3`). A `<>` that only reads (`cat <> L`) is denied too, a fail-closed false positive.
const WRITE_REDIRECT = /^(?:>>?|>[|&]|&>>?|<>)$/;

// Whether a command runs an interpreter (INTERPRETERS) whose inline script, or whose script on stdin (a heredoc body or a here-string),
// names a ledger. Stdin is the script unless the script operand (scriptOperand: past every option and option value) names a script
// file: no stdin operand (STDIN_OPERANDS), and a word holding a `.` or a `/` (`node scope.js … -`, `python3 tools/x.py`), which reads its
// stdin as data; with an inline script, stdin is data that script may write out, so it is judged too (fail closed).
// interpreterOf(values) -> { scripts, stdin } | null: the inline script texts, and whether the stdin text is judged; null for no interpreter.
function interpreterOf(values) {
  const bared = values.map((w) => (w.length > NAME_MAX ? w : bare(w))).filter(Boolean);
  const at = commandIndex(bared);
  if (at >= bared.length || bared[at].length > NAME_MAX) return null;
  const name = bared[at].replace(/^.*\//, '');
  const it = INTERPRETERS.find(([re]) => re.test(name));
  if (!it) return null;
  const args = bared.slice(at + 1);
  const scripts = inlineScripts(args, it[1], it[2]);
  const operand = scriptOperand(args, it[3]);
  const scriptFile = operand !== undefined && !STDIN_OPERANDS.has(operand) && /[./]/.test(operand);
  return { scripts, stdin: scripts.length > 0 || !scriptFile };
}
// Whether a scanned line feeds an interpreter a script naming a ledger: some command runs an interpreter whose stdin text is judged
// (interpreterOf), and a heredoc body or here-string anywhere on the line, or a word an `echo` or `printf` writes, names a ledger. Which
// stdin that text reaches is not traced (`cat <<E | python3`, `{ cat <<E; } | python3`, `f() { node; }; cat <<E | f` alike), so a text
// naming a ledger beside an unrelated stdin interpreter is denied too, failing closed.
function feedsInterpreterLedger(scanned) {
  const values = (c) => c.words.map((w) => w.value);
  const stdinScript = (c) => {
    const it = c.words.some((w) => w.raw.length <= NAME_MAX) && interpreterOf(values(c));
    return Boolean(it) && it.stdin;
  };
  if (!scanned.commands.some(stdinScript)) return false;
  const producer = (c) => {
    const bared = values(c).map((w) => (w.length > NAME_MAX ? w : bare(w))).filter(Boolean);
    const at = commandIndex(bared);
    return at < bared.length && /^(?:echo|printf)$/.test(bared[at].replace(/^.*\//, ''));
  };
  return scanned.texts.some((t) => refsLedger(t.text)) || scanned.commands.some((c) => producer(c) && c.words.some((w) => refsLedger(w.value)));
}
function interpreterNamesLedger(cmd, values) {
  const it = interpreterOf(values);
  if (!it) return false;
  if (it.scripts.some(refsLedger)) return true;
  return it.stdin && cmd.redirects.some((r) => (r.op === '<<' || r.op === '<<-' ? refsLedger(r.body || '') : r.op === '<<<' && refsLedger(r.target.value)));
}

// Whether one simple command writes a ledger. `level` > 0 is a command read from quoted text, read with the tool in command position.
function commandWritesLedger(cmd) {
  if (cmd.redirects.some((r) => WRITE_REDIRECT.test(r.op) && refsLedger(r.target.value))) return true;
  // A word longer than NAME_MAX can be no tool, wrapper, or flag, and a command with no word that could be one is read no further.
  if (cmd.words.every((w) => w.raw.length > NAME_MAX)) return false;
  const values = cmd.words.map((w) => w.value);
  const hit = runsInplaceEditor(values, cmd.level > 0);
  const targets = () => [...values, ...cmd.redirects.map((r) => r.target.value)];
  // A tool that names its output (sort, dd, tee, cp, ...) blocks only when that output is a ledger; the others, when any word is.
  if (hit === true && targets().some(refsLedger)) return true;
  if (Array.isArray(hit) && hit.some(refsLedger)) return true;
  if (interpreterNamesLedger(cmd, values)) return true;
  // The command-wide backstop: a command naming `sed` and ` -i` that names a run-state file is refused, whatever wraps it.
  const joined = values.filter((w) => w.length <= NAME_MAX).join(' ');
  if (/\bsed\b/.test(joined) && /\s-i/.test(joined) && targets().some(refsLedger)) {
    if (!(SEARCHER.test(commandWord(values)) && !values.some((w) => w === '--pre' || w.startsWith('--pre=')))) return true;
  }
  return false;
}

// A quoted word that names a ledger and holds an in-place editor writes it, whichever other word of the quoted text names the file
// (`sh -c 'for f in L; do perl -pi -e x $f; done'`): the editor's own words do not hold the path.
const editsInPlace = (text) => {
  const inner = scan(text);
  return inner.readable && inner.commands.some((c) => c.words.some((x) => x.raw.length <= NAME_MAX) && runsInplaceEditor(c.words.map((x) => x.value), true) === true);
};
const quotedEditorNamesLedger = (cmd) => cmd.words.some((w) => w.quoted && refsLedger(w.value) && editsInPlace(w.value));

// A quoted text that reads as no command line is data to the guard unless it holds a write form: a `>` redirect, or a write or
// in-place-editor word of the INPLACE table (`ed` and `ex` only at the start of a statement, where they are no English words).
const WRITE_FORM = />|\b(?:tee|cp|mv|install|ln|rsync|patch|truncate|gsed|awk|gawk|dd|sort)\b|\bsed\b[^]*\s-(?:[a-zA-Z]*i|-in-place)|\b(?:perl|ruby)\b[^]*\s-[0-9a-zA-Z]*i|(?:^|[;&|\n({`])\s*(?:ed|ex)\s/;

// A delete after a `cd` resolves its relative operands against the `cd` target (`cd .superdev && rm -rf scopes`). The targets of the
// `cd` and `pushd` commands met so far are joined in text order, whatever shell instance runs them, which over-reads (fail closed).
// cdRebase(cmd, dir) -> the directory the next command reads against, or true when cmd deletes run state read against `dir`.
const DELETER = /^(?:rm|unlink|find|mv)$/;
function cdRebase(cmd, dir) {
  const values = cmd.words.map((w) => w.value).filter((w) => w.length <= NAME_MAX).map(bare).filter(Boolean);
  const argv = values.slice(commandIndex(values));
  const name = (argv[0] || '').replace(/^.*\//, '');
  if (name === 'cd' || name === 'pushd') {
    const to = argv.slice(1).find((w) => !w.startsWith('-'));
    if (to === undefined) return null;
    return to.startsWith('/') || dir === null ? to : dir + '/' + to;
  }
  if (dir === null || !DELETER.test(name)) return dir;
  const rebased = argv.slice(1).map((w) => (w.startsWith('-') || w.startsWith('/') || w === ';' || w === '+' || w === '{}' ? w : dir + '/' + w));
  const hit = INPLACE[name](rebased);
  return Array.isArray(hit) && hit.some(refsLedger) ? true : dir;
}

// Whether a command line, read as the scanner reads it, writes a ledger. `depth` counts the command lines carried as one word (`su -c`, `env -S`, `rg --pre`).
function readsAsWriting(command, depth) {
  const scanned = scan(command, { quoted: true });
  // An unreadable command is denied only when its text names a ledger.
  if (!scanned.readable) return refsLedger(command);
  if (!textMentionsLedger(command)) return false;
  if (scanned.failedQuoted.some((t) => refsLedger(t) && WRITE_FORM.test(t))) return true;
  if (feedsInterpreterLedger(scanned)) return true;
  let cdTo = null;
  for (const cmd of scanned.commands) {
    if (commandWritesLedger(cmd) || quotedEditorNamesLedger(cmd)) return true;
    cdTo = cdRebase(cmd, cdTo);
    if (cdTo === true) return true;
    if (depth >= 8 || cmd.words.every((w) => w.raw.length > NAME_MAX)) continue;
    const values = cmd.words.map((w) => w.value);
    for (const line of [...stringCommands(values), ...preCommands(values)]) {
      // An editor carried as a command string edits the file the carrying command names (`rg --pre 'perl -pi -e 1' x L`).
      if (readsAsWriting(line, depth + 1) || (editsInPlace(line) && values.some(refsLedger))) return true;
    }
  }
  return false;
}

// `((…))` is arithmetic in bash, which the scanner reads, and two nested subshells in dash, which run what is inside. So a command is read twice,
// as written and as dash reads it (shell-words.js's dashReading), and a ledger write in either reading is a write. A run the reading spreads is read
// by the same scanner, quoted text included, so the quoted-text and unreadable-command rules decide every `((` case.
function writesLedger(command) {
  if (readsAsWriting(command, 0)) return true;
  const dash = dashReading(command);
  return dash !== null && readsAsWriting(dash, 0);
}
// simplicity: same ceiling as merge-guard — honest/common forms only. The text of a quoted or backslash-escaped word is read as a command line (INV-0141), so
// `bash -c "…"` is read through. A `cd` into the scopes dir followed by a bare `> ledger.md`, or a `cp`/`mv`/`install` invoked
// through a variable or a wrapper script, slips past; this is a guardrail against the model's normal output, not a sandbox.

module.exports = { writesLedger };
