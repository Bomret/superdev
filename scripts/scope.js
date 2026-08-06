#!/usr/bin/env node
'use strict';

// scope.js: the run-state CLI (ADR 0022). Owns every ledger.md write and read in the chain.
// Verbs: init, stage, slice, degraded, get, status. Exit nonzero with a one-line stderr
// reason on any refusal. hooks/ledger-guard.js makes this the only ledger write path.

const fs = require('fs');
const path = require('path');

// references/scope-mode.md `## The change type` — the eleven Conventional Commits types.
const CHANGE_TYPES = ['feat', 'fix', 'refactor', 'docs', 'perf', 'test', 'build', 'ci', 'chore', 'style', 'revert'];
// references/scope-mode.md `## The scope slug`.
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
// references/plan-contract.md status vocabulary.
const SLICE_STATUSES = ['todo', 'in-progress', 'in-review', 'blocked', 'merged'];
// references/scope-mode.md `## The stage never moves backwards`: a write is allowed exactly when
// it does not lower the stage's rank. `reviewed` and `documented-unreviewed` share a rank — the
// chain can do either doc pass first — so a same-rank move between them needs its own allowlist;
// every other same-rank move (e.g. reviewed → documented-unreviewed) refuses, and `documented`/
// `shipped` are terminal in the way rank already gives them: nothing outranks `shipped`, and
// `documented`'s only higher rank is `shipped` itself.
const STAGE_RANK = {
  implementing: 0,
  merged: 1,
  reviewed: 2,
  'documented-unreviewed': 2,
  documented: 3,
  shipped: 4,
};
const STAGES = Object.keys(STAGE_RANK);
// The sanctioned same-rank move: `/superdev:review` writes `reviewed` over `documented-unreviewed`
// when its fix loop landed commits (scope-mode.md).
const SANCTIONED_SAME_RANK = new Set(['documented-unreviewed>reviewed']);

function stageMoveAllowed(cur, next) {
  if (cur === next) return true;
  const rc = STAGE_RANK[cur];
  const rn = STAGE_RANK[next];
  if (rn > rc) return true;
  if (rn === rc) return SANCTIONED_SAME_RANK.has(cur + '>' + next);
  return false;
}

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

// --- ledger primitives -------------------------------------------------------

function ledgerPath(root) {
  return path.join(root, 'ledger.md');
}

function readLines(root) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath(root), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') fail(`no ledger at ${ledgerPath(root)}`);
    throw e;
  }
  return raw.split('\n');
}

function writeLines(root, lines) {
  // Atomic write: a reader (or a concurrent scope.js invocation) never observes a partially
  // written ledger.md — write to a temp file in the same directory, then rename over it.
  const target = ledgerPath(root);
  const tmpFile = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpFile, lines.join('\n'), 'utf8');
  fs.renameSync(tmpFile, target);
}

function headerRe(name) {
  return new RegExp('^\\*\\*' + name + ':\\*\\*\\s*(.*)$');
}

// A pre-CLI ledger may miss any header line; absence is the missing-optional-field
// case (scope-mode `## The ledger`), never a parse error.
function getHeader(lines, name) {
  const re = headerRe(name);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function setHeader(lines, name, value) {
  const re = headerRe(name);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      lines[i] = `**${name}:** ${value}`;
      return lines;
    }
  }
  // Absent line (pre-CLI ledger): insert after the title heading, or at the top.
  const at = lines.findIndex((l) => l.startsWith('# '));
  lines.splice(at >= 0 ? at + 1 : 0, 0, '', `**${name}:** ${value}`);
  return lines;
}

// Table rows are `| … |` lines minus the header row and its `|---|` separator.
function tableRowIndexes(lines) {
  const idx = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('|') && !/^\|[\s:-]*(\|[\s:-]*)+\|?$/.test(l) && !/^\|\s*id\s*\|/i.test(l)) {
      idx.push(i);
    }
  }
  return idx;
}

