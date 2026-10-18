'use strict';

// command-keys.js: turns one Bash call's command text into the grouping keys of the commands it ran,
// through a line-based shell scanner (ADR 0103, ADR 0143).

// The count of consecutive backslashes immediately before position `i`. An odd count means the
// character at `i` is escaped (the last backslash of the run escapes it); an even count means every
// backslash escaped another backslash, so the character at `i` is not.
function backslashRun(line, i) {
  let n = 0;
  i -= 1;
  while (i >= 0 && line[i] === '\\') { n += 1; i -= 1; }
  return n;
}

// Whether the character at `i` is escaped, given the quote (or null outside any quote) it sits in:
// only an odd backslash run escapes it, and a single-quoted string has no escapes. Every scanner of a
// command's quotes asks this one question, so they agree on where a quote opens and closes.
const isEscaped = (line, i, quote) => quote !== "'" && backslashRun(line, i) % 2 === 1;

// Scans one line of a command, given the quote (if any) still open from a previous line, and returns
// the text worth keeping from it, the quote left open at its end (if any), and the heredoc terminator
// a `<<WORD` on it opened (if any). A quote already open when this line starts drops the whole line
// unless it closes on it, since that line is the quoted argument's own body; a quote that opens and
// stays open on this line keeps the whole line as kept text (a later line's own scan drops its body
// instead), and once a quote closes — same line or a later one — scanning resumes right after the
// closing quote, so real code past a closing quote is never lost with it
// (`git commit -m "…\nbody" && git log …`). A run of backslashes escapes the character after it only
// when the run's length is odd — `\\"` is an escaped backslash followed by the real closing quote, not
// an escaped quote — except inside a single-quoted string, where the shell has no escapes. A `#` at a
// word start outside any quote starts a comment that drops the rest of the line. A `<<WORD` heredoc
// operator is recognized inside a double-quoted string only where a `$(` opened earlier in that same
// quoted span and has not yet closed, since a `$(...)` command substitution can open a heredoc there
// (`"$(cat <<'EOF' … EOF )"`) — plain quoted text such as `"use <<EOF here"` opens no heredoc, and a
// single-quoted string never does, since the shell never runs either as code.
function scanLine(line, quoteIn) {
  const n = line.length;
  let quote = quoteIn;
  let bodyStart = 0;
  if (quote !== null) {
    let i = 0;
    while (i < n) {
      const escaped = isEscaped(line, i, quote);
      if (line[i] === quote && !escaped) { i += 1; quote = null; break; }
      i += 1;
    }
    if (quote !== null) return { kept: '', quote, heredocTerm: null };
    bodyStart = i;
  }
  let heredocTerm = null;
  let cutAt = n;
  let paren = 0; // unmatched `$(` seen so far inside the double-quoted span currently open
  for (let i = bodyStart; i < n; i += 1) {
    const c = line[i];
    const escaped = isEscaped(line, i, quote);
    if (quote === "'") {
      if (c === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (c === '"' && !escaped) { quote = null; continue; }
      if (c === '$' && line[i + 1] === '(') { paren += 1; continue; }
      if (c === ')' && paren > 0) { paren -= 1; continue; }
      if (paren > 0 && c === '<' && line[i + 1] === '<') {
        const m = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line.slice(i));
        if (m) { heredocTerm = m[2]; break; }
      }
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) { cutAt = i; break; }
    if ((c === "'" || c === '"') && !escaped) { quote = c; paren = 0; continue; }
    if (c === '<' && line[i + 1] === '<') {
      const m = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line.slice(i));
      if (m) { heredocTerm = m[2]; break; }
    }
  }
  return { kept: line.slice(bodyStart, cutAt), quote, heredocTerm };
}

