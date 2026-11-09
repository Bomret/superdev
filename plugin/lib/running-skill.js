'use strict';

// running-skill.js: the superdev skill a session's transcript last started (ADR 0222). A typed command arrives as a user
// message carrying `<command-name>/superdev:<name></command-name>`; a model-started one as a `Skill` tool call whose
// `skill` is `superdev:<name>`. The offer guard reads it to pass a turn whose next command is the skill still running.

const fs = require('fs');

const TYPED = /<command-name>\/superdev:([a-z][a-z-]*)<\/command-name>/;
const CALLED = /^superdev:([a-z][a-z-]*)$/;

// The name a user message's text starts with a typed command of, or null. Tool results are skipped.
function typedName(content) {
  const texts = typeof content === 'string'
    ? [content]
    : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text) : [];
  for (const t of texts) {
    const m = typeof t === 'string' && TYPED.exec(t);
    if (m) return m[1];
  }
  return null;
}

// The name a `Skill` tool call in an assistant message starts, or null.
function calledName(content) {
  if (!Array.isArray(content)) return null;
  let name = null;
  for (const b of content) {
    const m = b && b.type === 'tool_use' && b.name === 'Skill' && b.input && typeof b.input.skill === 'string'
      && CALLED.exec(b.input.skill);
    if (m) name = m[1];
  }
  return name;
}

// The superdev skill the transcript at `file` last started, or null when it started none or cannot be read.
function runningSkill(file) {
  if (typeof file !== 'string' || !file) return null;
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  let name = null;
  for (const line of raw.split('\n')) {
    if (!line.includes('superdev:')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry && entry.message && entry.message.content;
    const found = entry.type === 'user' ? typedName(content) : entry.type === 'assistant' ? calledName(content) : null;
    if (found) name = found;
  }
  return name;
}

module.exports = { runningSkill };
