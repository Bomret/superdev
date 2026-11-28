'use strict';

// config.js: the `config` verb, one configuration value of `docs/agents/*.md` per call (INV-0213, INV-0196): the remote, the
// base branch, the deploy posture, or which test commands are configured, each read the way the plugin's own code reads it.
// It prints one line, the value or `absent`, and writes nothing.

const { fail } = require('./refusal.js');
const { readConfigDoc } = require('./config-doc.js');
const { bulletValue, parseRemote } = require('./remote.js');
const { readPosture } = require('./route.js');
const { verificationCommandsOf } = require('./verification.js');

// The `Base branch:` bullet's value where it opens with a backtick span, that span trimmed; null where the bullet is absent,
// opens with prose, or holds an empty span. The seeds' unfilled value opens with prose, so it reads as absent.
function parseBase(docText) {
  const m = /^`([^`\n]*)`/.exec(bulletValue(docText, 'Base branch') || '');
  return m ? m[1].trim() || null : null;
}

// Which of the full and focused test-command slots `verification.md` fills: `full focused`, `full`, `focused`, or `none`.
function commandsOf(docText) {
  const { full, focused } = verificationCommandsOf(docText);
  return [full && 'full', focused && 'focused'].filter(Boolean).join(' ') || 'none';
}

// Each key's document and reader. A reader takes the document's text and answers the value, or null for absent.
const KEYS = {
  remote: { doc: 'code-management.md', read: parseRemote, option: true },
  base: { doc: 'code-management.md', read: parseBase, option: true },
  commands: { doc: 'verification.md', read: commandsOf },
};

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
  if (key === undefined) fail('config needs a key: remote, base, posture, or commands');
  if (key !== 'posture' && !KEYS[key]) fail(`config: unknown key "${key}"; the keys are remote, base, posture, and commands`);
  let value;
  if (key === 'posture') value = readPosture(cwd, at, 'config');
  else {
    const text = readConfigDoc(cwd, KEYS[key].doc, at, 'config');
    value = text === null ? null : KEYS[key].read(text);
  }
  if (value && KEYS[key] && KEYS[key].option && value.startsWith('-')) fail(`config: the configured ${key} "${value}" starts with "-"; git would read it as an option`);
  console.log(value || 'absent');
}

module.exports = { verbConfig };
