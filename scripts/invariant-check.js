#!/usr/bin/env node
'use strict';

// invariant-check: the maintainer-only validator for a repository's invariant register (ADR 0093).
// `node scripts/invariant-check.js --root <dir>` reads <dir>/docs/invariants.md and reports every
// entry that breaks the register's format rules, or names a Paths glob, a symbol, or a Check path
// that resolves to nothing — one line per failure naming the entry id and the field. It reports and
// selects nothing: /superdev:plan and final-reviewer still read the register
// whole (INV-0088). Pure Node with no shell-out, so it runs on every OS the maintainer uses.

const fs = require('node:fs');
const path = require('node:path');

const USAGE = 'usage: node scripts/invariant-check.js --root <repository-dir>';
const REGISTER = path.join('docs', 'invariants.md');

const FIELD_KEYS = new Set(['Class', 'Concepts', 'Statement', 'Breaks', 'Check', 'Symbols', 'Paths']);
const KNOWN_FIELDS = [...FIELD_KEYS].join(', ');

// Strips leading whitespace, blockquote markers and list markers off a line, repeatedly, so
// `> ### INV-0005` and `    ### INV-0005` both expose the heading- or field-shaped text underneath.
function stripMarkers(line) {
  let s = line;
  for (;;) {
    const next = s.replace(/^\s+/, '').replace(/^>\s?/, '').replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
    if (next === s) return s;
    s = next;
  }
}

// An entry is a `### INV-NNNN` heading followed by `Key: value` lines, in any order, up to the next
// heading. A field line directly after the previous entry's last field still opens a new entry.
// A heading that mentions an id but is not exactly that form, a `Key: value` line outside any
// entry, a field key none of the seven names, a field key spelled in the wrong case, a field key
// repeated inside one entry, and a non-blank line inside an entry that is neither a heading nor a
// field line are all format violations, reported rather than silently dropped or merged into the
// entry above.
function parseEntries(text) {
  const entries = [];
  const failures = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^###\s+INV-(\d{4})\s*$/);
    if (heading) {
      current = { id: `INV-${heading[1]}`, fields: {} };
      entries.push(current);
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const mention = line.match(/INV-\d+/i);
      if (mention) {
        failures.push({
          id: mention[0].toUpperCase(),
          field: 'id',
          reason: `\`${line.trim()}\` is not \`### INV-\` plus four digits`,
        });
      }
      current = null;
      continue;
    }
    const field = line.match(/^([A-Za-z][A-Za-z]*):\s*(.*)$/);
    if (field) {
      const key = field[1];
      if (!current) {
        failures.push({ id: '(register)', field: key, reason: `\`${line.trim()}\` sits outside any entry` });
      } else if (FIELD_KEYS.has(key)) {
        if (Object.prototype.hasOwnProperty.call(current.fields, key)) {
          failures.push({ id: current.id, field: key, reason: 'appears twice; the first value is kept' });
        } else {
          current.fields[key] = field[2].trim();
        }
      } else {
        const canonical = [...FIELD_KEYS].find((k) => k.toLowerCase() === key.toLowerCase());
        failures.push(
          canonical
            ? { id: current.id, field: key, reason: `is written in the wrong case (expected \`${canonical}\`)` }
            : { id: current.id, field: key, reason: `is not a recognised field (${KNOWN_FIELDS})` },
        );
      }
      continue;
    }
    if (current && line.trim()) {
      failures.push({ id: current.id, field: '(line)', reason: `\`${line.trim()}\` is not a \`Key: value\` field line` });
      continue;
    }
    if (!current && line.trim()) {
      const stripped = stripMarkers(line);
      const mention = stripped.match(/INV-\d{4}/i);
      const shaped = /^#{1,6}\s+/.test(stripped) || /^[A-Za-z][A-Za-z]*:\s*/.test(stripped);
      if (mention && shaped) {
        failures.push({
          id: '(register)',
          field: 'id',
          reason: `\`${line.trim()}\` mentions ${mention[0].toUpperCase()} outside any entry`,
        });
      }
    }
  }
  return { entries, failures };
}

const MANDATORY = ['Class', 'Concepts', 'Statement', 'Breaks'];

function formatFailures(entries) {
  const failures = [];
  const seen = new Map();
  for (const e of entries) seen.set(e.id, (seen.get(e.id) || 0) + 1);
  for (const [id, n] of seen) if (n > 1) failures.push({ id, field: 'id', reason: `appears ${n} times` });
  for (const e of entries) {
    for (const key of MANDATORY) {
      if (!e.fields[key]) failures.push({ id: e.id, field: key, reason: 'mandatory field missing or empty' });
    }
    if (e.fields.Concepts && list(e.fields.Concepts).length === 0) {
      failures.push({ id: e.id, field: 'Concepts', reason: 'names no concept' });
    }
    const breaks = e.fields.Breaks || '';
    if (breaks && !/^(silently|loudly)(\s+—.*)?$/i.test(breaks)) {
      failures.push({ id: e.id, field: 'Breaks', reason: 'is neither `silently` nor `loudly`' });
    }
    if (/^silently\b/i.test(breaks)) {
      const proof = unquote(e.fields.Check || '');
      if (!proof) failures.push({ id: e.id, field: 'Check', reason: 'a silently breaking entry names its proof' });
      else if (/^none\W*$/i.test(proof)) {
        failures.push({ id: e.id, field: 'Check', reason: '`none` needs the reason nothing cheaply tests it' });
      } else if (!/\w/.test(proof)) {
        failures.push({ id: e.id, field: 'Check', reason: 'names no proof' });
      }
    }
  }
  return failures;
}

