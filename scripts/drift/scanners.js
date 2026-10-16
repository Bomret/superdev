'use strict';

// drift-check bespoke scanners: every check whose assertion is more than "this document still
// matches this pattern". The table-driven ones run through `lib.js`’s scanContract() instead.
// Each scanner is pure over a root dir and returns an array of gaps; `checks.js` orders them and
// owns how each gap is printed. A scanner that reads a named document reports it with `missingDoc()`
// when it is absent. A scanner that walks a directory reads whatever the directory holds, and an absent
// directory holds nothing.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, readDoc, missingDoc, maskFences, maskedSentences, normalizeWhitespace } = require('./lib');
const contracts = require('./contracts');
const {
  NARRATIVE_DOC,
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  SCOPETREE_RUN_ROOT_DOCS,
  SCOPETREE_RUN_ROOT_PATTERN,
  ADR_DIR,
  ADR_STATUS_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  KB_NO_CALL_DOCS,
  KB_BACKEND_CALL_MARKERS,
  AGENT_TOOLCHAIN_PATTERNS,
  UNMAPPED_PATHS_RUNNERS,
  UNMAPPED_PATHS_DOCS,
  HOOK_HEADER_REGEX,
  NO_FORCE_MERGE_DOCS,
  NO_FORCE_MERGE_PATTERNS,
  TEA_ONLY_DOCS,
  TEA_ONLY_MARKERS,
  CONFLICT_COMMIT_CONCLUSION_PATTERNS,
} = contracts;

// skillEntries(): every skill surface under a root, as `[<name>, absolute SKILL.md path]` pairs. An
// absent dir yields an empty list.
function skillEntries(root) {
  let entries;
  try {
    entries = fs.readdirSync(docPath(root, 'skills'), { withFileTypes: true });
  } catch {
    return []; // no skills dir → nothing to scan
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(docPath(root, 'skills', e.name, 'SKILL.md')))
    .map((e) => [e.name, docPath(root, 'skills', e.name, 'SKILL.md')]);
}

// proseDocuments(): every prompt-prose file under the given dirs, as `[plugin-relative source, absolute
// path]` pairs: skills/<name>/SKILL.md plus the flat agents/*.md and references/*.md.
function proseDocuments(root, dirs) {
  const docs = [];
  for (const dir of dirs) {
    if (dir === 'skills') {
      for (const [name, filePath] of skillEntries(root)) {
        docs.push([path.join('skills', name, 'SKILL.md'), filePath]);
      }
      continue;
    }
    const dirPath = docPath(root, dir);
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      docs.push([path.join(dir, entry), path.join(dirPath, entry)]);
    }
  }
  return docs;
}

// scan(): reads skills/<name>/SKILL.md, agents/*.md and references/*.md, extracts every referenced
// references/<name>.md, and reports the ones that don't exist. references/ is in the set because a
// reference cites another reference — the execution playbooks point at scope-mode.md.
function scan(root) {
  const missing = [];
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents', 'references'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const match of text.matchAll(REFERENCE_PATTERN)) {
      const refName = match[1];
      const refPath = docPath(root, 'references', refName);
      if (!fs.existsSync(refPath)) {
        missing.push({ source, reference: `references/${refName}` });
      }
    }
  }
  return missing;
}

// scanPatternHits(): every match of a global pattern in each named document, or the document as missing.
function scanPatternHits(root, docs, pattern) {
  const offenders = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) {
      offenders.push(missingDoc(rel));
      continue;
    }
    for (const match of text.matchAll(pattern)) {
      offenders.push({ source: rel, match: match[0] });
    }
  }
  return offenders;
}

// scanRunRootPaths(): every checkout-relative run-root artifact path an execution doc still carries.
const scanRunRootPaths = (root) => scanPatternHits(root, RUN_ROOT_DOCS, RUN_ROOT_ARTIFACT_PATTERN);

// scanScopetreeRunRootPaths(): the same shape over the documents (ADR 0080) that address another run's
// scopetree from their own cwd. `RUN_ROOT_ARTIFACT_PATTERN` deliberately excludes `scopetree`, so a
// reverted cwd-relative literal in one of these needs its own pattern.
const scanScopetreeRunRootPaths = (root) => scanPatternHits(root, SCOPETREE_RUN_ROOT_DOCS, SCOPETREE_RUN_ROOT_PATTERN);

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

