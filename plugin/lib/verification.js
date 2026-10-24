'use strict';

// verification.js: the readers of a tree's `docs/agents/verification.md`: its configured test commands and its test-path patterns.

const fs = require('fs');
const path = require('path');

// The fenced blocks of a document, read line by line. A fence opens on a line that starts, after at
// most three spaces of indentation, with three or more backticks or tildes and any info string (a
// backtick fence's info string holds no backtick, so an inline span such as ```x``` is no opener). It
// closes on a line with the same indentation limit, of the same character, at least as long as the
// opener. `blocks` holds each closed block's body, `outside` the text between blocks. An unclosed
// fence yields no block.
function fenceBlocks(raw) {
  const blocks = [];
  const outside = [];
  let open = null;
  let body = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) { open = m[1]; body = []; } else outside.push(line);
    } else if (/^ {0,3}(`+|~+)\s*$/.test(line) && line.trim()[0] === open[0] && line.trim().length >= open.length) {
      blocks.push(body.join('\n'));
      open = null;
    } else body.push(line);
  }
  return { blocks, outside: outside.join('\n') };
}

// The default test patterns, used where `docs/agents/verification.md` has no usable `## Test paths`.
const DEFAULT_TEST_PATHS = ['**/tests/', '**/test/', '**/__tests__/', '**/spec/', '**/*.Tests/', '**/*.Test/', '*.test.*', '*.spec.*', '*_test.*', 'test_*.py'];

// One glob entry -> a RegExp over a repo-relative path, or null for a malformed entry. `*` stays in a
// path segment, `**` crosses them, a trailing `/` names a directory. An entry holding a `/` is anchored
// at the repository root; one without matches a file name at any depth.
function globToRe(glob) {
  if (!glob || /\s/.test(glob) || glob.startsWith('/') || glob.split('/').includes('..')) return null;
  const dir = glob.endsWith('/');
  const body = dir ? glob.slice(0, -1) : glob;
  if (!body) return null;
  let re = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '*' && body[i + 1] === '*') {
      if (body[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const anchored = body.includes('/') || dir ? '^' : '^(?:.*/)?';
  return new RegExp(anchored + re + (dir ? '/' : '$'));
}

// The `## Test paths` entries of a `docs/agents/verification.md` text: list items, each one pattern
// optionally in a backtick span. Null where the section is absent or holds no usable entry.
function configuredTestPaths(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+Test paths\s*$/.test(l));
  if (at < 0) return null;
  const res = [];
  for (let i = at + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
    const m = /^\s*[-*]\s+(?:`([^`]*)`|(\S+))\s*$/.exec(lines[i]);
    const re = m && globToRe(m[1] !== undefined ? m[1] : m[2]);
    if (re) res.push(re);
  }
  return res.length ? res : null;
}

// The compiled test-path patterns of a `verification.md` text ('' for no file): its configured ones, or the defaults.
// A caller classifying many paths compiles them once (`source-set`).
function testPathPatterns(text) {
  return configuredTestPaths(text) || DEFAULT_TEST_PATHS.map(globToRe);
}

// Whether repo-relative `rel` is a test path under the `verification.md` text given ('' for no file).
// The one classifier: lib/run-tree.js reads its tree's file, `suite reusable` reads a commit's (ADR 0128).
function isTestPath(text, rel) {
  return testPathPatterns(text).some((re) => re.test(rel));
}

// The test commands a tree's `docs/agents/verification.md` configures, read the way
// `references/test-selection.md` reads it: the first fenced block (`fenceBlocks`) is the full
// command, the second the focused one, and the first backtick span under `## Whole-repo command` the
// whole-repo one. Each is whitespace-collapsed, or null when absent. The run-trace hook (ADR 0117)
// classes a Bash command against them.
function verificationCommands(tree, keepLines) {
  let raw;
  try { raw = fs.readFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), 'utf8'); } catch { return { full: null, focused: null, whole: null }; }
  return verificationCommandsOf(raw, keepLines);
}

// The same read over a `verification.md` text already in hand (the `fail-to-pass` verb reads a commit's, ADR 0134).
function verificationCommandsOf(raw, keepLines) {
  // `keepLines` keeps a fence's own newlines, for the runner that executes the command as written (ADR 0127).
  const norm = (t) => (t ? (keepLines ? t.trim() : t.replace(/\s+/g, ' ').trim()) || null : null);
  const { blocks, outside } = fenceBlocks(raw.replace(/\r\n?/g, '\n'));
  const sec = /^##\s+Whole-repo command\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/m.exec(outside);
  const span = sec && /`([^`\n]+)`/.exec(sec[1]);
  return { full: norm(blocks[0]), focused: norm(blocks[1]), whole: norm(span && span[1]) };
}

// The complete-selector declaration of a `verification.md` text (ADR 0175): null where there is no
// `## Complete selector` section, else `{ files }`, the selector's own files — the backtick spans of the
// section's list items (marker `-`, `*`, `+`, or an ordered `1.`), as root-relative paths. A list item names its
// first backtick span whatever text precedes or follows it, and a listed path covers itself and every path under it, a trailing `/` being optional. Fenced code is no heading and no list, and the section runs to
// the next heading of level 2 or above.
function completeSelector(text) {
  const files = [];
  let inSection = false;
  let found = false;
  for (const line of fenceBlocks(text).outside.split('\n')) {
    if (/^#{1,2}\s/.test(line)) {
      inSection = /^##\s+Complete selector\s*$/.test(line);
      found = found || inSection;
    } else if (inSection) {
      const m = /^\s*(?:[-*+]|\d+[.)])\s+[^`]*`([^`]+)`/.exec(line);
      if (m) files.push(m[1]);
    }
  }
  return found ? { files } : null;
}

module.exports = { isTestPath, testPathPatterns, verificationCommands, verificationCommandsOf, completeSelector };
