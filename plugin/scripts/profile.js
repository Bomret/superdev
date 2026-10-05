#!/usr/bin/env node
'use strict';

// profile.js — the run profile: where a scope run's wall-clock time went (ADR 0103).
//
//   node profile.js [slug]
//
// Reads the session and subagent transcripts Claude Code writes under
// `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/`, and writes nothing there (INV-0101). The format is
// Claude Code's own and undocumented, so an entry lacking a field read here is reported as
// unrecognized rather than counted. Human wait and idle time never enter a machine total (INV-0102),
// and a tool call with no result carries no duration (INV-0103).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { mainWorkTree, SLUG_RE, CHANGE_TYPES } = require('./scope.js');

// The chain commands a run profile reports. Every other superdev command still ends a segment.
const CHAIN = new Set(['implement', 'review', 'document', 'submit-pr', 'ship']);
// The entry types this script reads. Claude Code's bookkeeping types (`ai-title`, `last-prompt`, …)
// carry no timestamp and are skipped.
const READ_TYPES = new Set(['user', 'assistant', 'attachment', 'system']);
const QUIET_MODES = new Set(['auto', 'bypassPermissions']);
// A dispatch rejected at the permission prompt: its own tool_result carries this exact string in
// place of a usage object — a real result, reported by status like a failed or killed dispatch.
const REJECTED_INFO = 'User rejected tool use';
// Two more refusal shapes, also carried as the tool_result string in place of a usage object: the
// auto-mode classifier's own denial, and a PreToolUse:Agent hook's own block.
const DENIED_RE = /^Error: Permission for this action was denied by the Claude Code auto mode classifier/;
const BLOCKED_RE = /^Error: PreToolUse:Agent hook error:/;
const HUMAN_TOOLS = new Set(['AskUserQuestion']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);

// Domain shapes (CONTEXT.md):
// - Run profile: { slug, projectsDir, segments: PhaseSegment[], unfinished, unrecognized }
// - Phase segment: { command, args, session, start, end, times: { wall, subagent, tool, hook, human,
//   idle, model }, hooks: { <hook name>: ms }, promptingMode }
// - Human wait: the `human` intervals `sessionEvents` collects; `times.human` is their measure.
// - Idle: the `idle` intervals `sessionEvents` collects; `times.idle` is their measure.

class ProfileError extends Error {}

function projectsDirFor(env) {
  const config = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(config, 'projects');
}

// The repository's own transcript directory, plus the ones for sessions started inside one of its
// run roots (`/.superdev/scopes/` encodes to `--superdev-scopes-`). A sibling repository whose path
// merely shares the prefix is not one of them.
function transcriptDirs(projectsDir, repoRoot) {
  const enc = repoRoot.replace(/[^A-Za-z0-9]/g, '-');
  let names;
  try {
    names = fs.readdirSync(projectsDir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n === enc || n.startsWith(`${enc}--superdev-scopes-`))
    .map((n) => path.join(projectsDir, n));
}

function readJsonl(file, unrecognized) {
  const out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      unrecognized.push({ file, line: i + 1, reason: 'not JSON' });
      return;
    }
    if (!e || !READ_TYPES.has(e.type)) return;
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) {
      unrecognized.push({ file, line: i + 1, reason: `${e.type} entry has no timestamp` });
      return;
    }
    out.push({ ...e, t });
  });
  return out;
}

const blocks = (e) => (Array.isArray(e.message && e.message.content) ? e.message.content : []);
const text = (e) => {
  const c = e.message && e.message.content;
  if (typeof c === 'string') return c;
  return blocks(e).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
};

// A superdev command invocation: a typed `/superdev:<cmd>` or a `Skill` tool call for one.
function marker(e) {
  if (e.type === 'user') {
    const m = /<command-name>\/superdev:([\w-]+)<\/command-name>/.exec(text(e));
    if (m) {
      const a = /<command-args>([\s\S]*?)<\/command-args>/.exec(text(e));
      return { command: m[1], args: a ? a[1].trim() : '' };
    }
  }
  for (const b of blocks(e)) {
    if (b.type === 'tool_use' && b.name === 'Skill' && b.input) {
      const m = /^(?:superdev:)([\w-]+)$/.exec(b.input.skill || '');
      if (m) return { command: m[1], args: String(b.input.args || '').trim() };
    }
  }
  return null;
}