// scanCommandRefs(): every command reference in skills/<name>/SKILL.md and agents/*.md with no matching
// skill under skills/. A document naming the same missing command is reported once per document, so the
// report alone names every dead end.
function scanCommandRefs(root) {
  const unresolved = [];
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    const seen = new Set();
    for (const match of text.matchAll(COMMAND_REFERENCE_PATTERN)) {
      const name = match[1];
      if (seen.has(name)) continue; // one report per document per command
      seen.add(name);
      if (!fs.existsSync(docPath(root, 'skills', name, 'SKILL.md'))) {
        unresolved.push({ source, command: `/superdev:${name}` });
      }
    }
  }
  return unresolved;
}

// scanDocsAvoid(): the shared shape of a prohibition — each document must NOT match a marker. Each marker
// is `[pattern, expectation(hit)]`, so every check keeps its own gap text.
function scanDocsAvoid(root, docs, markers) {
  const gaps = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    for (const [pattern, expectation] of markers) {
      const hit = text.match(pattern);
      if (hit) gaps.push({ source: rel, expectation: expectation(hit) });
    }
  }
  return gaps;
}

// No document outside publish-kb may carry a KB-backend call marker (ADR 0023).
const scanKbNoBackendCall = (root) =>
  scanDocsAvoid(root, KB_NO_CALL_DOCS, KB_BACKEND_CALL_MARKERS.map(([pattern, what]) =>
    [pattern, () => `reach no knowledge-base backend — it still carries ${what}`]));

// Shipped agent briefs run in consumer repos, so their prose names no concrete toolchain command; see
// AGENT_TOOLCHAIN_PATTERNS' note for the class and its ceiling. The doc list is the `agents/` directory
// read at scan time, so a new agent is covered the day its file lands.
function scanAgentToolAgnostic(root) {
  let names = [];
  try {
    names = fs.readdirSync(docPath(root, 'agents')).filter((f) => f.endsWith('.md'));
  } catch {
    return []; // no agents dir → nothing to scan
  }
  return scanDocsAvoid(
    root,
    names.map((f) => path.join('agents', f)),
    AGENT_TOOLCHAIN_PATTERNS.map((pattern) => [
      pattern,
      (hit) =>
        `stay tool-agnostic — the test command is \`references/test-selection.md\`'s to select, and it ` +
        `still names \`${normalizeWhitespace(hit[0])}\``,
    ]),
  );
}

// ADR 0074: no shipped document proposes a `{paths}` form to a runner that maps no source file to the
// tests covering it. See UNMAPPED_PATHS_RUNNERS' note in `drift/contracts.js` for the class, what still
// fires it, and the denylist's own ceiling.
const scanUnmappedPathsForms = (root) =>
  scanDocsAvoid(root, UNMAPPED_PATHS_DOCS, [
    [
      UNMAPPED_PATHS_RUNNERS,
      (hit) =>
        `propose a \`{paths}\` form only to a runner that maps a source file to the tests covering it — ` +
        `it still proposes \`${normalizeWhitespace(hit[0])}\`, and that runner collects nothing from a ` +
        `source path, so the run reports red on a change set holding no tests`,
    ],
  ]);

