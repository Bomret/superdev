'use strict';

// Suite for the run configuration plugin/scripts/scope.js's `suite reusable` compares across a carry (ADR 0230, INV-0017).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { scopePath, call, gitOut: g, head, commitAll, fixtureRepo } = require('./scope-setup');
const { appendTrace } = require(scopePath);

// --- suite reusable: the run configuration (ADR 0230, INV-0017) -------------------------------------
// A carry refuses a change to verification.md only where its run configuration differs between the two commits a
// carry leg judges: the full and focused commands as written, the whole-repo command, the prepare command, the
// test-path entries, and the complete-selector declaration. Prose and every other section carry.
{
  const { encodePaths } = require('../plugin/lib/trace-log.js');
  const callIn = (argv, cwd) => call(argv, '', cwd);
  const vRel = 'docs/agents/verification.md';
  const V = ({ prose = 'The first fence is the full command; the second the focused one.', full = 'node all.js', focused = 'node focus.js {paths}', info = 'sh', extra = '' } = {}) =>
    `# Verification\n\n${prose}\n\n\`\`\`${info}\n${full}\n\`\`\`\n\n\`\`\`${info}\n${focused}\n\`\`\`\n${extra}`;
  const cases = [];
  // A copy of a repository whose first commit R holds `text` as verification.md, on `main`; `null` leaves the file out of R.
  const make = (text) => {
    const { repo, R } = fixtureRepo(JSON.stringify(['config', text]), (dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.superdev/\n');
      fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
      if (text !== null) fs.writeFileSync(path.join(dir, vRel), text);
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'a\n');
      return { R: commitAll(dir, 'base') };
    }, 'scope-runcfg-');
    cases.push(repo);
    let n = 0;
    const root = (record, lines, extraHeader) => {
      const rt = path.join(repo, '.superdev', 'scopes', `rc-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — rc-${n}\n\n**Stage:** documented\n**Branch:** main\n${extraHeader || ''}**Suite:** ${record}\n**Anchor:** #1 — rc\n\n` +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
      for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
      return rt;
    };
    const commit = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.writeFileSync(path.join(repo, file), content);
      return commitAll(repo, file);
    };
    const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'main', ...flags, '--root', rt], repo);
    return { repo, R, root, commit, reusable };
  };
  const full = (sha) => ['full', 'pass', sha, 'clean'];
  const focused = (sha, paths) => ['focused', 'pass', sha, 'clean', encodePaths(paths)];
  try {
    // The reproduction: a green full run at R, a prose-only edit to verification.md at T, a passing focused run at T.
    const p = make(V());
    const PT = p.commit(vRel, V({ prose: 'The first fence is the full command. The second the focused one.' }));
    let r = p.reusable(p.root(`green @ ${p.R}`, [full(p.R), focused(PT, [vRel])]));
    assert.ok(r.ok && r.out === 'reusable', 'a prose-only verification.md edit keeps the carry: ' + (r.err || ''));

    // Parts outside the run configuration carry: the timing command, a fence's info string, CRLF line endings, a third fence.
    const TIMING = '\n## Timing command\n\n`node all.js`\n';
    for (const [before, after, what] of [
      [V({ extra: TIMING }), V({ extra: TIMING.replace('node all.js', 'node all.js --time') }), 'a changed timing command'],
      [V(), V({ info: '' }), 'a fence info string'],
      [V(), V().replace(/\n/g, '\r\n'), 'CRLF line endings'],
      [V(), V({ extra: '\n```\nnode third.js\n```\n' }), 'a third fence'],
    ]) {
      const c = make(before);
      const T = c.commit(vRel, after);
      r = c.reusable(c.root(`green @ ${c.R}`, [full(c.R), focused(T, [vRel])]));
      assert.ok(r.ok && r.out === 'reusable', `${what} keeps the carry: ` + (r.err || ''));
    }

    // Every part of the run configuration refuses, and the reason names it.
    const WHOLE = (cmd) => `\n## Whole-repo command\n\n\`${cmd}\`\n`;
    const PREP = (cmd) => `\n## Prepare command\n\n\`${cmd}\`\n`;
    const TESTS = (entry) => `\n## Test paths\n\n- \`${entry}\`\n`;
    const SEL = '\n## Complete selector\n\nThe focused command selects every test.\n';
    const SELF = (f) => `${SEL}\n- \`${f}\`\n`;
    for (const [before, after, part] of [
      [V(), V({ full: 'node all.js --bail' }), 'full command'],
      [V(), V({ focused: 'node focus.js --fast {paths}' }), 'focused command'],
      [V(), V({ focused: 'node focus.js  {paths}' }), 'focused command'],
      [V(), V({ focused: 'node focus.js\n{paths}' }), 'focused command'],
      [V({ extra: WHOLE('node all.js') }), V({ extra: WHOLE('node all.js --all') }), 'whole-repo command'],
      [V({ extra: PREP('bun install') }), V({ extra: PREP('npm ci') }), 'prepare command'],
      [V({ extra: TESTS('tests/') }), V({ extra: TESTS('spec/') }), 'test paths'],
      [V({ extra: SELF('tools/a.js') }), V({ extra: SELF('tools/b.js') }), 'complete-selector declaration'],
      [V(), V({ extra: SEL }), 'complete-selector declaration'],
      [V({ extra: SEL }), V(), 'complete-selector declaration'],
    ]) {
      const c = make(before);
      const T = c.commit(vRel, after);
      r = c.reusable(c.root(`green @ ${c.R}`, [full(c.R), focused(T, [vRel])]));
      assert.ok(!r.ok && r.err.includes(`${vRel} changed its ${part}`), `a changed ${part} refuses and names it: ` + (r.err || ''));
    }

    // A verification.md git cannot read at the recorded commit, or at the tip, refuses with a git reason.
    for (const [at, what] of [['R', 'the recorded commit'], ['T', 'the tip']]) {
      const c = make(V());
      const T = c.commit(vRel, V({ prose: 'Other prose.' }));
      const rt = c.root(`green @ ${c.R}`, [full(c.R), focused(T, [vRel])]);
      const oid = g(['rev-parse', `${at === 'R' ? c.R : T}:${vRel}`], c.repo);
      const obj = path.join(c.repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
      fs.renameSync(obj, `${obj}.aside`);
      try {
        r = c.reusable(rt);
      } finally {
        fs.renameSync(`${obj}.aside`, obj);
      }
      assert.ok(!r.ok && /git could not read/.test(r.err), `an unreadable verification.md at ${what} refuses: ` + (r.err || ''));
    }

    // A verification.md deleted at the tip compares as an empty file: the recorded commit's fences differ, so it refuses.
    const del = make(V());
    g(['rm', '-q', vRel], del.repo);
    g(['commit', '-q', '-m', 'delete'], del.repo);
    const DT = head(del.repo);
    r = del.reusable(del.root(`green @ ${del.R}`, [full(del.R), focused(DT, [vRel])]));
    assert.ok(!r.ok && r.err.includes(`${vRel} changed its full command`), 'a verification.md deleted at the tip refuses: ' + (r.err || ''));

    // A verification.md created at the tip holding prose only reads as the absent file did, so it carries.
    const cr = make(null);
    const NT = cr.commit(vRel, '# Verification\n\nProse only.\n');
    r = cr.reusable(cr.root(`green @ ${cr.R}`, [full(cr.R), focused(NT, [vRel])]));
    assert.ok(r.ok && r.out === 'reusable', 'a prose-only verification.md created at the tip carries: ' + (r.err || ''));

    // The complete-selector carry: a prose-only verification.md change beside a code path carries when the focused run
    // covered both paths.
    const cs = make(V({ extra: SEL }));
    fs.writeFileSync(path.join(cs.repo, 'src', 'a.js'), 'changed\n');
    const CT = cs.commit(vRel, V({ prose: 'Other prose.', extra: SEL }));
    r = cs.reusable(cs.root(`green @ ${cs.R}`, [full(cs.R), focused(CT, [vRel, 'src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covered prose-only verification.md change beside a code path carries: ' + (r.err || ''));

    // The chained carry: the run configuration differs between the record and M, and agrees between the record and the tip.
    const ch = make(V({ extra: SEL }));
    fs.writeFileSync(path.join(ch.repo, 'src', 'a.js'), 'changed\n');
    const CM = ch.commit(vRel, V({ full: 'node all.js --bail', extra: SEL }));
    ch.commit(vRel, V({ extra: SEL }));
    r = ch.reusable(ch.root(`green @ ${ch.R}`, [full(ch.R), focused(CM, [vRel, 'src/a.js'])]));
    assert.ok(!r.ok && /changed its full command/.test(r.err), 'a chain whose M changed the run configuration refuses: ' + (r.err || ''));
  } finally {
    cases.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  }
}