// Harness-injected `user`-shape text, never something the operator typed: a task-notification (a
// background dispatch's own async result), and a local command's own stdout echoed back (e.g. `/model`).
const HARNESS_INJECTED_RE = /^<(?:task-notification|local-command-stdout)>/;
// The operator cut a turn short. Claude Code inserts this entry in the interrupted turn's place: it
// ends the turn right there, and is never itself a typed prompt.
const INTERRUPT_RE = /^\[Request interrupted by user(?: [^\]]*)?\]$/;
const isInterrupt = (e) => e.type === 'user' && !e.isMeta && INTERRUPT_RE.test(text(e).trim());
// A non-meta user entry an image block carries (the operator pasting a screenshot, with or without
// accompanying text) is a typed prompt too, even where it carries no text of its own.
const hasImage = (e) => blocks(e).some((b) => b.type === 'image');
// A compact summary — the harness's own injected recap after a context compaction — is never something
// the operator typed, whatever text it carries.
const isTypedPrompt = (e) =>
  e.type === 'user' && !e.isMeta && !isInterrupt(e) && !e.isCompactSummary &&
  !blocks(e).some((b) => b.type === 'tool_result') &&
  (text(e).trim() !== '' || hasImage(e)) && !HARNESS_INJECTED_RE.test(text(e).trim());
// A synthetic assistant entry — Claude Code's own stand-in message (a session- or spend-limit notice,
// a "No response requested." filler after a cut-off) — carries no model, only the literal marker.
const isSynthetic = (e) => e.type === 'assistant' && e.message && e.message.model === '<synthetic>';
// A Stop hook's own summary entry: when it follows the block's last real
// output, the walk-back stops there rather than continuing to that output, so the hook's own runtime —
// already counted separately as hook time — is never also folded into human wait or idle.
const isStopHookSummary = (e) => e.type === 'system' && e.subtype === 'stop_hook_summary';
const isTurnEnd = (e) =>
  e.type === 'system' || isInterrupt(e) || isSynthetic(e) ||
  (e.type === 'assistant' && !blocks(e).some((b) => b.type === 'tool_use'));
const isTaskNotification = (e) =>
  (e.type === 'attachment' && e.attachment && e.attachment.commandMode === 'task-notification') ||
  (e.type === 'user' && !e.isMeta && text(e).trim().startsWith('<task-notification>'));
// Harness filler that can sit between a turn's end and whatever closes the gap, carrying no signal of
// its own: an attachment (a hook result, a SessionStart context block on resume) — never a
// task-notification attachment, which is itself a wake — a compact summary (the harness's own injected
// recap after a context compaction), an isMeta note wrapped in a harness tag (a caveat ahead of a typed
// `/command`), or a non-meta harness-injected `user` entry that is not itself a task-notification (a
// local command's own echoed stdout).
const isIdleFiller = (e) =>
  (e.type === 'attachment' && !isTaskNotification(e)) ||
  (e.type === 'user' && !isTaskNotification(e) &&
    (e.isCompactSummary || (e.isMeta && /^</.test(text(e).trim())) ||
      (!e.isMeta && HARNESS_INJECTED_RE.test(text(e).trim()))));
// Whatever can close a gap: a `user` entry that carries no tool_result (a typed prompt, a peer-session
// message, a plain-text resumption note such as "Continue from where you left off."), or a
// task-notification attachment.
const canClose = (e) =>
  (e.type === 'user' && !blocks(e).some((b) => b.type === 'tool_result')) ||
  (e.type === 'attachment' && isTaskNotification(e));