// ADR 0022: no hook parses a ledger header itself; see HOOK_HEADER_REGEX's note for what it catches.
function scanHookLedgerParsers(root) {
  const dir = docPath(root, 'hooks');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return []; // no hooks dir → nothing to scan
  }
  const offenders = [];
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    if (HOOK_HEADER_REGEX.test(text)) {
      offenders.push({
        source: path.join('hooks', name),
        expectation:
          'read a ledger header through `scripts/scope.js`\'s exported `readLedgerHeader` — it carries a `**…:**` regex of its own, which is the drift ADR 0022 removed',
      });
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
  // Any `shell:` object-literal key (after `{`, `,`, or a line start); `shell-words.js`'s parse-node field
  // `shell: undefined` is no spawn option, and a ternary `ok ? shell : other` is no key.
  ['shell option', /(?:^|[{,])[ \t]*shell\s*:(?!\s*undefined\b)/m],
  // A shorthand `{ cwd, shell }` key: a brace, then only non-brace, non-paren text ending in a comma, then `shell`
  // before a comma or a closing brace that is no destructuring target (`const { shell } = x`).
  ['shell option', /\{(?:[^{}()]*,)?\s*shell\s*(?:,|\}(?!\s*=(?!=)))/],
];
const CHILD_PROCESS = String.raw`require\(\s*['"](?:node:)?child_process['"]\s*\)`;

// Cuts a trailing `//` comment (at the line start or after whitespace) unless it sits inside a quoted string.
function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '/' && line[i + 1] === '/' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function scanShellSpawn(root) {
  const offenders = [];
  for (const dir of ['hooks', 'scripts']) {
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
      const text = raw
        .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
        .split('\n')
        .map(stripLineComment)
        .join('\n');
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

// #683, INV-0092: no code-management document may ever invoke a force or bypass option on a merge
// call. See `NO_FORCE_MERGE_PATTERNS`'s own comment for the ceiling this shape-based absence check
// carries. A `never` sitting right before the match — "Never pass `--admin`", "this seed never sends
// `force_merge`" — is the seed's own caution naming the option to forbid it, not an instruction to send
// it, so it is excluded the same way `scanNoBaseBranchCommit`'s `negated()` excludes a "never commit …
// to the base branch" caution.
function scanNoForceMerge(root) {
  const gaps = [];
  for (const rel of NO_FORCE_MERGE_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    const masked = maskFences(text);
    for (const [pattern, expectation] of NO_FORCE_MERGE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const hit of masked.matchAll(re)) {
        const before = masked.slice(Math.max(0, hit.index - NEVER_NEGATION_WINDOW), hit.index);
        if (!/\bnever\b/i.test(before)) gaps.push({ source: rel, expectation: expectation(hit) });
      }
    }
  }
  return gaps;
}

// ADR 0123: no shipped skill, agent, or reference concludes a resolved merge conflict with `git commit`.
// The documents are the prose directories read at scan time, so a document added later is covered the
// day it lands. See `CONFLICT_COMMIT_CONCLUSION_PATTERNS`'s own comment for the ceiling.
const scanConflictConclusionNoCommit = (root) =>
  scanDocsAvoid(
    root,
    proseDocuments(root, ['skills', 'agents', 'references']).map(([rel]) => rel),
    CONFLICT_COMMIT_CONCLUSION_PATTERNS.map((pattern) => [
      pattern,
      (hit) =>
        'conclude a resolved conflict with `merge --continue`, never `git commit` — ' +
        `\`${normalizeWhitespace(hit[0])}\` names the other form (ADR 0123)`,
    ]),
  );

// ADR 0111, #794: the Forgejo backend documents reach the host through `tea` only. See
// `TEA_ONLY_MARKERS`'s own comment for the ceiling this shape-based absence check carries.
const scanTeaOnly = (root) => scanDocsAvoid(root, TEA_ONLY_DOCS, TEA_ONLY_MARKERS);

// ADR 0101, INV-0098: only `/superdev:ship` ever runs a deploy target's command. `references/
// deployment.md` states the rule itself, so it is exempt here the way a caution naming the forbidden thing
// always is; `skills/ship/SKILL.md` is the one surface entitled to claim the run. Every other skill and
// agent is scanned for the same shape a claim to run one would take — "run(s) … target's … command" —
// masked against fenced examples first, so an illustrative command block never trips it.
const DEPLOY_RUNNER_EXEMPT_FILES = new Set([
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('references', 'deployment.md'),
]);
const DEPLOY_RUNNER_PATTERN = /\brun(?:s|ning)?\b[\s\S]{0,40}?\btarget'?s?\b[\s\S]{0,25}?\bcommand\b/gi;
// A mention attributed to ship within this many characters ahead of the match — "`/superdev:ship` runs
// each target's command" — describes ship's own job rather than claiming this document's own, so it is
// not the shape this check exists to catch.
// simplicity: shape-based, and its ceiling is the "run(s) … target's … command" shape. A claim phrased
// another way ("execute the deploy step", "deploy it yourself") walks past.
const DEPLOY_RUNNER_ATTRIBUTION_WINDOW = 60;

function scanDeployRunnerExclusivity(root) {
  const gaps = [];
  for (const dir of ['skills', 'agents', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of files) {
      const source = path.join(dir, rel).split(path.sep).join('/');
      if (DEPLOY_RUNNER_EXEMPT_FILES.has(path.join(dir, rel))) continue;
      const text = fs.readFileSync(path.join(dirPath, rel), 'utf8');
      const masked = maskFences(text);
      for (const hit of masked.matchAll(DEPLOY_RUNNER_PATTERN)) {
        const before = masked.slice(Math.max(0, hit.index - DEPLOY_RUNNER_ATTRIBUTION_WINDOW), hit.index);
        if (/\bship\b/i.test(before)) continue;
        // A denial — "runs no target's command", "never runs a target's command" — claims no run.
        if (/\b(?:never|not|no)\s+$/i.test(before) || /^run(?:s|ning)?\s+(?:no|not|never)\b/i.test(hit[0])) continue;
        gaps.push({
          source,
          expectation:
            "name no deploy target's command as something it runs — only `skills/ship/SKILL.md` does, " +
            'and only under posture `auto` (INV-0098)',
        });
      }
    }
  }
  return gaps;
}

// scanNarrativeCoverage(): `scripts/AGENTS.md`'s drift-check table holds exactly one row per registered
// check, and no row for an id the registry does not carry. A row is a table line whose first cell is a
// backticked id.
//
// `ids` is a parameter rather than a module-level require because `checks.js` requires this file: taking
// the registry at call time keeps the cycle from forming, and lets the selftest drive the scanner with a
// fixed list.
function scanNarrativeCoverage(root, ids = require('./checks').map((check) => check.id)) {
  const narrative = readDoc(root, NARRATIVE_DOC);
  if (narrative === null) return [missingDoc(NARRATIVE_DOC)];
  const rows = new Map();
  for (const [, id] of narrative.matchAll(/^\|\s*`([a-z0-9]+(?:-[a-z0-9]+)*)`\s*\|/gm)) {
    rows.set(id, (rows.get(id) || 0) + 1);
  }
  const gaps = [];
  const gap = (expectation) => gaps.push({ source: NARRATIVE_DOC, expectation });
  for (const id of ids) {
    const count = rows.get(id) || 0;
    if (count === 0) gap(`carry a drift-check table row for \`${id}\` — it is registered in \`drift/checks.js\``);
    else if (count > 1) gap(`carry one drift-check table row for \`${id}\` — it carries ${count}`);
  }
  const registered = new Set(ids);
  for (const id of rows.keys()) {
    if (!registered.has(id)) gap(`carry no drift-check table row for \`${id}\` — \`drift/checks.js\` registers no such check`);
  }
  return gaps;
}

// scanMarketplaceSource(): each plugin in `.claude-plugin/marketplace.json` must name the shipped tree. A
// relative string `source` must resolve to a directory carrying `.claude-plugin/plugin.json` (ADR 0032). A
// `git-subdir` object source must name such a directory in this repo by its `path`, name this repo's
// canonical clone URL (MARKETPLACE_URL) as its `url`, so a fork or a mistyped URL cannot break or hijack
// every install, and pin `ref` to `v` + that directory's plugin.json version (ADR 0131). An object source
// of any other shape fails the url check. `claude plugin validate .` accepts a source that names no
// directory at all, so a renamed tree or a mistyped path breaks every install while the suite stays green.
// The manifest is a repo-root file, never under `plugin/`, so it is read directly rather than through
// docPath().
const MARKETPLACE_URL = 'https://codeberg.org/bomret/superdev.git';
const MARKETPLACE_MANIFEST = path.join('.claude-plugin', 'marketplace.json');
function scanMarketplaceSource(root) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(root, MARKETPLACE_MANIFEST), 'utf8');
  } catch {
    return [missingDoc(MARKETPLACE_MANIFEST)];
  }
  const gaps = [];
  const gap = (expectation) => gaps.push({ source: MARKETPLACE_MANIFEST, expectation });
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    gap(`parse as JSON — ${err.message}`);
    return gaps;
  }
  const pluginJson = (dir) => path.join(root, dir, '.claude-plugin', 'plugin.json');
  for (const plugin of manifest.plugins || []) {
    const src = plugin.source ?? {};
    if (typeof src === 'string') {
      if (!fs.existsSync(pluginJson(src))) {
        gap(`point \`${plugin.name}\`'s source at a directory carrying \`.claude-plugin/plugin.json\` — ` +
          `\`${src}\` resolves to no plugin tree, and \`claude plugin validate\` accepts that`);
      }
      continue;
    }
    if (src.source !== 'git-subdir' || src.url !== MARKETPLACE_URL) {
      gap(`point \`${plugin.name}\`'s \`git-subdir\` url at \`${MARKETPLACE_URL}\`, this repo's canonical clone ` +
        `URL — it reads \`${src.url}\``);
    }
    let version;
    try {
      version = JSON.parse(fs.readFileSync(pluginJson(String(src.path)), 'utf8')).version;
    } catch {
      gap(`point \`${plugin.name}\`'s \`git-subdir\` path at a directory carrying \`.claude-plugin/plugin.json\` — ` +
        `\`${src.path}\` resolves to no plugin tree`);
      continue;
    }
    if (src.ref !== `v${version}`) {
      gap(`pin \`${plugin.name}\`'s \`git-subdir\` ref to \`v${version}\`, the release tag of ` +
        `\`${src.path}/.claude-plugin/plugin.json\` — it reads \`${src.ref}\``);
    }
  }
  return gaps;
}

