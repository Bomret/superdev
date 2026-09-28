'use strict';

// Suite for scripts/invariant-check.js, the maintainer-only register validator (ADR 0093). Every
// case builds a throwaway repository under the OS temp dir and runs the CLI against it with
// --root, the same way the maintainer runs it against another repository.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const CLI = path.join(__dirname, '..', 'scripts', 'invariant-check.js');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'invariant-check-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function run(args, label) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(result, label);
  return result;
}

const GLOSSARY = '# Glossary\n\n**Order**: a purchase.\n\n**Tier** (execution): a route.\n';
const entry = (id, fields) => `### ${id}\n\n${fields.join('\n')}\n`;
const GOOD = [
  'Class: architecture',
  'Concepts: Order',
  'Statement: An order total equals the sum of its lines.',
  'Breaks: silently',
  'Check: none — nothing cheaply tests it yet',
];
const register = (...entries) => `# Invariant register\n\n${entries.join('\n')}`;

// --- the CLI contract: usage, a repository with no register, a clean register. ---
{
  const r = run([], 'no --root');
  assert.notEqual(r.status, 0, 'a missing --root exits non-zero');
  assert.match(r.stderr, /usage/i, 'a missing --root prints usage');

  const r2 = run(['--root', path.join(os.tmpdir(), 'invariant-check-does-not-exist')], 'bad --root');
  assert.notEqual(r2.status, 0, 'a --root naming no directory exits non-zero');
  assert.match(r2.stderr, /usage/i, 'a --root naming no directory prints usage');

  const empty = repo({ 'CONTEXT.md': GLOSSARY });
  const r3 = run(['--root', empty], 'no register');
  assert.equal(r3.status, 0, 'a repository with no register passes');
  assert.match(r3.stdout, /no register/i, 'and says no register was found');

  const clean = repo({ 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0001', GOOD)) });
  const r4 = run(['--root', clean], 'clean register');
  assert.equal(r4.status, 0, `a register meeting every rule exits 0 (got: ${r4.stdout}${r4.stderr})`);
  assert.equal(r4.stdout.trim().split('\n').length, 1, 'a clean run prints one summary line');
}

function failuresFor(files, label) {
  const r = run(['--root', repo(files)], label);
  return { status: r.status, out: r.stdout };
}
const without = (key) => GOOD.filter((l) => !l.startsWith(`${key}:`));

// --- mandatory fields: each missing one is named with the entry's id. ---
for (const key of ['Class', 'Concepts', 'Statement', 'Breaks']) {
  const { status, out } = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0007', without(key))) },
    `missing ${key}`,
  );
  assert.equal(status, 1, `an entry missing ${key} fails`);
  assert.match(out, new RegExp(`^INV-0007: ${key}: `, 'm'), `the failure names INV-0007 and ${key}`);
}

// --- Check on a silently breaking entry: required, and `none` carries a reason. ---
{
  const noCheck = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0002', without('Check'))) },
    'silent without Check',
  );
  assert.equal(noCheck.status, 1, 'a Breaks: silently entry with no Check fails');
  assert.match(noCheck.out, /^INV-0002: Check: /m, 'the failure names the entry and Check');

  const bare = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0003', [...without('Check'), 'Check: none'])),
    },
    'bare none',
  );
  assert.equal(bare.status, 1, 'a bare `Check: none` fails');
  assert.match(bare.out, /^INV-0003: Check: /m, 'the bare none failure names the entry and Check');

  const loud = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0004', [...without('Check').filter((l) => !l.startsWith('Breaks')), 'Breaks: loudly'])),
    },
    'loud without Check',
  );
  assert.equal(loud.status, 0, `an entry that breaks loudly needs no Check (got: ${loud.out})`);
}

// --- ids: a duplicate is reported once; a gap is legal. ---
{
  const dup = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0001', GOOD), entry('INV-0001', GOOD), entry('INV-0001', GOOD)),
    },
    'duplicate id',
  );
  assert.equal(dup.status, 1, 'a duplicated id fails');
  assert.equal((dup.out.match(/^INV-0001: id: /gm) || []).length, 1, 'a duplicated id is reported once');

  const gap = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0001', GOOD), entry('INV-0009', GOOD)) },
    'id gap',
  );
  assert.equal(gap.status, 0, `a gap in the id sequence is legal (got: ${gap.out})`);
}

const withConcepts = (value) => GOOD.map((l) => (l.startsWith('Concepts:') ? `Concepts: ${value}` : l));

