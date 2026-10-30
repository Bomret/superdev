'use strict';

// The scanners over the shipped executables' source text: hook ledger-header parsers and shell-starting spawn forms.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, stripComments } = require('../lib');
const { HOOK_HEADER_REGEX } = require('../contracts');

// ADR 0022: no hook parses a ledger header itself; see HOOK_HEADER_REGEX's note for what it catches.
function scanHookLedgerParsers(root) {
  const offenders = [];
  // `lib` holds the modules the hooks load, so a parser moved there is read as well.
  for (const sub of ['hooks', 'lib']) {
    const dir = docPath(root, sub);
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const name of names) {
      // `lib/ledger.js` owns the reader, so it is the one file that holds the header regex.
      if (sub === 'lib' && name === 'ledger.js') continue;
      // `lib/kb-backend-config.js` reads the `- **Backend:**` bullets of `docs/agents/knowledge-base.md`, a
      // document with no ledger header in it.
      if (sub === 'lib' && name === 'kb-backend-config.js') continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      if (HOOK_HEADER_REGEX.test(text)) {
        offenders.push({
          source: path.join(sub, name),
          expectation:
            'read a ledger header through `lib/ledger.js`\'s exported `readLedgerHeader` — it carries a `**…:**` regex of its own, which is the drift ADR 0022 removed',
        });
      }
    }
  }
  return offenders;
}

// INV-0153 (ADR 0150): no shipped executable starts a shell by absolute path, starts `bash`, or runs a
// command through Node's default shell. Allowed: `sh` with `-c`, `git`, `taskkill`, `process.execPath`.
// simplicity: regex over comment-stripped text, not a parser; a program held in a variable escapes it, and a quote inside a regex literal can skew the per-line string scan. upgrade: a JS tokenizer if a shipped file ever hides a start in one.
const SHELL_SPAWN_FORMS = [
  ['execSync', /\bexecSync\s*\(/],
  ['absolute path', /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`]\//],
  ['bash', /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`]bash['"`]/],
  // Any `shell:` object-literal key (after `{`, `,`, or a line start); `lib/shell-words.js`'s parse-node field
  // `shell: undefined` is no spawn option, and a ternary `ok ? shell : other` is no key.
  ['shell option', /(?:^|[{,])[ \t]*shell\s*:(?!\s*undefined\b)/m],
  // A shorthand `{ cwd, shell }` key: a brace, then only non-brace, non-paren text ending in a comma, then `shell`
  // before a comma or a closing brace that is no destructuring target (`const { shell } = x`).
  ['shell option', /\{(?:[^{}()]*,)?\s*shell\s*(?:,|\}(?!\s*=(?!=)))/],
];
const CHILD_PROCESS = String.raw`require\(\s*['"](?:node:)?child_process['"]\s*\)`;

function scanShellSpawn(root) {
  const offenders = [];
  for (const dir of ['hooks', 'scripts', 'lib']) {
    let names = [];
    try {
      names = fs.readdirSync(docPath(root, dir)).filter((f) => /\.m?js$/.test(f) && !f.endsWith('.test.js'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const name of names) {
      const raw = fs.readFileSync(path.join(docPath(root, dir), name), 'utf8');
      // Only comments that start a line or follow whitespace are stripped, so a `/*` inside a string or a
      // `//` comment never deletes live code.
      const text = stripComments(raw);
      const forms = new Set(SHELL_SPAWN_FORMS.filter(([, re]) => re.test(text)).map(([form]) => form));
      // `exec` and `execSync` count only from child_process: referenced or called directly, through a namespace,
      // or as a bare (maybe aliased) require, static import, or dynamic import binding.
      const namespaces = [
        ...text.matchAll(new RegExp(String.raw`(\w+)\s*=\s*${CHILD_PROCESS}`, 'g')),
        ...text.matchAll(/\bimport\s+(?:\*\s+as\s+)?(\w+)\s+from\s+['"](?:node:)?child_process['"]/g),
      ].map((m) => m[1]);
      const imports = [
        ...text.matchAll(new RegExp(String.raw`\{([^}]*)\}\s*=\s*${CHILD_PROCESS}`, 'g')),
        ...text.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g),
        ...text.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\(\s*['"](?:node:)?child_process['"]\s*\)/g),
        ...text.matchAll(/\bimport\(\s*['"](?:node:)?child_process['"]\s*\)\s*\.then\(\s*\(?\s*\{([^}]*)\}/g),
      ];
      // The binding itself is cut out of the text, so only a later reference (a call or a pass-along) counts.
      let rest = text;
      for (const m of imports) rest = rest.replace(m[0], '');
      for (const [, form, alias] of imports.flatMap((m) => m[1].split(',')).map((s) => s.trim().match(/^(exec(?:Sync)?)(?:\s*:\s*|\s+as\s+)?(\w+)?$/)).filter(Boolean)) {
        if (new RegExp(String.raw`(?<![.\w])${alias || form}\b`).test(rest)) forms.add(form);
      }
      // A `.exec` or `.execSync` member of the require is a start whether called or only passed along.
      for (const m of text.matchAll(new RegExp(String.raw`${CHILD_PROCESS}\s*\.(exec(?:Sync)?)\b`, 'g'))) forms.add(m[1]);
      for (const n of namespaces) {
        for (const m of text.matchAll(new RegExp(String.raw`\b${n}\.(exec(?:Sync)?)\b`, 'g'))) forms.add(m[1]);
      }
      for (const form of forms) {
        offenders.push({
          source: path.join(dir, name),
          expectation: `start a shell only as \`sh\` with \`-c\` for an operator command (${form}) — INV-0153, ADR 0150`,
        });
      }
    }
  }
  return offenders;
}

module.exports = { scanHookLedgerParsers, scanShellSpawn };