// scanReadmeCommands(): `README.md` and `skills/` agree — every `skills/<name>/SKILL.md` is mentioned in
// the README as `/superdev:<name>`, and every `/superdev:<name>` the README names has a skill. The README
// is the user-facing map of the commands, so a command it never names or a command it still names after a
// rename is a router that lies.
function scanReadmeCommands(root) {
  const readme = readDoc(root, 'README.md');
  if (readme === null) return [missingDoc('README.md')];
  const gaps = [];
  const commands = new Set(skillEntries(root).map(([name]) => name));
  for (const name of [...commands].sort()) {
    if (!readme.includes(`/superdev:${name}`)) {
      gaps.push({
        source: 'README.md',
        expectation:
          `mention \`/superdev:${name}\` — \`skills/${name}/SKILL.md\` ships, and a README that never ` +
          'names a command is a router that lies',
      });
    }
  }
  const named = new Set();
  for (const m of readme.matchAll(/\/superdev:([a-z][a-z0-9-]*)/g)) named.add(m[1]);
  for (const name of [...named].sort()) {
    if (!commands.has(name)) {
      gaps.push({
        source: 'README.md',
        expectation:
          `name only commands that exist — \`/superdev:${name}\` has no \`skills/${name}/SKILL.md\`, ` +
          'so the README routes users to a command the plugin does not carry',
      });
    }
  }
  return gaps;
}