// --- Concepts: an exact bold term, unioned over every CONTEXT.md the walk reaches. ---
{
  const unknown = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0005', withConcepts('Order, Invoice'))) },
    'unknown concept',
  );
  assert.equal(unknown.status, 1, 'a Concepts value no glossary defines fails');
  assert.match(unknown.out, /^INV-0005: Concepts: .*Invoice/m, 'the failure names the entry and the value');
  assert.doesNotMatch(unknown.out, /Concepts: .*\bOrder\b.*not a glossary term/, 'the defined value is not reported');

  const qualified = failuresFor(
    {
      'CONTEXT.md': `${GLOSSARY}\n**Definition of Done (DoD)**: the criteria.\n`,
      'docs/invariants.md': register(entry('INV-0006', withConcepts('Tier, Definition of Done'))),
    },
    'qualifier and abbreviation',
  );
  assert.match(qualified.out, /^INV-0006: Concepts: .*Definition of Done\b/m, '`Definition of Done` does not match `Definition of Done (DoD)`');
  assert.doesNotMatch(qualified.out, /Concepts: `?Tier`?/, '`Tier` matches `**Tier** (execution)`');

  const listed = failuresFor(
    {
      'CONTEXT.md': '# Glossary\n\n- **Order** — a purchase.\n\n* **Invoice** — a bill.\n',
      'docs/invariants.md': register(entry('INV-0009', withConcepts('Order, Invoice'))),
    },
    'list-item terms',
  );
  assert.doesNotMatch(listed.out, /not a glossary term/, 'a term opening a `- ` or `* ` list item is a glossary term');

  const nested = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'billing/CONTEXT.md': '**Invoice**: a bill.\n',
      'node_modules/pkg/CONTEXT.md': '**Ghost**: never read.\n',
      '.superdev/brainstorm/CONTEXT.md': '**Scratch**: never read.\n',
      'docs/invariants.md': register(entry('INV-0008', withConcepts('Order, Invoice, Ghost, Scratch'))),
    },
    'nested glossaries',
  );
  assert.doesNotMatch(nested.out, /Invoice/, 'a CONTEXT.md in a subdirectory contributes its terms');
  assert.match(nested.out, /Ghost/, 'a CONTEXT.md under node_modules/ contributes none');
  assert.match(nested.out, /Scratch/, 'a CONTEXT.md under .superdev/ contributes none');

  const gitRoot = repo({ 'docs/invariants.md': register(entry('INV-0010', withConcepts('Order, Gitty'))) });
  fs.mkdirSync(path.join(gitRoot, '.git'));
  fs.writeFileSync(path.join(gitRoot, '.git', 'CONTEXT.md'), '**Gitty**: never read.\n');
  fs.writeFileSync(path.join(gitRoot, 'CONTEXT.md'), GLOSSARY);
  const gitRun = run(['--root', gitRoot], '.git glossary');
  assert.match(gitRun.stdout, /Gitty/, 'a CONTEXT.md under .git/ contributes none');

  const claudeRoot = repo({
    'CONTEXT.md': GLOSSARY,
    '.claude/worktrees/copy/CONTEXT.md': '**Ghost**: never read.\n',
    'docs/invariants.md': register(entry('INV-0013', withConcepts('Order, Ghost'))),
  });
  const claudeRun = run(['--root', claudeRoot], '.claude glossary');
  assert.match(claudeRun.stdout, /Ghost/, 'a CONTEXT.md under .claude/ contributes none');

  const noGlossary = failuresFor(
    { 'docs/invariants.md': register(entry('INV-0011', withConcepts('Order, Tier'))) },
    'no glossary',
  );
  assert.equal(noGlossary.status, 1, 'a register with no glossary fails');
  assert.match(noGlossary.out, /^INV-0011: Concepts: .*Order/m, 'with no glossary, Order is unresolved');
  assert.match(noGlossary.out, /^INV-0011: Concepts: .*Tier/m, 'with no glossary, Tier is unresolved');
}

