'use strict';

// Suite for the Definition-of-Done gate: every entry to the `implementing` stage (`init … implementing`,
// `stage set implementing` on a `planned` run, `adopt` of an `implementing`-or-later snapshot) refuses while
// `<run-root>/dod.md` is missing, empty, not a regular file, or holds no criterion line, and writes nothing.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call, sliceJson, cleanup } = require('./scope-setup');

const made = [];
const fresh = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-dod-gate-'));
  made.push(d);
  return d;
};
const rootOf = (cwd, slug) => path.join(cwd, '.superdev', 'scopes', slug);

// The dod.md states the gate refuses, and the one it passes.
const BAD = {
  missing: (root) => {},
  empty: (root) => fs.writeFileSync(path.join(root, 'dod.md'), ''),
  'not a regular file': (root) => fs.mkdirSync(path.join(root, 'dod.md')),
  'no criterion line': (root) => fs.writeFileSync(path.join(root, 'dod.md'), '## Definition of Done\n\nProse, no checklist.\n- a bullet\n'),
  'only a fenced criterion line': (root) => fs.writeFileSync(path.join(root, 'dod.md'), '```\n- [ ] example\n```\n'),
  'an unterminated fence': (root) => fs.writeFileSync(path.join(root, 'dod.md'), '## Definition of Done\n\n- [ ] a — 07\n```\nopen\n'),
  'a criterion outside the Definition of Done section': (root) =>
    fs.writeFileSync(path.join(root, 'dod.md'), '## Notes\n\n- [ ] stray\n\n## Definition of Done\n\nnone yet\n'),
};
const GOOD = '- [ ] The gate refuses — 07\n';

const snapshot = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { out[p + '/'] = ''; walk(p); } else out[p] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
};