// auditSetMatches(): how many files an audit-set pattern resolves to under `root`. The section's own rule
// makes every entry a repo-relative path, optionally with one `*` in a single segment — the shape
// `/superdev:document audit` expands — so this walks the segments literally and expands the starred one
// by reading that directory, rather than depending on a glob implementation whose availability varies
// by Node version.
function auditSetMatches(root, pattern) {
  const segments = pattern.split('/');
  const starAt = segments.findIndex((s) => s.includes('*'));
  if (starAt === -1) return fs.existsSync(path.join(root, pattern)) ? 1 : 0;
  const re = new RegExp(
    `^${segments[starAt].split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
  );
  const walk = (dir, at) => {
    if (at === segments.length) return 1;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0; // the directory itself is gone, which is the same lie as an empty match
    }
    let count = 0;
    for (const entry of entries) {
      const last = at === segments.length - 1;
      const matches = at === starAt ? re.test(entry.name) : entry.name === segments[at];
      if (!matches) continue;
      if (last) count += 1;
      else if (entry.isDirectory()) count += walk(path.join(dir, entry.name), at + 1);
    }
    return count;
  };
  return walk(root, 0);
}

// scanAuditSetGlobs(): every glob listed under `## Audit set` in this repo's own
// `docs/agents/documentation.md` matches at least one file. A glob matching nothing is indistinguishable
// from a clean audit — `/superdev:document audit` silently reads zero files and reports success. Paths
// are repo-relative by the section's own rule, so they are resolved against the root and never through
// docPath()'s plugin/ fallback.
const AUDIT_SET_DOC = path.join('docs', 'agents', 'documentation.md');
function scanAuditSetGlobs(root) {
  const doc = readDoc(root, AUDIT_SET_DOC);
  if (doc === null) return [missingDoc(AUDIT_SET_DOC)];
  const at = doc.search(/^##\s+Audit set\s*$/m);
  if (at === -1) {
    return [{ source: AUDIT_SET_DOC, expectation: 'carry the `## Audit set` section `/superdev:document audit` reads' }];
  }
  const gaps = [];
  const rest = doc.slice(at);
  const next = rest.slice(1).search(/^##\s/m);
  const section = next === -1 ? rest : rest.slice(0, next + 1);
  for (const m of section.matchAll(/^-\s+`([^`]+)`\s*$/gm)) {
    const pattern = m[1];
    if (auditSetMatches(root, pattern) === 0) {
      gaps.push({
        source: AUDIT_SET_DOC,
        expectation:
          `list only audit-set patterns that resolve — \`${pattern}\` matches no file, so ` +
          '`/superdev:document audit` reads nothing for it and still reports a clean pass',
      });
    }
  }
  return gaps;
}