// --- layout: any field order, a heading straight after a field line, CRLF. ---
{
  const reordered = [GOOD[2], GOOD[4], GOOD[0], GOOD[3], GOOD[1]];
  const tight = `# Invariant register\n\n### INV-0001\n\n${GOOD.join('\n')}\n### INV-0002\n\n${reordered.join('\n')}\n`;
  const lf = failuresFor({ 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': tight }, 'layout');
  assert.equal(lf.status, 0, `reordered fields and a tight heading parse (got: ${lf.out})`);
  assert.match(lf.out, /\b2 entries\b/, 'the tight heading opens a second entry');

  const crlf = failuresFor(
    {
      'CONTEXT.md': GLOSSARY.replace(/\n/g, '\r\n'),
      'docs/invariants.md': tight.replace(/\n/g, '\r\n'),
    },
    'crlf',
  );
  assert.equal(crlf.status, lf.status, 'CRLF gives the same exit as LF');
  assert.equal(crlf.out, lf.out, 'CRLF gives the same output as LF');

  const brokenCrlf = failuresFor(
    {
      'CONTEXT.md': GLOSSARY.replace(/\n/g, '\r\n'),
      'docs/invariants.md': register(entry('INV-0012', withConcepts('Order, Invoice'))).replace(/\n/g, '\r\n'),
    },
    'crlf failure',
  );
  assert.match(
    brokenCrlf.out,
    /^INV-0012: Concepts: `Invoice` is not a glossary term\n/m,
    'a CRLF failure reports the value without a stray carriage return',
  );
}

// --- headings: an id-shaped heading that is not exactly `### INV-NNNN` is reported, not dropped. ---
{
  const level2 = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `# Invariant register\n\n## INV-0001\n\n${without('Concepts').join('\n')}\n` },
    'level-2 heading',
  );
  assert.equal(level2.status, 1, 'a level-2 INV heading fails, rather than silently dropping the entry');
  assert.match(level2.out, /^INV-0001: id: `## INV-0001` /m, 'the id failure names the offending heading text');
  assert.doesNotMatch(level2.out, /^invariant-check: 0 entries hold$/m, 'the dropped fields are not silently accepted');

  const titled = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `# Invariant register\n\n### INV-0002: Title\n\n${GOOD.join('\n')}\n` },
    'titled heading',
  );
  assert.equal(titled.status, 1, 'a heading trailing text past the id fails');
  assert.match(titled.out, /^INV-0002: id: `### INV-0002: Title` /m, 'the id failure names the heading text');

  const lower = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `# Invariant register\n\n### inv-0003\n\n${GOOD.join('\n')}\n` },
    'lowercase heading',
  );
  assert.equal(lower.status, 1, 'a lowercase `inv-` heading fails');
  assert.match(lower.out, /^INV-0003: id: /m, 'the id failure normalises the case for the reported id');

  const unpadded = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `# Invariant register\n\n### INV-2\n` },
    'unpadded id',
  );
  assert.equal(unpadded.status, 1, 'an id that is not zero-padded to four digits fails');
  assert.match(unpadded.out, /^INV-2: id: /m, 'the id failure names the unpadded id');

  const allThree = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': '# Invariant register\n\n## INV-0001\n\n### INV-0002: Title\n\n### inv-0003\n',
    },
    'three malformed headings',
  );
  assert.equal(allThree.status, 1, `three malformed headings fail rather than printing 0 entries (got: ${allThree.out})`);
  assert.match(allThree.out, /\b0 entries\b/, 'none of the three malformed headings opens a real entry');

  const clean = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `# Invariant register\n\nRules this repository's system may never break.\n\n${register(entry('INV-0001', GOOD))}`,
    },
    'title and intro prose',
  );
  assert.equal(clean.status, 0, `the title and its intro paragraph produce no failure (got: ${clean.out})`);
}

