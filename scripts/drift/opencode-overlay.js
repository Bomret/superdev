'use strict';

// The Render overlay format (ADR 0060, CONTEXT.md → *Render overlay*): the committed form of a
// derived OpenCode surface whose render is line-aligned with its `plugin/skills/*/SKILL.md` or
// `plugin/agents/*.md` source — the rendered frontmatter in full, plus only the body lines that
// differ from the source, keyed by line number. `opencode-fixtures.js` writes this form;
// `scanners.js`'s `scanOpencodeFixtures` recomputes it fresh and compares (ADR 0060's own words: "The
// check renders fresh, computes the overlay against the source the same way, and compares").
//
// A surface with no line-aligned source — the `afk` command, the generated hook bridge, and the
// synthesized `upgrade` skill — carries no overlay: `sourceForRendered` returns null for each, and
// both callers fall back to comparing the whole rendered body verbatim.

const path = require('node:path');

// The sentinel a committed fixture opens with when it carries overlay form rather than a whole
// rendered body. A real render always opens with `---` (its own frontmatter fence), so this can
// never collide with one.
const OVERLAY_MARKER = 'superdev-render-overlay';

// A skill name whose render is synthesized rather than a body pass-through, even though a
// same-named `plugin/skills/<name>/SKILL.md` exists — `upgrade` (ADR 0052) is the only one today.
// Adding a name here is the recovery ADR 0060 names for a skill whose render stops being
// line-aligned with its source.
const WHOLE_BODY_SKILL_NAMES = new Set(['upgrade']);

// The leading `---\n...\n---\n?` frontmatter fence, read the same way adapter.js's own
// readFrontmatter does (CRLF-normalized, matched rather than YAML-parsed). Returns
// { frontmatter, body }, with `frontmatter` null when the text carries none.
function splitFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: null, body: normalized };
  return { frontmatter: match[0], body: normalized.slice(match[0].length) };
}

// sourceForRendered(pluginDir, relpath): the plugin.md/SKILL.md path relpath renders line-for-line
// from, or null when relpath carries no such source — a command (only `afk` renders as one today),
// the generated hook bridge, or a WHOLE_BODY_SKILL_NAMES member. `relpath` is relative to the
// render root (dest), using either path separator.
function sourceForRendered(pluginDir, relpath) {
  const posix = relpath.split(path.sep).join('/');
  const skillMatch = posix.match(/^\.opencode\/skills\/superdev-([a-z0-9-]+)\/SKILL\.md$/);
  if (skillMatch && !WHOLE_BODY_SKILL_NAMES.has(skillMatch[1])) {
    return path.join(pluginDir, 'skills', skillMatch[1], 'SKILL.md');
  }
  const agentMatch = posix.match(/^\.opencode\/agents\/([a-z0-9-]+)\.md$/);
  if (agentMatch) return path.join(pluginDir, 'agents', `${agentMatch[1]}.md`);
  return null;
}

// computeOverlay(sourceText, renderedText): the overlay a line-aligned render carries against its
// source. Every skill/agent render builds `${frontmatter}\n${body with its leading blank lines
// collapsed to one}` (adapter.js's renderSkill/renderAgent/renderCommand), so the same transform
// applied to the source's own body is what the rendered body must equal, line for line, wherever a
// rewrite (rewriteProse, the `$ARGUMENTS` substitution) did not touch it. Returns
// `{ ok: true, overlay: { frontmatter, bodyLineCount, diffs } }`, or `{ ok: false, reason }` when
// the two bodies carry a different number of lines — alignment failed, and the caller must refuse
// rather than overlay onto the wrong line numbers (ADR 0060).
function computeOverlay(sourceText, renderedText) {
  const rendered = splitFrontmatter(renderedText);
  if (!rendered.frontmatter) return { ok: false, reason: 'the render carries no frontmatter block' };
  const source = splitFrontmatter(sourceText);
  const expectedLines = `\n${source.body.replace(/^\n+/, '')}`.split('\n');
  const renderedLines = rendered.body.split('\n');
  if (expectedLines.length !== renderedLines.length) {
    return {
      ok: false,
      reason: `the source's body is ${expectedLines.length} lines, the render's is ${renderedLines.length}`,
    };
  }
  const diffs = [];
  for (let i = 0; i < expectedLines.length; i += 1) {
    if (expectedLines[i] !== renderedLines[i]) diffs.push({ line: i + 1, content: renderedLines[i] });
  }
  return { ok: true, overlay: { frontmatter: rendered.frontmatter, bodyLineCount: renderedLines.length, diffs } };
}

