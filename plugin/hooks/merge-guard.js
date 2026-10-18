#!/usr/bin/env node
'use strict';

// merge-guard: deterministic PreToolUse(Bash) guard.
// Subagents must never integrate — only the controller merges. A subagent's tool
// call carries `agent_id` on the hook stdin; the controller's does not. So we block
// `git merge`/`push`/`rebase`/`pull`/`subtree push` ONLY when agent_id is present, leaving the controller free.
//
// The command is read by the shared shell scanner (shell-words.js, ADR 0135), which returns every simple
// command in it, the ones nested in substitutions, `$[ … ]` arithmetic, backtick groups, subshells, and heredoc
// bodies included. A heredoc body (any delimiter quoting, `<<-` and a numbered descriptor included) or a `<<<` here-string text
// that names a guarded integration by the raw-text rule below, or a `gh`/`tea api` merge, is denied whatever command receives it
// (`cat <<E`, `cat <<E > >(sh)`, `exec 3<<E; sh <&3-`, `ssh host <<E`): the base rule. Two receivers are exempt, each standing alone
// on the line (shell-words.js's `alone`: no pipe after it, no substitution, subshell, function body, group, or compound command
// around it), behind no wrapper or `NAME=` word, its text on stdin, and its other redirects writing plain files (no expansion, no
// process substitution, no `/dev/` or `/proc/` path but `/dev/null`), on a line running no `exec` (sinks below): a file sink, `cat`
// with no operand or `tee` with at most `-a` and plain file operands, its stdout redirected to such a file (`cat >> progress.md <<'E'`);
// and a message sink, `git commit -F -`, `gh pr|issue … --body-file -`, or `tea issue|issues|pull|pulls|pr … --description-file -`,
// that opens no editor on its text (no git `-e`/`--edit` or `-c` editor setting, no gh `-e`/`--editor`). A sink's text
// is still denied where the base hook denied it: a line or `;`, `&`, `|` segment starting with `git` that later names a guarded
// verb (lineIntegrates), and the raw BLOCK_CLI and API merge tests below, which read the whole command. A body
// that names nothing guarded is allowed, so a body any other command receives is denied only when it names one, a known
// false positive of the quoted-word class below. Each command is read past its `NAME=value` words and the prefix wrappers of
// shell-words.js's WRAPPER table (`env`, `sudo`, `nohup`, `xargs`, `exec`, `eval`, `command`, `timeout`, `rtk`, …) by `commandStart`,
// a wrapper spelled in many raw characters (`env''''…`) included. A wrapper value option is read as the BSD and macOS tools read it
// (`env -P altpath`, `xargs -J replstr`), so `env -P x git push` is denied under GNU env too, which has no `-P` and runs nothing
// on that usage error: a known false positive. A git, gh, or tea command behind `xargs` that stops before its
// subcommand or `pr` verb takes it from stdin, and is denied.
// The guard denies a command whose git subcommand (read past git's global options by `gitSubcommand`) is a
// guarded verb (`merge`, `push`, `rebase`, `pull`, or `subtree push`), directly or through an alias defined inline
// (`git -c alias.p=push p`, `git -c alias.x='!git push' x`, `git -c alias.x='!git' x push`, a chain of them, an alias a value defines,
// a value led by global options, a value split as git splits it: `git -c alias.x='"pu\sh"' x`), a typed guarded verb
// whatever an inline alias of its name says (git ignores such an alias), a `gh`/`tea pr merge` (tea's `pulls`/`pull` names for `pr` included), and a `gh`/`tea api` write to a pull request's /merge endpoint. A git
// command with any other subcommand is allowed, whatever words follow it: `git -C $(a $(b $(c))) log --grep push`,
// and `git merge-base`/`merge-tree` (read-only helpers), are not integrations.
// The scan also reads the text of every quoted or backslash-escaped word as a command line (INV-0141), whatever program
// receives the word: `sh -c "git merge x"`, `ssh host "git push"`, `watch "git rebase main"`, and `dash -c git\ push` are
// denied. The text an `echo` or `printf` writes, and a here-string, that a known shell reads on stdin is read the same way
// (`echo git push | sh`, `sh < <(echo git push)`, `bash <<<"git push"`); a file piped to a shell (`cat f | sh`) is not read. A command is
// also read as dash reads it (shell-words.js's dashReading), where `((…))` runs nested subshells, and so is every quoted text the scan
// re-reads: `dash -c "((git push))"` and `dash -c "dash -c \\(\\(git\\ push\\)\\)"` are denied. The guard fails closed instead of guessing which program runs the text, so any quoted word whose
// text names a guarded integration is denied too: a grep or rg pattern (`grep -rn "git merge" docs/`), a commit
// message (`git commit -m "git push fails behind rtk"`), or a PR body. That is a known false positive class.
// A command the scanner cannot read to its end is denied only when its raw text holds the word `git` and,
// later, the word `merge`, `push`, `rebase`, or `pull`, or the word `gh` or `tea` and, later, `pr merge`, `pulls merge`, or
// `pull merge`. A quoted text
// that does not read as a command line (an apostrophe or a parenthesis in a commit message is enough) is judged
// by the same raw-text rule, alone. A scanner that cannot load, or that throws, denies the call and names the
// broken install (INV-0140).
//
// simplicity: the guard catches a command the scanner reads as git, gh, or tea once the table's wrappers are
// skipped. A wrapper the table does not name, a command built at run time (a variable, `eval "$x"`), or a
// wrapper script slips past, and so does an alias defined outside `-c` (`--config-env`, `GIT_CONFIG_*`, a config file). This is a deterministic guardrail against the model's normal output, not a
// sandbox; airtight subagent isolation is the platform's job (see AGENTS.md known issues).