// Drops the body lines of a heredoc (`<<[-]?['"]?WORD['"]?` through the line that is exactly WORD) and
// of a quoted argument that spans several lines, so a `\n`-split below never turns one of those lines
// into its own statement. A small line-based scanner, not a shell parser: it does not track `$(...)`
// command substitution, or a heredoc/quote opened after another already-open one on the same line.
function stripMultilineBodies(command) {
  const out = [];
  const open = []; // whether a quote is still open at the end of each kept line
  let heredocTerm = null;
  let quote = null;
  for (const line of command.split('\n')) {
    if (heredocTerm !== null) {
      if (line.trim() === heredocTerm) heredocTerm = null;
      out.push('');
      open.push(false);
      continue;
    }
    const r = scanLine(line, quote);
    out.push(r.kept);
    quote = r.quote;
    open.push(quote !== null);
    heredocTerm = r.heredocTerm;
  }
  // A backslash-newline continues the statement: the next line joins this one. A line that leaves a
  // quote open ends inside a quoted argument, where the backslash-newline belongs to the quoted text,
  // so only a line with no open quote joins the next.
  const joined = [];
  let joinable = false;
  out.forEach((line, i) => {
    if (joinable) joined[joined.length - 1] = joined[joined.length - 1].slice(0, -1) + ' ' + line;
    else joined.push(line);
    const last = joined[joined.length - 1];
    joinable = !open[i] && backslashRun(last, last.length) % 2 === 1;
  });
  return joined.join('\n');
}

// The interpreters whose own argument names the real work: grouping every call under the bare program
// name collapses `node tests/profile.test.js`, `node plugin/scripts/profile.js`, and every `node -e`
// one-liner into a single `node` row.
const INTERPRETERS = new Set(['node', 'python3', 'python', 'bun', 'deno', 'ruby', 'bash', 'sh']);
// The `scope.js test` modes, each its own row in the repeated-commands table.
const TEST_MODES = new Set(['full', 'whole', 'focused', '--']);

// Shell keywords that never name a command themselves: a leading one is dropped from its statement, so
// the real command after it (`do bun run test`) keys on that command instead of on the keyword, and a
// statement left with nothing after the drop (`done`, a lone `}`) keys nothing at all. `for`, `select`
// and `case` are absent: their headers key nothing, and `commandKeys` handles them itself.
const SHELL_KEYWORDS = new Set([
  'while', 'until', 'do', 'done', 'if', 'then', 'elif', 'else', 'fi', 'esac', '{', '}', '(', ')',
]);

// Statements whose words are not a command: a `for`/`select` header names a loop variable and its
// list, and a `case … in` header names the word matched. Their bodies are statements of their own.
const HEADER_KEYWORDS = new Set(['for', 'select']);

// A version-numbered directory in an absolute path — the shape a plugin cache installs a script under
// (`…/superdev/0.41.0/scripts/scope.js`) — keys by its path past that directory, so a script run from
// two plugin versions groups under the same key rather than splitting one row per version.
function normalizeScriptArg(arg) {
  const m = /^.*\/\d+\.\d+\.\d+\/(.+)$/.exec(arg);
  return m ? m[1] : arg;
}

// Masks every quoted span of `line` to a run of spaces, so `splitStatements` below can find an
// operator's position by matching against the mask while cutting the *original* text at that position —
// a word a quote wraps (`"$S"`) survives in the statement text, only the quote's own operator-lookalike
// content (a `;` in a commit message) is hidden from the search.
function maskQuotes(line) {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      out += ' ';
      if (c === quote && !isEscaped(line, i, quote)) quote = null;
      continue;
    }
    if ((c === "'" || c === '"') && !isEscaped(line, i, null)) { quote = c; out += ' '; continue; }
    out += c;
  }
  return out;
}

// Splits `text` into statements on `&&`, `||`, `;` and `\n`, recognizing an operator only where the
// mask shows it sitting outside a quote — a quote already closed by `stripMultilineBodies` above never
// needs to balance across a line, so each physical line is masked and split on its own. Quoted text
// never splits into fake statements: `git commit -m "subject; wip` + `body"` keys once, as `git commit`.
function splitStatements(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const mask = maskQuotes(line);
    const re = /&&|\|\||;/g;
    let last = 0;
    let m;
    while ((m = re.exec(mask))) {
      out.push(line.slice(last, m.index));
      last = m.index + m[0].length;
    }
    out.push(line.slice(last));
  }
  return out;
}

