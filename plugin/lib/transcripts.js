'use strict';

// transcripts.js: finds the Claude Code transcripts of one repository and reads each session and its
// subagents into timestamped entries (ADR 0103). It only reads under the projects directory, never
// writes there (INV-0101), and reports an entry lacking a field it reads as unrecognized.

const fs = require('fs');
const os = require('os');
const path = require('path');

// The entry types the run profile reads. Claude Code's bookkeeping types (`ai-title`, `last-prompt`, …)
// carry no timestamp and are skipped.
const READ_TYPES = new Set(['user', 'assistant', 'attachment', 'system']);

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

module.exports = { projectsDirFor, transcriptDirs, readJsonl, readSession, blocks, text };