// walkFiles(dir): every file under dir, as paths relative to dir, sorted. `entry.parentPath` is Node's
// own name for the directory an fs.Dirent came from (`entry.path` before it, removed in Node 24) — read either, so
// this runs on the oldest Node this repo supports and the newest alike. `isFile()` excludes a
// symlink deliberately — no shipped document tree this walks contains one.
function walkFiles(dir) {
  const resolved = path.resolve(dir);
  return fs
    .readdirSync(resolved, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(resolved, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .sort();
}

// INV-0001 (docs/invariants.md): no shipped prose instructs a commit, a push, or a merge to the base
// branch, whether it names the target by the words "base branch" or by the base's own configured name
// (e.g. `main`, read from docs/agents/code-management.md's own `**Base branch:**` bullet). `/superdev:ship`'s
// own merge onto base runs only through the host's merge API (ADR 0096, INV-0092), the one site this
// scanner admits — SHIP_MERGE_ADMIT_FILE plus the SHIP_MERGE_ADMIT_PATTERN wording below, so the
// admission is narrow: a literal git merge or push to base written anywhere else, ship's own file
// included, still fails. The verb and the target have to sit close together, or a legitimate "never
// commit … onto the base branch" caution — `references/prototype.md` carries exactly that shape — would
// itself read as an instruction to do the thing it forbids. A `never` excuses the match only when it
// sits right next to the *verb* ("Never commit … to the base branch") or right next to the *target*
// ("commit … never onto the base branch"), each within NEVER_NEGATION_WINDOW chars — not merely
// somewhere between the verb and the target.
// The window is a small sliding join of consecutive lines rather than the whole normalized document,
// both so a `never` near the target reliably sits inside the same window and so the reported line is
// close to where the instruction actually starts.
// simplicity: the window is 4 lines / 150 chars, a heuristic proximity bound, not a parser — an
// instruction split across 5 or more lines is missed. Widen BASE_BRANCH_COMMIT_WINDOW (and the 150-char
// bound below, in step) if that shape turns up for real.
const NEVER_NEGATION_WINDOW = 20;
const BASE_BRANCH_COMMIT_WINDOW = 4;
const BASE_BRANCH_VERB = '\\b(?:commit(?:s|ted|ting)?|push(?:es|ed|ing)?|merge(?:s|d|ing)?)\\b(?!-)';
// The one admitted site: `/superdev:ship`'s own squash-merge onto base, through the host's merge API —
// admitted by file AND by this wording sitting within reach forward of the match's own position, never
// by file alone, so a second, unrelated base-branch instruction ship's own file might one day carry
// still fails.
const SHIP_MERGE_ADMIT_FILE = path.join('skills', 'ship', 'SKILL.md');
const SHIP_MERGE_ADMIT_PATTERN = /host'?s merge API/i;
const CODE_MANAGEMENT_DOC = path.join('docs', 'agents', 'code-management.md');
function verbTargetPattern(targetSource) {
  return new RegExp(`${BASE_BRANCH_VERB}([\\s\\S]{0,150}?)(?:${targetSource})`, 'i');
}
const BASE_BRANCH_PHRASE_PATTERN = verbTargetPattern('\\bbase branch\\b');

// The base's own configured name is a git target only in an unambiguous shape — backtick-quoted (like
// the `**Base branch:**` bullet's own value) or pushed to `origin` — never a bare word, since a base
// branch is commonly named "main" and that word is also ordinary English ("the main checkout", "the
// main working tree").
function baseNamePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return verbTargetPattern(`\`${escaped}\`|\\borigin\\s+${escaped}\\b`);
}

// negated(): true when a `never` sits right next to the instruction — either right before the
// *target* (the text between verb and target ends in "never", the shape `never onto the base
// branch` carries) or right before the *verb* itself (the text before the verb ends in "never", the
// shape `Never commit … to the base branch` carries). Either shape is a caution; a `never` anywhere
// else in the window (an earlier aside, an unrelated clause) is not.
function negated(beforeVerbText, betweenText) {
  return (
    /\bnever\b\s*$/i.test(beforeVerbText.slice(-NEVER_NEGATION_WINDOW)) ||
    /\bnever\b/i.test(betweenText.slice(-NEVER_NEGATION_WINDOW))
  );
}

// scanNoBaseBranchCommit(): walks every file under `skills/` and `references/` (INV-0001's own `Paths:`)
// and reports the line of every commit-or-push-to-base-branch instruction it finds, not only the first —
// one gap per real instance, however many a file carries. Fenced examples are masked first. The window
// joins real newlines so a match's own line is recoverable by counting the newlines ahead of it, which is
// what lets a wrapped sentence still report the line it starts on rather than only the window's.
function scanNoBaseBranchCommit(root) {
  const gaps = [];
  const codeManagement = readDoc(root, CODE_MANAGEMENT_DOC);
  if (codeManagement === null) gaps.push(missingDoc(CODE_MANAGEMENT_DOC));
  const baseNameMatch = codeManagement && codeManagement.match(/\*\*Base branch:?\*\*:?\s*`([^`]+)`/i);
  const patterns = [BASE_BRANCH_PHRASE_PATTERN];
  if (baseNameMatch) patterns.push(baseNamePattern(baseNameMatch[1]));
  for (const dir of ['skills', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of files) {
      const source = path.join(dir, rel).split(path.sep).join('/');
      const isShipMergeAdmitFile = source === SHIP_MERGE_ADMIT_FILE;
      const text = fs.readFileSync(path.join(dirPath, rel), 'utf8');
      const masked = maskFences(text);
      const lines = masked.split('\n');
      // Each line's absolute character offset in `masked`, so a match found by a window starting
      // partway through the file can still test negation against everything that came before it in
      // the real document — never only the window slice that happened to find it.
      const lineOffsets = [];
      let offset = 0;
      for (const l of lines) {
        lineOffsets.push(offset);
        offset += l.length + 1;
      }
      // Every sliding window re-finds the same physical match for as long as it stays in range, so
      // dedup on the match's absolute offset — never on "the first hit in this file" — is what lets
      // a real violation later in the file still get reported instead of being masked by an earlier
      // one, negated or not.
      const reportedAt = new Set();
      for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + BASE_BRANCH_COMMIT_WINDOW).join('\n');
        for (const pattern of patterns) {
          const match = pattern.exec(window);
          if (!match) continue;
          const absIndex = lineOffsets[i] + match.index;
          if (reportedAt.has(absIndex)) continue;
          if (negated(masked.slice(0, absIndex), match[1])) continue;
          // Tested against the whole document from the match's own absolute offset forward, never
          // against `window` alone: the admission wording can sit just past the window's edge.
          if (isShipMergeAdmitFile && SHIP_MERGE_ADMIT_PATTERN.test(masked.slice(absIndex, absIndex + 200))) continue;
          reportedAt.add(absIndex);
          const lineOffset = window.slice(0, match.index).split('\n').length - 1;
          gaps.push({ source, line: i + 1 + lineOffset });
        }
      }
    }
  }
  return gaps;
}

// scanShipNoOpensPr(): walks skills/, agents/, references/ and README.md (the plugin's shipped surfaces,
// not docs/adr/'s history) and reports every sentence where the open-a-pull-request phrase attaches to
// `/superdev:ship` — `/superdev:submit-pr` opens it, `/superdev:ship` only merges what is already open
// (ADR 0096). "Attaches" means `/superdev:ship` is immediately followed, within SHIP_OPENS_PR_WINDOW
// chars and with no other `/superdev:<name>` mention in between, by the open-PR phrase — not merely that
// both sit somewhere in the same sentence. Fenced examples are masked first, and wrapped lines are joined
// before splitting into sentences (`maskedSentences()`).
// simplicity: shape-based, and its ceiling is the "open(s) the/a pull request" phrase within 80 characters
// after `/superdev:ship`. A paraphrase ("ship creates the PR") walks past.
const SHIP_OPENS_PR_WINDOW = 80;
const SHIP_ATTACHED_OPEN_PATTERN = new RegExp(
  `\\/superdev:ship\\b([\\s\\S]{0,${SHIP_OPENS_PR_WINDOW}}?)open(?:s|ing)?\\s+(?:the|a)\\s+pull request\\b`,
  'i',
);
const SHIP_STEP_SURFACE_DIRS = ['skills', 'agents', 'references'];
function scanShipNoOpensPr(root) {
  const gaps = [];
  const files = [];
  for (const dir of SHIP_STEP_SURFACE_DIRS) {
    const dirPath = docPath(root, dir);
    let found;
    try {
      found = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of found) files.push(path.join(dir, rel).split(path.sep).join('/'));
  }
  if (readDoc(root, 'README.md') !== null) files.push('README.md');
  else gaps.push(missingDoc('README.md'));
  for (const rel of files) {
    const text = readDoc(root, rel);
    for (const sentence of maskedSentences(text)) {
      const match = SHIP_ATTACHED_OPEN_PATTERN.exec(sentence);
      // The captured middle text carrying another `/superdev:<name>` means the open-PR phrase
      // attaches to that other command, not to `/superdev:ship`.
      if (!match || /\/superdev:(?!ship\b)[a-z-]+/i.test(match[1])) continue;
      gaps.push({
        source: rel,
        expectation:
          'never let the open-the-pull-request phrase attach to `/superdev:ship` — ' +
          `\`/superdev:submit-pr\` opens it, \`/superdev:ship\` only merges what is already open: "${normalizeWhitespace(sentence)}"`,
      });
    }
  }
  return gaps;
}