// The commands one Bash call ran, as grouping keys: each statement's first pipeline stage, past any
// `cd`, variable assignment, or redirection, keyed by its program and up to two plain words after it
// (`bun run test`, `git log`). A statement that is a whole `VAR=$(cmd …)` assignment keys the command
// inside the substitution instead (`SHA=$(git rev-parse HEAD)` keys `git rev-parse`, not `rev-parse`).
// An interpreter keys instead by its first non-flag argument when that argument looks like a script path
// (`node tests/profile.test.js`) or starts with `$` (`node $S`, quoted or not), or by that argument
// itself when it is an inline-source flag (`node -e`, `python3 -c`, `node -`); an argument that is
// neither — `run` in `bun run test` — falls back to the plain-word rule instead. A `scope.js` path or a
// `$` argument followed by `test <mode>` or `fail-to-pass` keys as that runner mode's own row instead.
// simplicity: still a line-based scanner, not a shell parser — a backtick substitution, a nested
// `$(...)` inside another, or a keyword mid-statement (`x() { …; }`) can still misgroup; parse properly if a real command still groups wrong.
function commandKeys(command) {
  const keys = new Set();
  for (const statement of splitStatements(stripMultilineBodies(command))) {
    let text = statement.trim();
    // Leading `(`/`{` and shell keywords come off first, so a `case` after `do` or `then` is seen.
    for (let prev = null; prev !== text;) {
      prev = text;
      text = text.replace(/^[({]+\s*/, '').replace(/^[a-z]+(?=\s|$)/, (w) => (SHELL_KEYWORDS.has(w) ? '' : w)).trim();
    }
    if (/^case\s/.test(text)) {
      const header = /\sin\s+(.*)$/.exec(text);
      text = header ? header[1] : '';
    }
    text = text.replace(/^[^\s()]+\)\s*/, '');
    text = text.replace(/^[({]+\s*/, '');
    // A closing group left by the split comes off when it is its own word or unmatched, so `${S}` keeps its brace.
    for (;;) {
      const c = text[text.length - 1];
      if (c !== ')' && c !== '}') break;
      const count = (ch) => text.split(ch).length - 1;
      const own = /(^|[\s;])[)}]$/.test(text);
      if (!own && count(c) <= count(c === '}' ? '{' : '(')) break;
      text = text.slice(0, -1).trimEnd();
    }
    const assignSub = /^(?:(?:export|local|readonly|declare)\s+(?:-\w+\s+)*)?[A-Za-z_][A-Za-z0-9_]*=("?)\$\((?!\()(.*)\)\1$/.exec(text);
    const body = assignSub ? assignSub[2] : text;
    const words = body.split('|')[0].trim().split(/\s+/)
      .filter((w) => w && !/^\d*[<>]/.test(w) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
    while (words[0] === 'time') words.shift();
    while (words.length && SHELL_KEYWORDS.has(words[0])) words.shift();
    if (!words.length || words[0] === 'cd' || HEADER_KEYWORDS.has(words[0])) continue;
    let key = null;
    if (INTERPRETERS.has(words[0])) {
      const rest = words.slice(1);
      const first = rest[0];
      if (first === '-e' || first === '-c' || first === '-') key = [words[0], first];
      else {
        const at = rest.findIndex((w) => !w.startsWith('-'));
        const scriptArg = rest[at];
        if (scriptArg) {
          const unquoted = scriptArg.replace(/^(['"])(.*)\1$/, '$2');
          const [verb, mode] = rest.slice(at + 1);
          // The test runner keys by its mode alone, whatever path or shell variable ran it (ADR 0143).
          const runner = /(^|\/)scope\.js$/.test(unquoted) || unquoted.startsWith('$');
          if (runner && verb === 'test' && TEST_MODES.has(mode)) key = ['scope.js test', mode];
          else if (runner && verb === 'fail-to-pass') key = ['scope.js fail-to-pass'];
          else if (/[./]/.test(unquoted) || unquoted.startsWith('$')) key = [words[0], normalizeScriptArg(unquoted)];
        }
      }
    }
    if (!key) {
      key = [words[0]];
      for (const w of words.slice(1)) {
        if (key.length === 3 || !/^[a-z][\w:.-]*$/.test(w)) break;
        key.push(w);
      }
    }
    keys.add(key.join(' '));
  }
  return [...keys];
}

module.exports = { commandKeys, splitStatements, stripMultilineBodies };