let shellWords = null;
try {
  shellWords = require('../lib/shell-words.js');
} catch {
  // left null: decide() denies every subagent Bash call
}

// The git subcommands that integrate: `pull` merges or rebases. `subtree push` and an inline alias are read in gitIntegrates().
const GUARDED = new Set(['merge', 'push', 'rebase', 'pull']);
// The verbs the raw-text rule reads for, in an unreadable command, a quoted text that reads as no command line, and a `!` alias.
const VERB_WORD = /(?<![-\w])(?:merge|push|rebase|pull)(?![-\w])/;
// The `git subtree` options that take the next word as their value.
const SUBTREE_VALUE = new Set(['-P', '--prefix', '-m', '--message', '-b', '--branch', '--onto']);
// The raw-text rule for `gh`/`tea pr merge`: the word `gh` or `tea`, then later `pr merge` (or tea's `pulls merge`, `pull merge`).
const CLI_WORD = /(?<![-\w])(?:gh|tea)(?![-\w])/;
const PR_MERGE = /(?<![-\w])(?:pr|pulls?)[ \t]+merge(?![-\w])/;
const CLI = /^(?:.*\/)?(gh|tea)$/;
// tea's own names for its `pr` command (`tea pulls merge 3`); tea also names `merge` `m` (tea 0.16.0, `tea pr --help`).
const TEA_PULLS = /^pulls?$/;
// The options of `gh` and `tea` (and of their `pr` commands) that take the next word as their value, read past before `pr` and `merge`.
const CLI_VALUE_OPTS = {
  gh: new Set(['-R', '--repo', '--hostname']),
  tea: new Set(['-r', '--repo', '-R', '--remote', '-l', '--login', '-o', '--output', '-f', '--fields', '--state', '-p', '--page', '--limit', '--lm']),
};

