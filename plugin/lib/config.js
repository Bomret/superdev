'use strict';

// config.js: the `config` verb, one configuration value of `docs/agents/*.md` per call (INV-0213, INV-0196): the remote, the
// base branch, the deploy posture, or which test commands are configured, each read the way the plugin's own code reads it.
// It prints one line, the value or `absent`, and writes nothing.

const { fail } = require('./refusal.js');
const { readConfigDoc } = require('./config-doc.js');
const { bulletValue, parseRemote } = require('./remote.js');
const { readPosture } = require('./route.js');
const { verificationCommandsOf } = require('./verification.js');

// The `Base branch:` bullet's value: a leading backtick span, trimmed, or else the whole value where it is one bare token once
// trailing `.,;:` is stripped. Null where the bullet is absent, opens with prose, or holds an empty span. The seeds' unfilled
// value opens with prose, so it reads as absent.
function parseBase(docText) {
  const raw = bulletValue(docText, 'Base branch') || '';
  const span = /^`([^`\n]*)`/.exec(raw);
  if (span) return span[1].trim() || null;
  const token = raw.replace(/[.,;:]+$/, '');
  return token && !/\s/.test(token) ? token : null;
}

// Which of the full and focused test-command slots `verification.md` fills: `full focused`, `full`, `focused`, or `none`.
function commandsOf(docText) {
  const { full, focused } = verificationCommandsOf(docText);
  return [full && 'full', focused && 'focused'].filter(Boolean).join(' ') || 'none';
}

// A key's reader over one document: the document's text at `at`, or at the top level, parsed, or null where it is absent.
const fromDoc = (doc, parse) => (cwd, at) => {
  const text = readConfigDoc(cwd, doc, at, 'config');
  return text === null ? null : parse(text);
};

// Each key's reader, taking the caller's directory and `--at` and answering the value, or null for absent. `option` marks a
// value git would take as an argument, so one that starts with `-` is refused.
const KEYS = {
  remote: { read: fromDoc('code-management.md', parseRemote), option: true },
  base: { read: fromDoc('code-management.md', parseBase), option: true },
  posture: { read: (cwd, at) => readPosture(cwd, at, 'config') },
  commands: { read: fromDoc('verification.md', commandsOf) },
};
const NAMES = Object.keys(KEYS);
const listed = (conj) => `${NAMES.slice(0, -1).join(', ')}, ${conj} ${NAMES[NAMES.length - 1]}`;

// `config <key> [--at <commit>]`.
function verbConfig(cwd, args) {
  let key;
  let at;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--at') {
      if (at !== undefined) fail('config: --at given twice');
      at = args[i + 1];
      if (at === undefined || at === '') fail('config: --at needs a commit');
      i += 1;
    } else if (key === undefined && !arg.startsWith('-')) key = arg;
    else fail(`config: unrecognized argument "${arg}"`);
  }
  if (key === undefined) fail(`config needs a key: ${listed('or')}`);
  if (!Object.hasOwn(KEYS, key)) fail(`config: unknown key "${key}"; the keys are ${listed('and')}`);
  const value = KEYS[key].read(cwd, at);
  if (value && KEYS[key].option && value.startsWith('-')) fail(`config: the configured ${key} "${value}" starts with "-"; git would read it as an option`);
  console.log(value || 'absent');
}

module.exports = { verbConfig };