// serializeOverlay(sourceRel, overlay): the committed text form of `overlay` (as computeOverlay
// returns it), naming `sourceRel` — the source path relative to the plugin root, forward-slashed —
// for a human reading the fixture. Round-trips through parseOverlay.
function serializeOverlay(sourceRel, overlay) {
  const lines = [OVERLAY_MARKER, `source: ${sourceRel}`, `body-lines: ${overlay.bodyLineCount}`];
  lines.push(...overlay.frontmatter.replace(/\n$/, '').split('\n'));
  for (const { line, content } of overlay.diffs) lines.push(`@${line}`, content);
  return `${lines.join('\n')}\n`;
}

// parseOverlay(text): the inverse of serializeOverlay, or null when `text` carries no
// OVERLAY_MARKER header (a whole-body fixture, read as such by the caller instead). A marker
// present but malformed after that is a fixture the maintainer broke by hand — thrown, not
// swallowed, so a bad edit is loud rather than read as "no longer matches".
function parseOverlay(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines[0] !== OVERLAY_MARKER) return null;
  const source = (lines[1] || '').startsWith('source: ') ? lines[1].slice('source: '.length) : null;
  const bodyLineCount = Number((lines[2] || '').startsWith('body-lines: ') ? lines[2].slice('body-lines: '.length) : NaN);
  if (lines[3] !== '---') throw new Error('overlay fixture carries no frontmatter block');
  let end = 4;
  while (end < lines.length && lines[end] !== '---') end += 1;
  if (end >= lines.length) throw new Error('overlay fixture frontmatter block never closes');
  const frontmatterText = `${lines.slice(3, end + 1).join('\n')}\n`;
  const diffs = [];
  let i = end + 1;
  while (i < lines.length) {
    const m = lines[i].match(/^@(\d+)$/);
    if (!m) throw new Error(`overlay fixture has a malformed diff marker at its line ${i + 1}: ${lines[i]}`);
    diffs.push({ line: Number(m[1]), content: lines[i + 1] ?? '' });
    i += 2;
  }
  return { source, bodyLineCount, frontmatter: frontmatterText, diffs };
}

// overlaysEqual(a, b): the same frontmatter, the same body-lines count, and the same (line, content)
// diffs in the same order — what the drift check treats as "still matches a fresh render" for an
// overlay-form fixture. body-lines carries no weight of its own beyond this comparison (the diffs
// alone locate every rewritten line), but it is a cheap cross-check against a truncated or
// otherwise corrupted fixture the line-keyed diffs would miss — a dropped trailing line that was
// identical to the source needs no diff entry, so only the count would ever show it.
function overlaysEqual(a, b) {
  if (a.frontmatter !== b.frontmatter) return false;
  if (a.bodyLineCount !== b.bodyLineCount) return false;
  if (a.diffs.length !== b.diffs.length) return false;
  return a.diffs.every((d, i) => d.line === b.diffs[i].line && d.content === b.diffs[i].content);
}

module.exports = {
  OVERLAY_MARKER,
  WHOLE_BODY_SKILL_NAMES,
  sourceForRendered,
  computeOverlay,
  serializeOverlay,
  parseOverlay,
  overlaysEqual,
};
