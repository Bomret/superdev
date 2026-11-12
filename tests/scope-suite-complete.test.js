'use strict';

// Suite for plugin/scripts/scope.js's `suite reusable` complete-selector carry (ADR 0175, INV-0017).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, call, gitOut: g, head, commitAll, fixtureRepo } = require('./scope-setup');
const { appendTrace } = require(scopePath);

// --- suite reusable: the complete-selector carry (ADR 0175, INV-0017) ----------------------------
// A green record carries across a non-Markdown delta where the tip's verification.md declares the focused
// selector complete, the focused command takes `{paths}`, and a passing clean focused run at the tip covered
// every changed path. Each case gets its own repository from the verification.md text it needs.
{
  const { encodePaths, encodeArgs } = require('../plugin/lib/trace-log.js');
  const callIn = (argv, cwd) => call(argv, '', cwd);
  const vRel = path.join('docs', 'agents', 'verification.md');
  const verification = (focused, extra) => `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\n${focused}\n\`\`\`\n${extra || ''}`;
  const DECLARED = '\n## Complete selector\n\nThe focused command selects every test a changed path can affect.\n';
  const withFiles = (files) => `${DECLARED}\nSelector files:\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;

  // fixture(text) -> helpers over a copy of a repository whose first commit R holds `text` as verification.md.
  const fixture = (text) => {
    const { repo, R } = fixtureRepo(JSON.stringify(['complete', text]), (dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.superdev/\n');
      fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(dir, vRel), text);
      fs.mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'a\n');
      fs.writeFileSync(path.join(dir, 'src', 'deep', 'd.js'), 'd\n');
      fs.writeFileSync(path.join(dir, 'old.js'), 'o\n');
      return { R: commitAll(dir, 'base') };
    }, 'scope-complete-');
    let n = 0;
    const root = (record, lines) => {
      const rt = path.join(repo, '.superdev', 'scopes', `cc-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(
        path.join(rt, 'ledger.md'),
        `# Ledger — cc-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — carry\n\n` +
          '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
        'utf8'
      );
      for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
      return rt;
    };
    const commit = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      if (content === null) fs.rmSync(path.join(repo, file));
      else fs.writeFileSync(path.join(repo, file), content);
      return commitAll(repo, file);
    };
    const reusable = (rt, cwd, ...flags) => callIn(['suite', 'reusable', '--branch', 'main', ...flags, '--root', rt], cwd || repo);
    return { repo, R, root, commit, reusable };
  };
  const base = (R) => ['full', 'pass', R, 'clean'];
  const focused = (sha, paths, result, tree) => ['focused', result || 'pass', sha, tree || 'clean', encodePaths(paths)];
  const cases = [];
  const cleanup = () => cases.forEach((f) => fs.rmSync(f.repo, { recursive: true, force: true }));
  const make = (text) => { const f = fixture(text); cases.push(f); return f; };
  try {
    const FOCUSED = 'node focus.js {paths}';
    const f = make(verification(FOCUSED, DECLARED));
    const T = f.commit('src/a.js', 'changed\n');
    let r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covering clean focused run carries a green record: ' + (r.err || ''));

    // A run line in the layout with the duration and the arguments field reads as one without them (the lines above): same verdict. The old reader ignores trailing fields, so this pins that the reader keeps ignoring them.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), [...focused(T, ['src/a.js']), '120', encodeArgs(['focus.js', 'src/a.js'])]]));
    assert.ok(r.ok && r.out === 'reusable', 'a covering focused run with the arguments field carries a green record: ' + (r.err || ''));

    // The kind carries.
    r = f.reusable(f.root(`green @ ${f.R} whole`, [['whole', 'pass', f.R, 'clean'], focused(T, ['src/a.js'])]), null, '--whole');
    assert.ok(r.ok, 'a whole record carries as whole: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]), null, '--whole');
    assert.ok(!r.ok && /kind/.test(r.err), 'a kindless record still fails --whole: ' + (r.err || ''));

    // Paths recorded as typed: ./x, an absolute path, and a path with a comma all compare normalized.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['./src/a.js'])]));
    assert.ok(r.ok, 'a ./ path covers: ' + (r.err || ''));
    // A selector may reach fewer tests for a directory than for a file under it, so only the path itself covers.
    for (const dir of ['src', 'src/', '.', f.repo]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, [dir])]));
      assert.ok(!r.ok && /fewer paths/.test(r.err), `a directory (${dir}) covers no file under it: ` + (r.err || ''));
    }
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, [path.join(f.repo, 'src', 'a.js')])]));
    assert.ok(r.ok, 'an absolute path covers: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['srcx'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'a sibling prefix is no directory cover: ' + (r.err || ''));

    // Refusals at the tip.
    for (const [lines, re, what] of [
      [[], /no focused run recorded at the tip/, 'no focused run'],
      [[focused(T, ['src/a.js'], 'fail')], /fail/, 'a failed focused run'],
      [[focused(T, ['src/a.js'], 'unknown')], /unknown/, 'an unknown focused run'],
      [[focused(T, ['src/a.js'], 'pass', 'dirty')], /dirty/, 'a dirty focused run'],
      [[['focused', 'pass', T, 'clean', '-']], /no recorded path set/, 'a run with no path set'],
      [[['focused', 'pass', T, 'clean']], /no recorded path set/, 'a run line with no path field'],
      [[focused(T, ['src/other.js'])], /fewer|cover/, 'a run covering fewer paths'],
      [[focused(T, ['src/a.js']), ['full', 'fail', T, 'clean']], /full run at the tip failed/, 'a failed full run'],
      [[focused(T, ['src/a.js']), ['whole', 'fail', T, 'clean']], /whole run at the tip failed/, 'a failed whole run'],
      [[focused(T, ['src/a.js']), ['path', 'fail', T, 'clean', 'tests/x.test.js']], /path run at the tip failed/, 'a failed path run'],
    ]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), ...lines]));
      assert.ok(!r.ok && /predates tip/.test(r.err) && re.test(r.err), `${what} refuses: ${r.err || ''}`);
    }
    // The record itself: red, or no backing run.
    r = f.reusable(f.root(`red @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]));
    assert.ok(!r.ok && /not green/.test(r.err), 'a red record refuses: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [focused(T, ['src/a.js'])]));
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'an unbacked record refuses: ' + (r.err || ''));

    // Deletions and both sides of a rename count as changed paths.
    const T2 = f.commit('old.js', null);
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T2, ['src/a.js'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'a deleted path must be covered: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T2, ['src/a.js', 'old.js'])]));
    assert.ok(r.ok, 'a deleted path covered carries: ' + (r.err || ''));
    fs.renameSync(path.join(f.repo, 'src', 'deep', 'd.js'), path.join(f.repo, 'src', 'deep', 'e.js'));
    const T3 = commitAll(f.repo, 'rename');
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js'])]));
    assert.ok(!r.ok, 'a rename covered on its new side only refuses: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(r.ok, 'a rename covered on both sides carries: ' + (r.err || ''));

    // No carry builds on another: a focused run covering only the paths since an intermediate tip does not carry.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok, 'a run covering only the paths since an intermediate tip does not carry: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${T}`, [focused(T3, ['old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'no step wrote a carried record at T, so it has no backing run: ' + (r.err || ''));

    // From a subdirectory, and under diff.relative=true, reuse decides the same (triage #1004, #1015).
    g(['config', 'diff.relative', 'true'], f.repo);
    for (const cwd of [f.repo, path.join(f.repo, 'src', 'deep'), path.join(f.repo, 'docs')]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]), cwd);
      assert.ok(r.ok, `a covered delta carries from ${path.relative(f.repo, cwd) || 'root'} under diff.relative: ` + (r.err || ''));
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/deep/e.js', 'src/deep/d.js'])]), cwd);
      assert.ok(!r.ok && /fewer|cover/.test(r.err), `a delta outside the subdirectory is still seen from ${path.relative(f.repo, cwd) || 'root'}: ` + (r.err || ''));
    }
    g(['config', '--unset', 'diff.relative'], f.repo);

    // Markdown-only rule (ADR 0128, ADR 0189): a Markdown delta under the declaration carries with or without a recorded run.
    const m = make(verification(FOCUSED, DECLARED));
    const MT = m.commit('notes.md', 'n\n');
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R), ['focused', 'pass', MT, 'clean']]));
    assert.ok(r.ok, 'the Markdown-only carry stands under the declaration: ' + (r.err || ''));
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R)]));
    assert.ok(r.ok, 'the Markdown-only carry needs no run at the tip under the declaration: ' + (r.err || ''));
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R), ['focused', 'fail', MT, 'clean']]));
    assert.ok(!r.ok && /focused run at the tip failed/.test(r.err), 'a failed focused run refuses the Markdown carry under the declaration: ' + (r.err || ''));

    // A covered commit M, then Markdown-only commits to the tip (ADR 0189): the record carries to the tip with no run there.
    const cm = make(verification(FOCUSED, DECLARED));
    const CM = cm.commit('src/a.js', 'c\n');
    const CT = cm.commit('README.md', 'r\n');
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covered commit then a Markdown-only commit carries with no run at the tip: ' + (r.err || ''));
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js']), ['full', 'fail', CT, 'clean']]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a failed run at the tip refuses the carry through a covered commit: ' + (r.err || ''));
    // The refusal names the Markdown tail's own reason where that tail is what failed.
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js']), ['full', 'unknown', CT, 'clean']]));
    assert.ok(!r.ok && /full run at the tip is unknown/.test(r.err), 'the Markdown tail\'s reason names the blocker: ' + (r.err || ''));
    const CX = cm.commit('src/b.js', 'b\n');
    cm.commit('NOTES.md', 'n\n');
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js'])]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a non-Markdown change after the covered commit refuses: ' + (r.err || ''));
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CX, ['src/a.js', 'README.md', 'src/b.js'])]));
    assert.ok(r.ok, 'a later covered commit then Markdown carries: ' + (r.err || ''));
    // The Markdown-only tail is case-sensitive: an uppercase `.MD` after the covered commit refuses.
    const up = make(verification(FOCUSED, DECLARED));
    const UM = up.commit('src/a.js', 'c\n');
    up.commit('NOTES.MD', 'n\n');
    r = up.reusable(up.root(`green @ ${up.R}`, [base(up.R), focused(UM, ['src/a.js'])]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a NOTES.MD commit after the covered commit refuses: ' + (r.err || ''));
    // A side commit with a later committer date, merged in, is listed before the covered commit's line; the walk
    // still reaches the covered commit.
    const sk = make(verification(FOCUSED, DECLARED));
    g(['checkout', '-q', '-b', 'side'], sk.repo);
    fs.writeFileSync(path.join(sk.repo, 'side.md'), 's\n');
    g(['add', '-A'], sk.repo);
    execFileSync('git', ['commit', '-q', '-m', 'side'], { cwd: sk.repo, env: { ...process.env, GIT_COMMITTER_DATE: '2099-01-01T00:00:00' } });
    const SQ = head(sk.repo);
    g(['checkout', '-q', 'main'], sk.repo);
    const SM = sk.commit('src/a.js', 'c\n');
    sk.commit('README.md', 'r\n');
    g(['checkout', '-q', SQ, '--', 'side.md'], sk.repo);
    const ST2 = g(['commit-tree', g(['write-tree'], sk.repo), '-p', 'HEAD', '-p', SQ, '-m', 'join'], sk.repo);
    g(['reset', '-q', '--hard', ST2], sk.repo);
    r = sk.reusable(sk.root(`green @ ${sk.R}`, [base(sk.R), focused(SM, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covered commit reached past a later-dated side commit carries: ' + (r.err || ''));

    // Refused: no declaration; a focused command without {paths}.
    const nd = make(verification(FOCUSED, ''));
    const NT = nd.commit('src/a.js', 'c\n');
    r = nd.reusable(nd.root(`green @ ${nd.R}`, [base(nd.R), focused(NT, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'no declaration: the Markdown rule alone decides: ' + (r.err || ''));
    const np = make(verification('node focus.js', DECLARED));
    const PT = np.commit('src/a.js', 'c\n');
    r = np.reusable(np.root(`green @ ${np.R}`, [base(np.R), focused(PT, ['src/a.js'])]));
    assert.ok(!r.ok && /\{paths\}/.test(r.err), 'a focused command without {paths} refuses with its own reason: ' + (r.err || ''));

    // A listed selector file, or verification.md itself, in the delta refuses.
    const sf = make(verification(FOCUSED, withFiles(['tools/select.js'])));
    const ST = sf.commit('tools/select.js', 's\n');
    r = sf.reusable(sf.root(`green @ ${sf.R}`, [base(sf.R), focused(ST, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a listed selector file refuses: ' + (r.err || ''));
    const vc = make(verification(FOCUSED, DECLARED));
    fs.writeFileSync(path.join(vc.repo, 'src', 'a.js'), 'changed\n');
    const VT = vc.commit(vRel, verification('node focus.js --all {paths}', DECLARED));
    r = vc.reusable(vc.root(`green @ ${vc.R}`, [base(vc.R), focused(VT, [vRel, 'src/a.js'])]));
    assert.ok(!r.ok && /verification\.md changed its focused command/.test(r.err), 'a run-configuration change next to a code path refuses: ' + (r.err || ''));

    // A list item may carry text after its span, and a listed directory covers the files under it.
    const lt = make(verification(FOCUSED, `${DECLARED}\n- \`tools/select.js\` — the runner\n- \`tools/lib/\`\n`));
    const LT = lt.commit('tools/select.js', 's\n');
    r = lt.reusable(lt.root(`green @ ${lt.R}`, [base(lt.R), focused(LT, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a listed file with trailing text refuses: ' + (r.err || ''));
    const dl = make(verification(FOCUSED, `${DECLARED}\n- \`tools/select.js\`\n- \`tools/lib/\`\n`));
    const LD = dl.commit('tools/lib/x.js', 'x\n');
    r = dl.reusable(dl.root(`green @ ${dl.R}`, [base(dl.R), focused(LD, ['tools/lib/x.js'])]));
    assert.ok(!r.ok && /tools\/lib\/x\.js is a selector file/.test(r.err), 'a file under a listed directory refuses: ' + (r.err || ''));
    const ld = make(verification(FOCUSED, `${DECLARED}\n- \`tools/lib/\`\n`));
    const LS = ld.commit('tools/libx.js', 'x\n');
    r = ld.reusable(ld.root(`green @ ${ld.R}`, [base(ld.R), focused(LS, ['tools/libx.js'])]));
    assert.ok(r.ok, 'a sibling of a listed directory is no selector file: ' + (r.err || ''));

    // The section is found outside code fences, and a subheading does not end it.
    const fc = make(verification(FOCUSED, '\n```\n## Complete selector\n```\n'));
    const FT = fc.commit('src/a.js', 'c\n');
    r = fc.reusable(fc.root(`green @ ${fc.R}`, [base(fc.R), focused(FT, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'a fenced heading declares nothing: ' + (r.err || ''));
    const sh = make(verification(FOCUSED, `${DECLARED}\n### Files\n\n- \`tools/select.js\`\n`));
    const SH = sh.commit('tools/select.js', 's\n');
    r = sh.reusable(sh.root(`green @ ${sh.R}`, [base(sh.R), focused(SH, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a list under a subheading still counts: ' + (r.err || ''));

    // A list item names its first backtick span wherever it sits, under any bullet or ordered marker.
    for (const item of ['- the runner: `tools/select.js`', '+ `tools/select.js`', '1. `tools/select.js`', '* `tools/select.js`']) {
      const mi = make(verification(FOCUSED, `${DECLARED}\n${item}\n`));
      const MI = mi.commit('tools/select.js', 's\n');
      r = mi.reusable(mi.root(`green @ ${mi.R}`, [base(mi.R), focused(MI, ['tools/select.js'])]));
      assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), `the item ${item} lists its span: ` + (r.err || ''));
    }

    // A four-backtick fence holding a three-backtick line stays open: the heading inside it declares nothing.
    const f4 = make(verification(FOCUSED, '\n````\n```\n## Complete selector\n````\n'));
    const F4 = f4.commit('src/a.js', 'c\n');
    r = f4.reusable(f4.root(`green @ ${f4.R}`, [base(f4.R), focused(F4, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'a heading inside a longer fence declares nothing: ' + (r.err || ''));

    // A failing covering focused run at the tip is not masked by an earlier pass.
    const mk = make(verification(FOCUSED, DECLARED));
    const MK = mk.commit('src/a.js', 'c\n');
    r = mk.reusable(mk.root(`green @ ${mk.R}`, [base(mk.R), focused(MK, ['src/a.js']), focused(MK, ['src/a.js'], 'fail'), focused(MK, ['src/other.js'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'pass, fail, then a narrower pass refuses: ' + (r.err || ''));
    r = mk.reusable(mk.root(`green @ ${mk.R}`, [base(mk.R), focused(MK, ['src/a.js'], 'fail'), focused(MK, ['src/a.js'])]));
    assert.ok(r.ok, 'a covering pass after a failure carries: ' + (r.err || ''));

    // Git errors read as git errors: an unreadable tip configuration, and no work tree to resolve an absolute path.
    const ge = make(verification(FOCUSED, DECLARED));
    const GT = ge.commit('src/a.js', 'c\n');
    const geRoot = ge.root(`green @ ${ge.R}`, [base(ge.R), focused(GT, ['src/a.js'])]);
    const blob = g(['rev-parse', `${GT}:${vRel}`], ge.repo);
    fs.rmSync(path.join(ge.repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
    r = ge.reusable(geRoot);
    assert.ok(!r.ok && /git could not read/.test(r.err) && !/not Markdown/.test(r.err), 'an unreadable declaration is a git error: ' + (r.err || ''));
    const gb = make(verification(FOCUSED, DECLARED));
    const GB = gb.commit('src/a.js', 'c\n');
    const gbRoot = gb.root(`green @ ${gb.R}`, [base(gb.R), focused(GB, [path.join(gb.repo, 'src', 'a.js')])]);
    const bare = path.join(gb.repo, '..', `${path.basename(gb.repo)}.git`);
    g(['clone', '-q', '--bare', gb.repo, bare], gb.repo);
    try {
      r = gb.reusable(gbRoot, bare);
      assert.ok(!r.ok && /git could not/.test(r.err) && !/no recorded path set/.test(r.err), 'an unresolvable work tree is a git error: ' + (r.err || ''));
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }

    // The declaration is read from the tip commit, never the working tree.
    const wt = make(verification(FOCUSED, DECLARED));
    const WT = wt.commit('src/a.js', 'c\n');
    fs.writeFileSync(path.join(wt.repo, vRel), verification(FOCUSED, ''));
    r = wt.reusable(wt.root(`green @ ${wt.R}`, [base(wt.R), focused(WT, ['src/a.js'])]));
    assert.ok(r.ok, 'a working-tree edit of the declaration changes nothing: ' + (r.err || ''));

    // A record not on an ancestor refuses.
    g(['checkout', '-q', '-b', 'side', f.R], f.repo);
    const SD = f.commit('side.js', 's\n');
    g(['checkout', '-q', 'main'], f.repo);
    r = f.reusable(f.root(`green @ ${SD}`, [base(SD), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok && /not an ancestor/.test(r.err), 'a record off the tip line refuses: ' + (r.err || ''));
  } finally {
    cleanup();
  }
}