// A `|` inside a cell value corrupts the row unless escaped, and a newline breaks the one
// line = one row assumption entirely. sanitizeCell makes a value safe to store as a cell;
// splitRow's unescape is its exact inverse, so a row-rebuild (verbSlice) that re-sanitizes
// the cells it read back is lossless.
function sanitizeCell(v) {
  return String(v).replace(/(\r\n|\r|\n)+/g, ' ').replace(/\|/g, '\\|');
}

function splitRow(line) {
  // '| a | b |' -> ['a', 'b']; a `\|` inside a cell doesn't split it, and comes back unescaped.
  const parts = line.split(/(?<!\\)\|/);
  return parts.slice(1, parts.length - 1).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// --- verbs -------------------------------------------------------------------

function validateLabel(label) {
  const cut = label.indexOf('/');
  if (cut < 0) fail(`label "${label}" has no "/" — a feature label is <type>/<slug>`);
  const type = label.slice(0, cut);
  const slug = label.slice(cut + 1);
  if (!type) fail(`label "${label}" has an empty type segment`);
  if (!slug) fail(`label "${label}" has an empty slug segment`);
  if (!CHANGE_TYPES.includes(type)) fail(`label type "${type}" is not a change type (${CHANGE_TYPES.join(', ')})`);
  if (!SLUG_RE.test(slug)) fail(`label slug "${slug}" fails the scope-slug charset [a-zA-Z0-9][a-zA-Z0-9_-]*`);
  return { type, slug };
}

function verbInit(cwd, label, stdinJson) {
  const { slug } = validateLabel(label);
  const root = path.join(cwd, '.superdev', 'scopes', slug);
  // The real double-init signal is an existing ledger.md, not the run-root directory: Phase 0
  // writes dod.md into the run root before calling init, so the directory legitimately exists
  // on every fresh run.
  if (fs.existsSync(ledgerPath(root))) fail(`ledger already exists: ${ledgerPath(root)}`);

  let spec;
  try {
    spec = JSON.parse(stdinJson);
  } catch {
    fail('stdin is not JSON — expected {"anchor": "...", "slices": [...]}');
  }
  if (!spec || typeof spec.anchor !== 'string' || !Array.isArray(spec.slices)) {
    fail('stdin JSON must carry an "anchor" string and a "slices" array');
  }

  // Ensure .superdev/ is git-ignored before creating anything under it.
  const gi = path.join(cwd, '.gitignore');
  let giText = '';
  try {
    giText = fs.readFileSync(gi, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (!giText.split('\n').some((l) => l.trim() === '.superdev/' || l.trim() === '.superdev')) {
    fs.writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + '.superdev/\n', 'utf8');
  }

  const seenIds = new Set();
  const rows = spec.slices.map((s) => {
    for (const k of ['id', 'issue', 'title', 'type']) {
      if (typeof s[k] !== 'string' || !s[k]) fail(`slice row missing "${k}"`);
    }
    if (seenIds.has(s.id)) fail(`duplicate slice id "${s.id}"`);
    seenIds.add(s.id);
    const dep = s['depends-on'] || '—';
    const status = s.status || 'todo';
    if (!SLICE_STATUSES.includes(status)) fail(`slice ${s.id} has unknown status "${status}"`);
    return (
      `| ${sanitizeCell(s.id)} | ${sanitizeCell(s.issue)} | ${sanitizeCell(s.title)} | ${sanitizeCell(s.type)} | ` +
      `${sanitizeCell(dep)} | ${status} | ${sanitizeCell(s.range || '—')} |`
    );
  });

  const doc = [
    `# Ledger — ${slug}`,
    '',
    '**Stage:** implementing',
    `**Branch:** ${label}`,
    `**Anchor:** ${sanitizeCell(spec.anchor)}`,
    '',
    '| id | issue | title | type | depends-on | status | range |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ];
  fs.mkdirSync(root, { recursive: true });
  writeLines(root, doc);
  console.log(root);
}

function verbStage(root, sub, value) {
  const lines = readLines(root);
  if (sub === 'get') {
    const v = getHeader(lines, 'Stage');
    console.log(v === null ? 'absent' : v);
    return;
  }
  if (sub !== 'set') fail(`unknown stage subcommand "${sub}" — use get|set`);
  if (!STAGES.includes(value)) fail(`unknown stage "${value}" (${STAGES.join(', ')})`);
  const cur = getHeader(lines, 'Stage');
  if (cur !== null && cur !== value) {
    if (!STAGES.includes(cur)) fail(`ledger carries unknown stage "${cur}" — fix the ledger by hand first`);
    if (!stageMoveAllowed(cur, value)) {
      const allowed = STAGES.filter((s) => s !== cur && stageMoveAllowed(cur, s));
      fail(`stage "${cur}" does not move to "${value}" — allowed: ${allowed.join(', ') || 'none (terminal)'}`);
    }
  }
  writeLines(root, setHeader(lines, 'Stage', value));
}

function verbSlice(root, id, status, range) {
  if (!SLICE_STATUSES.includes(status)) fail(`unknown slice status "${status}" (${SLICE_STATUSES.join(', ')})`);
  const lines = readLines(root);
  const rows = tableRowIndexes(lines);
  for (const i of rows) {
    const cells = splitRow(lines[i]);
    if (cells[0] === id) {
      if (cells.length !== 7) fail(`slice row "${id}" does not carry the 7 ledger columns`);
      // Rebuild the row preserving every other cell verbatim — splitRow unescaped them, so
      // re-sanitizing on the way back out keeps the round-trip lossless.
      cells[5] = status;
      if (range !== undefined) cells[6] = range;
      lines[i] = '| ' + cells.map(sanitizeCell).join(' | ') + ' |';
      writeLines(root, lines);
      return;
    }
  }
  fail(`no slice row with id "${id}" in ${ledgerPath(root)}`);
}

function verbDegraded(root, sub, text) {
  if (sub !== 'add') fail(`unknown degraded subcommand "${sub}" — use add`);
  if (!text) fail('degraded add needs the bullet text');
  const lines = readLines(root);
  const re = headerRe('Degraded');
  let at = lines.findIndex((l) => re.test(l));
  if (at < 0) {
    // Create the line beside **Stage:** (scope-mode `## Degraded passes`).
    const stageAt = lines.findIndex((l) => headerRe('Stage').test(l));
    at = stageAt >= 0 ? stageAt + 1 : 0;
    lines.splice(at, 0, '**Degraded:**');
  }
  // Append after the last existing bullet under the line.
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  lines.splice(end, 0, `- ${text}`);
  writeLines(root, lines);
}

function verbGet(root, field) {
  if (field === 'slices') {
    // The read half of `slice`: every table row as tab-separated
    // id/issue/title/type/depends-on/status/range, one line per slice.
    const lines = readLines(root);
    for (const i of tableRowIndexes(lines)) {
      const cells = splitRow(lines[i]);
      if (cells.length !== 7) fail(`slice row does not carry the 7 ledger columns: ${lines[i].trim()}`);
      console.log(cells.join('\t'));
    }
    return;
  }
  const names = { stage: 'Stage', branch: 'Branch', anchor: 'Anchor' };
  const name = names[field];
  if (!name) fail(`unknown field "${field}" — use stage|branch|anchor|slices`);
  const v = getHeader(readLines(root), name);
  console.log(v === null ? 'absent' : v);
}

function verbStatus(cwd) {
  const scopesDir = path.join(cwd, '.superdev', 'scopes');
  let entries = [];
  try {
    entries = fs
      .readdirSync(scopesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => fs.existsSync(path.join(scopesDir, n, 'ledger.md')));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (entries.length === 0) {
    console.log('No superdev runs found in this repo.');
    return;
  }
  // Oldest run root first.
  entries.sort((a, b) => {
    const sa = fs.statSync(path.join(scopesDir, a));
    const sb = fs.statSync(path.join(scopesDir, b));
    return (sa.birthtimeMs || sa.mtimeMs) - (sb.birthtimeMs || sb.mtimeMs);
  });

  const out = [];
  for (const scope of entries) {
    let lines;
    try {
      lines = readLines(path.join(scopesDir, scope));
    } catch {
      out.push(`${scope}: ledger unreadable`);
      continue;
    }
    try {
      const stage = getHeader(lines, 'Stage');
      const rows = tableRowIndexes(lines).map((i) => splitRow(lines[i]));
      if (rows.some((c) => c.length !== 7)) {
        out.push(`${scope}: ledger unreadable`);
        continue;
      }
      const counts = { todo: 0, 'in-progress': 0, 'in-review': 0, blocked: 0, merged: 0 };
      const blocked = [];
      for (const c of rows) {
        if (counts[c[5]] !== undefined) counts[c[5]]++;
        if (c[5] === 'blocked') blocked.push(`${c[0]} ${c[2]}`);
      }
      const degRe = headerRe('Degraded');
      const degAt = lines.findIndex((l) => degRe.test(l));
      const degraded = [];
      if (degAt >= 0) {
        for (let i = degAt + 1; i < lines.length && lines[i].startsWith('- '); i++) {
          degraded.push(lines[i].slice(2));
        }
      }
      out.push(`${scope}  (${rows.length} slices${stage ? `, stage: ${stage}` : ''})`);
      out.push(`  todo: ${counts.todo}  in-progress: ${counts['in-progress']}  in-review: ${counts['in-review']}  blocked: ${counts.blocked}  merged: ${counts.merged}`);
      if (blocked.length) out.push(`  blocked: ${blocked.join(', ')}`);
      if (degraded.length) out.push(`  degraded: ${degraded.join(', ')}`);
    } catch {
      out.push(`${scope}: ledger unreadable`);
    }
  }
  console.log(out.join('\n'));
}

// --- CLI ---------------------------------------------------------------------

function usage() {
  return [
    'usage: node scope.js <verb> …   (ledger CLI — the only ledger.md write path)',
    '  init <type>/<slug>                 stdin: {"anchor":"…","slices":[{id,issue,title,type,…}]}',
    '  stage get|set <value> --root <run-root>',
    '  slice <id> <status> [--range <r>]   --root <run-root>',
    '  degraded add <text>   --root <run-root>',
    '  get stage|branch|anchor|slices --root <run-root>',
    '  status                             scans <cwd>/.superdev/scopes/*/',
  ].join('\n');
}

function takeRoot(args) {
  const i = args.indexOf('--root');
  if (i < 0) fail('missing --root <run-root> (the absolute run-root path)');
  const root = args[i + 1];
  if (!root) fail('--root needs a path');
  args.splice(i, 2);
  return root;
}

function run(argv, cwd, stdinJson) {
  const args = argv.slice();
  const verb = args.shift();
  switch (verb) {
    case 'init':
      if (!args[0]) fail('init needs a <type>/<slug> label');
      verbInit(cwd, args[0], stdinJson);
      break;
    case 'stage': {
      const root = takeRoot(args);
      verbStage(root, args[0], args[1]);
      break;
    }
    case 'slice': {
      const root = takeRoot(args);
      let range;
      const ri = args.indexOf('--range');
      if (ri >= 0) {
        range = args[ri + 1];
        if (!range) fail('--range needs a value');
        args.splice(ri, 2);
      }
      if (!args[0] || !args[1]) fail('slice needs <id> <status>');
      verbSlice(root, args[0], args[1], range);
      break;
    }
    case 'degraded': {
      const root = takeRoot(args);
      verbDegraded(root, args[0], args.slice(1).join(' '));
      break;
    }
    case 'get': {
      const root = takeRoot(args);
      verbGet(root, args[0]);
      break;
    }
    case 'status':
      verbStatus(cwd);
      break;
    default:
      fail('unknown verb "' + (verb || '') + '"\n' + usage());
  }
}

function main() {
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }
  const argv = process.argv.slice(2);
  const needsStdin = argv[0] === 'init';
  const go = (stdinJson) => {
    try {
      run(argv, process.cwd(), stdinJson);
      // Let the process exit naturally on success, so stdout is guaranteed to flush first;
      // a refusal still exits nonzero below.
    } catch (e) {
      if (e.isRefusal) {
        process.stderr.write(e.message + '\n');
        process.exit(1);
      }
      throw e;
    }
  };
  if (needsStdin) {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => go(raw));
  } else {
    go('');
  }
}

// --- selftest ----------------------------------------------------------------

function selftest() {
  const assert = require('node:assert');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-'));

  // Capture console.log output per call.
  const call = (argv, stdinJson) => {
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, tmp, stdinJson || '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  };

  const sliceJson = JSON.stringify({
    anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
    slices: [
      { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—' },
      { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
    ],
  });

  try {
    // init: valid label creates root + schema-shaped ledger.
    let r = call(['init', 'feat/demo'], sliceJson);
    assert.ok(r.ok, 'init should pass: ' + (r.err || ''));
    const root = path.join(tmp, '.superdev', 'scopes', 'demo');
    const text = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(text.includes('**Stage:** implementing'), 'ledger carries Stage');
    assert.ok(text.includes('**Branch:** feat/demo'), 'ledger carries Branch');
    assert.ok(text.includes('**Anchor:** #187'), 'ledger carries Anchor');
    assert.ok(text.includes('| id | issue | title | type | depends-on | status | range |'), 'ledger carries the 7-column table');
    assert.ok(text.includes('| 01 | #188 | scope.js CLI | behavior | — | todo | — |'), 'ledger carries slice rows');
    assert.ok(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8').includes('.superdev/'), '.superdev/ git-ignored');

    // init: a run root whose ledger.md already exists is refused (the real double-init signal).
    r = call(['init', 'feat/demo'], sliceJson);
    assert.ok(!r.ok && /already exists/.test(r.err), 'existing ledger refused');

    // init: a run root directory that exists but holds no ledger.md yet (Phase 0 writes dod.md
    // before calling init) is tolerated — init still writes the ledger into it.
    const preexistingRoot = path.join(tmp, '.superdev', 'scopes', 'preexisting');
    fs.mkdirSync(preexistingRoot, { recursive: true });
    fs.writeFileSync(path.join(preexistingRoot, 'dod.md'), '# DoD\n', 'utf8');
    r = call(['init', 'feat/preexisting'], sliceJson);
    assert.ok(r.ok, 'init tolerates a pre-existing dir with no ledger.md: ' + (r.err || ''));
    assert.ok(fs.existsSync(path.join(preexistingRoot, 'ledger.md')), 'ledger written into the pre-existing dir');
    assert.ok(fs.existsSync(path.join(preexistingRoot, 'dod.md')), 'dod.md untouched');

    // init: invalid labels refused naming the failing segment, no root created.
    for (const [label, re] of [
      ['zap/demo2', /type/],
      ['feat/Bad Slug', /slug/],
      ['nodelimiter', /no "\/"/],
      ['/demo2', /empty type/],
      ['feat/', /empty slug/],
      ['feat/-lead', /slug/],
    ]) {
      r = call(['init', label], sliceJson);
      assert.ok(!r.ok, `init "${label}" should refuse`);
      assert.ok(re.test(r.err), `refusal for "${label}" names the segment: ${r.err}`);
    }
    assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'demo2')), 'no root created on refusal');

    // init: duplicate slice ids refused.
    const dupJson = JSON.stringify({
      anchor: '#1 — anchor',
      slices: [
        { id: '01', issue: '#1', title: 'a', type: 'behavior' },
        { id: '01', issue: '#2', title: 'b', type: 'behavior' },
      ],
    });
    r = call(['init', 'feat/dup'], dupJson);
    assert.ok(!r.ok && /duplicate slice id/.test(r.err), 'duplicate slice id refused');
    assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'dup')), 'no root created on duplicate id');

    // stage: get, unknown value, backwards, terminal, sanctioned move.
    const R = ['--root', root];
    assert.strictEqual(call(['stage', 'get', ...R]).out, 'implementing', 'stage get');
    r = call(['stage', 'set', 'polished', ...R]);
    assert.ok(!r.ok && /unknown stage/.test(r.err), 'unknown stage refused');
    assert.ok(call(['stage', 'set', 'merged', ...R]).ok, 'implementing → merged');
    r = call(['stage', 'set', 'implementing', ...R]);
    assert.ok(!r.ok, 'backwards move refused');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', ...R]).ok, 'merged → documented-unreviewed');
    assert.ok(call(['stage', 'set', 'reviewed', ...R]).ok, 'sanctioned reviewed over documented-unreviewed');
    assert.ok(call(['stage', 'set', 'documented', ...R]).ok, 'reviewed → documented');
    r = call(['stage', 'set', 'reviewed', ...R]);
    assert.ok(!r.ok, 'documented is terminal for earlier stages');
    assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'documented → shipped (ship\'s own write)');
    r = call(['stage', 'set', 'documented', ...R]);
    assert.ok(!r.ok, 'shipped is terminal');
    assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'same-value write is a no-op, not a refusal');

    // stage: forward moves may skip ranks — the chain prose instructs it (review.md "anything else →
    // write reviewed", document.md "anything else → write documented-unreviewed") — and a forward move
    // out of documented-unreviewed reaching documented (no fix cycle ran) is allowed too. Each gets its
    // own scratch scope so it doesn't disturb the pipeline walk above.
    const mkStageRoot = (slug) => {
      assert.ok(call(['init', 'feat/' + slug], sliceJson).ok);
      return path.join(tmp, '.superdev', 'scopes', slug);
    };
    let sr = mkStageRoot('stage-fwd-reviewed');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok, 'implementing → reviewed (skip forward) allowed');

    sr = mkStageRoot('stage-fwd-docunrev');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok, 'implementing → documented-unreviewed (skip forward) allowed');

    sr = mkStageRoot('stage-fwd-doc');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok, 'documented-unreviewed → documented (no fix cycle) allowed');

    // stage: still-refused same-rank and backwards moves.
    sr = mkStageRoot('stage-back-docunrev');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
    r = call(['stage', 'set', 'documented-unreviewed', '--root', sr]);
    assert.ok(!r.ok, 'reviewed → documented-unreviewed refused (only the reverse pair is sanctioned)');

    sr = mkStageRoot('stage-back-reviewed');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
    r = call(['stage', 'set', 'reviewed', '--root', sr]);
    assert.ok(!r.ok, 'documented → reviewed refused');

    sr = mkStageRoot('stage-back-documented');
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'shipped', '--root', sr]).ok);
    r = call(['stage', 'set', 'documented', '--root', sr]);
    assert.ok(!r.ok, 'shipped → documented refused');

    // slice: unknown id/status refused; a valid call updates exactly that row.
    r = call(['slice', '01', 'polished', ...R]);
    assert.ok(!r.ok && /unknown slice status/.test(r.err), 'unknown slice status refused');
    r = call(['slice', '99', 'merged', ...R]);
    assert.ok(!r.ok && /no slice row/.test(r.err), 'unknown slice id refused');
    assert.ok(call(['slice', '01', 'merged', ...R]).ok, 'valid slice update');
    const after = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(after.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |'), 'row 01 updated');
    assert.ok(after.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |'), 'row 02 untouched');

    // slice --range: writes the range cell when given, leaves it alone (— above) without it.
    assert.ok(call(['slice', '02', 'merged', '--range', 'abc123..def456', ...R]).ok, 'slice with --range');
    const withRange = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(withRange.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | merged | abc123..def456 |'), 'range cell written');

    // writeLines writes atomically (temp file + rename) — no leftover temp file survives a write.
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), [], 'no stray temp file left behind');

    // degraded: creates the line when absent, appends when present.
    assert.ok(call(['degraded', 'add', 'first pass degraded (2026-08-06)', ...R]).ok, 'degraded add creates');
    assert.ok(call(['degraded', 'add', 'second pass degraded (2026-08-06)', ...R]).ok, 'degraded add appends');
    const deg = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(/\*\*Degraded:\*\*\n- first pass degraded \(2026-08-06\)\n- second pass degraded \(2026-08-06\)/.test(deg), 'both bullets under one line');

    // get: prints the value; absent header reported as absent.
    assert.strictEqual(call(['get', 'branch', ...R]).out, 'feat/demo', 'get branch');
    assert.ok(/#187/.test(call(['get', 'anchor', ...R]).out), 'get anchor');
    const slices = call(['get', 'slices', ...R]).out.split('\n');
    assert.strictEqual(slices.length, 2, 'get slices prints one line per row');
    assert.strictEqual(slices[0], '01\t#188\tscope.js CLI\tbehavior\t—\tmerged\t—', 'get slices is tab-separated');

    // cell escaping: a `|` or a newline in a title must not corrupt the ledger row, and must
    // round-trip losslessly through get slices and a slice row-rebuild.
    const pipeJson = JSON.stringify({
      anchor: '#1 — anchor',
      slices: [{ id: '01', issue: '#1', title: 'add a|b parser', type: 'behavior' }],
    });
    let pr = call(['init', 'feat/pipe-title'], pipeJson);
    assert.ok(pr.ok, 'init with a `|` in the title should pass: ' + (pr.err || ''));
    const pipeRoot = path.join(tmp, '.superdev', 'scopes', 'pipe-title');
    const P2 = ['--root', pipeRoot];
    let pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
    assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\ttodo\t—', 'get slices restores the literal |');
    assert.ok(call(['slice', '01', 'merged', ...P2]).ok, 'slice row-rebuild survives an escaped |');
    pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
    assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\tmerged\t—', 'title with | intact after row-rebuild');
    let ps = call(['status']);
    assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('pipe-title')) || ''), 'status reads the pipe-title ledger fine');

    const newlineJson = JSON.stringify({
      anchor: '#2 — anchor',
      slices: [{ id: '01', issue: '#2', title: 'line one\nline two', type: 'behavior' }],
    });
    pr = call(['init', 'feat/newline-title'], newlineJson);
    assert.ok(pr.ok, 'init with a newline in the title should pass: ' + (pr.err || ''));
    const nlRoot = path.join(tmp, '.superdev', 'scopes', 'newline-title');
    const N2 = ['--root', nlRoot];
    let nlSlices = call(['get', 'slices', ...N2]).out.split('\n');
    assert.strictEqual(nlSlices.length, 1, 'a collapsed newline title stays one ledger row');
    assert.strictEqual(nlSlices[0], '01\t#2\tline one line two\tbehavior\t—\ttodo\t—', 'newline runs collapse to one space');
    assert.ok(call(['slice', '01', 'merged', ...N2]).ok, 'slice row-rebuild survives a collapsed newline');
    ps = call(['status']);
    assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('newline-title')) || ''), 'status reads the newline-title ledger fine');

    // The scope-slug and change-type rules live here as code (SLUG_RE, CHANGE_TYPES) but
    // hooks/run-lock.js extracts with the same charset and references/scope-mode.md states it
    // in prose — one fact in three syntaxes, kept equal (took over from drift-check's retired
    // scope-slug contract row).
    assert.strictEqual(SLUG_RE.source, '^[a-zA-Z0-9][a-zA-Z0-9_-]*$', 'SLUG_RE itself is pinned');
    const charset = SLUG_RE.source.slice(1, -1); // drop the ^…$ anchors
    const repo = path.join(__dirname, '..');
    const runLock = fs.readFileSync(path.join(repo, 'hooks', 'run-lock.js'), 'utf8');
    assert.ok(runLock.includes(charset), 'run-lock.js extracts with the SLUG_RE charset');
    const scopeMode = fs.readFileSync(path.join(repo, 'references', 'scope-mode.md'), 'utf8');
    assert.ok(scopeMode.includes('`' + charset + '`'), 'scope-mode.md states the SLUG_RE charset');

    // A pre-CLI ledger (hand-written, no Branch/Anchor/Degraded lines) parses unchanged.
    const preRoot = path.join(tmp, '.superdev', 'scopes', 'precli');
    fs.mkdirSync(preRoot, { recursive: true });
    fs.writeFileSync(
      path.join(preRoot, 'ledger.md'),
      '# Ledger — precli\n\n**Stage:** merged\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n' +
        '| 01 | #10 | old slice | mechanical | — | merged | abc..def |\n',
      'utf8'
    );
    const P = ['--root', preRoot];
    assert.strictEqual(call(['stage', 'get', ...P]).out, 'merged', 'pre-CLI stage readable');
    assert.strictEqual(call(['get', 'branch', ...P]).out, 'absent', 'absent Branch reported as absent');
    assert.ok(call(['stage', 'set', 'reviewed', ...P]).ok, 'pre-CLI ledger writable');

    // status: renders every scope; an unreadable ledger is reported while others render.
    const badRoot = path.join(tmp, '.superdev', 'scopes', 'broken');
    fs.mkdirSync(badRoot, { recursive: true });
    fs.writeFileSync(path.join(badRoot, 'ledger.md'), '| 01 | not | enough | cells |\n', 'utf8');
    const st = call(['status']);
    assert.ok(st.ok, 'status runs');
    assert.ok(st.out.includes('demo  (2 slices, stage: shipped)'), 'status shows demo scope: ' + st.out);
    assert.ok(st.out.includes('todo: 0  in-progress: 0  in-review: 0  blocked: 0  merged: 2'), 'status tallies demo');
    assert.ok(st.out.includes('degraded: first pass degraded (2026-08-06), second pass degraded (2026-08-06)'), 'status shows degrade record');
    assert.ok(st.out.includes('precli  (1 slices, stage: reviewed)'), 'status shows pre-CLI scope');
    assert.ok(st.out.includes('broken: ledger unreadable'), 'unreadable ledger reported');

    // status with zero scopes.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-empty-'));
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(['status'], empty, '');
    } finally {
      console.log = orig;
    }
    assert.strictEqual(logged.join('\n'), 'No superdev runs found in this repo.', 'zero-scope message');
    fs.rmSync(empty, { recursive: true, force: true });

    // main()'s success path lets the process exit naturally instead of forcing process.exit(0),
    // so stdout flushes before exit. `call()` above bypasses main() entirely, so this needs a
    // real subprocess.
    const cp = require('child_process');
    const spawnEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-spawn-'));
    const spawned = cp.spawnSync(process.execPath, [__filename, 'status'], { cwd: spawnEmpty, encoding: 'utf8' });
    assert.strictEqual(spawned.status, 0, 'CLI process exits 0 on success');
    assert.strictEqual(spawned.stdout.trim(), 'No superdev runs found in this repo.', 'CLI process flushes stdout');
    fs.rmSync(spawnEmpty, { recursive: true, force: true });

    console.log('scope selftest ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
