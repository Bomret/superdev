'use strict';

// shell-word-readers.js: the readers of shell words that only the Bash hooks use: a git command's subcommand and inline alias, the raw-text verb rule, and a
// Git Bash drive path (ADR 0135). The rule: shell-words.js, the scanner core, holds every function its tokenizer calls (commandStart,
// optionWords, dashReading), and this module holds the rest. This module is a leaf: it requires no other module, and the core
// requires it and re-exports every name, so a hook reads all of them from the scanner.

// A `NAME=value` word, `NAME[i]=value` and `NAME+=value` included.
const ASSIGN_WORD = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
const RTK_RUNNERS = new Set(['proxy', 'err', 'run', 'summary', 'test']);
const GIT_VALUE_OPTS = new Set(['-C', '-c']);
const GIT_LONG_VALUE_OPTS = new Set(['--git-dir', '--work-tree', '--namespace', '--config-env', '--shallow-file', '--attr-source']);
// git's global options that print and exit, running no subcommand: `--exec-path` without a value, `--version`, `-v`, `--help`,
// `-h`, and the documentation paths (ADR 0160).
const GIT_EXITS = /^(?:--exec-path|--version|-v|--help|-h|--html-path|--man-path|--info-path)$/;

// gitSubcommand(words) -> { subcommand, values, options, index, alias } | null
// Reads past `rtk` (its options and a run-anything subcommand), `git`, and git's global options.
// `subcommand` is the first word after them (null when none, and when a print-and-exit option comes first: GIT_EXITS), `values`
// the values the options took,
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
    } else if (GIT_EXITS.test(w)) return { subcommand: null, values, options, index: -1, alias: null };
    else if (w.startsWith('-')) i++;
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

// A Git Bash drive path (`/c/Users/x`) as the Windows path (`C:/Users/x`) on win32 (ADR 0150). MSYS converts
// such a path for the programs it starts, but a hook reads the raw command text. Only `/<letter>` followed by
// `/` or the end translates; every other path (`/tmp/x`, `/dev/null`, `/cc/x`) and every other platform keeps it.
function drivePath(p, platform = process.platform) {
  const m = platform === 'win32' && /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] || '/'}` : p;
}

module.exports = { ASSIGN_WORD, RTK_RUNNERS, gitSubcommand, inlineAlias, rawNamesVerb, drivePath };
