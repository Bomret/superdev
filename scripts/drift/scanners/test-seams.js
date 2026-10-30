'use strict';

// The scanner over the shipped JavaScript for test seams (INV-0156, ADR 0154). It reads every `.js`, `.mjs`,
// and `.cjs` file at any depth of the shipped tree (`plugin/`) and reports two forms:
//   1. A file that names one of superdev's own test files: the base name of any file in the repository's
//      `tests/` directory, as a whole word in the file's text, comments included, or a `tests/` path that
//      carries a glob (`tests/scope-*.test.js`, `tests/{a,b}.test.js`, `tests/[ab].js`). The test-path
//      classifier's default globs (`**/tests/`, `**/tests/**`, `*.test.*`) name no file, so they pass.
//   2. A file that reads an environment variable that no Markdown document in the shipped tree names and
//      whose name does not start with `CLAUDE_`. A read is `process.env.NAME`, `process.env['NAME']`, or a
//      destructuring `const { NAME } = process.env`, found in comment-stripped text. A write, a whole-env
//      spread, and a read through an object a caller passes in are no read.
// simplicity: regexes over comment-stripped text, not a parser; `process.env` held in an alias escapes it, and a destructuring default nests braces one level deep at most. upgrade: a JS tokenizer if shipped code ever hides a read in one.

const fs = require('node:fs');
const path = require('node:path');

const { stripComments } = require('../lib');

// Every regular file under a directory whose name `keep` accepts, as absolute paths; a directory entry is no
// file, and a missing directory holds none.
function walk(dir, keep) {
  try {
    return fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && keep(e.name))
      .map((e) => path.join(e.parentPath, e.name));
  } catch {
    return [];
  }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The names of the environment variables the text reads.
function envReads(text) {
  const names = new Set();
  for (const m of text.matchAll(/\bprocess\s*\.\s*env\s*\??\.\s*([A-Za-z_]\w*)\b(?!\s*=(?!=))/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bprocess\s*\.\s*env\s*(?:\?\.\s*)?\[\s*(['"`])([^'"`]+)\1\s*\](?!\s*=(?!=))/g)) names.add(m[2]);
  for (const m of text.matchAll(/\{((?:[^{}]|\{[^{}]*\})*)\}\s*=\s*process\s*\.\s*env\b(?!\s*(?:\??\.|\[))/g)) {
    for (const part of m[1].replace(/\{[^{}]*\}/g, '').split(',')) {
      const key = part.trim().match(/^([A-Za-z_]\w*|(['"])[^'"]+\2)/);
      if (key) names.add(key[1].replace(/^['"]|['"]$/g, ''));
    }
  }
  return names;
}

function scanTestSeams(root) {
  const base = path.join(root, 'plugin');
  const testNames = walk(path.join(root, 'tests'), () => true).map((f) => path.basename(f));
  const documented = walk(base, (n) => n.endsWith('.md')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const offenders = [];
  for (const file of walk(base, (n) => /\.[cm]?js$/.test(n))) {
    const source = path.relative(root, file);
    const raw = fs.readFileSync(file, 'utf8');
    for (const name of testNames) {
      if (new RegExp(String.raw`(?<![\w.-])${escape(name)}(?![\w-])`).test(raw)) {
        offenders.push({ source, expectation: `name no superdev test file (\`${name}\`) — INV-0156, ADR 0154` });
      }
    }
    for (const [ref] of raw.matchAll(/(?<![\w.-])tests\/[\w.*?{},\[\]\/-]*/g)) {
      if (/[*?{[]/.test(ref) && /\w/.test(ref.slice('tests/'.length))) {
        offenders.push({ source, expectation: `name no superdev test file (\`${ref}\`) — INV-0156, ADR 0154` });
      }
    }
    for (const name of envReads(stripComments(raw))) {
      if (name.startsWith('CLAUDE_') || new RegExp(String.raw`(?<![\w])${escape(name)}(?![\w])`).test(documented)) continue;
      offenders.push({
        source,
        expectation: `read only an environment variable a shipped Markdown document names or one starting \`CLAUDE_\` (\`${name}\`) — INV-0156, ADR 0154`,
      });
    }
  }
  return offenders;
}

module.exports = { scanTestSeams };
