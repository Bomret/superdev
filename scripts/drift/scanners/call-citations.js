'use strict';

// The scanner for a store or code-host call cited with no section heading. A skill, a non-seed reference, or an agent
// cites a seed call as "**<name>** call" or within "**<A>** and **<B>** calls", and the controller fetches it with
// `scope.js section` only when the same unit names the `## ` heading that holds it. The call names come from the seeds
// themselves, so a call a seed adds is checked with no edit here. Its read set, its unit rule, and its exemption rule
// are its `call-citations` row in `scripts/AGENTS.md`.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, fenceLines } = require('../lib');

// The seed families, each judged on its own: the store seeds, the store plan seeds, and the code-host seeds.
const FAMILIES = [
  ['store', /^issue-tracker-[a-z0-9]+\.md$/],
  ['plan', /^issue-tracker-[a-z0-9]+-plan\.md$/],
  ['host', /^code-management-[a-z0-9]+\.md$/],
];
const familyOf = (name) => (FAMILIES.find(([, re]) => re.test(name)) || [null])[0];

// A bullet that defines one call, `**Name**:`, `**Name:**`, `**Name.**`, or `**Name** (context):`, and one that defines a
// pair, `**A** and **B:**`, its last label ending in any of those forms.
const LABEL_END = String.raw`(?:[:.]\*\*|\*\*\s*(?:\([^)]*\))?\s*:)`;
const SINGLE = new RegExp(String.raw`^\s*[-*+]\s+\*\*([^*]+?)${LABEL_END}`);
const PAIR = new RegExp(String.raw`^\s*[-*+]\s+\*\*([^*]+?)[:.]?\*\*\s+and\s+\*\*([^*]+?)${LABEL_END}`);

// The call names a bullet line defines, none where it defines no call.
function definedNames(line) {
  const pair = PAIR.exec(line);
  if (pair) return [pair[1], pair[2]];
  const single = SINGLE.exec(line);
  return single ? [single[1]] : [];
}
// A citation: `**<name>** call`, or `**<A>** and **<B>** calls`, a comma before the `and` allowed.
const CITATION = /(?:\*\*([^*]+)\*\*,? and )?\*\*([^*]+)\*\* calls?\b/g;
const HEADING_SPAN = /`##\s+([^`]+?)\s*`/g;

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Every `.md` file at any depth below dir, as absolute paths. An absent dir holds none.
function markdownFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files.sort();
}

// name -> family -> seed file -> Set of the `## ` headings that hold a bullet defining it, read outside fences.
function seedCalls(refs) {
  const calls = new Map();
  const seeds = new Map();
  for (const file of markdownFiles(refs).filter((f) => path.dirname(f) === refs)) {
    const family = familyOf(path.basename(file));
    if (!family) continue;
    if (!seeds.has(family)) seeds.set(family, []);
    seeds.get(family).push(file);
    let h2 = null;
    let deeper = false;
    for (const { line, role } of fenceLines(fs.readFileSync(file, 'utf8'))) {
      if (role !== 'text') continue;
      const bare = line.replace(/\r$/, '');
      const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(bare);
      if (h) {
        if (h[1].length === 2) h2 = norm(h[2]);
        else if (h[1].length < 2) h2 = null;
        deeper = h[1].length <= 3;
        continue;
      }
      if (h2 === null || !deeper) continue;
      for (const raw of definedNames(bare)) {
        const name = norm(raw);
        if (!calls.has(name)) calls.set(name, new Map());
        const byFamily = calls.get(name);
        if (!byFamily.has(family)) byFamily.set(family, new Map());
        const bySeed = byFamily.get(family);
        if (!bySeed.has(file)) bySeed.set(file, new Set());
        bySeed.get(file).add(h2);
      }
    }
  }
  return { calls, seeds };
}

// The headings a citation of `name` may name, or null where the name is exempt: some family defining it holds it under
// different headings in different seeds, or not in every seed. A valid heading holds the name in every seed of a family.
function validHeadings(name, calls, seeds) {
  const valid = new Set();
  for (const [family, bySeed] of calls.get(name)) {
    const all = seeds.get(family).map((f) => bySeed.get(f) || new Set());
    const key = (set) => [...set].sort().join('\n');
    if (all.some((set) => key(set) !== key(all[0]))) return null;
    for (const h of all[0]) valid.add(h);
  }
  return valid;
}