// --- a `Key: value` line outside any entry, or a field key none of the seven names, is reported. ---
{
  const stray = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `# Invariant register\n\nConcepts: Order\n\n${register(entry('INV-0001', GOOD))}`,
    },
    'stray line before any entry',
  );
  assert.equal(stray.status, 1, 'a Key: value line outside any entry fails');
  assert.match(stray.out, /^\(register\): Concepts: `Concepts: Order` /m, 'the failure names the line');

  const misspelled = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0007', [...GOOD, 'Path: plugin/skills/**'])),
    },
    'misspelled Paths key',
  );
  assert.equal(misspelled.status, 1, 'an unrecognised field key fails');
  assert.match(misspelled.out, /^INV-0007: Path: /m, 'the failure names the entry and the unrecognised key');

  const misspelledSymbol = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0008', [...GOOD, 'Symbol: decide'])),
    },
    'misspelled Symbols key',
  );
  assert.equal(misspelledSymbol.status, 1, 'a misspelled Symbols key fails too');
  assert.match(misspelledSymbol.out, /^INV-0008: Symbol: /m, 'the failure names the entry and the unrecognised key');
}

// --- Breaks: silently/loudly match case-insensitively; any other value is reported. ---
{
  const capitalised = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0009', [...without('Check').filter((l) => !l.startsWith('Breaks')), 'Breaks: Silently'])) },
    'capitalised silently, no Check',
  );
  assert.equal(capitalised.status, 1, '`Breaks: Silently` still requires a Check, matched case-insensitively');
  assert.match(capitalised.out, /^INV-0009: Check: /m, 'the failure names the entry and Check');

  const loudUpper = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0010', [...without('Check').filter((l) => !l.startsWith('Breaks')), 'Breaks: LOUDLY'])) },
    'uppercase loudly',
  );
  assert.equal(loudUpper.status, 0, `an entry that breaks loudly, in any case, needs no Check (got: ${loudUpper.out})`);

  const other = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0011', [...GOOD.filter((l) => !l.startsWith('Breaks')), 'Breaks: sometimes'])) },
    'unknown Breaks value',
  );
  assert.equal(other.status, 1, 'a Breaks value that is neither silently nor loudly fails');
  assert.match(other.out, /^INV-0011: Breaks: /m, 'the failure names the entry and Breaks');
}


// --- wiring: `bun run test` validates this repository's own register. ---
{
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(
    pkg.scripts.test,
    /(^|&& )node scripts\/invariant-check\.js --root \.( &&|$)/,
    'the test chain runs the validator against this repository',
  );
}

// --- INV-0051: nothing in the shipped tree names or requires the validator. ---
{
  const shipped = path.join(__dirname, '..', 'plugin');
  const hits = [];
  const visit = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) visit(p);
      else if (fs.readFileSync(p, 'utf8').includes('invariant-check')) hits.push(path.relative(shipped, p));
    }
  };
  visit(shipped);
  assert.deepEqual(hits, [], 'no file under plugin/ names scripts/invariant-check.js');
}

// --- INV-0088: a run prints failures and one summary, never a selected subset of entries. ---
{
  const { out } = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0001', GOOD), entry('INV-0002', withConcepts('Invoice'))),
    },
    'output shape',
  );
  const lines = out.trim().split('\n');
  assert.match(lines.pop(), /^invariant-check: \d+ failure\(s\) in \d+ entries$/, 'the last line is the summary');
  for (const line of lines) assert.match(line, /^INV-\d+: \w+: /, `every other line is a failure: ${line}`);
  assert.doesNotMatch(out, /INV-0001/, 'an entry that holds is not printed');
}

// --- Paths: every glob matches at least one walked file. ---
const TREE = {
  'CONTEXT.md': GLOSSARY,
  'plugin/skills/plan/SKILL.md': 'Plan decides the order total.\n',
  'plugin/skills/ship/SKILL.md': 'Ship.\n',
  'tests/order.test.js': 'orderTotal();\n',
  'src/billing.js': 'function decided() {}\nfunction invoiceTotal() {}\n',
  'node_modules/dep/index.js': 'function hidden() {}\n',
};
const withField = (key, value) => [...GOOD.filter((l) => !l.startsWith(`${key}:`)), `${key}: ${value}`];
{
  const good = failuresFor(
    {
      ...TREE,
      'docs/invariants.md': register(
        entry('INV-0001', withField('Paths', 'plugin/skills/**, tests/*.test.js, CONTEXT.md')),
        entry('INV-0002', withField('Paths', '`plugin/skills/plan/SKILL.md`')),
        entry('INV-0003', withField('Paths', 'plugin/**/SKILL.md, tests/order.test.?s')),
      ),
    },
    'paths resolve',
  );
  assert.equal(good.status, 0, `**, *, ? and literal paths match what they name (got: ${good.out})`);

  const bad = failuresFor(
    {
      ...TREE,
      'docs/invariants.md': register(
        entry('INV-0004', withField('Paths', 'plugin/skills/**, plugin/hooks/**')),
        entry('INV-0005', withField('Paths', 'tests/*.spec.js')),
        entry('INV-0006', withField('Paths', 'node_modules/**')),
        entry('INV-0007', withField('Paths', 'plugin/*.md')),
      ),
    },
    'paths zero',
  );
  assert.equal(bad.status, 1, 'a glob matching no file fails');
  assert.match(bad.out, /^INV-0004: Paths: `plugin\/hooks\/\*\*` matches no file$/m, 'names the entry and the glob');
  assert.doesNotMatch(bad.out, /plugin\/skills\/\*\*/, 'the glob that matches is not reported');
  assert.match(bad.out, /^INV-0005: Paths: /m, 'a * glob matching nothing fails');
  assert.match(bad.out, /^INV-0006: Paths: /m, 'a skipped tree matches nothing');
  assert.match(bad.out, /^INV-0007: Paths: /m, '* stays inside one path segment');
}

// --- separators: the walk yields forward-slash paths, and a backslash path matches the same glob. ---
{
  const { walk, globMatcher } = require(CLI);
  const files = walk(repo(TREE));
  assert.ok(files.includes('plugin/skills/plan/SKILL.md'), 'the walk yields repo-relative paths');
  assert.ok(files.every((f) => !f.includes('\\')), 'the walk yields forward-slash paths only');
  const matches = globMatcher('plugin/skills/**');
  assert.ok(matches('plugin/skills/plan/SKILL.md'), 'a forward-slash path matches');
  assert.ok(matches('plugin\\skills\\plan\\SKILL.md'), 'the same path with backslash separators matches');
  assert.ok(!matches('plugin\\hooks\\a.js'), 'a backslash path outside the glob does not');
}