const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.superdev', '.claude']);

// Every file under root as a forward-slash relative path, pruning SKIPPED_DIRS. A manual walk
// rather than readdirSync's `recursive`, so a skipped tree is never read at all.
function walk(root) {
  const files = [];
  const visit = (rel) => {
    for (const dirent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        if (!SKIPPED_DIRS.has(dirent.name)) visit(child);
      } else if (dirent.isFile()) files.push(child);
    }
  };
  visit('');
  return files.sort();
}

// A glossary term is the bold text opening a line of a CONTEXT.md; a qualifier after it, as in
// `**Tier** (execution)`, is not part of the term. Terms union over every CONTEXT.md the walk
// reaches, which covers a multi-context repository without reading its context map.
function glossaryTerms(root, files) {
  const terms = new Set();
  for (const rel of files) {
    if (rel !== 'CONTEXT.md' && !rel.endsWith('/CONTEXT.md')) continue;
    for (const m of fs.readFileSync(path.join(root, rel), 'utf8').matchAll(/^\*\*([^*\r\n]+)\*\*/gm)) {
      terms.add(m[1].trim());
    }
  }
  return terms;
}

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

function conceptFailures(entries, terms) {
  const failures = [];
  for (const e of entries) {
    for (const concept of list(e.fields.Concepts)) {
      if (!terms.has(concept)) {
        failures.push({ id: e.id, field: 'Concepts', reason: `\`${concept}\` is not a glossary term` });
      }
    }
  }
  return failures;
}

// A `Paths` glob as a predicate over repo-relative paths: `**` spans segments, `*` and `?` stay
// inside one. Matching runs on forward slashes, so a path carrying backslash separators matches
// the same glob. fs.globSync would do this, but it needs Node 22 and package.json supports 20.8.1.
function globMatcher(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const re = new RegExp(`^${source}$`);
  return (rel) => re.test(rel.replace(/\\/g, '/'));
}

const unquote = (s) => s.replace(/`/g, '').trim();

// The files an entry's `Paths` govern, and a failure for each glob that governs none.
function governedFiles(entry, files) {
  const governed = new Set();
  const failures = [];
  for (const glob of list(entry.fields.Paths).map(unquote)) {
    const matches = files.filter(globMatcher(glob));
    if (!matches.length) failures.push({ id: entry.id, field: 'Paths', reason: `\`${glob}\` matches no file` });
    for (const f of matches) governed.add(f);
  }
  return { governed, failures };
}

// A symbol resolves when its last dotted segment appears as a whole word in a governed file: the
// entry's `Paths` files, or every walked file but the register itself when it names no `Paths`.
function symbolFailures(entry, governed, files, read) {
  const failures = [];
  const scope = entry.fields.Paths ? [...governed] : files.filter((f) => f !== REGISTER.replace(/\\/g, '/'));
  for (const symbol of list(entry.fields.Symbols).map(unquote)) {
    const word = symbol.split('.').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9_$])${word}($|[^A-Za-z0-9_$])`, 'm');
    if (!scope.some((f) => re.test(read(f)))) {
      const where = entry.fields.Paths ? "the entry's Paths files" : 'the repository';
      failures.push({ id: entry.id, field: 'Symbols', reason: `\`${symbol}\` appears nowhere in ${where}` });
    }
  }
  return failures;
}

// A path-shaped token in `Check:` — segments joined by `/`, ending in a file extension — names a
// file under root. Drift ids and quoted test names are prose, and stay unchecked.
const CHECK_PATH = /(?:^|[^\w./-])((?:[\w.-]+\/)+[\w-][\w.-]*\.[A-Za-z0-9]{1,5})(?![\w/])/g;

function checkPathFailures(entry, root) {
  const failures = [];
  for (const m of (entry.fields.Check || '').matchAll(CHECK_PATH)) {
    if (!fs.existsSync(path.join(root, m[1]))) {
      failures.push({ id: entry.id, field: 'Check', reason: `\`${m[1]}\` names no file` });
    }
  }
  return failures;
}

function check(root) {
  const file = path.join(root, REGISTER);
  if (!fs.existsSync(file)) return { entries: null, failures: [] };
  const { entries, failures: parseFailures } = parseEntries(fs.readFileSync(file, 'utf8'));
  if (entries.length === 0) {
    parseFailures.push({ id: '(register)', field: 'id', reason: 'no `### INV-NNNN` entry found' });
  }
  const files = walk(root);
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    return cache.get(rel);
  };
  const failures = [...parseFailures, ...formatFailures(entries), ...conceptFailures(entries, glossaryTerms(root, files))];
  for (const e of entries) {
    const { governed, failures: pathFailures } = governedFiles(e, files);
    failures.push(...pathFailures, ...symbolFailures(e, governed, files, read), ...checkPathFailures(e, root));
  }
  return { entries, failures };
}

function main(argv) {
  const at = argv.indexOf('--root');
  const root = at === -1 ? null : argv[at + 1];
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const { entries, failures } = check(root);
  if (entries === null) {
    process.stdout.write(`invariant-check: no register found at ${REGISTER}, nothing to check\n`);
    return 0;
  }
  for (const f of failures) process.stdout.write(`${f.id}: ${f.field}: ${f.reason}\n`);
  if (failures.length) {
    process.stdout.write(`invariant-check: ${failures.length} failure(s) in ${entries.length} entries\n`);
    return 1;
  }
  process.stdout.write(`invariant-check: ${entries.length} entries hold\n`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parseEntries, check, walk, globMatcher };