// scanShipHumanOnly(): reads the SKILL.md of every skill that carries no unattended mode
// (NO_UNATTENDED_SKILLS) and reports two gaps INV-0093 names — a literal `--unattended` token anywhere in the
// file, which ADR 0096 says none of the three carries, and, for ship alone, a missing
// `disable-model-invocation: true` in its frontmatter (ADR 0132 opens the other two to the model).
const NO_UNATTENDED_SKILLS = ['ship', 'verify-ship', 'wrap-up'];

function scanShipHumanOnly(root) {
  const gaps = [];
  for (const name of NO_UNATTENDED_SKILLS) {
    const source = path.join('skills', name, 'SKILL.md');
    const text = readDoc(root, source);
    if (text === null) {
      gaps.push(missingDoc(source));
      continue;
    }
    if (name === 'ship' && !/^disable-model-invocation:\s*true\s*$/m.test(text)) {
      gaps.push({
        source,
        expectation: 'carry `disable-model-invocation: true` in its frontmatter, so no model starts it on its own (INV-0093, ADR 0096, ADR 0132)',
      });
    }
    if (/--unattended/.test(text)) {
      gaps.push({
        source,
        expectation: 'name no `--unattended` mode of its own — it carries none (INV-0093, ADR 0096, ADR 0132)',
      });
    }
  }
  return gaps;
}