// The lead-in of an RTK-prefixed or bare `gh`/`tea` call, for the raw BLOCK_CLI and API_CALL tests below. A hand-typed `rtk` prefix (RTK's
// output filter) runs the command behind it unchanged. merge-guard is a PreToolUse hook and sees the command as written,
// never RTK's own rewrite, so `rtk gh pr merge` reaches it only when typed (docs/known-issues.md). The
// matcher takes an optional `rtk` before `gh` or `tea`, with rtk's own value-less global options (triage
// #958), then an optional run-anything subcommand with its own value-less options and an optional `--`
// separator: `proxy`, `err`, `run`, `summary`, and `test` each execute the command after them (rtk 0.51.0).
// The whole prefix repeats, so an rtk behind another rtk (`rtk proxy rtk gh pr merge`) matches too.
const RTK_PREFIX = `(?:rtk(?:[ \\t]+(?:-v+|--verbose|--ultra-compact|--skip-env))*[ \\t]+(?:(?:proxy|err|run|summary|test)(?:[ \\t]+(?:--ultra-compact|--skip-env))*(?:[ \\t]+--)?[ \\t]+)?)*`;
// Integration via the code-host CLI is the controller's job too: `gh pr merge` / `tea pr merge`, read from the scanned
// commands like the git verbs, and from the raw text as a line-start match (BLOCK_CLI), which keeps every shape that match
// denies denied, a line of heredoc text included.
// The REST-API path through `curl … /pulls/<n>/merge` can't be caught deterministically without
// false-positiving on legitimate read curls, so the `curl` forms stay a prose contract the subagent
// bodies carry. The `tea api` and `gh api` forms are caught: `tea api` is the documented pinned merge
// path (ADR 0111), so it cannot stay open, and `gh api` reaches the same endpoint (triage #793).
// A `tea api` / `gh api` call merges when its endpoint names a pull request's `/merge` path and its method
// writes: an explicit `-X`/`--method`, or — with none — a body flag, which defaults the call to POST. A GET of
// the same endpoint (the merged-status read) is not a merge. The call is read from every scanned command, and from the raw
// text too: there each call is one `;&|\n`-bounded segment, led by a
// line start, separator, `(`, backtick (so `$(` too), `{`, `!`, or a `if`/`then`/`do`/`while`/`until`/`elif`/`else` keyword.
// The leading horizontal whitespace is `[ \t]*`, never `\s*`: a newline is itself a lead-in, and `\s*`
// after it re-scans every following newline from each one, which is quadratic on a long run of blank lines.
// Known gap, like curl: a GraphQL route (`gh api graphql -f query='mutation{mergePullRequest…}'`) names no
// `/merge` endpoint and is not caught, and neither is an endpoint built at run time (`x=…/pulls/1; gh api -X PUT $x/merge`):
// no rule tells it from the many legitimate writes through a variable without denying them too.
// The scanned reading skips the options before `pr` and before `merge`, their values included (`gh -R o/r pr merge 1`,
// `gh pr --repo=o/r merge 1`), and reads tea's `m` as `merge` (`tea pulls m 3`).
// `tea api` merges with POST only; `gh api` with PUT or POST (GitHub's merge endpoint is PUT).
const BLOCK_CLI = new RegExp(`(^|[;&|\\n])[ \\t]*${RTK_PREFIX}(?:gh\\s+pr|tea\\s+(?:pr|pulls?))\\s+merge\\b`, 'm');
const API_CALL = new RegExp(
  `(?:^|[;&|\\n(\`{!])[ \\t]*(?:(?:if|then|do|while|until|elif|else)\\s+)?${RTK_PREFIX}(tea|gh)\\s+api\\b([^;&|\\n]*)`,
  'gm'
);
const MERGE_ENDPOINT = /\/pulls\/[^\s/'"]+\/merge(?![\w/-])/;
const API_METHOD = /(?:^|\s)(?:-X\s*|--method(?:=|\s+))["']?([A-Za-z]+)/;
const API_BODY = {
  tea: /\s(?:-[dfF]|--(?:data|field|Field))(?![A-Za-z-])/,
  gh: /\s(?:-[fF]|--(?:field|raw-field|input))(?![A-Za-z-])/,
};
const API_MERGE_METHODS = { tea: ['POST'], gh: ['PUT', 'POST'] };
// Whether a `tool api` call with these arguments (one text, each word led by a space) merges.
function apiMerges(tool, args) {
  if (!MERGE_ENDPOINT.test(args)) return false;
  const method = API_METHOD.exec(args);
  return method ? API_MERGE_METHODS[tool].includes(method[1].toUpperCase()) : API_BODY[tool].test(args);
}
function isApiMerge(cmd) {
  // a backslash-newline continuation is one logical line
  for (const m of cmd.replace(/\\\r?\n/g, ' ').matchAll(API_CALL)) if (apiMerges(m[1], m[2])) return true;
  return false;
}
// The raw `tea api` / `gh api` test also blocks text that merely quotes the call (`git commit -m "… (tea api -X POST
// …/merge)"`): a known false positive, accepted because it fails closed with a clear message.

const INTEGRATE =
  "superdev: subagents must not integrate. `git merge`/`push`/`rebase`/`pull`/`subtree push`, `gh`/`tea pr merge`, and a `tea api` or `gh api` write to a pull request's /merge endpoint " +
  "are the controller's job — commit on your slice branch and report your status. A quoted word, heredoc body, or here-string " +
  'that names one of them (a grep pattern, a commit message, a PR body) is denied too, except a heredoc or here-string, no line of ' +
  'it starting with such a command, standing ' +
  "alone on the line into `cat > file`, `tee -a file > file`, `git commit -F -`, `gh pr|issue … --body-file -`, or `tea … --description-file -`. (merge-guard)";
const BROKEN =
  'superdev: merge-guard could not read this command because the shared shell scanner (lib/shell-words.js) ' +
  'failed to load or to run, so it denies every subagent Bash call. The superdev install is broken: ' +
  'reinstall or update the plugin. (merge-guard)';

// The raw-text rule: the word `git` and later a guarded verb, or `gh`/`tea` and later `pr merge`.
const rawIntegrates = (text) => shellWords.rawNamesVerb(text, VERB_WORD) || shellWords.rawNamesVerb(text, PR_MERGE, CLI_WORD);

// The inline aliases a chain is followed through: a longer chain, a loop included, is denied, failing closed.
const ALIAS_DEPTH = 16;
// The `!` values being read as command lines, one inside another (gitIntegrates): each nesting reads a text no longer than the one
// around it, and ALIAS_DEPTH caps the nesting, so the reading stays bounded.
let bangDepth = 0;

// True when a git command integrates: its typed subcommand does, or it is defined inline as an alias (`git -c alias.p=push p`) whose
// value, read as a git command line with the words after it, does, or whose `!` shell command, with the words git appends to it
// single-quoted (`!git` with `'push'`), integrates when read as a command line (commandLineIntegrates, so shell quoting hides no verb: `!git "pu"sh`)
// or names `git` and later a guarded verb in its raw text.
// Git ignores an alias whose name is a git command, so the typed subcommand is read first, whatever the alias says
// (`git -c alias.merge=log merge x` merges). That fails closed: `git -c alias.log=push log` runs `log` and is denied, and so is
// `git -c alias.a=log -c alias.log=push a`. An alias value is split as git's split_cmdline splits it (splitCmdline), then read past
// git's global options (`--no-pager push`). A subcommand it names that is itself an inline alias is followed
// (`-c alias.a=b -c alias.b=push a`), looked up in the outer options and every `-c` an earlier link set (`-c alias.a='-c alias.b=push b'`),
// and the words a link adds after its subcommand go ahead of the words after it into the next link. A `!` value is judged with the words
// git appends to it, the words earlier links added included, joined after its text, each single-quoted as git's "$@" passes it, so a quote,
// `)`, or `<<` in one changes nothing. The raw rule still reads that joined text, so `git -c alias.x='!git log' x --grep push` and
// `git -c alias.x='!echo' x git push` are denied, known false positives.
// `args` are the words after the subcommand, as strings.
function gitIntegrates(g, args) {
  if (wordsIntegrate([g.subcommand, ...args])) return true;
  let alias = g.alias;
  let options = g.options;
  for (let depth = 0; alias !== null; depth++) {
    if (depth === ALIAS_DEPTH) return true;
    if (alias.startsWith('!')) {
      // git hands the appended words to the shell through "$@", so each is single-quoted: a quote, `)`, or `<<` in one is no shell text.
      const text = [alias.slice(1), ...args.map((w) => "'" + w.replace(/'/g, "'\\''") + "'")].join(' ');
      if (shellWords.rawNamesVerb(text, VERB_WORD)) return true;
      // The full reading can meet another `!` value inside this one; past ALIAS_DEPTH nested readings it is denied, failing closed.
      if (bangDepth === ALIAS_DEPTH) return true;
      bangDepth++;
      try {
        return commandLineIntegrates(text);
      } finally {
        bangDepth--;
      }
    }
    const split = splitCmdline(alias.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, ''));
    if (split === null) return true;
    const a = shellWords.gitSubcommand(['git', ...split]);
    if (a.subcommand === null) return false;
    args = [...split.slice(a.index), ...args];
    if (wordsIntegrate([a.subcommand, ...args])) return true;
    options = [...options, ...a.options];
    alias = shellWords.inlineAlias(options, a.subcommand);
  }
  return false;
}

// splitCmdline(value) -> string[] | null
// Splits an alias value into words the way git's split_cmdline does: a run of space, tab, newline, or carriage return (git's
// isspace) separates words, while a vertical tab, form feed, or Unicode space stays inside one; single and double quotes group
// and are removed, and a backslash outside single quotes escapes the next character. An unclosed quote or a trailing backslash,
// which git refuses to run, reads as null.
const GIT_SPACE = /[ \t\n\r]/;
function splitCmdline(value) {
  const words = [''];
  let quoted = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (!quoted && GIT_SPACE.test(c)) {
      while (i + 1 < value.length && GIT_SPACE.test(value[i + 1])) i++;
      words.push('');
    } else if (!quoted && (c === "'" || c === '"')) quoted = c;
    else if (c === quoted) quoted = '';
    else if (c === '\\' && quoted !== "'") {
      if (++i === value.length) return null;
      words[words.length - 1] += value[i];
    } else words[words.length - 1] += c;
  }
  return quoted ? null : words;
}

// True when a subcommand and the words after it integrate: the subcommand is guarded, or it is `subtree` whose own subcommand is `push`.
function wordsIntegrate(ws) {
  if (GUARDED.has(ws[0])) return true;
  if (ws[0] !== 'subtree') return false;
  for (let k = 1; k < ws.length; k++) {
    if (SUBTREE_VALUE.has(ws[k])) k++;
    else if (!ws[k].startsWith('-')) return ws[k] === 'push';
  }
  return false;
}

// True when one scanned command, read past its `NAME=` words, wrappers, and `rtk`, integrates.
// `xargs` appends the words it reads on stdin to the command behind it, so a git, gh, or tea command behind `xargs` that stops before
// its subcommand or its `pr` verb takes that word from stdin (`cat <<E | xargs git` with a body `push`): it is denied, failing closed.
function commandIntegrates(c) {
  const start = shellWords.commandStart(c.words);
  const words = c.words.slice(start);
  if (!words.length) return false;
  const open = c.words.slice(0, start).some((w) => /(?:^|\/)xargs$/.test(w.name || ''));
  const g = shellWords.gitSubcommand(words);
  if (g) return g.subcommand === null ? open : gitIntegrates(g, g.subcommand === 'subtree' || g.alias !== null ? words.slice(g.index + 1).map((w) => w.value) : []);
  const tool = words[0].value.length > 64 ? null : CLI.exec(words[0].value);
  if (!tool) return false;
  // The next word that is no option, past each option and the separate value a value option takes (`gh -R o/r pr merge 1`).
  const opts = CLI_VALUE_OPTS[tool[1]];
  const next = (k) => {
    while (k < words.length && words[k].value.startsWith('-')) k += opts.has(words[k].value) ? 2 : 1;
    return k;
  };
  const at = next(1);
  if (at >= words.length) return open;
  const w = words[at].value;
  if (w === 'pr' || (tool[1] === 'tea' && TEA_PULLS.test(w))) {
    const verb = next(at + 1);
    return verb < words.length ? words[verb].value === 'merge' || (tool[1] === 'tea' && words[verb].value === 'm') : open;
  }
  return w === 'api' && apiMerges(tool[1], words.slice(at + 1).map((x) => ' ' + x.value).join(''));
}

// The redirects a sink may carry besides its text on stdin: output to a plain file, for stdout or stderr.
const FILE_OPS = new Set(['>', '>>', '>|', '&>', '&>>']);
const TEXT_OPS = new Set(['<<', '<<-', '<<<']);
// A plain file path: no expansion, substitution, or process substitution, and no device or descriptor path but /dev/null.
const plainPath = (w) => !/[$`()<>]/.test(w.raw) && (w.value === '/dev/null' || !/(?:^|\/)(?:dev|proc)\//.test(w.value));
// Whether `args` hands a stdin body to one of the options `names` (`-F -`, `--file -`, `--file=-`).
const stdinOption = (args, names) => args.some((w, k) => (names.includes(w.value) && k + 1 < args.length && args[k + 1].value === '-') ||
  names.some((n) => n.startsWith('--') && w.value === n + '=-'));
const MESSAGE_GH = /^(?:pr|issue)$/;
const MESSAGE_TEA = /^(?:issues?|pulls?|pr)$/;
// A message sink that opens an editor on its text runs that editor over the body, so it is no sink: git's `-e` (alone or in a short
// cluster), `--edit` or a prefix of it, or a `-c`/`--config-env` value setting `core.editor` or `sequence.editor` (keys read
// case-insensitively, as git reads them); gh's `-e` (alone or in a short cluster) or `--editor`. tea 0.16.0 has no editor flag on its
// `--description-file` commands. An editor set by an environment word (`GIT_EDITOR=sh git …`) leaves no sink already: a sink takes no `NAME=` word.
const EDITOR_CONFIG = /^(?:core|sequence)\.editor(?:=|$)/i;
const GIT_EDIT = /^(?:-[a-zA-Z]*e|--e(?:d(?:it?)?)?$)/;
const GH_EDIT = /^(?:-[a-zA-Z]*e|--editor$)/;

// sink(t) -> boolean
// True when the heredoc body or here-string text `t` (a scan `texts` entry) goes to a pure file sink or a message sink standing
// alone on the line (see the header), so its text is data, never a command line. The answer is kept on the command (`sink`), which
// all its texts share, so a command holding many heredocs reads its redirects once.
function sink(t) {
  if (!t.alone) return false;
  if (t.cmd.sink === undefined) t.cmd.sink = isSink(t.cmd);
  return t.cmd.sink;
}
function isSink({ words, redirects }) {
  if (!words.length) return false;
  let out = false;
  for (const r of redirects) {
    if (TEXT_OPS.has(r.op)) {
      if (r.fd !== null && r.fd !== '0') return false;
    } else if (FILE_OPS.has(r.op) && (r.fd === null || r.fd === '1' || r.fd === '2') && plainPath(r.target)) {
      if (r.fd !== '2') out = true;
    } else return false;
  }
  const name = words[0].name === null ? '' : words[0].name;
  const base = name.replace(/^.*\//, '');
  const args = words.slice(1);
  if (base === 'cat') return out && args.length === 0;
  if (base === 'tee') return out && args.every((w) => w.value === '-a' || (!w.value.startsWith('-') && plainPath(w)));
  if (base === 'git') {
    const g = shellWords.gitSubcommand(words);
    if (g === null || g.subcommand !== 'commit' || g.alias !== null) return false;
    const rest = words.slice(g.index + 1);
    if (g.options.some((o) => o.value !== null && EDITOR_CONFIG.test(o.value)) || rest.some((w) => GIT_EDIT.test(w.value))) return false;
    return stdinOption(rest, ['-F', '--file']);
  }
  if (base === 'gh') return args.length > 0 && MESSAGE_GH.test(args[0].value) && !args.some((w) => GH_EDIT.test(w.value)) && stdinOption(args, ['-F', '--body-file']);
  if (base === 'tea') return args.length > 0 && MESSAGE_TEA.test(args[0].value) && stdinOption(args, ['--description-file']);
  return false;
}

// The base hook's line rule, which still reads a sink's text: a line or `;`, `&`, `|` segment that starts with `git`, behind any
// `rtk` prefix, and later names a guarded verb (`cat > f <<E` with a line `git push`). The base hook denied that whatever received it.
const SEGMENT_GIT = new RegExp(`^[ \\t]*${RTK_PREFIX}git(?![-\\w])`);
const lineIntegrates = (text) => text.split(/[;&|\n]/).some((s) => {
  const m = SEGMENT_GIT.exec(s);
  return m !== null && VERB_WORD.test(s.slice(m[0].length));
});

// True when the scanned command integrates, or cannot be read and names an integration in its raw text.
function integrates(cmd) {
  const r = shellWords.scan(cmd, { quoted: true });
  if (!r.readable) return rawIntegrates(cmd);
  if (r.failedQuoted.some(rawIntegrates)) return true;
  // A heredoc body or here-string text naming an integration is denied unless a sink receives it (the base rule). A line running
  // `exec` may point a sink's file at a shell (`exec > >(sh); cat > /dev/stdout`), so it exempts none.
  const exec = r.commands.some((c) => c.words.slice(0, shellWords.commandStart(c.words) + 1).some((w) => w.name === 'exec'));
  if (r.texts.some((t) => (rawIntegrates(t.text) || isApiMerge(t.text)) && (exec || !sink(t) || lineIntegrates(t.text)))) return true;
  return r.commands.some(commandIntegrates);
}

// True when a command line integrates: its scanned reading, its dash reading, the CLI line rule, or a `tea api`/`gh api` merge.
function commandLineIntegrates(cmd) {
  const dash = shellWords.dashReading(cmd);
  return integrates(cmd) || (dash !== null && integrates(dash)) || BLOCK_CLI.test(cmd) || isApiMerge(cmd);
}

function decide(input) {
  if (!input || !input.agent_id) return { block: false }; // controller (or unknown) → allow
  const cmd = (input.tool_input && input.tool_input.command) || '';
  let hit;
  try {
    if (!shellWords) return { block: true, reason: BROKEN };
    bangDepth = 0;
    hit = commandLineIntegrates(cmd);
  } catch {
    return { block: true, reason: BROKEN };
  }
  return hit ? { block: true, reason: INTEGRATE } : { block: false };
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

module.exports = { decide };