// The blocks of a document: a paragraph, a list item with its indented continuation lines, or a table cell, each with
// its hard-wrapped lines joined by one space and the source line of every offset. Fenced lines and headings end a block.
function blocks(text) {
  const out = [];
  let cur = null;
  const close = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  const add = (s, lineNo, fresh) => {
    if (fresh || !cur) {
      close();
      cur = { text: '', lines: [] };
    } else cur.text += ' ';
    cur.lines.push({ at: cur.text.length, line: lineNo });
    cur.text += s;
  };
  fenceLines(text).forEach(({ line, role }, i) => {
    const bare = line.replace(/\r$/, '');
    if (role !== 'text' || /^\s*$/.test(bare) || /^#{1,6}\s/.test(bare)) return close();
    if (/^\s*\|/.test(bare)) {
      close();
      for (const cell of cells(bare)) add(cell, i + 1, true);
      return close();
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(bare)) return add(bare.trim(), i + 1, true);
    if (cur && /^\s+\S/.test(bare)) return add(bare.trim(), i + 1, false);
    return add(bare.trim(), i + 1, cur === null);
  });
  close();
  return out;
}

// The backtick run that starts at `text[i]`: its length `n`, and `tick`, the code-span state after it. `tick` is the length
// of the run that opened the current code span, 0 outside one; only a run of that same length closes it.
function tickRun(text, i, tick) {
  let n = 0;
  while (text[i + n] === '`') n++;
  return { n, tick: tick === 0 ? n : tick === n ? 0 : tick };
}

// A table row's cells, split at each `|` outside a code span.
function cells(row) {
  const out = [];
  let cell = '';
  let tick = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '`') {
      const run = tickRun(row, i, tick);
      tick = run.tick;
      cell += row.slice(i, i + run.n);
      i += run.n - 1;
    } else if (row[i] === '|' && tick === 0 && row[i - 1] !== '\\') {
      out.push(cell);
      cell = '';
    } else cell += row[i];
  }
  out.push(cell);
  return out.map((c) => c.trim()).filter(Boolean);
}

// A block's sentences as `[start, end)` offsets: split after a `.`, `?`, or `!` followed by whitespace or the end, outside
// a code span, never after "e.g.". A period that closes a bold label (`**Label.**`) is followed by `*`, so it splits nothing.
function sentences(text) {
  const out = [];
  let start = 0;
  let tick = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      const run = tickRun(text, i, tick);
      tick = run.tick;
      i += run.n - 1;
      continue;
    }
    if (tick || !'.?!'.includes(text[i]) || !(i + 1 === text.length || /\s/.test(text[i + 1]))) continue;
    if (text[i] === '.' && /(^|[^A-Za-z])e\.g$/.test(text.slice(Math.max(0, i - 4), i))) continue;
    out.push([start, i + 1]);
    start = i + 1;
  }
  if (start < text.length) out.push([start, text.length]);
  return out;
}

const lineAt = (block, offset) => block.lines.filter((l) => l.at <= offset).pop().line;

function scanCallCitations(root) {
  const refs = docPath(root, 'references');
  const { calls, seeds } = seedCalls(refs);
  const citing = [
    ...markdownFiles(docPath(root, 'skills')),
    ...markdownFiles(refs).filter((f) => !(path.dirname(f) === refs && familyOf(path.basename(f)))),
    ...markdownFiles(docPath(root, 'agents')),
  ];
  const gaps = [];
  for (const file of citing) {
    const source = path.relative(root, file).split(path.sep).join('/');
    for (const block of blocks(fs.readFileSync(file, 'utf8'))) {
      for (const [from, to] of sentences(block.text)) {
        const unit = block.text.slice(from, to);
        const named = [...unit.matchAll(HEADING_SPAN)].map((m) => norm(m[1]));
        for (const m of unit.matchAll(CITATION)) {
          for (const raw of [m[1], m[2]].filter(Boolean)) {
            const call = norm(raw);
            if (!calls.has(call)) continue;
            const valid = validHeadings(call, calls, seeds);
            if (valid === null || named.some((h) => valid.has(h))) continue;
            gaps.push({ source, line: lineAt(block, from + m.index), call, named });
          }
        }
      }
    }
  }
  return gaps.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.line - b.line));
}

module.exports = { scanCallCitations };