// The invariant register joined to the drift registry and the contract tables (ADR 0156). A register
// `Check:` line that names `scripts/drift-check.js` lists the ids it pins as backticked tokens up to the
// next `;`; a token shaped like a check id must be a registered one (a backticked token that is not
// lowercase words joined by hyphens is prose). A contract row whose expectation cites `INV-NNNN` must
// pin a document one of that entry's `Paths:` globs covers, the plugin-relative path mapped to its
// repository path the way `docPath()` does; an entry with no `Paths:` covers every path except the
// register itself. A row whose document is absent is scanContract()'s to report. `checkIds` and
// `tables` default to the real registry and tables; the selftest passes its own.
function scanInvariantRegisterJoin(root, { checkIds, tables } = {}) {
  const { REGISTER, REGISTER_PATH, parseEntries, globMatcher, list, unquote } = require('../invariant-check');
  const register = path.join(root, REGISTER);
  if (!fs.existsSync(register)) return [missingDoc(REGISTER_PATH)];
  const { entries } = parseEntries(fs.readFileSync(register, 'utf8'));
  const known = new Set(checkIds || require('./checks').map((c) => c.id));
  const gaps = [];

  const DRIFT = 'scripts/drift-check.js';
  for (const e of entries) {
    for (const segment of (e.fields.Check || '').split(';')) {
      const at = segment.indexOf(DRIFT);
      if (at < 0) continue;
      for (const [, token] of segment.slice(at + DRIFT.length).replace(/^`/, '').matchAll(/`([^`]+)`/g)) {
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token) && !known.has(token)) {
          gaps.push({ message: `${e.id}: Check: \`${token}\` is not a registered drift-check id` });
        }
      }
    }
  }

  const byId = new Map(entries.map((e) => [e.id, e]));
  // An entry with no `Paths:` governs every path but the register, as `invariant-check.js` reads it.
  const covers = (e, repoPath) =>
    e.fields.Paths
      ? list(e.fields.Paths).map(unquote).some((g) => globMatcher(g)(repoPath))
      : repoPath !== REGISTER_PATH;
  const seen = new Set();
  const allTables =
    tables || Object.fromEntries(Object.entries(contracts).filter(([, v]) => Array.isArray(v)));
  for (const [name, rows] of Object.entries(allTables)) {
    for (const row of rows) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[2] !== 'string') continue;
      const doc = docPath(root, row[0]);
      if (!fs.existsSync(doc)) continue;
      const repoPath = path.relative(root, doc).split(path.sep).join('/');
      for (const id of new Set(row[2].match(/INV-\d{4}/g) || [])) {
        const key = `${id}|${name}|${repoPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const e = byId.get(id);
        if (!e) {
          gaps.push({ message: `${name}: a row on ${repoPath} cites ${id}, which the register does not carry` });
        } else if (!covers(e, repoPath)) {
          gaps.push({ message: `${id}: Paths covers none of ${repoPath}, which a ${name} row pins as that invariant's rule` });
        }
      }
    }
  }
  return gaps;
}

module.exports = {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanAdrStatus,
  scanAdrNumbers,
  scanAdrRelations,
  scanCommandRefs,
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanHookLedgerParsers,
  scanShellSpawn,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanTeaOnly,
  scanDeployRunnerExclusivity,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanNoBaseBranchCommit,
  scanShipNoOpensPr,
  scanShipHumanOnly,
  scanInvariantRegisterJoin,
};
