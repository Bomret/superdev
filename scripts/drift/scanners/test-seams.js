'use strict';

// The scanner over the shipped tree for test seams and `SUPERDEV_` names (INV-0156, ADR 0154, ADR 0207, INV-0180).
// It reads every `.js`, `.mjs`, and `.cjs` file at any depth of the shipped tree (`plugin/`) and every shipped
// Markdown file, and reports four forms:
//   1. A file that names one of superdev's own test files: the base name of any file in the repository's
//      `tests/` directory, as a whole word in the file's text, comments included, or a `tests/` path that
//      carries a glob (`tests/scope-*.test.js`, `tests/{a,b}.test.js`, `tests/[ab].js`). The test-path
//      classifier's default globs (`**/tests/`, `**/tests/**`, `*.test.*`) name no file, so they pass.
//   2. A file that reads an environment variable that no Markdown document in the shipped tree names and
//      whose name does not start with `CLAUDE_`. A name starting `SUPERDEV_` is never allowed, whatever a
//      document names (ADR 0207, INV-0180). A read is `process.env.NAME`, `process.env['NAME']`, or a
//      destructuring `const { NAME } = process.env`, found in comment-stripped text. A write, a whole-env
//      spread, and a read through an object a caller passes in are no read.
//   3. A file that uses a `SUPERDEV_` name on any object, `process.env` or not: a property (`o.SUPERDEV_X`), a
//      bracket (`o['SUPERDEV_X']`), a destructuring (`{ SUPERDEV_X } = o`), an object key (`SUPERDEV_X: v`,
//      `'SUPERDEV_X': v`, `['SUPERDEV_X']: v`, shorthand `{ SUPERDEV_X }`), a `const SUPERDEV_X` binding, or a `SUPERDEV_X=` prefix in text. A string that
//      only contains the name (`includes('SUPERDEV_KB_')`) is neither a read nor a write and passes.
//   4. A shipped Markdown file that names a `SUPERDEV_` identifier.
//   The heredoc delimiter `SUPERDEV_TEXT_EOF` is allowed by name in every form.
// simplicity: regexes over comment-stripped text, not a parser; `process.env` held in an alias escapes the non-`SUPERDEV_` read form, a computed key matches no form (one
// built by concatenation, `process.env['SUPERDEV_' + k]`, or held in a variable, `process.env[name]`), and a destructuring default nests braces one level deep at most. upgrade: a JS tokenizer if shipped code ever hides a read in one.

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

const OWN = 'SUPERDEV_(?!TEXT_EOF(?![A-Za-z0-9_]))[A-Za-z0-9_]*';
const OWN_RE = new RegExp(`^${OWN}$`);

// The `SUPERDEV_` names the text uses on any object: a property read or write, a bracket read or write, a
// destructuring (nested, or with a default), an object key (plain, quoted, computed, or shorthand), a
// `const`/`let`/`var` binding, or a `NAME=` prefix.
function ownUses(text) {
  const names = new Set();
  const forms = [
    String.raw`(?<![\w.$])['"]?(?<n>${OWN})['"]?\s*:(?!:)`,
    String.raw`\.\s*(?<n>${OWN})`,
    String.raw`\[\s*(['"\x60])(?<n>${OWN})\1\s*\]`,
    String.raw`\{[^{}]*(?<![\w.$])(?<n>${OWN})(?![A-Za-z0-9_])[^{}]*\}\s*=(?!=)`,
    String.raw`(?<![\w.$])(?<n>${OWN})=`,
    String.raw`\b(?:const|let|var)\s+(?<n>${OWN})(?![A-Za-z0-9_])`,
    String.raw`[{,]\s*(?<n>${OWN})(?![A-Za-z0-9_])\s*(?:[,}]|=(?!=))`,
  ];
  for (const f of forms) for (const m of text.matchAll(new RegExp(f, 'g'))) names.add(m.groups.n);
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
    const code = stripComments(raw);
    for (const name of new Set([...envReads(code), ...ownUses(code)])) {
      if (OWN_RE.test(name)) {
        offenders.push({ source, expectation: `name no \`SUPERDEV_\` environment variable (\`${name}\`) — ADR 0207, INV-0180` });
        continue;
      }
      if (name.startsWith('CLAUDE_') || new RegExp(String.raw`(?<![\w])${escape(name)}(?![\w])`).test(documented)) continue;
      offenders.push({
        source,
        expectation: `read only an environment variable a shipped Markdown document names or one starting \`CLAUDE_\` (\`${name}\`) — INV-0156, ADR 0154`,
      });
    }
  }
  for (const file of walk(base, (n) => n.endsWith('.md'))) {
    for (const name of new Set([...fs.readFileSync(file, 'utf8').matchAll(new RegExp(OWN, 'g'))].map((m) => m[0]))) {
      offenders.push({ source: path.relative(root, file), expectation: `name no \`SUPERDEV_\` environment variable (\`${name}\`) — ADR 0207, INV-0180` });
    }
  }
  return offenders;
}

module.exports = { scanTestSeams };
