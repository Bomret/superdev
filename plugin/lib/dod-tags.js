'use strict';

// dod-tags.js: the `dod-tags` verb, the rewrite of a Definition of Done's slice-id tags into store notation
// and the check that every unjudged line carries a tag `dod-line` reads (ADR 0209, INV-0182).

const { fail } = require('./refusal.js');
const { splitLines } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');
const {
  dodLineHasNote, dodSectionRange, takeOption, readOptionFile, DOD_LINE_RE, DOD_NO_NOTE_TAG_RE,
} = require('./dod-line.js');

const SLICE_ID_RE = /^\d+$/;
const STORE_REF_RE = /^(?:#\d+|[A-Z][A-Z0-9_]*-\d+)$/;

// The tag map: one `<id> <reference>` pair per line, the reference in store notation.
function readTagMap(mapFile) {
  const map = new Map();
  const problems = [];
  for (const raw of readOptionFile('--map-file', mapFile).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [id, ref, ...extra] = line.split(/\s+/);
    if (!SLICE_ID_RE.test(id) || ref === undefined || extra.length) problems.push(`not an "<id> <reference>" pair: ${line}`);
    else if (!STORE_REF_RE.test(ref)) problems.push(`reference not in store notation: ${line}`);
    else if (map.has(id)) problems.push(`duplicate id ${id}: ${line}`);
    else map.set(id, ref);
  }
  if (problems.length) fail('dod-tags refused the map:\n' + problems.join('\n'));
  return map;
}

// One checklist line: the line rewritten (or unchanged), or the reason it is refused.
function tagLine(line, map) {
  const m = line.match(DOD_LINE_RE);
  if (!m || dodLineHasNote(line)) return { line };
  const trimmed = line.replace(/\s+$/, '');
  const tagged = m[2].match(DOD_NO_NOTE_TAG_RE);
  if (!tagged) {
    const entries = trimmed.slice(trimmed.lastIndexOf(' — ') + 3).split(/,\s*/);
    const joined = trimmed.includes(' — ') && entries.length > 1 && entries.some((e) => e === 'scope' || e === 'docs');
    return { problem: joined ? 'joins scope or docs with other entries' : 'carries no tag dod-line reads' };
  }
  const tag = tagged[2];
  if (!map) return { line };
  const parts = tag.split(/,\s*/);
  const missing = parts.filter((p) => SLICE_ID_RE.test(p) && !map.has(p));
  if (missing.length) return { problem: `names slice id ${missing.join(', ')} the map lacks` };
  const rewritten = parts.map((p) => (SLICE_ID_RE.test(p) ? map.get(p) : p)).join(', ');
  const at = trimmed.length - tag.length;
  return { line: line.slice(0, at) + rewritten + line.slice(at + tag.length) };
}

function refuse(problems) {
  fail('dod-tags refused:\n' + problems.map((p) => `${p.where}: ${p.problem}: ${p.text}`).join('\n'));
}

function verbDodTags(args, stdinRaw) {
  const mapFile = takeOption(args, '--map-file');
  const lineMode = args.includes('--line');
  const map = mapFile === undefined ? null : readTagMap(mapFile);
  if (!stdinRaw || !stdinRaw.trim()) fail('dod-tags refused: the input is empty');

  if (lineMode) {
    const line = stdinRaw.replace(/\r?\n$/, '');
    const r = tagLine(line, map);
    if (r.problem) refuse([{ where: 'line', problem: r.problem, text: line }]);
    console.log(r.line);
    return;
  }
  const lines = splitLines(stdinRaw);
  const masked = maskFencedLines(lines, 'dod-tags input', 'rewritten');
  const range = dodSectionRange(masked);
  if (!range) fail('dod-tags refused: the body carries no ## Definition of Done section');
  const out = lines.slice();
  const problems = [];
  for (let i = range.start + 1; i < range.end; i += 1) {
    if (!masked[i]) continue;
    const r = tagLine(masked[i], map);
    if (r.problem) problems.push({ where: `line ${i + 1}`, problem: r.problem, text: lines[i] });
    else out[i] = r.line;
  }
  if (problems.length) refuse(problems);
  // Each line keeps its own ending, so a CRLF or mixed body comes out byte-identical outside the rewrites.
  const ends = stdinRaw.match(/\r?\n/g) || [];
  process.stdout.write(out.map((l, i) => l + (ends[i] || '')).join(''));
}

module.exports = { verbDodTags };