try {
  for (const [state, setup] of Object.entries(BAD)) {
    // init … implementing
    {
      const cwd = fresh();
      const root = rootOf(cwd, 'gate');
      fs.mkdirSync(root, { recursive: true });
      setup(root);
      const before = snapshot(cwd);
      const r = call(['init', 'feat/gate', 'implementing'], sliceJson, cwd);
      assert.ok(!r.ok, `init implementing refuses on dod.md ${state}`);
      assert.match(r.err, /dod\.md/, `the refusal names dod.md (${state})`);
      assert.ok(r.err.includes(path.join(root, 'dod.md')), `the refusal names the run root's dod.md path (${state})`);
      assert.deepStrictEqual(snapshot(cwd), before, `init writes nothing on dod.md ${state}`);
      assert.ok(!fs.existsSync(path.join(cwd, '.gitignore')), `no .gitignore edit (${state})`);
    }
    // init over a closed ledger rotates only after the gate
    {
      const cwd = fresh();
      const root = rootOf(cwd, 'gate');
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — gate\n\n**Stage:** closed\n**Branch:** feat/gate\n');
      setup(root);
      // The digest sidecar is sealed by the run check before the gate, so it stays out of the comparison.
      const snap = () => Object.fromEntries(Object.entries(snapshot(cwd)).filter(([k]) => !k.endsWith('digest.json')));
      const before = snap();
      const r = call(['init', 'feat/gate', 'implementing'], sliceJson, cwd);
      assert.ok(!r.ok && /dod\.md/.test(r.err), `rotation case refuses (${state})`);
      assert.deepStrictEqual(snap(), before, `no rotation on dod.md ${state}`);
    }
    // stage set implementing on a planned run
    {
      const cwd = fresh();
      assert.ok(call(['init', 'feat/gate', 'planned'], sliceJson, cwd).ok);
      const root = rootOf(cwd, 'gate');
      setup(root);
      const before = snapshot(cwd);
      const r = call(['stage', 'set', 'implementing', '--root', root], '', cwd);
      assert.ok(!r.ok, `stage set implementing refuses on dod.md ${state}`);
      assert.ok(r.err.includes(path.join(root, 'dod.md')), `the stage refusal names dod.md (${state})`);
      assert.deepStrictEqual(snapshot(cwd), before, `stage set writes nothing (ledger, trace) on dod.md ${state}`);
    }
    // adopt of an implementing snapshot
    {
      const cwd = fresh();
      const root = path.join(cwd, 'elsewhere', 'gate');
      fs.mkdirSync(root, { recursive: true });
      setup(root);
      const before = snapshot(cwd);
      const r = call(['adopt', '--root', root], ADOPT('implementing'), cwd);
      assert.ok(!r.ok && r.err.includes(path.join(root, 'dod.md')), `adopt implementing refuses on dod.md ${state}: ${r.err}`);
      assert.deepStrictEqual(snapshot(cwd), before, `adopt writes nothing on dod.md ${state}`);
    }
  }

  // The gate passes with a criterion line, bare or under the heading.
  for (const dod of [GOOD, `# Anchor\n\n## Definition of Done\n\n${GOOD}\n## Next\n`]) {
    const cwd = fresh();
    const root = rootOf(cwd, 'gate');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'dod.md'), dod);
    assert.ok(call(['init', 'feat/gate', 'implementing'], sliceJson, cwd).ok, 'init implementing passes with a criterion line');
    assert.ok(fs.existsSync(path.join(root, 'ledger.md')), 'init wrote the ledger');
  }
  {
    const cwd = fresh();
    assert.ok(call(['init', 'feat/gate', 'planned'], sliceJson, cwd).ok, 'init planned passes with no dod.md');
    const root = rootOf(cwd, 'gate');
    assert.ok(call(['stage', 'set', 'implementing', '--root', root], '', cwd).ok === false);
    fs.writeFileSync(path.join(root, 'dod.md'), GOOD);
    assert.ok(call(['stage', 'set', 'implementing', '--root', root], '', cwd).ok, 'stage set implementing passes with a criterion line');
    // Other stage writes carry no gate: a later move needs no dod.md.
    fs.rmSync(path.join(root, 'dod.md'));
    assert.ok(call(['stage', 'set', 'merged', '--root', root], '', cwd).ok, 'implementing to merged needs no dod.md');
    assert.ok(call(['stage', 'set', 'merged', '--root', root], '', cwd).ok, 'a same-stage write needs no dod.md');
  }
  {
    const cwd = fresh();
    assert.ok(call(['init', 'feat/gate', 'planned'], sliceJson, cwd).ok);
    const root = rootOf(cwd, 'gate');
    assert.ok(call(['stage', 'set', 'planned', '--root', root], '', cwd).ok, 'a planned same-stage write needs no dod.md');
  }
  // The re-init run-init.md names: `init … implementing` over a `planned` ledger with no dod.md refuses and leaves the run as it was.
  {
    const cwd = fresh();
    assert.ok(call(['init', 'feat/gate', 'planned'], sliceJson, cwd).ok);
    const root = rootOf(cwd, 'gate');
    const before = snapshot(cwd);
    const r = call(['init', 'feat/gate', 'implementing'], sliceJson, cwd);
    assert.ok(!r.ok && r.err.includes(path.join(root, 'dod.md')), `re-init implementing refuses over a planned ledger: ${r.err}`);
    assert.deepStrictEqual(snapshot(cwd), before, 'the planned ledger, its standing step, and the run root stay unchanged');
    assert.match(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), /\*\*Stage:\*\* planned/, 'the ledger still reads planned');
  }
  // adopt: passes with a criterion line; a planned snapshot needs none; a later stage is gated too.
  {
    const cwd = fresh();
    const root = path.join(cwd, 'elsewhere', 'gate');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'dod.md'), GOOD);
    assert.ok(call(['adopt', '--root', root], ADOPT('implementing'), cwd).ok, 'adopt implementing passes with a criterion line');
  }
  {
    const cwd = fresh();
    const root = path.join(cwd, 'elsewhere', 'gate');
    assert.ok(call(['adopt', '--root', root], ADOPT('planned'), cwd).ok, 'adopt planned needs no dod.md');
  }
  {
    // shipped-run.md writes dod.md after `adopt --shipped`, so that path carries no gate.
    const cwd = fresh();
    const root = path.join(cwd, 'elsewhere', 'gate');
    assert.ok(call(['adopt', '--shipped', '--root', root], ADOPT('shipped'), cwd).ok, 'adopt --shipped needs no dod.md');
  }
  for (const stage of ['merged', 'reviewed', 'documented', 'submitted']) {
    const cwd = fresh();
    const root = path.join(cwd, 'elsewhere', 'gate');
    const r = call(['adopt', '--root', root], ADOPT(stage), cwd);
    assert.ok(!r.ok && /dod\.md/.test(r.err), `adopt ${stage} refuses with no dod.md`);
  }
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  cleanup();
}

function ADOPT(stage) {
  return (
    `## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** ${stage}\n**Branch:** feat/gate\n**Anchor:** #1 — anchor\n\n` +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '<!-- /superdev:run-state -->\n'
  );
}
