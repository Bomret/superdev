'use strict';

// dod-own.js: the `dod-own` verb, an anchor's Definition of Done trimmed to the lines one Repository component owns
// on a shared anchor (ADR 0285).

const { fail } = require('./refusal.js');
const { splitLines } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');
const { takeOption } = require('./options.js');
const { parseDodLineReadings, dodSectionRange, readOptionFile, QUALIFIED_TAG_RE, DOD_LINE_RE } = require('./dod-line.js');
const { STORE_REF_RE } = require('./dod-tags.js');

// The slices file: one `<store-ref> <component>` pair per line, the component running to the end of the line, every
// slice under the anchor in every repository. Returns the reference-to-component map.
function readSlices(file) {
  const slices = new Map();
  const problems = [];
  for (const raw of readOptionFile('--slices-file', file).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\S+)\s+(\S.*)$/.exec(line);
    if (!m || !STORE_REF_RE.test(m[1])) problems.push(`not a "<store-ref> <component>" pair: ${line}`);
    else if (slices.has(m[1])) problems.push(`reference ${m[1]} listed twice: ${line}`);
    else slices.set(m[1], m[2].trim());
  }
  if (problems.length) fail('dod-own refused the slices file:\n' + problems.join('\n'));
  return slices;
}

// An owned line: the component that owns a checklist line, or the problem that keeps its owner unknown.
function ownerOf(line, slices, components) {
  const [reading] = parseDodLineReadings(line);
  const tag = reading.tag;
  if (!tag) {
    return { problem: 'untagged line', fix: 'tag it with its slices, or with scope (<component>) or docs (<component>)', criterion: reading.criterion };
  }
  if (tag === 'scope' || tag === 'docs') {
    return { problem: `plain ${tag} tag`, fix: `name its repository: ${tag} (<component>)`, criterion: reading.criterion };
  }
  const q = QUALIFIED_TAG_RE.exec(tag);
  if (q) {
    if (!components.has(q[2])) {
      return { problem: `${tag} names a component no slice carries`, fix: 'name a component the anchor\'s slices carry', criterion: reading.criterion };
    }
    return { owner: q[2], criterion: reading.criterion };
  }
  const refs = tag.split(/,\s*/);
  if (refs.some((ref) => /^\d+$/.test(ref))) {
    return { problem: `id-form tag ${tag}`, fix: 'rewrite its slice ids into store references (scope.js dod-tags)', criterion: reading.criterion };
  }
  const unknown = refs.filter((ref) => !slices.has(ref));
  if (unknown.length) {
    return { problem: `tag names ${unknown.join(', ')}, which no slice under the anchor is`, fix: 'tag it with slices the anchor holds', criterion: reading.criterion };
  }
  const owners = [...new Set(refs.map((ref) => slices.get(ref)))];
  if (owners.length > 1) {
    return { problem: `tag names slices of ${owners.join(' and ')}`, fix: 'split it into one line per repository', criterion: reading.criterion };
  }
  return { owner: owners[0], criterion: reading.criterion };
}

function verbDodOwn(args, stdinRaw) {
  const component = takeOption(args, '--component');
  const slicesFile = takeOption(args, '--slices-file');
  if (args.length) fail(`dod-own takes no argument "${args[0]}"`);
  if (component === undefined || !component.trim()) fail('dod-own needs --component <name>');
  if (slicesFile === undefined) fail('dod-own needs --slices-file <path>');
  const slices = readSlices(slicesFile);
  const lines = splitLines(stdinRaw || '');
  const masked = maskFencedLines(lines, 'dod-own input', 'trimmed');
  const range = dodSectionRange(masked);
  if (!range) fail('dod-own refused: the body carries no ## Definition of Done section');
  const section = lines.slice(range.start, range.end);
  const components = new Set(slices.values());
  // A shared anchor: the slices file holds a slice of another component.
  const shared = [...components].some((c) => c !== component);
  if (!shared) {
    process.stdout.write(section.join('\n') + '\n');
    return;
  }
  const out = [];
  const problems = [];
  const ownCriteria = [];
  for (let i = range.start; i < range.end; i += 1) {
    if (i === range.start || !DOD_LINE_RE.test(masked[i])) {
      out.push(lines[i]);
      continue;
    }
    const o = ownerOf(masked[i], slices, components);
    if (o.problem) problems.push(`${o.problem}: ${lines[i].trim()} — fix: ${o.fix}`);
    else if (o.owner === component) {
      out.push(lines[i]);
      ownCriteria.push(o.criterion.trim());
    }
  }
  if (!problems.length) {
    if (!ownCriteria.some((c) => c.startsWith('Reachable:'))) {
      problems.push(`${component} owns no Reachable: line — fix: add one tagged with its slices or scope (${component})`);
    }
    if (!ownCriteria.some((c) => c.startsWith('Release risk:'))) {
      problems.push(`${component} owns no Release risk: line — fix: add one tagged with its slices or scope (${component})`);
    }
  }
  if (problems.length) fail('dod-own refused:\n' + problems.join('\n'));
  process.stdout.write(out.join('\n') + '\n');
}

module.exports = { verbDodOwn };