// --- Symbols: a whole word inside the entry's governed files. ---
{
  const scoped = [...withField('Paths', 'tests/**'), 'Symbols: orderTotal, invoiceTotal'];
  const unscoped = [...GOOD, 'Symbols: invoiceTotal, Billing.decided, onlyInRegister'];
  const dotted = [...withField('Paths', 'src/**'), 'Symbols: `Billing.invoiceTotal`, decide'];
  const { status, out } = failuresFor(
    {
      ...TREE,
      'docs/invariants.md': register(entry('INV-0001', scoped), entry('INV-0002', unscoped), entry('INV-0003', dotted)),
    },
    'symbols',
  );
  assert.equal(status, 1, 'an unresolved symbol fails');
  assert.doesNotMatch(out, /INV-0001: Symbols: `orderTotal`/, 'a symbol inside the entry\'s Paths files resolves');
  assert.match(out, /^INV-0001: Symbols: `invoiceTotal` /m, 'a symbol found only outside the entry\'s Paths files fails');
  assert.doesNotMatch(out, /INV-0002: Symbols: `(invoiceTotal|Billing\.decided)`/, 'with no Paths, any walked file resolves a symbol');
  assert.match(out, /^INV-0002: Symbols: `onlyInRegister` /m, 'the register itself resolves no symbol');
  assert.doesNotMatch(out, /INV-0003: Symbols: `Billing\.invoiceTotal`/, 'a dotted symbol resolves on its last segment');
  assert.match(out, /^INV-0003: Symbols: `decide` /m, '`decide` does not match `decided`');
}

// --- Check: a path-shaped token names a file that exists; prose around it is not checked. ---
{
  const good = withField('Check', 'tests/order.test.js ("sums the lines"); `scripts/drift-check.js` `order-total` row');
  const bad = withField('Check', '`tests/gone.test.js` and src/billing.js:12 (the `#no-fetch` case)');
  const { status, out } = failuresFor(
    { ...TREE, 'docs/invariants.md': register(entry('INV-0001', good), entry('INV-0002', bad)) },
    'check paths',
  );
  assert.equal(status, 1, 'a Check naming a missing file fails');
  assert.match(out, /^INV-0001: Check: `scripts\/drift-check\.js` /m, 'a missing script path is reported');
  assert.doesNotMatch(out, /INV-0001: Check: `tests\/order\.test\.js`/, 'an existing test path passes');
  assert.doesNotMatch(out, /order-total|sums the lines/, 'drift ids and quoted test names are not checked');
  assert.match(out, /^INV-0002: Check: `tests\/gone\.test\.js` names no file$/m, 'names the entry and the path');
  assert.doesNotMatch(out, /src\/billing\.js|#no-fetch/, 'an existing path with a line suffix passes');
}

// --- I-1: a non-field line inside an entry fails, naming the entry and the line; a duplicate field
// key fails too, keeping the first value rather than overwriting it. ---
{
  const { parseEntries } = require(CLI);
  const stray = `${entry('INV-0001', GOOD)}###INV-0002\n\nStatement: second rule\nBreaks: loudly\n`;
  const { entries, failures } = parseEntries(stray);
  assert.equal(entries.length, 1, 'the unrecognised heading opens no new entry');
  assert.equal(
    entries[0].fields.Statement,
    'An order total equals the sum of its lines.',
    "INV-0001's own Statement is not overwritten",
  );
  assert.equal(entries[0].fields.Breaks, 'silently', "INV-0001's own Breaks is not overwritten");
  assert.ok(
    failures.some((f) => f.id === 'INV-0001' && /###INV-0002/.test(f.reason)),
    'the stray heading line fails, naming INV-0001',
  );
  assert.ok(
    failures.some((f) => f.id === 'INV-0001' && f.field === 'Statement' && /twice/.test(f.reason)),
    'the duplicated Statement fails',
  );
  assert.ok(
    failures.some((f) => f.id === 'INV-0001' && f.field === 'Breaks' && /twice/.test(f.reason)),
    'the duplicated Breaks fails',
  );

  const indented = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `${register(entry('INV-0001', GOOD))} ### INV-0002\n\nStatement: second rule\nBreaks: loudly\n`,
    },
    'indented heading',
  );
  assert.equal(indented.status, 1, 'an indented ### heading inside an entry fails rather than silently reparenting fields');

  const tight = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `${register(entry('INV-0001', GOOD))}###INV-0002\n\nStatement: second rule\nBreaks: loudly\n`,
    },
    'unspaced heading',
  );
  assert.equal(tight.status, 1, 'an unspaced ###INV-0002 heading inside an entry fails rather than silently reparenting fields');
}

