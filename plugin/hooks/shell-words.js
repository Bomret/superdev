'use strict';

// Shell-word scanner shared by the Bash hooks (ADR 0135). It reads a Bash command in one linear pass
// with an explicit stack, so no input depth can overflow the JS stack, and returns the command's simple
// commands, each with its words and redirects, plus the commands nested in substitutions, backtick
// groups, and subshells. It balances quotes, `$'…'`, `$(…)`, `${…}`, `$((…))`, `$[…]`, backticks, subshells,
// process substitutions, array assignments, `[[ … ]]`, `case` patterns, comments, heredocs, and
// backslash-newline continuations, which it joins where bash joins them: in unquoted text, double quotes,
// and the lines of a heredoc body with an unquoted delimiter, and never in a comment, single quotes, or the
// body of a quoted-delimiter heredoc.
// A heredoc body is data, except that it is read as a command line, one subshell level down, when a known shell reads it
// on stdin (feedsShell below: `bash <<E`, `cat <<E | sh`, `{ cat <<E; } | sh`, `cat <<E | (bash)`, `source /dev/stdin <<E`,
// `eval "$(cat <<E …)"`), also when the line reaches the shell indirectly (noteIndirect: `xargs sh -c`, an alias or function
// that runs a shell, `exec 3<<E; sh <&3`, `sh <&3-`, `sh -c "$(cat)"`, `eval "$(cat)"`), or through a `>( … )` it is written into
// (`cat <<E > >(sh)`, `cat <<E | tee >(sh)`). Any other receiver (`cat`, `ssh host`, `python3`) keeps it data; the scan still lists
// every body and here-string text in `texts`, which merge-guard judges unless a file or message sink receives it. A heredoc opened in a
// `( … )` subshell that closes before its body (`(cat <<E) ; x`) is read after the next newline, as bash reads it.
// A command it cannot read to its end is `{ readable: false, reason, commands: [] }`; `scan` never throws.
//
// Shapes:
//   Word      { raw, value, spans: [{ text, quote }], quoted }   `quote` is null (unquoted), 'single',
//             'double', 'ansi', or 'escape' (one backslash-escaped character); `value` is the unquoted
//             text, a `$'…'` span's ANSI-C escapes decoded (decodeAnsi); `quoted` is true when a span sits in quotes. `value` and the text of a double-quoted
//             span are built on first read, so a deeply nested command costs memory linear in its length.
//   Redirect  { op, fd, target, body }   `fd` is the digit prefix (or null), `target` the Word that follows; a `<<` or `<<-`
//             heredoc also carries its `body` text (lines joined at backslash-newlines for an unquoted delimiter).
//   Simple command  { words, redirects, level, nest, group, inst, at, sep, negated }   `sep` is the operator that follows the
//             command in its own text or group (`&&`, `||`, `;`, `\n`, `|`, `|&`, `&`), `''` for the last
//             command of a text or group; the last command of a `( … )` subshell takes the operator after its `)`.
//             `negated` is true for the command a `!` leads: the command after it (`! a`, `if ! a`,
//             `x && ! a`) or after the keywords that follow it (`! time -p a`), and for every command of a
//             `{ … }` or `( … )` group it precedes, nested groups included (`! (a; b)` and `! { a; b; }` mark `a` and `b`).
//             A command a `! (( … ))` arithmetic group holds is not marked. `at` is the offset where the command starts in
//             the text it was read from; a command of a backtick body takes the offset of its backtick, and a command of a
//             heredoc body the offset of the command that opens the heredoc, in the text that holds them, so
//             sorting by `at` (stable) gives the order bash runs them in. `group` is an
//             opaque id, equal for the commands of one subshell instance (`( … )`, `$( … )`, a backtick group,
//             `<( … )`, `>( … )`) and different for each instance, so two sibling subshells at one `nest` differ;
//             commands of the current shell of a text share one id. `nest` is the subshell depth within the text the command
//             was read from: 0 when it runs in the current shell (top level, `{ …; }` groups, if/while/for
//             bodies, function bodies, any pipeline element), and one more for each enclosing `( … )`,
//             `$( … )`, backtick group, `<( … )`, `>( … )`, or heredoc body a shell reads. A command read out of quoted text counts `nest`
//             within that text, from 0. `level` 0 is the command itself, N > 0 is a command
//             read out of the text of a quoted or backslash-escaped word (`scan(..., { quoted: true })`).
//             `inst` is the chain of shell instances the command runs in, `{ id, up }` innermost first, null in the shell the scan
//             starts from (instAt): each stage of a pipeline of two or more elements, simple or compound, each and-or list an `&`
//             sends to the background, each `coproc` command, and each `( … )`, `$( … )`, backtick group, `<( … )`, `>( … )`, or heredoc body a shell reads
//             is an instance, its `id` unique in the scan; `up` names the instance around it.
//             `fn` is true for a command inside a function body (`f() { … }`, `function f { … }`, `f() ( … )`), nested
//             groups, substitutions, backtick groups, and heredoc bodies included: a definition runs nothing.
//             A body that is no `{ … }` or `( … )` group (`f() if …; fi`) is not marked; the scan result's `fnBare` reports it.
//   The scan result carries `negation`, true when the command line (backtick groups and substitutions included, quoted text
//   not) holds a `!` reserved word anywhere, whichever command its negation reaches (`! case x in *) a;; esac` negates no
//   command the scanner keeps). A `!` in quotes, in `$(( … ))`, or in a word reads false, and so does a `!` that leads a
//   `[[ ! … ]]`; a later `!` in `[[ a && ! b ]]` reads true, the safe direction.
//   It carries `compound`, true when the command line (backtick groups included, quoted text not) holds compound structure the
//   scanner drops: a reserved word that opens or closes a compound command (`if then elif else fi case esac for select while
//   until do done { }`), `[[`, a `( … )` group, a `(( … ))` command, a function header, or `coproc`, which runs its command asynchronously). A substitution or process
//   substitution sets it only through what it holds. And `fnBare`, true when a function header is followed by a body that
//   is no `{ … }` or `( … )` group (`f() case x in *) a;; esac`): the body's commands stay in `commands`, unmarked. And `fns`,
//   the Set of the function names the line defines, quoted texts included.
//   Commands come in the order of their first word, except that the commands of a backtick group follow
//   the commands of the text that holds the group.
//
// simplicity: backtick bodies are unescaped and rescanned per nesting level, which is quadratic only in the
// (tiny) depth of nested backticks. `$((` and a statement-start `((` read as arithmetic first and, where
// the arithmetic does not close, as `$( (` and `( (` the way bash falls back; each start fails at most once,
// and the characters the rewinds read again are capped (RESCAN_FACTOR), so a nest of fallbacks reads unreadable
// instead of costing quadratic time. A heredoc body is read again too, and a body that holds a heredoc is read
// again at every level, so the characters of all those re-reads draw on one budget (HEREDOC_REREAD_FACTOR); a body a
// shell reads as a command line draws on it too, and spending the last of it makes the whole command unreadable.

// Quoted text is re-read as a command line down to this depth; a quoted word at this level reads as unreadable.
const MAX_QUOTED_DEPTH = 3;
// Quoted words are queued for reading only up to this many characters in all: the factor times the command's length plus the floor.
const QUOTED_BUDGET_FACTOR = 16;
const QUOTED_BUDGET_FLOOR = 4096;
// A `$[ … ]` arithmetic is read as one word only when its `]` lies within this many characters.
const BRACKET_SPAN = 1024;

// Reserved words that open or close a compound command: they are dropped, so the command after one
// (`then git merge x`) starts at its own first word.
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'while', 'until', 'do', 'done', '!', '{', '}', 'time', 'coproc']);
const MAX_KEYWORD = 8;
// No command, wrapper, option, alias, or function name the scanner looks up is longer than this (nameText).
const NAME_MAX = 64;
const ASSIGN_WORD = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
const DECLARERS = new Set(['declare', 'typeset', 'local', 'readonly']);
// The known shells: a command line reaching one of them on stdin is read as a command line (shellReader below).
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const DQ_ESCAPE = /\\([$`"\\\n])/g;
// The unquoted prefixes a quoted word's text is read past: a `NAME=` assignment, and the attached command-string options `-c`
// (a short cluster ending in it, as `su -lc`), `-S`, `--command=`, and `--split-string=`.
// An escaped character that lets an unquoted, backslash-escaped word spell a command line once a shell reads its value again:
// whitespace, an operator, a backtick, or a `$`. Only the word's `escape` spans are tested, so no value is built, and an escaped
// backslash, or a `$` the word holds unescaped, re-reads nothing: the next shell reads that text as one word.
const ESCAPED_LINE = /[\s;&|<>()`$]/;
const QUOTED_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=|-[A-Za-z]*[cS]|--(?:command|split-string)=)/;

