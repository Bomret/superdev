'use strict';

// The scanners over `docs/adr/`: status lines, unique numbers, and paired relation headers.

const fs = require('node:fs');
const path = require('node:path');

const { maskFences } = require('../lib');
const { ADR_DIR, ADR_STATUS_PATTERN } = require('../contracts');

// adrNames(): the file names in `docs/adr/`, sorted, or none when the directory is absent.
function adrNames(root) {
  try {
    return fs.readdirSync(path.join(root, ADR_DIR)).sort();
  } catch {
    return []; // no ADR tree → nothing to scan
  }
}

// scanAdrStatus(): every `docs/adr/*.md` carrying no recognised status line.
function scanAdrStatus(root) {
  return adrNames(root)
    .filter((n) => n.endsWith('.md'))
    .filter((n) => !ADR_STATUS_PATTERN.test(fs.readFileSync(path.join(root, ADR_DIR, n), 'utf8')))
    .map((n) => ({ source: path.join(ADR_DIR, n) }));
}

// scanAdrNumbers(): no two ADRs in docs/adr/ share a four-digit number. Two files with one number and
// different slugs never conflict in git, so a duplicate lands silently unless this looks (ADR 0126,
// INV-0134).
function scanAdrNumbers(root) {
  const byNumber = new Map();
  for (const n of adrNames(root).filter((x) => /^\d{4}-.*\.md$/.test(x))) {
    const num = n.slice(0, 4);
    (byNumber.get(num) || byNumber.set(num, []).get(num)).push(n);
  }
  return [...byNumber]
    .filter(([, files]) => files.length > 1)
    .map(([num, files]) => ({
      source: ADR_DIR,
      expectation: `give each ADR its own number — ${num} is shared by ${files.join(', ')}`,
    }));
}

// ADR relation headers (ADR 0156). Each label pairs with the label its target must carry.
const ADR_RELATION_REVERSE = {
  Amends: 'Amended by',
  'Amended by': 'Amends',
  Supersedes: 'Superseded by',
  'Superseded by': 'Supersedes',
};

// adrRelationHeaders() reads one ADR's header region from fence-masked text: the lines after the
// `**Status:**` line up to the body, which starts at the first `## ` heading or bold `**Context`
// paragraph. An ADR with no `**Status:**` line has no header region. A header is a bold `**Label:**`
// line plus its continuation lines up to the next blank line. Returns the headers, each
// `{ label, text }` with the continuation lines joined by a space.
function adrRelationHeaders(masked) {
  const headers = [];
  let open = null;
  const lines = masked.split('\n');
  const status = lines.findIndex((l) => l.startsWith('**Status:**'));
  if (status < 0) return headers;
  for (const line of lines.slice(status + 1)) {
    if (/^## |^\*\*Context/.test(line)) break;
    const label = line.match(/^\*\*([^*]+?):\*\*/);
    if (label) headers.push((open = { label: label[1], text: line }));
    else if (!line.trim()) open = null;
    else if (open) open.text += ` ${line.trim()}`;
  }
  return headers;
}

// Every markdown link in a relation header; `named` is the match of an `ADR NNNN` link text, `file` the href without its anchor.
const adrHeaderLinks = (text) =>
  [...text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)].map(([, linkText, href]) => ({
    linkText,
    href,
    file: href.split('#')[0],
    named: linkText.match(/^ADR (\d{4})$/),
  }));

// scanAdrRelations(): every relation header in `docs/adr/*.md` pairs with the reverse header on its
// target, the target file exists, link text and target agree on the number, and no other relation label
// appears. `**Status:** Superseded` and a `**Superseded by:**` header go together. Every `[ADR NNNN](...)`
// link in a header is a relation target. A header with no such link fails unless it names only INV
// targets, and a link to an ADR file whose text is not `ADR NNNN` fails.
function scanAdrRelations(root) {
  const adrs = new Map(); // number → { source, headers, superseded }
  for (const n of adrNames(root).filter((x) => /^\d{4}-.*\.md$/.test(x))) {
    const text = fs.readFileSync(path.join(root, ADR_DIR, n), 'utf8');
    const masked = maskFences(text);
    adrs.set(n.slice(0, 4), {
      source: path.join(ADR_DIR, n),
      headers: adrRelationHeaders(masked),
      superseded: /^\*\*Status:\*\* Superseded\b/m.test(masked),
    });
  }
  const gaps = [];
  const gap = (source, expectation) => gaps.push({ source, expectation });
  for (const [num, adr] of adrs) {
    const has = (label) => adr.headers.some((h) => h.label === label);
    if (adr.superseded !== has('Superseded by')) {
      gap(
        adr.source,
        adr.superseded
          ? `carry a \`**Superseded by:**\` header, because ADR ${num} states \`**Status:** Superseded\``
          : `state \`**Status:** Superseded\`, because ADR ${num} carries a \`**Superseded by:**\` header`,
      );
    }
    for (const { label, text } of adr.headers) {
      if (!ADR_RELATION_REVERSE[label]) {
        gap(adr.source, `use only the relation labels ${Object.keys(ADR_RELATION_REVERSE).join(', ')} — ADR ${num} uses \`**${label}:**\``);
        continue;
      }
      const links = adrHeaderLinks(text);
      const adrLinks = links.filter((l) => l.named);
      const misnamed = links.filter((l) => !l.named && /^\d{4}-.*\.md$/.test(path.basename(l.file)));
      for (const { linkText, href } of misnamed) {
        gap(adr.source, `write the link text of an ADR link as \`ADR NNNN\` — ADR ${num}'s \`**${label}:**\` header links \`[${linkText}](${href})\``);
      }
      // only a header naming INV targets alone (linked or plain) may hold no ADR link
      const invOnly =
        /\bINV-\d{4}\b/.test(text) && !/\bADR\s*\d{4}\b/i.test(text.replace(/\[INV-\d{4}\]\([^)]*\)/g, '')) && links.every((l) => /^INV-\d{4}$/.test(l.linkText));
      if (!adrLinks.length && !misnamed.length && !invOnly) {
        gap(adr.source, `link each target as [ADR NNNN](NNNN-<slug>.md) — ADR ${num}'s \`**${label}:**\` header holds no such link`);
        continue;
      }
      for (const { named, linkText, href, file } of adrLinks) {
        const target = path.basename(file).match(/^(\d{4})-.*\.md$/);
        if (!target || target[1] !== named[1]) {
          gap(adr.source, `link [${linkText}] to the ADR file with that number — ADR ${num}'s \`**${label}:**\` header points at \`${href}\``);
        } else if (!fs.existsSync(path.join(root, ADR_DIR, path.basename(file)))) {
          gap(adr.source, `link an ADR file that exists — ADR ${num}'s \`**${label}:**\` header points at the missing \`${href}\``);
        } else if (!adrs.get(named[1]).headers.some((h) => h.label === ADR_RELATION_REVERSE[label] && adrHeaderLinks(h.text).some((l) => l.named?.[1] === num && path.basename(l.file).startsWith(`${num}-`)))) {
          gap(
            adr.source,
            `pair with ADR ${named[1]} — ADR ${num}'s \`**${label}:**\` header names ADR ${named[1]}, which carries no \`**${ADR_RELATION_REVERSE[label]}:**\` header naming ADR ${num}`,
          );
        }
      }
    }
  }
  return gaps;
}

module.exports = { scanAdrStatus, scanAdrNumbers, scanAdrRelations };
