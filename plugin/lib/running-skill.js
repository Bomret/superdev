'use strict';

// running-skill.js: the superdev skill a session's transcript last started (ADR 0222). A typed command arrives as a user
// message whose text opens with `<command-message>…</command-message>` and `<command-name>/superdev:<name></command-name>`;
// a model-started one as a `Skill` tool call whose `skill` is `superdev:<name>`. The offer guard reads it to pass a turn
// whose next command is the skill still running.

const fs = require('fs');

const TYPED = /^<command-message>[^<]*<\/command-message>\s*<command-name>\/superdev:([a-z][a-z-]*)<\/command-name>/;
const CALLED = /^superdev:([a-z][a-z-]*)$/;
const CHUNK = 1 << 20;

// The name a user message's text opens with a typed command of, or null. Tool results are skipped.
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

// The name the last `Skill` tool call in an assistant message starts, or null.
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

// The skill one transcript line starts, or null.
function lineName(line) {
  if (!line.includes('superdev:')) return null;
  let entry;
  try { entry = JSON.parse(line); } catch { return null; }
  const content = entry && entry.message && entry.message.content;
  return entry.type === 'user' ? typedName(content) : entry.type === 'assistant' ? calledName(content) : null;
}

// The superdev skill the transcript at `file` last started, or null when it started none or cannot be read. Reads the
// file backward in chunks and stops at the last start, so a long transcript costs only its tail since that start.
function runningSkill(file) {
  if (typeof file !== 'string' || !file) return null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    let pos = fs.fstatSync(fd).size;
    let rest = Buffer.alloc(0);
    while (pos > 0) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      const data = Buffer.concat([buf, rest]);
      // Before the file's start, the chunk's first line may be partial: keep it for the next, earlier chunk.
      const cut = pos > 0 ? data.indexOf(0x0a) : -1;
      if (pos > 0 && cut < 0) { rest = data; continue; }
      rest = data.subarray(0, Math.max(cut, 0));
      const lines = data.subarray(cut + 1).toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const name = lineName(lines[i]);
        if (name) return name;
      }
    }
    return null;
  } catch { return null; } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ }
  }
}

module.exports = { runningSkill };