const CMD_PLAIN = /[^ \t\n'"`$\\;&|<>()]+/y;
const DQ_PLAIN = /[^"\\$`]+/y;
const BRACE_PLAIN = /[^'"\\$`}]+/y;
const ARITH_PLAIN = /[^()\\$`'"]+/y;
const BRACKET_PLAIN = /[^[\]'"\\$`]+/y;
const REDIR_OP = /<<<|<<-|<<|<>|<&|<|>>|>&|>\||>/y;
const FUNC_PARENS = /\(\s*\)/y;

// decodeAnsi(text) -> text
// The ANSI-C escapes bash decodes in `$'…'` (and printf and `echo -e` in their text): `\n \t \r \a \b \e \E \f \v \\ \' \" \?`,
// `\xHH`, `\NNN` (octal), `\uHHHH`, `\UHHHHHHHH`, and `\cX`. An unknown escape keeps its backslash. One linear pass.
const ANSI_ESCAPE = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3})|c([\s\S])|([\s\S]))/g;
const ANSI_CHAR = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
function decodeAnsi(text) {
  return text.replace(ANSI_ESCAPE, (m, x, u, U, o, c, ch) => {
    if (x) return String.fromCharCode(parseInt(x, 16));
    if (u || U) {
      const cp = parseInt(u || U, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (o) return String.fromCharCode(parseInt(o, 8) & 0xff);
    if (c) return String.fromCharCode(c.charCodeAt(0) & 0x1f);
    return Object.prototype.hasOwnProperty.call(ANSI_CHAR, ch) ? ANSI_CHAR[ch] : m;
  });
}

// Source of `group` ids: unique per subshell instance, 0 for the text a scan starts from.
let groupSeq = 0;

// instAt(pos) -> { id, up } | null
// The shell instance a command at pipeline position `pos` (`{ pl, el }`) runs in, as a chain of instances, innermost first:
// a stage of a pipeline of two or more elements, an and-or list an `&` runs in the background, a `coproc` command, a `( … )`, `$( … )`, `<( … )`,
// or `>( … )` frame, a backtick body, and a heredoc body a shell reads each start one; null is the shell the scan starts from.
// The walk is iterative and caches each pipeline's instance (`base`) and each element's (`at`), so the instances of every
// command cost time linear in the command's length.
function instAt(pos) {
  const pend = [];
  let node = null;
  for (let cur = pos; cur;) {
    const { pl, el } = cur;
    if (pl.at && pl.at.has(el)) { node = pl.at.get(el); break; }
    pend.push(cur);
    if (pl.base !== undefined) break;
    cur = pl.up ? { pl: pl.up, el: pl.upEl } : pl.root && pl.root.pos;
  }
  for (let k = pend.length - 1; k >= 0; k--) {
    const { pl, el } = pend[k];
    if (pl.base === undefined) {
      let b = node;
      const id = pl.sub ? pl.sub.grp : pl.up || !pl.root ? null : pl.root.frame ? pl.root.frame.grp : pl.root.id;
      if (id !== null && id !== undefined) b = { id, up: b };
      if (pl.job.bg) b = pl.job.node || (pl.job.node = { id: pl.job.id, up: b });
      pl.base = b;
    }
    node = pl.elem > 0 || (pl.co && pl.co.has(el)) ? { id: `${pl.id}:${el}`, up: pl.base } : pl.base;
    (pl.at || (pl.at = new Map())).set(el, node);
  }
  return node;
}

class Unreadable extends Error {}
const fail = (message) => { throw new Unreadable(message); };
// The heredoc re-read budget of the whole scan is spent: the whole command reads as unreadable, whichever text spent the last of it.
class Exhausted extends Unreadable {}
const spendHeredoc = (hdRead, chars) => {
  hdRead.used += chars;
  if (hdRead.used > hdRead.max) throw new Exhausted('too many heredoc bodies to read again');
};

// True when `line` ends in an odd run of backslashes, so its newline is a continuation.
function continues(line) {
  let k = line.length;
  while (k > 0 && line[k - 1] === '\\') k--;
  return (line.length - k) % 2 === 1;
}

// A text built on first read.
const lazy = (build) => {
  let t;
  return () => (t === undefined ? (t = build()) : t);
};

const newFrame = (kind, start) => ({
  kind, start, sub: null, cmd: null, word: null, cases: [], pat: 'word', redir: null, redirHd: false, hd: [], need: false, after: false, depth: 0, cmdForm: false,
  arr: false, dbl: false, dblDepth: 0, timeOpt: false, nc: 0, nq: 0, fnDef: false, forForm: false, coproc: false,
  // `ng`: this `( … )` frame sits in a negated group. `bs`: one entry per open `{`, true for a negated one; `bsNeg` counts the true ones.
  ng: false, bs: [], bsNeg: 0,
  // Function bodies. `fnPend`: a function header was read and its body is next. `fnCount`: open `{` bodies of this frame.
  // `fnIn`: an enclosing frame sits in a function body.
  fnPend: false, fnCount: 0, fnIn: false,
  // `pls`: the open pipelines of this frame, one per open compound command (see topPipe in run()).
  pls: null,
});

// Rewinds of `$((` and `((` may rescan this many characters in all: the factor times the text's length plus the floor.
const RESCAN_FACTOR = 4;
const RESCAN_FLOOR = 4096;
// Heredoc bodies read again (a body is scanned as a double-quoted text, and a body can hold another heredoc) may total
// this many characters over the whole scan: the factor times the command's length plus the floor.
const HEREDOC_REREAD_FACTOR = 4;
const HEREDOC_REREAD_FLOOR = 4096;

// Scans one text (the command, a backtick body, or the text of a quoted or backslash-escaped word). Appends its commands to
// `cmds` and queues backtick bodies on `queue`. Throws Unreadable.
// `hdRead` is the scan's one budget for heredoc bodies read again: `{ used, max }` in characters.
// `baseAt` is where the text sits in the text it was read from (a backtick body, a heredoc body), or undefined for the root.
// `baseRoot` is the text's `{ pos, frame, id }` for instAt(): the position it runs at, and the instance it starts (`id`), or null.
function run(src, cmds, queue, level, heredocBody, baseNest, hdRead, baseGroup, baseAt, baseFn, baseRoot) {
  const n = src.length;
  const st = [newFrame('cmd', 0)];
  st[0].nest = baseNest;
  st[0].grp = baseGroup;
  st[0].fnIn = baseFn === true;
  st[0].root = baseRoot || null;
  // A heredoc body starts inside a double-quote frame that no `"` closes; it runs where its command runs.
  if (heredocBody) { st.push(newFrame('dq', 0)); st[1].fnIn = baseFn === true; st[1].pos = baseRoot ? baseRoot.pos : null; }
  const arithFail = new Set();
  let rescanned = 0;
  // The order heredoc openers come in this text (`seq`).
  let hdSeq = 0;
  let i = 0;

  // The subshell depth of the top frame: the text's base plus one per enclosing `$(…)`, `<(…)`, `>(…)`, or `( … )`
  // frame. Each frame's depth is stored when first asked for, so the walk up the stack is linear in all.
  const frameNest = () => {
    let j = st.length - 1;
    while (j > 0 && st[j].nest === undefined) j--;
    for (let k = j + 1; k < st.length; k++) st[k].nest = st[k - 1].nest + (st[k].kind === 'cmd' && (st[k].sub === 'word' || st[k].sub === 'group') ? 1 : 0);
    return st[st.length - 1].nest;
  };
  // The subshell instance of the top frame: each `( … )`, `$( … )`, `<( … )`, `>( … )` frame gets its own id, cached like the depth.
  const frameGroup = () => {
    let j = st.length - 1;
    while (j > 0 && st[j].grp === undefined) j--;
    for (let k = j + 1; k < st.length; k++) st[k].grp = st[k].kind === 'cmd' && (st[k].sub === 'word' || st[k].sub === 'group') ? ++groupSeq : st[k - 1].grp;
    return st[st.length - 1].grp;
  };
  // True when the frame runs inside a function body.
  const inFn = (f) => f.fnIn || f.fnCount > 0;
  const inPat = (f) => f.cases[f.cases.length - 1] === 'pattern';
  // A function header names a function the line defines (noteIndirect reads its calls), read by its capped name (nameText).
  const defineFn = (w) => {
    const name = nameText(w);
    if (cmds.ctx && name !== null) cmds.ctx.fns.add(name);
  };
  // Pipelines, so `scan` can tell whose stdin a pipeline feeds. Every command sits at an element (`el`) of a pipeline (`pl`): `elem`
  // counts the `|` read so far. A compound command (`{ … }`, `if`, `while`, `until`, `for`, `select`, `case`) or a `( … )` group is
  // one element of the pipeline around it, so a pipeline inside one names that element as `up` and `upEl`, and its output reaches
  // every later element of `up` (`{ cat <<E; } | sh`, `cat <<E | (bash)`). A `;`, `&`, `&&`, `||`, newline, `then`, `do`, `else`, or
  // `elif` starts the next pipeline in the same element. A pipeline lists its commands (`list`) and the pipelines inside its
  // elements (`kids`), which shellAt() reads when a command asks whether it feeds a shell.
  // A pipeline also names the shell instance it runs in, for instAt(): `job` is its and-or list (shared across `&&` and `||`), which
  // an `&` marks `bg`; `sub` is the `( … )` frame whose own pipelines it is one of; `root` is the frame's `{ pos, frame, id }` where a
  // pipeline sits in no enclosing one: `pos` the position (`{ pl, el }`) the frame opened at, `frame` the `$( … )` or `<( … )` frame it
  // starts, `id` the instance a queued text starts.
  const newPipe = (up, upEl) => {
    const p = { elem: 0, up, upEl, list: [], kids: [], shell: undefined, fi: undefined, id: ++groupSeq, job: { id: ++groupSeq, bg: false }, sub: null, root: null };
    if (up) up.kids.push(p);
    return p;
  };
  const topPipe = (f) => {
    if (!f.pls) { f.pls = [newPipe(null, 0)]; f.pls[0].root = f.root || null; }
    return f.pls[f.pls.length - 1];
  };
  const openPipe = (f) => {
    const t = topPipe(f);
    f.pls.push(newPipe(t, t.elem));
  };
  // `andOr`: the next pipeline follows `&&` or `||`, so it runs in the same and-or list.
  const nextPipe = (f, andOr) => {
    const t = topPipe(f);
    const p = newPipe(t.up, t.upEl);
    p.sub = t.sub;
    p.root = t.root;
    if (andOr) p.job = t.job;
    f.pls[f.pls.length - 1] = p;
  };
  // The position a frame opened now starts at: the current command's pipeline element in a command frame, else the frame's own.
  const here = (f) => {
    if (f.kind !== 'cmd') return f.pos || null;
    const pl = f.cmd ? f.cmd.pl : topPipe(f);
    return { pl, el: f.cmd ? f.cmd.el : pl.elem };
  };
  // A closer without an opener (bash rejects it) leaves the frame's outermost pipeline open.
  const closePipe = (f) => { if (f.pls && f.pls.length > 1) f.pls.pop(); };
  // The words of an array assignment are no command, so they start dropped.
  // `feeds` marks a command whose output bash reads as a command line (it runs in a `$( … )` at a command word), and `feedOwner` names
  // the command that `$( … )` belongs to; `psubOf` names the command a `<( … )` it runs in belongs to.
  const ensureCmd = (f) => {
    f.need = false;
    f.fnDef = false;
    if (!f.cmd) {
      const pl = topPipe(f);
      f.cmd = { words: [], redirects: [], level, nest: frameNest(), group: frameGroup(), at: baseAt === undefined ? i : baseAt, sep: '', negated: f.neg === true || f.ng || f.bsNeg > 0, fn: inFn(f), drop: f.arr,
        pl, el: pl.elem, feeds: f.feeds === true, feedOwner: f.feedOwner || null, psubOf: f.psubOf || null, fed: null, ctx: cmds.ctx };
      pl.list.push(f.cmd);
      f.last = f.cmd; f.pend = null; f.neg = false; cmds.push(f.cmd);
    }
  };
  // The operator that follows the frame's latest command; the first one it meets wins (`a;` newline keeps `;`).
  // A subshell's last command takes the operator after its `)` (`pend`) instead.
  const setSep = (f, op) => {
    const c = f.pend || f.last;
    f.pend = null;
    if (c && c.sep === '') c.sep = op;
  };
  const beginWord = (f) => {
    if (f.word) return;
    if (f.after && !f.redir) fail('word after a subshell');
    f.word = { start: i, spans: [], plain: '' };
    if (!inPat(f)) ensureCmd(f);
  };
  const flush = (w) => { if (w.plain !== '') { w.spans.push({ text: w.plain, quote: null }); w.plain = ''; } };
  const addPlain = (f, text) => { f.word.plain += text; };
  const addQuoted = (f, text, quote) => { flush(f.word); f.word.spans.push({ text, quote }); };
  // A double-quoted span whose unescaped text is built only when read. `head(limit)` decodes only a prefix: the whole text, or a prefix
  // longer than `limit` characters, from a raw slice that doubles until one of those holds (a slice ending inside an escape keeps its
  // backslash, one character more than bash reads, hence `limit + 1`).
  const decodeDq = (a, b) => src.slice(a, b).replace(DQ_ESCAPE, (m, ch) => (ch === '\n' ? '' : ch));
  const addDouble = (f, a, b) => {
    flush(f.word);
    const text = lazy(() => decodeDq(a, b));
    const head = (limit) => {
      for (let r = 2 * limit + 2; ; r *= 2) {
        const t = decodeDq(a, Math.min(b, a + r));
        if (a + r >= b || t.length > limit + 1) return t;
      }
    };
    f.word.spans.push({ get text() { return text(); }, head, quote: 'double' });
  };

  const deliver = (f, w, plain) => {
    if (f.redir) {
      f.redir.target = w;
      // `frame`, `nest`, `group`, `fn`, and `seq` let a heredoc outlive its `( … )` subshell: its body is read after the next newline, in
      // the frame around it (`(cat <<E) ; x`), with the depth and instance of the frame that opened it, in the order the openers came.
      if (f.redirHd) {
        f.hd.push({ delim: w.value, strip: f.redir.op === '<<-', quoted: w.spans.some((s) => s.quote), at: f.cmd.at, cmd: f.cmd, redir: f.redir,
          frame: f, nest: f.cmd.nest, group: f.cmd.group, fn: inFn(f), seq: hdSeq++ });
      }
      f.redir = null;
      f.redirHd = false;
      return;
    }
    if (f.arr) return;
    const top = f.cases[f.cases.length - 1];
    if (top === 'pattern') {
      if (f.pat === 'sep') fail('two words in one case pattern');
      if (plain && w.value === 'esac') { f.cases.pop(); closePipe(f); } else f.pat = 'sep';
      return;
    }
    const c = f.cmd;
    const afterTime = f.timeOpt;
    const afterCoproc = f.coproc;
    f.timeOpt = false;
    f.coproc = false;
    if (top === 'subject') {
      c.words.push(w);
      if (plain && w.value === 'in' && c.words.length >= 3) { f.cases[f.cases.length - 1] = 'pattern'; f.pat = 'word'; c.drop = true; f.cmd = null; }
      return;
    }
    // A function header followed by anything but a `{` body (a `( … )` group takes its own path) names a bare compound body.
    if (c.words.length === 0 && f.fnPend && !(plain && w.value === '{')) { cmds.fnBare = true; f.fnPend = false; }
    if (c.words.length === 0 && plain) {
      if (w.value === 'for' || w.value === 'select') { cmds.compound = true; openPipe(f); }
      if (w.value === 'esac' && top === 'body') { f.cases.pop(); closePipe(f); c.drop = true; f.cmd = null; return; }
      // `time` takes `-p` and then `--`, each ending the dropped command like `time` itself.
      if (afterTime === true && w.value === '-p') { f.neg = c.negated; c.drop = true; f.cmd = null; f.timeOpt = 'p'; return; }
      if (afterTime && w.value === '--') { f.neg = c.negated; c.drop = true; f.cmd = null; return; }
      // A Set lookup internalizes a long string, copying it; no keyword is that long.
      // A `!` reaches past the keywords after it (`! time a`, `! { a; }`): the dropped command hands its `negated` on.
      if (w.value.length <= MAX_KEYWORD && KEYWORDS.has(w.value)) {
        // A `{ … }` group a `!` leads marks every command it holds, nested groups included; a `{ … }` after a function header is its body.
        // `bs` holds one entry per open `{`: 1 for a negated one, 2 for a function body.
        if (w.value === '{') {
          f.bs.push((c.negated ? 1 : 0) | (f.fnPend ? 2 : 0));
          if (c.negated) f.bsNeg++;
          if (f.fnPend) f.fnCount++;
        } else if (w.value === '}') {
          const b = f.bs.pop() || 0;
          if (b & 1) f.bsNeg--;
          if (b & 2) f.fnCount--;
        }
        if (w.value === '{' || w.value === 'if' || w.value === 'while' || w.value === 'until') openPipe(f);
        else if (w.value === '}' || w.value === 'fi' || w.value === 'done') closePipe(f);
        else if (w.value === 'then' || w.value === 'do' || w.value === 'else' || w.value === 'elif') nextPipe(f);
        // A `!` is a negation wherever its status lands (a dropped `case` subject, a `[[ … ]]` list); `scan` reports that.
        if (w.value === '!') cmds.negation = true;
        else if (w.value !== 'time') cmds.compound = true;
        // A coprocess runs in a subshell of its own: its pipeline element is an instance (instAt), whatever the command is.
        if (w.value === 'coproc') (c.pl.co || (c.pl.co = new Set())).add(c.el);
        f.fnPend = false;
        if (w.value === '!' || c.negated) f.neg = true; c.drop = true; f.cmd = null; f.timeOpt = w.value === 'time'; f.coproc = w.value === 'coproc'; return; }
      if (w.value === 'case') { f.cases.push('subject'); cmds.compound = true; openPipe(f); }
      if (w.value === '[[') { f.dbl = true; cmds.compound = true; }
    }
    if (f.dbl && plain && w.value === ']]') {
      if (f.dblDepth > 0) fail('unbalanced ( in [[ ]]');
      f.dbl = false;
    }
    // `coproc NAME { … }`: the word after `coproc` is a name when a `{` follows it, and the body starts its own command.
    if (c.coName && c.words.length === 1 && plain && w.value === '{') { cmds.compound = true; f.bs.push(c.negated ? 1 : 0); if (c.negated) f.bsNeg++; openPipe(f); c.words.length = 0; c.drop = true; f.cmd = null; return; }
    c.words.push(w);
    if (afterCoproc && c.words.length === 1) c.coName = true;
    // `function name` heads a function definition: the header is dropped, so the body that follows starts its own command.
    if (c.words.length === 2 && !f.dbl && !c.words[0].quoted && c.words[0].value === 'function') { defineFn(w); c.drop = true; f.cmd = null; f.fnDef = true; f.fnPend = true; cmds.compound = true; }
  };
  const endWord = (f) => {
    const w = f.word;
    if (!w) return;
    flush(w);
    f.word = null;
    const spans = w.spans;
    let v;
    let nm;
    const head = (limit) => {
      if (v !== undefined) return v;
      let t = '';
      for (const s of spans) {
        t += s.head ? s.head(limit) : s.text;
        if (t.length > limit) break;
      }
      return t;
    };
    deliver(f, {
      raw: src.slice(w.start, i),
      get value() { return v === undefined ? (v = spans.length === 1 ? spans[0].text : spans.map((s) => s.text).join('')) : v; },
      head,
      get name() {
        if (nm === undefined) { const t = head(NAME_MAX); nm = t.length > NAME_MAX ? null : t; }
        return nm;
      },
      spans,
      quoted: spans.some((s) => s.quote && s.quote !== 'escape'),
    }, spans.every((s) => !s.quote));
  };
  const endCommand = (f) => {
    endWord(f);
    if (f.redir) fail('redirect without a target');
    f.cmd = null;
    f.neg = false;
    f.after = false;
    f.timeOpt = false;
    f.fnDef = false;
  };
  const beginRedirect = (f, op, fd) => {
    if (f.redir) fail('redirect without a target');
    ensureCmd(f);
    const r = { op, fd, target: null };
    f.cmd.redirects.push(r);
    f.redir = r;
    f.redirHd = op === '<<' || op === '<<-';
  };

  // Reads the heredoc bodies that follow a newline at `pos`; returns the position after them. A body line
  // that ends in a backslash joins the next line, unless the delimiter was quoted. Each body is kept on its
  // redirect (`body`). The body of an unquoted-delimiter heredoc is read again with the double-quote rules and no closing
  // quote, because bash runs the `$(…)` and backtick groups in it; its commands join `cmds`.
  // Each body is also handed to its command (`fed`) as the text a shell would read, one subshell level down: `scan` reads it
  // as a command line when that command feeds its stdin to a shell. An unquoted delimiter's body loses the backslash before
  // `$`, a backtick, and a backslash first, as bash's expansion of it does.
  // Inside a `$( … )` or `<( … )`, a line that starts with the delimiter and a `)` also ends the body, and reading goes on at that `)`.
  const readHeredocs = (hds, pos) => {
    const top = st[st.length - 1];
    const inSub = top.sub === 'word';
    // Heredocs handed out of closed subshells may sit out of order (closeGroup); sorting an ordered list is one linear pass.
    if (hds.length > 1) hds.sort((a, b) => a.seq - b.seq);
    for (let k = 0; k < hds.length; k++) {
      const hd = hds[k];
      // A heredoc of this frame reads at the frame's own depth; one handed out of a closed subshell keeps the depth it was opened at.
      const own = hd.frame === top;
      const hdNest = own ? frameNest() : hd.nest;
      const hdGroup = own ? frameGroup() : hd.group;
      const hdFn = own ? inFn(top) : hd.fn;
      let body = '';
      let closed = -1;
      for (;;) {
        if (pos >= n) fail('heredoc without a delimiter line');
        const lineAt = pos;
        let line = '';
        let joined = false;
        for (;;) {
          const eol = src.indexOf('\n', pos);
          const part = eol < 0 ? src.slice(pos) : src.slice(pos, eol);
          pos = eol < 0 ? n : eol + 1;
          if (hd.quoted || eol < 0 || !continues(part)) { line += part; break; }
          line += part.slice(0, -1);
          joined = true;
        }
        const bare = hd.strip ? line.replace(/^\t+/, '') : line;
        if (bare === hd.delim) break;
        if (inSub && !joined && hd.delim !== '' && bare.startsWith(hd.delim + ')')) {
          if (k < hds.length - 1) fail('heredoc without a delimiter line');
          closed = lineAt + line.length - bare.length + hd.delim.length;
          break;
        }
        body += line + '\n';
      }
      if (closed >= 0) pos = closed;
      hd.redir.body = body;
      if (body !== '' && !hd.quoted) {
        // Every body re-read, at any nesting level, spends from the one budget of the whole scan.
        spendHeredoc(hdRead, body.length);
        run(body, cmds, queue, level, true, hdNest, hdRead, hdGroup, hd.at, hdFn, { pos: { pl: hd.cmd.pl, el: hd.cmd.el }, frame: null, id: null });
      }
      if (body !== '') {
        (hd.cmd.fed || (hd.cmd.fed = [])).push({ text: hd.quoted ? body : body.replace(/\\([$`\\])/g, '$1'), at: hd.at, nest: hdNest + 1, fn: hdFn, fd: hd.redir.fd });
      }
    }
    return pos;
  };

  // True when a word starting now in the command frame `f` is a command line to bash: the command word itself (past the `NAME=`
  // words and WRAPPER entries, `eval` included), or the argument of a known shell's `-c`.
  // simplicity: a command already holding more than 32 words is past its command word for this test, which keeps it linear.
  const atCommandWord = (f) => {
    if (f.arr || inPat(f) || (f.word && (f.word.plain !== '' || f.word.spans.length))) return false;
    const ws = f.cmd ? f.cmd.words : [];
    if (ws.length > 32) return false;
    const at = commandStart(ws);
    // Past the end: the word is the command word, or the value of a wrapper's option (`env -S`).
    if (at >= ws.length) return true;
    const last = nameText(ws[ws.length - 1]);
    return SHELLS.has(commandName(ws, at)) && last !== null && /^-[A-Za-z]*c$/.test(last);
  };
  const push = (f, frame, width) => {
    if (f.kind === 'cmd') beginWord(f);
    frame.fnIn = inFn(f);
    frame.pos = here(f);
    if (frame.kind === 'cmd') frame.root = { pos: frame.pos, frame: frame.sub === 'word' ? frame : null, id: null };
    st.push(frame);
    i += width;
  };
  // Pops a substitution, expansion, or arithmetic frame whose last character is at `end`.
  const popInner = (end) => {
    const g = st.pop();
    const p = st[st.length - 1];
    if (g.kind === 'cmd' && g.sub === 'group') { p.cmd = null; p.need = false; } else if (g.cmdForm) { p.cmd = null; p.after = !g.forForm; } else if (p.kind === 'cmd') addPlain(p, src.slice(g.start, end + 1));
  };
  const backtick = (f) => {
    let j = i + 1;
    while (j < n && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
    if (j >= n) fail('unclosed backtick');
    // In double quotes bash also strips the backslash of an escaped double quote.
    const group = ++groupSeq;
    queue.push({ text: src.slice(i + 1, j).replace(f.kind === 'dq' ? /\\([`\\$"])/g : /\\([`\\$])/g, '$1'), level, nest: frameNest() + 1, group, at: baseAt === undefined ? i : baseAt, fn: inFn(f),
      root: { pos: here(f), frame: null, id: group } });
    if (f.kind === 'cmd') { beginWord(f); addPlain(f, src.slice(i, j + 1)); }
    i = j + 1;
  };
  const dollar = (f) => {
    const d = src[i + 1];
    if (d === '(') {
      if (src[i + 2] === '(' && !arithFail.has(i)) { const a = newFrame('arith', i); push(f, a, 3); a.nc = cmds.length; a.nq = queue.length; return; }
      const s = newFrame('cmd', i);
      s.sub = 'word';
      // Its output is a command line when it opens the command word (`$(cat <<E …)`, `eval "$(…)"`) or a shell's `-c` argument.
      s.feeds = f.kind === 'cmd' ? atCommandWord(f) : f.kind === 'dq' && f.atCmd === true && i === f.start + 1;
      push(f, s, 2);
      // `feedOwner`: the command whose command line it is, which a bare `cat` in it hands its own stdin to (`sh -c "$(cat)"`).
      if (s.feeds) s.feedOwner = (f.kind === 'cmd' ? f.cmd : f.owner) || null;
    } else if (d === '{') push(f, newFrame('brace', i), 2);
    else if (d === '"' && f.kind === 'cmd') push(f, newFrame('dq', i + 1), 2); // a locale string reads as a double-quoted one
    else if (d === '$') {
      // `$$` is the PID parameter: it takes both dollars before a `$'` or `$(` can start.
      if (f.kind === 'cmd') { beginWord(f); addPlain(f, '$$'); }
      i += 2;
    } else if (d === "'" && f.kind === 'cmd') {
      let j = i + 2;
      while (j < n && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
      if (j >= n) fail('unterminated $\'');
      beginWord(f);
      addQuoted(f, decodeAnsi(src.slice(i + 2, j)), 'ansi');
      i = j + 1;
    } else if (d === '[' && f.kind === 'cmd' && bracketEnd(i + 1) > 0) {
      // Deprecated `$[ … ]` arithmetic, read like `$(( … ))`: its `>` is no redirect, and the substitutions and backtick groups it
      // holds are read, because bash runs them (`echo $[1+$(echo 2)]` prints 3).
      push(f, newFrame('bracket', i), 2);
    } else {
      if (f.kind === 'cmd') { beginWord(f); addPlain(f, '$'); }
      i++;
    }
  };
  // The offset of the `]` that closes the `[` at `k`, counting nested brackets, or -1 when none closes within BRACKET_SPAN characters.
  // It only decides whether `$[` opens arithmetic: the frame itself then reads the body, substitutions included.
  // simplicity: the span cap keeps a run of unclosed `$[` linear; a longer one reads as before, its `>` a redirect.
  const bracketEnd = (k) => {
    const stop = Math.min(n, k + BRACKET_SPAN);
    for (let depth = 0; k < stop; k++) {
      if (src[k] === '[') depth++;
      else if (src[k] === ']' && --depth === 0) return k;
    }
    return -1;
  };

  // An array body `(…)` follows a variable assignment, which comes before the command word or after a declaration builtin.
  const assignmentContext = (words) => words.every((w) => ASSIGN_WORD.test(w.value)) || (!words[0].quoted && words[0].value.length <= MAX_KEYWORD && DECLARERS.has(words[0].value));

  // Reads an arithmetic frame that did not close as `((…))` again the way bash falls back: `$(` and `(`
  // each hold a subshell. The start offset is remembered, so each start fails at most once, and the
  // characters a rewind reads again are counted: past RESCAN_FACTOR times the text's length the text is
  // unreadable, which keeps a nest of fallbacks linear.
  const rewindArith = (a) => {
    if (a.forForm) fail('arithmetic for does not close');
    rescanned += i - a.start;
    if (rescanned > RESCAN_FACTOR * n + RESCAN_FLOOR) fail('too many arithmetic fallbacks to read');
    st.pop();
    cmds.length = a.nc;
    queue.length = a.nq;
    arithFail.add(a.start);
    i = a.start;
    if (!a.cmdForm) {
      const s = newFrame('cmd', a.start);
      s.sub = 'word';
      s.pos = a.pos;
      s.root = { pos: a.pos, frame: s, id: null };
      st.push(s);
      i += 2;
    }
  };

  while (i < n) {
    const f = st[st.length - 1];
    const c = src[i];
    if (f.kind === 'dq') {
      if (c === '"' && heredocBody && st.length === 2) i++;
      else if (c === '"') {
        st.pop();
        const p = st[st.length - 1];
        if (p.kind === 'cmd') addDouble(p, f.start + 1, i);
        i++;
      } else if (c === '\\') i += 2;
      else if (c === '$') dollar(f);
      else if (c === '`') backtick(f);
      else { DQ_PLAIN.lastIndex = i; i += DQ_PLAIN.exec(src)[0].length; }
      continue;
    }
    if (f.kind === 'brace') {
      if (c === '}') { popInner(i); i++; } else if (c === '\\') i += 2;
      else if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) fail('unterminated quote in ${…}');
        i = j + 1;
      } else if (c === '"') { push(f, newFrame('dq', i), 1); } else if (c === '$') dollar(f);
      else if (c === '`') backtick(f);
      else { BRACE_PLAIN.lastIndex = i; i += BRACE_PLAIN.exec(src)[0].length; }
      continue;
    }
    if (f.kind === 'arith') {
      if (c === '(') { f.depth++; i++; } else if (c === ')') {
        if (f.depth > 0) { f.depth--; i++; } else if (src[i + 1] === ')') { popInner(i + 1); i += 2; } else rewindArith(f);
      } else if (c === '\\') i += 2;
      else if (c === "'") {
        // bash reads quotes inside `$(( … ))` and `(( … ))`: a quoted `)` closes nothing.
        const j = src.indexOf("'", i + 1);
        if (j < 0) fail('unterminated quote in arithmetic');
        i = j + 1;
      } else if (c === '"') push(f, newFrame('dq', i), 1);
      else if (c === '$') dollar(f);
      else if (c === '`') backtick(f);
      else { ARITH_PLAIN.lastIndex = i; i += ARITH_PLAIN.exec(src)[0].length; }
      continue;
    }
    if (f.kind === 'bracket') {
      if (c === '[') { f.depth++; i++; } else if (c === ']') {
        if (f.depth > 0) { f.depth--; i++; } else { popInner(i); i++; }
      } else if (c === '\\') i += 2;
      else if (c === "'") {
        // bash reads quotes inside `$[ … ]`: a quoted `]` closes nothing.
        const j = src.indexOf("'", i + 1);
        if (j < 0) fail('unterminated quote in $[…]');
        i = j + 1;
      } else if (c === '"') push(f, newFrame('dq', i), 1);
      else if (c === '$') dollar(f);
      else if (c === '`') backtick(f);
      else { BRACKET_PLAIN.lastIndex = i; i += BRACKET_PLAIN.exec(src)[0].length; }
      continue;
    }

    // A command frame: the root, `$(…)`, a process substitution, or a subshell.
    // A pattern-position word that ends here may be `esac`, which closes the case before this character reads.
    if (f.word && inPat(f) && ' \t\n;|)'.includes(c)) endWord(f);
    const pat = inPat(f);
    if (f.arr && ';&|<>('.includes(c)) fail('operator inside an array assignment');
    if (c === ' ' || c === '\t') { endWord(f); i++; } else if (c === '\n') {
      endWord(f);
      if (pat) {
        if (f.pat === 'sep') fail('newline inside a case pattern');
        i++;
      } else {
        if (f.redir) fail('redirect without a target');
        setSep(f, '\n');
        nextPipe(f);
        f.cmd = null;
        f.after = false;
        f.timeOpt = false;
        f.fnDef = false;
        f.neg = false;
        i++;
        if (f.hd.length) { i = readHeredocs(f.hd, i); f.hd = []; }
      }
    } else if (c === '#' && !f.word) {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else if (c === '\\' && src[i + 1] === '\n') i += 2;
    else if (c === '\\') {
      if (i + 1 < n) beginWord(f);
      if (i + 1 >= n) { if (f.word) addPlain(f, '\\'); i++; } else {
        const ch = String.fromCodePoint(src.codePointAt(i + 1));
        addQuoted(f, ch, 'escape');
        i += 1 + ch.length;
      }
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) fail('unterminated single quote');
      beginWord(f);
      addQuoted(f, src.slice(i + 1, j), 'single');
      i = j + 1;
    } else if (c === '"') {
      const d = newFrame('dq', i);
      d.atCmd = atCommandWord(f);
      push(f, d, 1);
      d.owner = f.cmd;
    } else if (c === '`') backtick(f);
    else if (c === '$') dollar(f);
    else if (c === ';') {
      if (pat) fail('; inside a case pattern');
      setSep(f, ';');
      endCommand(f);
      nextPipe(f);
      if (f.dbl) fail('; inside [[ ]]');
      if (f.need) fail('operator without a command');
      if (src[i + 1] === ';' || src[i + 1] === '&') {
        if (f.cases[f.cases.length - 1] !== 'body') fail(';; outside a case');
        f.cases[f.cases.length - 1] = 'pattern';
        f.pat = 'word';
        i += src[i + 1] === ';' && src[i + 2] === '&' ? 3 : 2;
      } else i++;
    } else if (c === '&') {
      if (pat || (f.dbl && f.dblDepth > 0)) { beginWord(f); addPlain(f, '&'); i++; } else if (src[i + 1] === '&') { setSep(f, '&&'); endCommand(f); nextPipe(f, true); f.need = true; i += 2; } else if (src[i + 1] === '>') {
        endWord(f);
        const op = src[i + 2] === '>' ? '&>>' : '&>';
        beginRedirect(f, op, null);
        i += op.length;
      } else {
        setSep(f, '&');
        endCommand(f);
        topPipe(f).job.bg = true;
        nextPipe(f);
        if (f.need) fail('operator without a command');
        i++;
      }
    } else if (c === '|') {
      if (pat) {
        endWord(f);
        if (f.pat !== 'sep') fail('empty case pattern');
        f.pat = 'word';
        i++;
      } else if (f.dbl && f.dblDepth > 0) { beginWord(f); addPlain(f, '|'); i++; } else {
        const op = src[i + 1] === '|' || src[i + 1] === '&' ? src.slice(i, i + 2) : '|';
        setSep(f, op);
        endCommand(f);
        if (op === '||') nextPipe(f, true); else topPipe(f).elem++;
        i += op.length;
        f.need = true;
      }
    } else if (c === '<' || c === '>') {
      if (pat || f.dbl) { beginWord(f); addPlain(f, c); i++; } else if (src[i + 1] === '(') {
        const s = newFrame('cmd', i);
        s.sub = 'word';
        push(f, s, 2);
        // A `<( … )` hands its output to the command it is a word or redirect target of (`sh < <(echo …)`). A command writing into a
        // `>( … )` is marked (`outPsub`): what it writes may reach a shell there (`cat <<E > >(sh)`), read failing closed.
        if (c === '<') s.psubOf = f.cmd;
        else if (f.cmd) f.cmd.outPsub = true;
      } else {
        REDIR_OP.lastIndex = i;
        const op = REDIR_OP.exec(src)[0];
        let fd = null;
        if (f.word && f.word.spans.length === 0 && /^\d+$/.test(f.word.plain)) { fd = f.word.plain; f.word = null; } else endWord(f);
        beginRedirect(f, op, fd);
        i += op.length;
      }
    } else if (f.dbl && (c === '(' || c === ')') && !(f.word && f.word.plain === ']]' && f.word.spans.length === 0)) {
      if (c === '(') f.dblDepth++; else if (f.dblDepth-- === 0) fail('unbalanced ) in [[ ]]');
      beginWord(f);
      addPlain(f, c);
      i++;
    } else if (c === '(') {
      if (pat) {
        if (f.word || f.pat !== 'word') fail('unexpected ( in a case pattern');
        i++;
      } else if (f.fnDef && !f.word) {
        FUNC_PARENS.lastIndex = i;
        const m = FUNC_PARENS.exec(src);
        if (!m) fail('a function name takes empty parens');
        f.fnDef = false;
        f.fnPend = true;
        cmds.compound = true;
        i += m[0].length;
      } else if (!f.word && f.cmd && f.cmd.words.length === 1 && f.cmd.redirects.length === 0 && src[i + 1] === '(' && !arithFail.has(i) && !f.cmd.words[0].quoted && f.cmd.words[0].value === 'for') {
        // An arithmetic for: `for ((…))`. Bash reads no subshell here, so a body that does not close is unreadable.
        const a = newFrame('arith', i);
        a.fnIn = inFn(f);
        a.cmdForm = true;
        a.forForm = true;
        a.nc = cmds.length;
        a.nq = queue.length;
        a.pos = here(f);
        f.cmd.drop = true;
        st.push(a);
        i += 2;
        f.cmd = null;
        f.need = false;
      } else if (!f.word && (!f.cmd || (f.cmd.words.length === 0 && f.cmd.redirects.length === 0) || (f.cmd.coName && f.cmd.words.length === 1 && f.cmd.redirects.length === 0))) {
        if (f.cmd && f.cmd.coName) { f.cmd.words.length = 0; f.cmd.drop = true; }
        cmds.compound = true;
        if (src[i + 1] === '(' && !arithFail.has(i)) {
          if (f.fnPend) { cmds.fnBare = true; f.fnPend = false; }
          const a = newFrame('arith', i);
          a.fnIn = inFn(f);
          a.cmdForm = true;
          a.nc = cmds.length;
          a.nq = queue.length;
          a.pos = here(f);
          st.push(a);
          i += 2;
        } else {
          const g = newFrame('cmd', i);
          g.sub = 'group';
          const t = topPipe(f);
          g.pls = [newPipe(t, t.elem)];
          g.pls[0].sub = g;
          g.neg = f.neg === true;
          g.ng = g.neg || f.ng || f.bsNeg > 0;
          g.fnIn = inFn(f) || f.fnPend;
          f.fnPend = false;
          st.push(g);
          i++;
        }
        f.neg = false;
        f.cmd = null;
        f.need = false;
      } else if (f.word && f.word.spans.length === 0 && ASSIGN_WORD.test(f.word.plain) && f.word.plain.endsWith('=') && assignmentContext(f.cmd.words)) {
        const s = newFrame('cmd', i);
        s.sub = 'array';
        s.arr = true;
        push(f, s, 1);
      } else {
        FUNC_PARENS.lastIndex = i;
        const m = FUNC_PARENS.exec(src);
        if (!m) fail('unexpected (');
        endWord(f);
        // A function definition is `name ()`: one word. (`function name ()` ends its word at the name, which sets `fnDef`.)
        if (f.fnDef) f.fnDef = false;
        else if (f.cmd && f.cmd.redirects.length === 0 && f.cmd.words.length === 1) { defineFn(f.cmd.words[0]); f.cmd.drop = true; f.cmd = null; } else fail('a function name is one word');
        f.fnPend = true;
        cmds.compound = true;
        i += m[0].length;
      }
    } else if (c === ')') {
      if (pat) {
        endWord(f);
        if (f.pat !== 'sep') fail('empty case pattern');
        f.cases[f.cases.length - 1] = 'body';
        i++;
      } else {
        endCommand(f);
        if (f.need) fail('operator without a command');
        if (f.cases.length) fail('unclosed case');
        if (f.dbl) fail('unclosed [[');
        if (f.hd.length && f.sub !== 'group') fail('heredoc without a delimiter line');
        if (st.length === 1) fail('unexpected )');
        st.pop();
        const p = st[st.length - 1];
        if (f.sub === 'group') {
          p.cmd = null; p.need = false; p.after = true; p.pend = f.last;
          // bash reads a closed subshell's heredoc bodies after the next newline (`(cat <<E) ; x`): the frame around it takes them over.
          // The shorter list joins the longer, so a nest of closing subshells moves each heredoc O(log n) times; readHeredocs restores the order.
          if (f.hd.length) {
            const [big, small] = p.hd.length >= f.hd.length ? [p.hd, f.hd] : [f.hd, p.hd];
            for (const h of small) big.push(h);
            p.hd = big;
          }
        } else if (p.kind === 'cmd') addPlain(p, src.slice(f.start, i + 1));
        i++;
      }
    } else {
      CMD_PLAIN.lastIndex = i;
      const m = CMD_PLAIN.exec(src)[0];
      beginWord(f);
      addPlain(f, m);
      i += m.length;
    }
  }

  if (heredocBody && st.length === 2) st.pop();
  if (st.length > 1) fail('unclosed quote, substitution, or subshell');
  const root = st[0];
  endCommand(root);
  if (root.need) fail('operator without a command');
  if (root.cases.length) fail('unclosed case');
  if (root.dbl) fail('unclosed [[');
  if (root.hd.length) fail('heredoc without a delimiter line');
}

// scan(command, { quoted }) -> { readable: true, commands, failedQuoted, texts } | { readable: false, reason, commands: [] }
// `texts` lists every heredoc body (as written, lines joined at backslash-newlines for an unquoted delimiter) and every `<<<`
// here-string's text of every command read, whatever command receives it, each as `{ text, cmd, alone }`: `cmd` is the receiving
// command's `{ words, redirects }`, and `alone` is true when that command stands alone on the line: read from the command itself
// (level 0), in the current shell (nest 0), outside a function body and any compound command or group, and piping into nothing.
// merge-guard applies its raw-text rule to each text a sink it names does not receive. A here-string's text is charged to the heredoc re-read budget before it is built.
// With `quoted: true` the value of every quoted word, and of every backslash-escaped word that escapes whitespace, an operator, a
// backtick, or a `$` (ESCAPED_LINE), not a redirect target, is read as a command line too, down to MAX_QUOTED_DEPTH, and so is that
// value's dash reading (dashReading) when it spreads a `((`. A quoted text that does not read as a command line leaves the scan
// readable and comes back in `failedQuoted`, a list of those texts (empty when none): `sh -c` runs the lines before a syntax
// error, so a caller applies its raw-text rule to each failed text, and only to those. A heredoc body a shell reads on stdin
// (feedsShell) is read as a command line at the level of its command, with or without `quoted`, and one that does not read as
// a command line comes back in `failedQuoted` the same way. With `quoted`, a `<<<` here-string, and the text an `echo` or
// `printf` writes (producerArgs), that a shell reads on stdin is read as quoted text too (`bash <<<"…"`, `echo git push | sh`,
// `sh < <(echo …)`); the contents of a file piped to a shell (`cat f | sh`) stay unknown. The whole scan is unreadable when a quoted word sits at the depth
// limit, or when the quoted words together exceed QUOTED_BUDGET_FACTOR times the command's length (plus a
// floor), which keeps the reading linear in the command's length.
function scan(command, opts = {}) {
  try {
    if (typeof command !== 'string') fail('not a string');
    const queue = [{ text: command, level: 0 }];
    const budget = QUOTED_BUDGET_FACTOR * command.length + QUOTED_BUDGET_FLOOR;
    let queued = 0;
    const hdRead = { used: 0, max: HEREDOC_REREAD_FACTOR * command.length + HEREDOC_REREAD_FLOOR };
    const all = [];
    const failedQuoted = [];
    const texts = [];
    let negation = false;
    let compound = false;
    let fnBare = false;
    const ctx = newIndirect();
    for (let q = 0; q < queue.length; q++) {
      const item = queue[q];
      const cmds = [];
      cmds.ctx = ctx;
      const queued0 = queue.length;
      try {
        run(item.text, cmds, queue, item.level, false, item.nest || 0, hdRead, item.group || 0, item.at, item.fn, item.root);
      } catch (e) {
        // A quoted text, or a heredoc body a shell reads, that is no command line goes to the caller; the commands it held are dropped.
        if (!(e instanceof Unreadable) || e instanceof Exhausted || (item.level === 0 && !item.fed)) throw e;
        queue.length = queued0;
        failedQuoted.push(item.text);
        continue;
      }
      if (item.level === 0) {
        if (cmds.negation) negation = true;
        if (cmds.compound) compound = true;
        if (cmds.fnBare) fnBare = true;
      }
      noteIndirect(ctx, cmds);
      for (const c of cmds) {
        // Every heredoc body and here-string text, whatever command receives it. A here-string's text is charged to the heredoc re-read
        // budget before it is built, so a nest of here-strings stays linear.
        if (c.redirects.length) {
          const alone = !c.drop && c.level === 0 && c.nest === 0 && !c.fn && c.pl.up === null && c.sep !== '|' && c.sep !== '|&';
          const cmd = { words: c.words, redirects: c.redirects };
          for (const r of c.redirects) {
            if (r.body) texts.push({ text: r.body, cmd, alone });
            else if (r.op === '<<<') {
              spendHeredoc(hdRead, r.target.raw.length);
              texts.push({ text: r.target.value, cmd, alone });
            }
          }
        }
        if (c.drop || (c.words.length === 0 && c.redirects.length === 0)) continue;
        all.push({ words: c.words, redirects: c.redirects, level: c.level, nest: c.nest, group: c.group, at: c.at, sep: c.sep, negated: c.negated, fn: c.fn,
          inst: instAt({ pl: c.pl, el: c.el }) });
        // A heredoc body a shell reads is a command line at the level of the command that holds it (#1016).
        // A numbered heredoc (`3<<E`, `exec 3<<E`) reaches a shell too when a shell of the line reads that descriptor (noteIndirect).
        if (c.fed) {
          const fed = feedsShell(c);
          for (const b of c.fed) {
            if (!fed && !(b.fd !== null && ctx.fds.has(b.fd))) continue;
            spendHeredoc(hdRead, b.text.length);
            const group = ++groupSeq;
            queue.push({ text: b.text, level: item.level, nest: b.nest, group, at: b.at, fn: b.fn, fed: true, root: { pos: { pl: c.pl, el: c.el }, frame: null, id: group } });
          }
        }
        if (!opts.quoted) continue;
        // The budget is charged before a text is built, so a text past it is never built. Each text is read as dash reads it too
        // (dashReading), charged again, so a `((` escaped for any shell level opens subshells at the level that unescapes it.
        const charge = (cost) => {
          queued += cost;
          if (queued > budget) fail('quoted text too large to read as command lines');
        };
        const readAsCommand = (text, cost) => {
          if (item.level >= MAX_QUOTED_DEPTH) fail(`quoted text nested deeper than ${MAX_QUOTED_DEPTH}`);
          charge(cost);
          const t = text();
          queue.push({ text: t, level: item.level + 1 });
          const dash = dashReading(t);
          if (dash === null) return;
          charge(cost);
          queue.push({ text: dash, level: item.level + 1 });
        };
        for (const w of c.words) {
          // A backslash-escaped word is quoted text to a shell that reads it again (`dash -c git\ push`), though not `quoted`. One whose
          // escaped characters hold no whitespace, operator, backtick, or `$` (ESCAPED_LINE) is one word to that shell too, so a run of
          // backslashes (`\\\\n`, `\\\\$`) adds no level.
          if (!w.quoted && !w.spans.some((s) => s.quote === 'escape' && ESCAPED_LINE.test(s.text))) continue;
          readAsCommand(() => w.value, w.raw.length);
          // An unquoted `NAME=` or command-string option prefix joins the text (`alias g='git push'`, `su -c'…'`), so the text past it is read too.
          const pre = w.spans[0].quote === null && w.spans[0].text.length <= 4096 ? QUOTED_PREFIX.exec(w.spans[0].text) : null;
          if (pre) readAsCommand(() => w.value.slice(pre[0].length), w.raw.length);
        }
        // A here-string, and the text an `echo` or `printf` writes, that reaches a shell on stdin is quoted text a shell reads.
        const produced = producerArgs(c.words);
        const strings = c.redirects.filter((r) => r.op === '<<<');
        if ((produced || strings.length) && feedsShell(c)) {
          for (const r of strings) readAsCommand(() => r.target.value, r.target.raw.length);
          if (produced) {
            const cost = produced.reduce((sum, w) => sum + w.raw.length + 1, 0);
            let text = '';
            readAsCommand(() => (text = produced.map((w) => w.value).join(' ')), cost);
            if (text.includes('\\')) readAsCommand(() => decodeAnsi(text), cost);
          }
        }
      }
    }
    return { readable: true, commands: all, failedQuoted, texts, negation, compound, fnBare, fns: ctx.fns };
  } catch (e) {
    return { readable: false, reason: e instanceof Unreadable ? e.message : `scan failed: ${e && e.message}`, commands: [] };
  }
}

const RTK_RUNNERS = new Set(['proxy', 'err', 'run', 'summary', 'test']);
const GIT_VALUE_OPTS = new Set(['-C', '-c']);
const GIT_LONG_VALUE_OPTS = new Set(['--git-dir', '--work-tree', '--namespace', '--config-env', '--shallow-file', '--attr-source']);

// gitSubcommand(words) -> { subcommand, values, options, index, alias } | null
// Reads past `rtk` (its options and a run-anything subcommand), `git`, and git's global options.
// `subcommand` is the first word after them (null when none), `values` the values the options took,
// `options` those value-taking options as `{ name, value }` in order (`value` null when the word ended the command), `index`
// the subcommand's position in `words` (-1 when none), and `alias` the value of a `-c alias.<subcommand>=…` defining the
// subcommand inline (null when none).
// `words` holds Word objects or plain strings. A command that is not a git command reads as null.
function gitSubcommand(words) {
  const v = (w) => (typeof w === 'string' ? w : w.value);
  let i = 0;
  while (i < words.length && ASSIGN_WORD.test(v(words[i]))) i++;
  // `rtk` repeats (an rtk behind an rtk), and its run-anything subcommand takes value-less options of its own.
  while (i < words.length && v(words[i]) === 'rtk') {
    i++;
    while (i < words.length && v(words[i]).startsWith('-')) i++;
    if (i < words.length && RTK_RUNNERS.has(v(words[i]))) {
      i++;
      while (i < words.length && v(words[i]).startsWith('-')) i++;
    }
  }
  if (i >= words.length || !/(^|\/)git$/.test(v(words[i]))) return null;
  i++;
  const values = [];
  const options = [];
  const take = (name, value) => { if (value !== undefined) values.push(value); options.push({ name, value: value === undefined ? null : value }); };
  while (i < words.length) {
    const w = v(words[i]);
    if (GIT_VALUE_OPTS.has(w)) {
      take(w, i + 1 < words.length ? v(words[i + 1]) : undefined);
      i += 2;
    } else if (w.startsWith('--') && GIT_LONG_VALUE_OPTS.has(w.split('=')[0])) {
      if (w.includes('=')) { take(w.split('=')[0], w.slice(w.indexOf('=') + 1)); i++; } else {
        take(w, i + 1 < words.length ? v(words[i + 1]) : undefined);
        i += 2;
      }
    } else if (w.startsWith('-')) i++;
    else return { subcommand: w, values, options, index: i, alias: inlineAlias(options, w) };
  }
  return { subcommand: null, values, options, index: -1, alias: null };
}
// The value of the last `-c alias.<name>=<value>` option defining the subcommand `name` (git compares the name case-insensitively),
// or null when none does: `git -c alias.p=push p` runs `git push`, and a value starting with `!` runs as a shell command.
function inlineAlias(options, name) {
  const key = 'alias.' + name.toLowerCase() + '=';
  let alias = null;
  for (const o of options) if (o.name === '-c' && o.value !== null && o.value.slice(0, key.length).toLowerCase() === key) alias = o.value.slice(key.length);
  return alias;
}

// Prefix wrappers, shared by the Bash hooks: each runs the command that follows its own options. The value is the set of
// options, short and long, that take a separate value. ledger-guard.js skips every one before it reads a command word;
// run-trace.js reads a test run behind the names its own WRAPPERS pattern lists.
const WRAPPER = new Map([
  ['sudo', new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-T', '-U', '-D', '-R', '--user', '--group', '--host', '--prompt', '--role', '--type',
    '--other-user', '--close-from', '--chdir', '--chroot', '--login-class'])],
  ['env', new Set(['-u', '-C', '-S', '-P', '-a', '--unset', '--chdir', '--split-string', '--argv0'])],
  ['xargs', new Set(['-n', '-I', '-J', '-R', '-S', '-P', '-L', '-d', '-a', '-s', '-E', '--max-args', '--max-procs', '--max-lines', '--max-chars', '--delimiter',
    '--arg-file', '--process-slot-var'])],
  ['nice', new Set(['-n', '--adjustment'])],
  ['nohup', new Set()],
  ['command', new Set()],
  ['time', new Set()],
  ['timeout', new Set(['-s', '-k', '--signal', '--kill-after'])],
  ['exec', new Set(['-a'])],
  ['doas', new Set(['-u', '-C'])],
  ['stdbuf', new Set(['-i', '-o', '-e', '--input', '--output', '--error'])],
  ['builtin', new Set()],
  ['eval', new Set()],
  ['rtk', new Set()],
  // macOS `arch` takes single-dash words that are no getopt clusters (`-arm64`, `-x86_64`, `-arch NAME`): `exact` reads each whole.
  ['arch', Object.assign(new Set(['-arch', '-d', '-e']), { exact: true })],
  ['caffeinate', new Set(['-t', '-w'])],
  ['flock', new Set(['-w', '--wait', '--timeout', '-E', '--conflict-exit-code'])],
  ['chronic', new Set()],
  ['unbuffer', new Set()],
  ['ionice', new Set(['-c', '--class', '-n', '--classdata', '-p', '--pid', '-P', '--pgid', '-u', '--uid'])],
  ['taskset', new Set()],
]);
// The wrappers that take one operand after their options and before the command: flock's lock file (or descriptor) and
// taskset's CPU mask or list. (`timeout` takes its duration, read in commandStart.)
const OPERAND_WRAPPERS = new Set(['flock', 'taskset']);
// optionWords(word, valueOpts) -> 1 or 2
// The words an option word takes, read as getopt reads it: a long option takes the next word when it is a value option. A short
// cluster is walked left to right to its first value option, whose value is the characters after it (`sudo -uroot`, one word) or,
// when it ends the cluster (`sudo -iu bob`), the next word. A table marked `exact` (arch) reads every option word whole.
function optionWords(w, valueOpts) {
  if (w.startsWith('--') || valueOpts.exact) return valueOpts.has(w) ? 2 : 1;
  const at = [...w.slice(1)].findIndex((c) => valueOpts.has('-' + c));
  return at < 0 || at + 2 < w.length ? 1 : 2;
}

// rawNamesVerb(text, verbRe, leadRe) -> boolean
// The raw-text rule for a command the scanner cannot read: a word `leadRe` matches (the word `git` by default), then later
// a word `verbRe` matches (a regex with word boundaries, such as /(?<![-\w])merge(?![-\w])/). One search for the first
// lead word, then one for a verb after it, so the test stays linear. A global or sticky regex is read without its flags,
// so no `lastIndex` carries from one call to the next.
const GIT_WORD = /(?<![-\w])git(?![-\w])/;
const stateless = (re) => (re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re);
function rawNamesVerb(text, verbRe, leadRe = GIT_WORD) {
  const g = stateless(leadRe).exec(text);
  return Boolean(g) && stateless(verbRe).test(text.slice(g.index + g[0].length));
}

// commandStart(words, from = 0) -> index
// The index of the command word: past `NAME=value` words, every prefix wrapper of WRAPPER with its options (and `timeout`'s
// duration, flock's lock file, and taskset's CPU mask), and `rtk` with its options and a run-anything subcommand (RTK_RUNNERS) with its own. `words` holds Word objects
// or plain strings; only the words from `from` on are read, and only the leading ones of those.
// A Word is read by its capped name (nameText), so its whole value is never built here: a nest of long words (`"$( "$( …`) costs
// linear time, and a short name spelled in many raw characters (`env''''…`) is still that name. A Word whose value is longer than any
// name is no name and no option, and is an assignment when its raw text starts like one.
function commandStart(words, from = 0) {
  const v = (w) => nameText(w) || '';
  let i = from;
  while (i < words.length) {
    const w = nameText(words[i]);
    if (ASSIGN_WORD.test(w === null ? words[i].raw : w)) { i++; continue; }
    // No wrapper name is this long, so a long word (a nested substitution) is never copied for a lookup.
    const name = w === null || w.length > 64 ? '' : w.replace(/^.*\//, '');
    const opts = WRAPPER.get(name);
    if (!opts) break;
    i++;
    while (i < words.length && v(words[i]).startsWith('-')) i += optionWords(v(words[i]), opts);
    if (name === 'timeout' && /^\d/.test(i < words.length ? v(words[i]) : '')) i++;
    else if (OPERAND_WRAPPERS.has(name)) i++;
    if (name === 'rtk' && i < words.length && RTK_RUNNERS.has(v(words[i]))) {
      i++;
      while (i < words.length && v(words[i]).startsWith('-')) i++;
    }
  }
  return i;
}
// A word's text where it may be a command name, a wrapper, an option, an alias, or a function name: a Word's `name`, its value read
// from a capped prefix of its spans, or null when the value is longer than NAME_MAX characters, which no name is.
const nameText = (w) => (typeof w === 'string' ? w : w.name);

// The name of a command's command word (past commandStart, without its path), or '' when none or longer than any name.
function commandName(words, at = commandStart(words)) {
  if (at >= words.length) return '';
  const w = nameText(words[at]);
  return w === null || w.length > 64 ? '' : w.replace(/^.*\//, '');
}
const STDIN_FILES = new Set(['/dev/stdin', '/dev/fd/0']);
const SHELL_VALUE_OPT = /^(?:[-+][A-Za-z]*[oO]|--rcfile|--init-file)$/;

// shellReader(words) -> boolean
// True when the command runs a known shell (SHELLS, at any path, behind any WRAPPER entry) that reads its commands from stdin:
// no `-c`, and no script operand or `-s` (`bash`, `bash -s -- a`); a script operand of /dev/stdin or /dev/fd/0 counts as stdin.
// `source` and `.` of /dev/stdin or /dev/fd/0 read stdin too.
function shellReader(words) {
  const v = (w) => nameText(w) || '';
  const at = commandStart(words);
  const name = commandName(words, at);
  if (name === 'source' || name === '.') return at + 1 < words.length && STDIN_FILES.has(v(words[at + 1]));
  if (!SHELLS.has(name)) return false;
  let stdin = false;
  let k = at + 1;
  for (; k < words.length; k++) {
    const w = nameText(words[k]);
    if (w === null || w.length > NAME_MAX) break;
    if (w === '--' || w === '-') { k++; break; }
    if (/^[-+][A-Za-z]+$/.test(w)) {
      if (w[0] === '-' && w.includes('c')) return false;
      if (w[0] === '-' && w.includes('s')) stdin = true;
      if (SHELL_VALUE_OPT.test(w)) k++;
    } else if (w.startsWith('--')) { if (SHELL_VALUE_OPT.test(w)) k++; } else break;
  }
  return stdin || k >= words.length || STDIN_FILES.has(v(words[k]));
}

// True when `p`, the command a `<( … )` belongs to, runs what it reads as a command line: a known shell without `-c`, `source`, or `.`.
// The answer is kept on `p` (`psh`), so a command holding many `<( … )` reads its words once.
function psubShell(p) {
  if (p.psh !== undefined) return p.psh;
  const at = commandStart(p.words);
  const name = commandName(p.words, at);
  if (name === 'source' || name === '.') return (p.psh = true);
  return (p.psh = SHELLS.has(name) && !p.words.slice(at + 1).some((w) => /^-[A-Za-z]*c/.test(nameText(w) || '')));
}

// xargsShell(words) -> boolean
// True when the command runs a known shell behind `xargs`, whatever the options of either (`xargs sh -c`, `xargs -I{} bash -c {}`):
// xargs builds the shell's arguments from what it reads on stdin, so that text reaches the shell. Fails closed.
function xargsShell(words) {
  const at = commandStart(words);
  if (!SHELLS.has(commandName(words, at))) return false;
  for (let k = 0; k < at; k++) {
    const w = nameText(words[k]);
    if (w !== null && w.length <= 64 && w.replace(/^.*\//, '') === 'xargs') return true;
  }
  return false;
}

// True when the scanned command `c` is a stdin-reading shell (shellReader) or a shell behind `xargs` (xargsShell), read once and kept
// on `c` (`reads`). Two shapes count as one, failing closed: a command writing into a `>( … )` (`outPsub`: `cat <<E > >(sh)`,
// `tee >(sh)`), and a command whose command line a bare `cat` builds from its stdin (`stdinShell`: `sh -c "$(cat)"`, `eval "$(cat)"`).
const reads = (c) => (c.reads === undefined ? (c.reads = !c.drop && (c.outPsub === true || c.stdinShell === true || shellReader(c.words) || xargsShell(c.words))) : c.reads);

// The shells a command line reaches indirectly, gathered over the whole scan (`ctx`): `aliases`, the names an `alias` gives a value
// naming a known shell; `fns`, the names of the functions the line defines (run() adds each at its header); `fnShell`, true when a
// function body holds a stdin-reading shell; `fds`, the descriptors a known shell, `source`, or `.` reads through `<&N`, `0<&N`,
// `< /dev/fd/N`, or a `/dev/fd/N` word; `callers`, the commands that call a defined function, of which the first `seen` were asked
// whether they feed a shell, and `fnFed`, true once one does.
// simplicity: a definition in a text read later (a backtick body, a quoted word, a shell-fed body) reaches only the texts read after
// it, so a call read before it is missed, which fails open; merge-guard denies a heredoc body or here-string text by its own words
// (`texts`), so ledger-guard, the run trace, and `echo`/`printf` text a shell reads depend on it. An alias or function counts
// wherever it sits on the line and whichever function holds the heredoc, which fails closed.
const newIndirect = () => ({ aliases: new Set(), fns: new Set(), fnShell: false, fds: new Set(), callers: [], seen: 0, fnFed: false });
const nameOf = (c) => (c.name === undefined ? (c.name = commandName(c.words)) : c.name);
// The characters of an `alias` argument read: its name, the `=`, and enough of its value for a wrapped shell (`env A=1 /bin/bash -s`).
const ALIAS_HEAD = 512;
const DEV_FD = /^\/dev\/fd\/(\d+)$/;
// A descriptor a `<&` duplicates, or moves (`<&3-`).
const FD_WORD = /^(\d+)-?$/;
// noteIndirect(ctx, cmds)
// Reads each command of one text into `ctx` once, before any of them asks whether it feeds a shell. A bare `cat` in a `$( … )` whose
// output is a command line marks the command that `$( … )` belongs to (`stdinShell`) first, before any `reads` is kept.
function noteIndirect(ctx, cmds) {
  for (const c of cmds) if (c.feedOwner && !c.drop && c.words.length === 1 && nameOf(c) === 'cat') c.feedOwner.stdinShell = true;
  for (const c of cmds) {
    if (c.drop) continue;
    const name = nameOf(c);
    if (name === 'alias') {
      // Each argument is read from a capped prefix (ALIAS_HEAD), so a nest of `alias a="$( alias …` costs linear time. A value too long
      // to read whole names a shell: the reading fails closed.
      for (const w of c.words.slice(commandStart(c.words) + 1)) {
        const t = w.head(ALIAS_HEAD);
        const eq = t.indexOf('=');
        if (eq <= 0 || eq > NAME_MAX) continue;
        if (t.length > ALIAS_HEAD || SHELLS.has(commandName(t.slice(eq + 1).split(/\s+/).filter(Boolean)))) ctx.aliases.add(t.slice(0, eq));
      }
    }
    if (c.fn && reads(c)) ctx.fnShell = true;
    if (SHELLS.has(name) || name === 'source' || name === '.') {
      for (const r of c.redirects) {
        if (r.fd !== null && r.fd !== '0') continue;
        const v = nameText(r.target) || '';
        const m = r.op === '<' ? DEV_FD.exec(v) : r.op === '<&' ? FD_WORD.exec(v) : null;
        if (m) ctx.fds.add(m[1]);
      }
      for (const w of c.words) {
        const m = DEV_FD.exec(nameText(w) || '');
        if (m) ctx.fds.add(m[1]);
      }
    }
    if (ctx.fns.has(name)) ctx.callers.push(c);
  }
}
// True when `c` reads its stdin as a command line: a stdin-reading shell or a shell behind `xargs` (reads), or a call of an alias
// naming a known shell or of a function whose body holds a stdin-reading shell (`alias s=sh; cat <<E | s`, `f() { sh; }; cat <<E | f`).
const reader = (c) => reads(c) || (!c.drop && c.ctx !== undefined && (c.ctx.aliases.has(nameOf(c)) || (c.ctx.fnShell && c.ctx.fns.has(nameOf(c)))));

// shellAt(pl) -> element index
// The last element of the pipeline `pl` that is or holds a stdin-reading shell, -1 when none: a command of `pl` at that element
// reads stdin as a shell (reader), or a pipeline inside that element holds one at any element. Each pipeline is read once, kept as `shell`,
// and only when a command asks whether it feeds a shell; a nest of compound elements is walked with an explicit stack.
function shellAt(pl) {
  if (pl.shell !== undefined) return pl.shell;
  const order = [];
  for (const todo = [pl]; todo.length;) {
    const p = todo.pop();
    order.push(p);
    for (const k of p.kids) if (k.shell === undefined) todo.push(k);
  }
  // Every pipeline comes after the one holding it in `order`, so walking it backwards reads the inner ones first.
  for (let j = order.length - 1; j >= 0; j--) {
    const p = order[j];
    let s = -1;
    for (const c of p.list) if (c.el > s && reader(c)) s = c.el;
    for (const k of p.kids) if (k.upEl > s && k.shell >= 0) s = k.upEl;
    p.shell = s;
  }
  return pl.shell;
}
// pipeFed(pl) -> boolean
// True when the element holding the pipeline `pl`, in any pipeline around it, comes before an element of that pipeline that is or
// holds a stdin-reading shell. The answer is kept on each pipeline (`fi`), so a deep nest of compound elements is walked once.
function pipeFed(pl) {
  const chain = [];
  for (let p = pl; p && p.fi === undefined; p = p.up) chain.push(p);
  for (let j = chain.length - 1; j >= 0; j--) {
    const p = chain[j];
    p.fi = p.up !== null && (p.upEl < shellAt(p.up) || p.up.fi);
  }
  return pl.fi;
}

// feedsShell(c) -> boolean
// True when what the scanned command `c` reads on stdin, or writes, reaches a shell as a command line: `c` is a stdin-reading shell
// (reader: a shell, a shell behind `xargs`, or a call of an alias or function that runs one), a `cat` reading stdin inside a `$( … )`
// whose output is a command line, a command inside a `<( … )` a shell reads, or a command whose pipeline element comes before an
// element that is or holds a stdin-reading shell (`cat <<E | sh`, `{ cat <<E; } | sh`, `cat <<E | (bash)`), in its own pipeline or
// in any pipeline around a compound element that holds it. A command in a function body feeds a shell too when a call of a defined
// function does (`f() { cat <<E; }; f | sh`).
// simplicity: a shell anywhere in a later element counts, even one that reads another pipe (`cat <<E | (echo a | sh)`): the reading
// fails closed.
function feedsShell(c) {
  if (feedsDirect(c)) return true;
  if (!c.fn || c.ctx === undefined) return false;
  // Each call is asked once over the whole scan, so many function bodies cost no rescan of the calls.
  const ctx = c.ctx;
  while (!ctx.fnFed && ctx.seen < ctx.callers.length) ctx.fnFed = feedsDirect(ctx.callers[ctx.seen++]);
  return ctx.fnFed;
}
function feedsDirect(c) {
  if (reader(c)) return true;
  if (c.feeds && commandName(c.words) === 'cat') return true;
  if (c.psubOf && psubShell(c.psubOf)) return true;
  return c.el < shellAt(c.pl) || pipeFed(c.pl);
}

// producerArgs(words) -> [Word] | null
// The argument words of an `echo` or `printf` command, whose text (the words joined with spaces) is what it writes: past `echo`'s
// `-n`/`-e`/`-E` flags and `printf`'s `--`. `scan` reads that text, and the text with its escapes decoded when it holds a backslash
// (`printf 'true\ngit push'`, `echo -e`). null for any other command and for `printf -v`, which writes a variable.
function producerArgs(words) {
  const at = commandStart(words);
  const name = commandName(words, at);
  if (name !== 'echo' && name !== 'printf') return null;
  const flag = (k) => (k < words.length && nameText(words[k])) || '';
  let k = at + 1;
  if (name === 'echo') while (/^-[neE]+$/.test(flag(k))) k++;
  else if (flag(k) === '-v') return null;
  else if (flag(k) === '--') k++;
  return words.slice(k);
}

// dashReading(command) -> text | null
// The command as dash reads it: bash reads `((…))` as arithmetic, dash a run of two or more `(` that is no `$((` as nested subshells.
// Each such run, unquoted, in a quoted word, or in a heredoc body, is spread (`((` becomes `( (`), and a run of escaped parens
// (`\(\(`) is spread with an escaped space (`\(\ \(`), so the re-read text of an escaped word opens subshells too. `))` stays, which
// keeps `$((1 + 2))` whole. One linear pass, after backslash-newlines are joined. null when no run is spread. The Bash guards scan
// both the command and this reading, and a verdict that denies, or a candidate found, in either counts. `scan` with `quoted` reads
// each quoted text it re-reads this way too, so a `((` escaped for a deeper shell level is spread at the level that unescapes it.
const DASH_RUN = /(?<![$(\\])\\?\((?:\\?\()+/g;
function dashReading(command) {
  const text = command.replace(/\\\n/g, '');
  const dash = text.replace(DASH_RUN, (run) => {
    const parens = run.match(/\\?\(/g);
    return parens.join(parens[0].length === 2 ? '\\ ' : ' ');
  });
  return dash === text ? null : dash;
}

// A Git Bash drive path (`/c/Users/x`) as the Windows path (`C:/Users/x`) on win32 (ADR 0150). MSYS converts
// such a path for the programs it starts, but a hook reads the raw command text. Only `/<letter>` followed by
// `/` or the end translates; every other path (`/tmp/x`, `/dev/null`, `/cc/x`) and every other platform keeps it.
function drivePath(p, platform = process.platform) {
  const m = platform === 'win32' && /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] || '/'}` : p;
}

module.exports = { scan, gitSubcommand, inlineAlias, rawNamesVerb, commandStart, WRAPPER, optionWords, MAX_QUOTED_DEPTH, dashReading, drivePath };