// --- m-A: a field key matching one of the seven case-insensitively, but written in the wrong case,
// is reported as a wrong-case key rather than an unrecognised one or silently ignored. ---
{
  const wrongCase = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0014', [...GOOD, 'paths: nowhere/**'])) },
    'wrong-case Paths key',
  );
  assert.equal(wrongCase.status, 1, 'a lowercase paths: key fails');
  assert.match(
    wrongCase.out,
    /^INV-0014: paths: .*wrong case.*`Paths`/m,
    'the failure names the wrong-case key and the correct spelling',
  );

  const wrongCase2 = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0015', [...GOOD, 'symbols: Nope'])) },
    'wrong-case Symbols key',
  );
  assert.equal(wrongCase2.status, 1, 'a lowercase symbols: key fails');
  assert.match(
    wrongCase2.out,
    /^INV-0015: symbols: .*wrong case.*`Symbols`/m,
    'the failure names the wrong-case key and the correct spelling',
  );
}

// --- I-1: a backticked `Check:` value is unquoted before the missing-proof and `none` tests, so
// `` `none` `` and empty backticks on a silently breaking entry fail like their bare forms. ---
{
  const backtickedNone = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0016', [...without('Check'), 'Check: `none`'])),
    },
    'backticked none',
  );
  assert.equal(backtickedNone.status, 1, 'a backticked `none` fails like the bare form');
  assert.match(backtickedNone.out, /^INV-0016: Check: /m, 'the failure names the entry and Check');

  const emptyBackticks = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0017', [...without('Check'), 'Check: ``'])),
    },
    'empty backticks',
  );
  assert.equal(emptyBackticks.status, 1, 'empty backticks fail like a missing Check');
  assert.match(emptyBackticks.out, /^INV-0017: Check: /m, 'the failure names the entry and Check');
}

// --- I-2: a register that exists but parses to zero entries fails, rather than passing as
// "0 entries hold". An empty file, a UTF-16LE file, and a blockquoted-only register all trigger it. ---
{
  const empty = failuresFor({ 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': '' }, 'empty register');
  assert.equal(empty.status, 1, 'an empty register file fails rather than passing as 0 entries');
  assert.match(empty.out, /^\(register\): id: no `### INV-NNNN` entry found$/m, 'names the missing-entry reason');

  const utf16 = repo({ 'CONTEXT.md': GLOSSARY });
  fs.mkdirSync(path.join(utf16, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(utf16, 'docs', 'invariants.md'), Buffer.from(`﻿${register(entry('INV-0001', GOOD))}`, 'utf16le'));
  const utf16Run = run(['--root', utf16], 'utf-16le register');
  assert.equal(utf16Run.status, 1, 'a UTF-16LE register fails rather than passing as 0 entries');
  assert.match(utf16Run.stdout, /^\(register\): id: no `### INV-NNNN` entry found$/m, 'names the missing-entry reason');

  const blockquoted = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `# Invariant register\n\n> ### INV-0001\n>\n> ${GOOD.join('\n> ')}\n`,
    },
    'blockquoted register',
  );
  assert.equal(blockquoted.status, 1, 'a blockquoted-only register fails rather than passing as 0 entries');
  assert.match(blockquoted.out, /^\(register\): id: no `### INV-NNNN` entry found$/m, 'names the missing-entry reason');

  const noRegisterFile = repo({ 'CONTEXT.md': GLOSSARY });
  const noRegRun = run(['--root', noRegisterFile], 'no register file at all');
  assert.equal(noRegRun.status, 0, 'a repository with no register file at all still passes');
  assert.match(noRegRun.stdout, /no register/i, 'and still says no register was found');
}

// --- m-1: a line outside any entry that carries an invariant id is reported, even after a non-INV
// heading (e.g. `## Retired`), while the register's own title and intro prose stay legal. ---
{
  const retired = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `${register(entry('INV-0001', GOOD))}\n## Retired\n\n> ### INV-0005\n`,
    },
    'blockquoted heading after non-INV heading',
  );
  assert.equal(retired.status, 1, 'a blockquoted heading-shaped INV line outside any entry fails');
  assert.match(retired.out, /^\(register\): id: `> ### INV-0005` /m, 'the failure names the offending line');

  const indentedRetired = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': `${register(entry('INV-0001', GOOD))}\n## Retired\n\n    ### INV-0005\n`,
    },
    'indented heading after non-INV heading',
  );
  assert.equal(indentedRetired.status, 1, 'an indented heading-shaped INV line outside any entry fails');
  assert.match(indentedRetired.out, /^\(register\): id: /m, 'the failure names the offending line');
}

// --- m-2: `Breaks:` is anchored, so `Breaks: loudly, silently` is not accepted as a loudly entry
// that skips the Check requirement. ---
{
  const trailing = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0018', [...without('Check').filter((l) => !l.startsWith('Breaks')), 'Breaks: loudly, silently'])),
    },
    'Breaks with trailing text',
  );
  assert.equal(trailing.status, 1, '`Breaks: loudly, silently` fails rather than passing as loudly');
  assert.match(trailing.out, /^INV-0018: Breaks: /m, 'the failure names the entry and Breaks');
}

// --- m-3: a `Check:` value with no word characters once unquoted (e.g. `-` or empty) fails on a
// silently breaking entry, the same as a missing Check; `TBD` stays legal content. ---
{
  const dash = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0019', [...without('Check'), 'Check: -'])),
    },
    'dash Check',
  );
  assert.equal(dash.status, 1, 'a `Check: -` value fails on a silently breaking entry');
  assert.match(dash.out, /^INV-0019: Check: /m, 'the failure names the entry and Check');

  const tbd = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0020', [...without('Check'), 'Check: TBD'])),
    },
    'TBD Check',
  );
  assert.equal(tbd.status, 0, `\`Check: TBD\` stays legal content (got: ${tbd.out})`);
}

// --- class sweep: a `Concepts` value that is present but resolves to no list item (`,` or
// whitespace) passes the mandatory-field check yet names nothing to resolve, so it fails too. ---
{
  const commaOnly = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0021', withConcepts(','))) },
    'comma-only Concepts',
  );
  assert.equal(commaOnly.status, 1, 'a Concepts value with no real item fails');
  assert.match(commaOnly.out, /^INV-0021: Concepts: names no concept$/m, 'names the entry and the reason');
}

// --- inbound citations (#689): an id cited outside the register must name an entry it carries.
// STALE is built at runtime so this file's own source never cites a missing id — the repository's
// own `invariant-check --root .` walks tests/ too. ---
{
  const STALE = ['INV', '9999'].join('-');
  const base = { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0001', GOOD)) };

  const stale = failuresFor(
    { ...base, 'docs/guide.md': `# Guide\n\nSee INV-0001.\nAnd ${STALE} too.\n`, 'src/gate.js': `// ${STALE}\n` },
    'stale citations',
  );
  assert.equal(stale.status, 1, `a citation the register lacks fails (got: ${stale.out})`);
  assert.match(stale.out, new RegExp(`^${STALE}: citation: .*docs/guide\\.md:4`, 'm'), 'names the id, the Markdown file, and the line');
  assert.match(stale.out, new RegExp(`^${STALE}: citation: .*src/gate\\.js:1`, 'm'), 'and a .js file');
  assert.doesNotMatch(stale.out, /^INV-0001: citation/m, 'a citation the register carries is not reported');

  const resolved = failuresFor({ ...base, 'README.md': 'Held by INV-0001.\n' }, 'resolved citation');
  assert.equal(resolved.status, 0, `a citation that resolves passes (got: ${resolved.out})`);

  const history = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0001', GOOD)),
      'CHANGELOG.md': `- dropped ${STALE}\n`,
      'docs/adr/0001-x.md': `# 1. X\n\nCites ${STALE}.\n`,
      'docs/adr/nested/0002-y.md': `Cites ${STALE}.\n`,
    },
    'history exclusions',
  );
  assert.equal(history.status, 0, `CHANGELOG.md and docs/adr/ are never scanned (got: ${history.out})`);

  const skipped = failuresFor(
    {
      ...base,
      '.git/x': `${STALE}\n`,
      'node_modules/p/index.js': `${STALE}\n`,
      '.superdev/scopes/s/ledger.md': `${STALE}\n`,
      '.claude/settings.json': `"${STALE}"\n`,
    },
    'skipped directories',
  );
  assert.equal(skipped.status, 0, `a skipped directory is never scanned (got: ${skipped.out})`);

  const noRegister = run(['--root', repo({ 'CONTEXT.md': GLOSSARY, 'README.md': `${STALE}\n` })], 'no register, stale citation');
  assert.equal(noRegister.status, 0, 'a repository with no register still passes, whatever it cites');
  assert.match(noRegister.stdout, /no register/i, 'and says there is nothing to check');
}

// --- #724 residuals from #691's final review. ---
// A reasonless `none` wrapped in any punctuation fails like a backticked bare `none`; a reason passes.
for (const wrapped of ['*none*', '**none**', '"none"', '(none)', '_none_']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0022', [...without('Check'), `Check: ${wrapped}`])) },
    `wrapped none ${wrapped}`,
  );
  assert.equal(r.status, 1, `\`Check: ${wrapped}\` fails on a silently breaking entry (got: ${r.out})`);
  assert.match(r.out, /^INV-0022: Check: `none` needs the reason/m, 'naming the entry and Check');
}
{
  const reasoned = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0022', [...without('Check'), 'Check: *none* — nothing cheaply tests it'])) },
    'wrapped none with a reason',
  );
  assert.equal(reasoned.status, 0, `a wrapped none followed by a reason passes (got: ${reasoned.out})`);
}

// A mandatory field whose value carries no word character fails, naming the entry and the field.
for (const [key, value] of [['Class', '-'], ['Statement', '—'], ['Class', '``']]) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0023', [...without(key), `${key}: ${value}`])) },
    `wordless ${key}`,
  );
  assert.equal(r.status, 1, `\`${key}: ${value}\` fails (got: ${r.out})`);
  assert.match(r.out, new RegExp(`^INV-0023: ${key}: `, 'm'), 'naming the entry and the field');
}

// A present `Paths:` or `Symbols:` value that names nothing fails; omitting either still passes.
for (const key of ['Paths', 'Symbols']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0024', [...GOOD, `${key}: ,`])) },
    `comma-only ${key}`,
  );
  assert.equal(r.status, 1, `\`${key}: ,\` fails (got: ${r.out})`);
  assert.match(r.out, new RegExp(`^INV-0024: ${key}: names no `, 'm'), 'naming the entry and the field');
}

// A byte-order mark directly before a first-line entry heading parses like the same text without it.
{
  const text = `${entry('INV-0025', GOOD)}\n${entry('INV-0026', GOOD)}`;
  const bom = failuresFor({ 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `\uFEFF${text}` }, 'BOM before first heading');
  const plain = failuresFor({ 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': text }, 'no BOM');
  assert.equal(bom.status, 0, `a leading BOM before \`### INV-0025\` passes (got: ${bom.out})`);
  assert.equal(bom.out, plain.out, 'and reports exactly what the same text without the mark reports');
}

// Bulleted and numbered heading-shaped lines outside any entry fail, as blockquoted and indented ones do.
for (const line of ['- ### INV-0005', '1. ### INV-0005', '- > ### INV-0005']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': `${register(entry('INV-0001', GOOD))}\n## Retired\n\n${line}\n` },
    `marked heading ${line}`,
  );
  assert.equal(r.status, 1, `\`${line}\` outside any entry fails`);
  assert.match(r.out, /^\(register\): id: .*mentions INV-0005 outside any entry/m, 'the failure names the offending line');
}

// --- #741: an underscore is not a word. A value made only of `_` and punctuation names nothing, while
// a real proof or statement carrying underscores, or written in non-English script, still passes. A
// citation glued to a trailing letter or `_` is still read, and a longer digit run never as a shorter id. ---
for (const value of ['_', '__', '_-_']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0027', [...without('Check'), `Check: ${value}`])) },
    `underscore Check ${value}`,
  );
  assert.equal(r.status, 1, `\`Check: ${value}\` fails on a silently breaking entry (got: ${r.out})`);
  assert.match(r.out, /^INV-0027: Check: names no proof$/m, 'naming the entry and Check');
}
{
  const real = failuresFor(
    {
      'CONTEXT.md': GLOSSARY,
      'docs/invariants.md': register(entry('INV-0027', [...without('Check'), 'Check: tests/a_b.test.js — pinned by `FULL_SUITE_CONTRACTS`'])),
      'tests/a_b.test.js': '',
    },
    'Check with underscores in a real proof',
  );
  assert.equal(real.status, 0, `a real proof carrying underscores passes (got: ${real.out})`);
}
for (const key of ['Class', 'Statement']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0028', [...without(key), `${key}: _`])) },
    `underscore ${key}`,
  );
  assert.equal(r.status, 1, `\`${key}: _\` fails (got: ${r.out})`);
  assert.match(r.out, new RegExp(`^INV-0028: ${key}: carries no word$`, 'm'), 'naming the entry and the field');
}
for (const statement of ['Bestellung ändert sich nie', '注文は不変']) {
  const r = failuresFor(
    { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0028', [...without('Statement'), `Statement: ${statement}`])) },
    `non-English Statement ${statement}`,
  );
  assert.equal(r.status, 0, `a Statement in non-English script passes (got: ${r.out})`);
}
{
  const STALE = ['INV', '9998'].join('-');
  const LONGER = ['INV', '99981'].join('-');
  const base = { 'CONTEXT.md': GLOSSARY, 'docs/invariants.md': register(entry('INV-0001', GOOD)) };
  const glued = failuresFor({ ...base, 'README.md': `See ${STALE}_x and ${STALE}b.\n` }, 'citation glued to a letter or underscore');
  assert.equal(glued.status, 1, `a citation followed by a letter or underscore is still read (got: ${glued.out})`);
  assert.match(glued.out, new RegExp(`^${STALE}: citation: .*README\\.md:1`, 'm'), 'and reported with its file and line');
  const longer = failuresFor({ ...base, 'README.md': `See ${LONGER}.\n` }, 'longer digit run');
  assert.equal(longer.status, 0, `a longer digit run is never read as a shorter id (got: ${longer.out})`);
}

console.log('invariant-check tests ok');