// A task-notification's `<usage>` block, for the two shapes that carry a background dispatch's
// duration, tool count and tokens only as text (an attachment's own `prompt`, or a `user` entry's
// string content) rather than a structured `attachment.usage` field.
const USAGE_TEXT_RE = /<usage><subagent_tokens>(\d+)<\/subagent_tokens><tool_uses>(\d+)<\/tool_uses><duration_ms>(\d+)<\/duration_ms><\/usage>/;
// A failed or killed dispatch's own notification carries `<status>` and no `<usage>` block at all —
// still a real result, never "not yet notified" and never a zero duration (INV-0101).
function noteFromText(txt) {
  const id = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(txt);
  if (!id) return null;
  const status = /<status>([^<]+)<\/status>/.exec(txt);
  const u = USAGE_TEXT_RE.exec(txt);
  return {
    id: id[1],
    status: status ? status[1] : null,
    tokens: u ? Number(u[1]) : null,
    toolUses: u ? Number(u[2]) : null,
    durationMs: u ? Number(u[3]) : null,
  };
}

function readSession(file, unrecognized) {
  const entries = readJsonl(file, unrecognized);
  const agents = new Map(); // toolUseId → { meta, entries }
  const subDir = path.join(file.replace(/\.jsonl$/, ''), 'subagents');
  if (fs.existsSync(subDir)) {
    for (const n of fs.readdirSync(subDir)) {
      if (!n.endsWith('.meta.json')) continue;
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(subDir, n), 'utf8'));
      } catch {
        unrecognized.push({ file: path.join(subDir, n), line: 1, reason: 'not JSON' });
        continue;
      }
      const jsonl = path.join(subDir, n.replace(/\.meta\.json$/, '.jsonl'));
      if (!meta.toolUseId) {
        unrecognized.push({ file: path.join(subDir, n), line: 1, reason: 'meta has no toolUseId' });
        continue;
      }
      agents.set(meta.toolUseId, { meta, entries: fs.existsSync(jsonl) ? readJsonl(jsonl, unrecognized) : [] });
    }
  }
  return { file, entries, agents };
}

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
// neither — `run` in `bun run test` — falls back to the plain-word rule instead.
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
        const scriptArg = rest.find((w) => !w.startsWith('-'));
        if (scriptArg) {
          const unquoted = scriptArg.replace(/^(['"])(.*)\1$/, '$2');
          if (/[./]/.test(unquoted) || unquoted.startsWith('$')) key = [words[0], normalizeScriptArg(unquoted)];
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

// --- interval arithmetic ------------------------------------------------------------------------
function measure(intervals) {
  const xs = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of xs) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : total;
}
const clip = (intervals, start, end) =>
  intervals.map(([a, b]) => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b > a);

// Every interval and point event of one session, before it is split into segments.
function sessionEvents(s) {
  const uses = new Map();
  const results = new Map();
  const human = [];
  const idle = [];
  const hooks = []; // { t, name, ms, tool } — the wait a hook cost the session; parallel Stop hooks
  // collapse to their slowest member here, since the session waited for that one, not their sum.
  const hookBreakdown = []; // { t, name, ms } — every hook's own duration, for the per-name view;
  // several Stop hooks in one summary each keep their own entry, so this can sum to more than `hooks`.
  const notifications = new Map(); // toolUseId → { tokens, toolUses, durationMs } (an async dispatch's own result carries none of these, ADR 0103)
  s.entries.forEach((e, i) => {
    for (const b of blocks(e)) {
      if (b.type === 'tool_use') uses.set(b.id, { t: e.t, name: b.name, input: b.input || {} });
      if (b.type === 'tool_result') results.set(b.tool_use_id, { t: e.t, info: e.toolUseResult });
    }
    // Consecutive turn ends, with any filler between them, form one block; the gap this entry (if it
    // can close one) ends runs from the block's last real, non-synthetic assistant entry — the model's
    // own last real output — rather than an earlier turn end (a thinking block, a synthetic notice) that
    // carries no model output of its own. Machine work also stops at an interrupt entry, so
    // the walk-back stops there too, never crediting the model's own generation time up to the interrupt
    // to human wait; it likewise stops at a Stop hook summary that follows the
    // last real output, so that hook's own runtime is counted once, as hook time, never also folded into
    // this gap. A block with no real assistant entry still starts at its earliest
    // turn end. A typed prompt makes the gap human wait; anything else that closes it is idle.
    if (canClose(e) && !isTurnEnd(e) && !isIdleFiller(e)) {
      let j = i - 1;
      let start = null;
      while (j >= 0 && (isTurnEnd(s.entries[j]) || isIdleFiller(s.entries[j]))) {
        if (isTurnEnd(s.entries[j])) start = j;
        if (isInterrupt(s.entries[j]) || isStopHookSummary(s.entries[j]) ||
          (s.entries[j].type === 'assistant' && !isSynthetic(s.entries[j]))) break;
        j -= 1;
      }
      if (start !== null) {
        const gap = [s.entries[start].t, e.t];
        if (isTypedPrompt(e)) human.push(gap);
        else idle.push(gap);
      }
    }
    const a = e.attachment;
    if (e.type === 'attachment' && a && a.type === 'hook_success' && typeof a.durationMs === 'number') {
      const name = a.hookName || a.hookEvent || 'hook';
      hooks.push({ t: e.t, name, ms: a.durationMs, tool: /ToolUse/.test(a.hookEvent || '') });
      hookBreakdown.push({ t: e.t, name, ms: a.durationMs });
    }
    // Stop hooks run in parallel, so the session only waited for the slowest one — that is what
    // `hooks` carries — while the breakdown keeps every hook's own duration, to show which one is slow.
    if (e.type === 'system' && e.subtype === 'stop_hook_summary' && Array.isArray(e.hookInfos)) {
      let slowest = -1;
      for (const h of e.hookInfos) {
        if (typeof h.durationMs !== 'number') continue;
        hookBreakdown.push({ t: e.t, name: 'Stop', ms: h.durationMs });
        if (h.durationMs > slowest) slowest = h.durationMs;
      }
      if (slowest >= 0) hooks.push({ t: e.t, name: 'Stop', ms: slowest, tool: false });
    }
    if (e.type === 'attachment' && a && a.commandMode === 'task-notification') {
      const note = noteFromText(a.prompt || '');
      if (note) {
        notifications.set(note.id, a.usage
          ? { status: note.status, tokens: a.usage.totalTokens, toolUses: a.usage.toolUses, durationMs: a.usage.durationMs }
          : note);
      }
    } else if (e.type === 'user') {
      const t = text(e).trim();
      if (t.startsWith('<task-notification>')) {
        const note = noteFromText(t);
        if (note) notifications.set(note.id, note);
      }
    }
  });

  const tool = [];
  const subagent = [];
  const unfinished = [];
  const bash = []; // { t, command, ms } — t is the dispatch time for a subagent's own call
  const dispatches = []; // { t, id, start, end, meta, info }
  for (const [id, u] of uses) {
    const r = results.get(id);
    const end = r && r.t;
    if (end === undefined) {
      unfinished.push({ t: u.t, tool: u.name });
      continue;
    }
    if (HUMAN_TOOLS.has(u.name)) human.push([u.t, end]);
    else if (AGENT_TOOLS.has(u.name)) {
      // A dispatch rejected at the permission prompt is the operator deciding, not the machine working
      // ; a denied or blocked one is the classifier or a hook, so it stays machine time.
      if (r.info === REJECTED_INFO) human.push([u.t, end]);
      else subagent.push([u.t, end]);
      const a = s.agents.get(id);
      const span = a && a.entries.length ? a.entries.map((e) => e.t) : [u.t, end];
      dispatches.push({ t: u.t, id, start: Math.min(...span), end: Math.max(...span), meta: (a && a.meta) || {}, info: r.info, file: s.file });
    } else tool.push([u.t, end]);
    if (u.name === 'Bash') bash.push({ t: u.t, command: String(u.input.command || '').trim(), ms: end - u.t });
  }
  for (const [id, a] of s.agents) {
    const dispatched = uses.has(id) ? uses.get(id).t : null;
    const au = new Map();
    for (const e of a.entries) {
      for (const b of blocks(e)) {
        if (b.type === 'tool_use' && b.name === 'Bash') au.set(b.id, { t: e.t, command: String((b.input || {}).command || '').trim() });
        if (b.type === 'tool_result' && au.has(b.tool_use_id)) {
          const u = au.get(b.tool_use_id);
          bash.push({ t: dispatched === null ? u.t : dispatched, command: u.command, ms: e.t - u.t });
        }
      }
    }
  }
  // A subagent's own transcript span covers a background dispatch whose call returned at once.
  const cwds = []; // { t, cwd } — the session's and its subagents', for attribution
  const modes = []; // { t, mode } — the permission mode a user entry records
  for (const e of s.entries) {
    if (e.cwd) cwds.push({ t: e.t, cwd: e.cwd });
    if (e.type === 'user' && e.permissionMode) modes.push({ t: e.t, mode: e.permissionMode });
  }
  for (const [id, a] of s.agents) {
    if (!a.entries.length) continue;
    const t = a.entries.map((e) => e.t);
    subagent.push([Math.min(...t), Math.max(...t)]);
    const dispatched = uses.has(id) ? uses.get(id).t : Math.min(...t);
    for (const e of a.entries) if (e.cwd) cwds.push({ t: dispatched, cwd: e.cwd });
  }
  return { human, idle, subagent, tool, hooks, hookBreakdown, unfinished, cwds, modes, bash, dispatches, notifications };
}

function segmentsOf(s) {
  const out = [];
  for (const e of s.entries) {
    const m = marker(e);
    if (!m) continue;
    if (out.length) out[out.length - 1].end = e.t;
    out.push({ ...m, session: path.basename(s.file, '.jsonl'), start: e.t, end: null });
  }
  const last = s.entries.length ? s.entries[s.entries.length - 1].t : 0;
  for (const seg of out) if (seg.end === null) seg.end = Math.max(seg.start, last);
  return out.filter((seg) => CHAIN.has(seg.command));
}

// The right-hand side of a `BASE..branch` or `BASE...branch` review range, e.g. `816f89fe..feat/x`.
const RANGE_RE = /\.{2,3}([a-z][\w-]*)\/([A-Za-z0-9][\w.-]*)$/;

// The scopes one segment belongs to: named in its arguments, or run under a run root. An argument
// names a scope when it is a whole `<change-type>/<slug>` feature label, a `BASE..branch` (or
// `BASE...branch`) range whose right-hand side is one, or a bare slug given alone that some cwd read
// elsewhere in the transcripts evidences as a real run root — a free-form argument such as a sentence,
// or an unevidenced bare word, names none. Cwd attribution runs only when the arguments name no scope,
// since a named scope's own leftover cwd (a session that has not yet cd'ed into it) never dilutes it.
function scopesOf(seg, ev, repoRoot, evidenced) {
  const toks = seg.args.split(/\s+/).filter((t) => t && !t.startsWith('--'));
  const found = new Set();
  for (const tok of toks) {
    const range = RANGE_RE.exec(tok);
    const [type, slug, extra] = (range ? `${range[1]}/${range[2]}` : tok).split('/');
    if (CHANGE_TYPES.includes(type) && slug && extra === undefined && SLUG_RE.test(slug)) found.add(slug);
  }
  if (found.size) return found;
  if (toks.length === 1 && SLUG_RE.test(toks[0]) && evidenced.has(toks[0])) return new Set([toks[0]]);
  const scopes = path.join(repoRoot, '.superdev', 'scopes') + path.sep;
  for (const { t, cwd } of ev.cwds) {
    if (t < seg.start || t >= seg.end || !cwd.startsWith(scopes)) continue;
    found.add(cwd.slice(scopes.length).split(path.sep)[0]);
  }
  return found;
}

function times(seg, ev) {
  const { start, end } = seg;
  const H = clip(ev.human, start, end);
  const S = clip(ev.subagent, start, end);
  const I = clip(ev.idle, start, end);
  const T = clip(ev.tool, start, end);
  const wall = end - start;
  const human = measure(H);
  const subagent = measure([...H, ...S]) - human;
  // Idle only claims what human wait and subagent time left over: either one covering the same gap
  // wins (human wait always does; a subagent interval wins over idle).
  const idle = measure([...H, ...S, ...I]) - human - subagent;
  const toolRaw = measure([...H, ...S, ...I, ...T]) - human - subagent - idle;
  const hooks = ev.hooks.filter((h) => h.t >= start && h.t < end);
  const byName = {};
  for (const h of ev.hookBreakdown.filter((h) => h.t >= start && h.t < end)) byName[h.name] = (byName[h.name] || 0) + h.ms;
  const sum = (xs) => xs.reduce((n, h) => n + h.ms, 0);
  // simplicity: a hook's recorded duration is taken out of the time around it, capped so the split
  // still sums to wall-clock time; a hook fired inside a subagent stays subagent time.
  const toolHook = Math.min(sum(hooks.filter((h) => h.tool)), toolRaw);
  const rest = wall - human - subagent - idle - toolRaw;
  const otherHook = Math.min(sum(hooks.filter((h) => !h.tool)), rest);
  return {
    times: { wall, human, idle, subagent, tool: toolRaw - toolHook, hook: toolHook + otherHook, model: rest - otherHook },
    hooks: byName,
  };
}

function profile({ projectsDir, repoRoot, slug }) {
  const dirs = transcriptDirs(projectsDir, repoRoot);
  if (!dirs.length) {
    throw new ProfileError(`no transcripts for ${repoRoot} under ${projectsDir}${slug ? ` (scope ${slug})` : ''}`);
  }
  const unrecognized = [];
  // Each session's parsed entries and subagent entries are read once, here, and released as soon as
  // `sessionEvents`/`segmentsOf` have distilled them: `perSession` keeps only that distillate, never
  // the raw `s` a whole 600 MB transcript tree would otherwise hold onto for the rest of the run.
  const perSession = [];
  // Every single-key Bash call's duration in every session read, by key: the weights a compound call
  // of the profiled scope splits by. Numbers only, so the raw entries stay releasable.
  const solo = new Map();
  let recognized = 0;
  for (const dir of dirs) {
    for (const n of fs.readdirSync(dir)) {
      if (!n.endsWith('.jsonl')) continue;
      const s = readSession(path.join(dir, n), unrecognized);
      recognized += s.entries.length;
      const ev = sessionEvents(s);
      for (const b of ev.bash) {
        const keys = commandKeys(b.command);
        b.keys = keys;
        if (keys.length === 1) {
          if (!solo.has(keys[0])) solo.set(keys[0], []);
          solo.get(keys[0]).push(b.ms);
        }
      }
      perSession.push({ ev, segs: segmentsOf(s) });
    }
  }
  if (!recognized) {
    throw new ProfileError(`format not recognized: no transcript entry under ${dirs.join(', ')} carries the fields the run profile reads`);
  }
  // A run root seen as a cwd anywhere in the transcripts read, whatever the segment — the evidence a
  // lone bare argument needs before it can name a scope (a fake scope such as "audit" or "staged"
  // otherwise never appears as a cwd, so it never qualifies).
  const scopesDir = path.join(repoRoot, '.superdev', 'scopes') + path.sep;
  const evidenced = new Set();
  for (const { ev } of perSession) {
    for (const { cwd } of ev.cwds) if (cwd.startsWith(scopesDir)) evidenced.add(cwd.slice(scopesDir.length).split(path.sep)[0]);
  }
  const all = [];
  for (const { ev, segs } of perSession) {
    for (const seg of segs) all.push({ seg, ev, scopes: scopesOf(seg, ev, repoRoot, evidenced) });
  }
  let target = slug;
  if (!target) {
    const latest = all.filter((x) => x.scopes.size).sort((a, b) => b.seg.end - a.seg.end)[0];
    target = latest && [...latest.scopes].sort()[0];
  }
  const mine = all.filter((x) => target && x.scopes.has(target)).sort((a, b) => a.seg.start - b.seg.start);
  if (!mine.length) {
    throw new ProfileError(`no phase segment for ${slug ? `scope ${slug}` : 'any scope'} in ${dirs.join(', ')}`);
  }
  const segments = [];
  const unfinished = [];
  const groups = new Map();
  const dispatches = [];
  const calls = []; // every Bash call of the profiled scope's segments, with the keys it ran
  mine.forEach(({ seg, ev }, i) => {
    const inSeg = (t) => t >= seg.start && t < seg.end;
    const mode = ev.modes.find((m) => inSeg(m.t) && !QUIET_MODES.has(m.mode));
    segments.push({ ...seg, ...times(seg, ev), promptingMode: mode ? mode.mode : null });
    for (const u of ev.unfinished) if (inSeg(u.t)) unfinished.push({ segment: i, tool: u.tool, t: u.t });
    for (const b of ev.bash) {
      if (!inSeg(b.t)) continue;
      const keys = b.keys;
      if (keys.length) calls.push({ keys, ms: b.ms });
    }
    for (const d of ev.dispatches) {
      if (!inSeg(d.t)) continue;
      const info = d.info || {};
      const num = (k) => (typeof info[k] === 'number' ? info[k] : null);
      // A background (run_in_background) dispatch's own result carries no figures at all — they
      // arrive later in a task-notification entry, keyed by this dispatch's tool-use id.
      const note = ev.notifications.get(d.id);
      const duration = num('totalDurationMs') ?? (note ? note.durationMs : null);
      const toolUses = num('totalToolUseCount') ?? (note ? note.toolUses : null);
      const tokens = num('totalTokens') ?? (note ? note.tokens : null);
      // A failed or killed dispatch's own notification carries a status and no usage at all — a real
      // result, never "not yet notified" and never a zero duration (INV-0101). A dispatch rejected at
      // the permission prompt, denied by the auto-mode classifier, or blocked by a PreToolUse:Agent
      // hook carries no notification at all, only its own tool_result's fixed or prefixed string
      // .
      const status = note && (note.status === 'failed' || note.status === 'killed') ? note.status :
        d.info === REJECTED_INFO ? 'rejected' :
        typeof d.info === 'string' && DENIED_RE.test(d.info) ? 'denied' :
        typeof d.info === 'string' && BLOCKED_RE.test(d.info) ? 'blocked' : null;
      // A background dispatch's own result never carries these figures by design (ADR 0103): its own
      // notification just has not arrived yet, which is not a format problem.
      const pending = duration === null && !status && info.status === 'async_launched';
      if (duration === null && !pending && !status) {
        unrecognized.push({ file: d.file, line: 0, reason: `Agent result for "${d.meta.description || d.id}" has no totalDurationMs` });
      }
      dispatches.push({
        agentType: d.meta.agentType || null, description: d.meta.description || null, duration,
        toolUses, tokens, segment: i, start: d.start, end: d.end, batch: null, slowest: false, pending, status,
      });
    }
  });
  // A key's weight is the median duration of its single-key calls across the repository's transcripts;
  // a compound call's time splits by the weights of its keys, so the per-key totals sum to the Bash time
  // of every call that ran a command.
  const weight = new Map();
  for (const [k, xs] of solo) {
    xs.sort((a, b) => a - b);
    const mid = xs.length >> 1;
    weight.set(k, xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
  }
  for (const c of calls) {
    const known = c.keys.filter((k) => weight.has(k)).map((k) => weight.get(k));
    const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
    const ws = c.keys.map((k) => (weight.has(k) ? weight.get(k) : fill));
    const sum = ws.reduce((a, b) => a + b, 0);
    c.keys.forEach((k, j) => {
      const g = groups.get(k) || { command: k, count: 0, total: 0 };
      g.count += 1;
      g.total += sum > 0 ? (c.ms * ws[j]) / sum : c.ms / c.keys.length;
      groups.set(k, g);
    });
  }
  dispatches.sort((a, b) => a.start - b.start);
  // Dispatches whose time ranges overlap form a parallel batch; its longest is the one the run waited for.
  let batch = 0;
  for (let i = 0; i < dispatches.length; ) {
    let j = i + 1;
    let reach = dispatches[i].end;
    while (j < dispatches.length && dispatches[j].start < reach) reach = Math.max(reach, dispatches[j++].end);
    if (j - i > 1) {
      batch += 1;
      const members = dispatches.slice(i, j);
      for (const d of members) d.batch = batch;
      members.reduce((m, d) => ((d.end - d.start) > (m.end - m.start) ? d : m)).slowest = true;
    }
    i = j;
  }
  const commands = [...groups.values()].sort((a, b) => b.total - a.total);
  return { slug: target, projectsDir, dirs, segments, unfinished, unrecognized, commands, dispatches };
}

// --- report ------------------------------------------------------------------------------------
function dur(ms) {
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
const clock = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

function render(p) {
  const cols = ['wall', 'subagent', 'tool', 'hook', 'model', 'human', 'idle'];
  const rows = p.segments.map((s, i) => [String(i + 1), s.command, clock(s.start), ...cols.map((c) => dur(s.times[c]))]);
  const head = ['#', 'phase', 'start (UTC)', ...cols.map((c) => (c === 'human' ? 'human wait' : c))];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => '  ' + r.map((c, i) => (i < 3 ? c.padEnd(width[i]) : c.padStart(width[i]))).join('  ');
  const out = [`Run profile — ${p.slug}`, `Transcripts: ${p.dirs.join(', ')}`, '', 'Phases', line(head), ...rows.map(line)];
  out.push('', 'Human wait is time spent waiting for the operator, and is in no other column.');
  out.push('Idle is time nothing was running until something other than a typed prompt woke the session, and is in no other column.');
  out.push('A hook that records no duration stays inside the tool or model time around it.');
  p.segments.forEach((s, i) => {
    const hooks = Object.entries(s.hooks).map(([n, ms]) => `${n} ${dur(ms)}`);
    if (hooks.length) out.push(`  #${i + 1} hooks: ${hooks.join(', ')}`);
    if (s.promptingMode) out.push(`  #${i + 1} ran in permission mode ${s.promptingMode}: tool times include approval waits.`);
  });
  if (p.commands.length) {
    out.push('', 'Repeated commands (Bash, orchestrator and subagents)');
    for (const c of p.commands.slice(0, 15)) out.push(`  ${dur(c.total).padStart(7)}  ${String(c.count).padStart(3)}×  ${c.command}`);
    if (p.commands.length > 15) out.push(`  … and ${p.commands.length - 15} more`);
    out.push("  A compound call's time is shared among its commands by each command's median solo run across the repository's transcripts, so these totals sum to the Bash time of every call that ran a command.");
  }
  if (p.dispatches.length) {
    out.push('', 'Dispatches');
    for (const d of p.dispatches) {
      const mark = d.batch === null ? '' : `  batch ${d.batch}${d.slowest ? ', slowest: waited for' : ''}`;
      const n = (v, unit) => (v === null ? '?' : `${v}${unit}`);
      const label = d.duration !== null ? dur(d.duration) : d.status || (d.pending ? 'not yet notified' : '? (unrecognized)');
      out.push(`  #${d.segment + 1} ${d.agentType || '?'} — ${d.description || '?'}: ${label}, ${n(d.toolUses, ' tools')}, ${n(d.tokens, ' tokens')}${mark}`);
    }
  }
  if (p.unfinished.length) {
    out.push('', 'Unfinished calls (no result, no duration):');
    for (const u of p.unfinished) out.push(`  #${u.segment + 1} ${u.tool}, started ${clock(u.t)}`);
  }
  if (p.unrecognized.length) {
    out.push('', `Unrecognized entries (${p.unrecognized.length}, not counted):`);
    for (const u of p.unrecognized.slice(0, 5)) out.push(`  ${u.file}:${u.line} — ${u.reason}`);
    if (p.unrecognized.length > 5) out.push(`  … and ${p.unrecognized.length - 5} more`);
  }
  return out.join('\n') + '\n';
}

function main() {
  const slug = process.argv[2];
  if (slug !== undefined && !SLUG_RE.test(slug)) {
    process.stderr.write(`profile: "${slug}" is not a scope slug\n`);
    process.exit(2);
  }
  const repoRoot = mainWorkTree(process.cwd()) || process.cwd();
  try {
    process.stdout.write(render(profile({ projectsDir: projectsDirFor(process.env), repoRoot, slug })));
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    process.stderr.write(`profile: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { profile, render, ProfileError, projectsDirFor };

if (require.main === module) main();
