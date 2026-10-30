'use strict';

// Suite for plugin/scripts/scope.js's `dod-line` verb: the Definition-of-Done checklist line editor, body and
// --line modes, tagged and untagged criteria, the four verdicts, and the fail-closed refusals. The shared
// directory and `call` come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { execFileSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { call: rawCall, scopePath, cleanup } = require('./scope-setup');

// The tick command reads its criterion and note from files only. `fileArgs` writes each criterion and
// note a case gives as `--match <text>` or `--note <text>` to a file and swaps in the file option;
// `call` and `spawnDod` run the verb through it.
const fileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-line-args-'));
let fileCount = 0;
const fileArgs = (argv) =>
  argv.map((a, i) => {
    const flag = argv[i - 1];
    if (flag !== '--match' && flag !== '--note') return a;
    const p = path.join(fileDir, `arg-${fileCount++}.txt`);
    fs.writeFileSync(p, a, 'utf8');
    return p;
  }).map((a) => (a === '--match' || a === '--note' ? a + '-file' : a));
const call = (argv, stdin) => rawCall(fileArgs(argv), stdin);

try {
  let r;

  // dod-line: sets a `met` line, keeping the tag, ticking the marker.
  {
    const body = [
      '# dod.md',
      '',
      '- [ ] the widget renders — 01',
      '- [ ] the gadget spins — 02',
      '',
    ].join('\n');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'screenshot attached'],
      body
    );
    assert.ok(r.ok, 'dod-line met should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [x] the widget renders — 01 — met: screenshot attached'),
      'dod-line renders a met line ticked, with its note, keeping the tag: ' + r.out
    );
    assert.ok(r.out.includes('- [ ] the gadget spins — 02'), 'dod-line leaves the other line untouched');
  }

  // dod-line: sets `not-met` and `ceiling` lines unticked, with their own note, keeping the tag.
  {
    const body = ['- [ ] the widget renders — 01, 02', '- [x] the gadget spins — #667'].join('\n');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'not-met', '--note', 'no evidence yet'],
      body
    );
    assert.ok(r.ok, 'dod-line not-met should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] the widget renders — 01, 02 — not met: no evidence yet'),
      'dod-line renders a not-met line unticked, keeping a multi-id tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the gadget spins', '--verdict', 'ceiling', '--note', 'needs a deploy'],
      body
    );
    assert.ok(r.ok, 'dod-line ceiling should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] the gadget spins — #667 — ceiling: needs a deploy'),
      'dod-line renders a ceiling line unticked, keeping a store-ref tag: ' + r.out
    );
  }

  // dod-line: a second write replaces the earlier note rather than adding a second one, and a
  // same-verdict write leaves the marker unchanged (INV-0014).
  {
    const firstPass = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'first pass'],
      '- [ ] the widget renders — 01'
    ).out;
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'second pass'],
      firstPass
    );
    assert.ok(r.ok, 'dod-line re-write should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: second pass',
      'a same-verdict re-write replaces the note and leaves the marker ticked: ' + r.out
    );

    const ceilingPass = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'ceiling', '--note', 'needs a deploy'],
      '- [ ] the widget renders — 01'
    ).out;
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'ceiling', '--note', 'still needs a deploy'],
      ceilingPass
    );
    assert.strictEqual(
      r.out,
      '- [ ] the widget renders — 01 — ceiling: still needs a deploy',
      'a same-verdict ceiling re-write stays unticked: ' + r.out
    );
  }

  // dod-line: a note containing a substring shaped like " — <tag> — <verdict>: " does not fool a
  // later write into splitting at that embedded boundary instead of the real, leftmost one.
  {
    const firstPass = call(
      [
        'dod-line',
        '--match',
        'the widget renders',
        '--verdict',
        'not-met',
        '--note',
        'X — 02 — met: fake',
      ],
      '- [ ] the widget renders — 01'
    ).out;
    assert.strictEqual(
      firstPass,
      '- [ ] the widget renders — 01 — not met: X — 02 — met: fake',
      'the first write embeds the look-alike boundary in the note: ' + firstPass
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'real evidence'],
      firstPass
    );
    assert.ok(r.ok, 'the second write should still match the criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: real evidence',
      'the second write replaces the whole note rather than misparsing the embedded boundary: ' + r.out
    );
  }

  // dod-line: a --match argument whose own whitespace — including an embedded newline — collapses
  // before comparing, still matches the same single physical checklist line; a criterion carrying its
  // own " — " parses off the tag from the right, per plan-contract.md's worked example.
  {
    r = call(
      ['dod-line', '--match', 'the widget   renders\nacross a wrap', '--verdict', 'met', '--note', 'ok'],
      '- [ ] the widget renders across a wrap — 01'
    );
    assert.ok(r.ok, 'dod-line matches through a --match argument\'s own collapsed whitespace: ' + (r.err || ''));

    r = call(
      ['dod-line', '--match', 'Reachable: none — entrance unchanged; nothing else moved', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Reachable: none — entrance unchanged; nothing else moved — scope'
    );
    assert.ok(r.ok, 'dod-line parses a criterion containing " — " off the tag: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Reachable: none — entrance unchanged; nothing else moved — scope — met: ok',
      'the em-dash-bearing criterion and the "scope" tag both survive intact: ' + r.out
    );
  }

  // dod-line: a matching line inside a fenced block is never matched.
  {
    const body = ['```', '- [ ] the widget renders — 01', '```', '- [ ] the widget renders — 02'].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line should pass, matching only the unfenced line: ' + (r.err || ''));
    assert.ok(r.out.includes('- [x] the widget renders — 02 — met: ok'), 'the unfenced line is ticked: ' + r.out);
    assert.ok(r.out.includes('- [ ] the widget renders — 01'), 'the fenced line is untouched: ' + r.out);
  }

  // dod-line: a checklist line carrying trailing whitespace still matches, with or without a note
  // already on it, and the trailing whitespace is dropped only on the line dod-line itself rewrites —
  // an untouched sibling line's own trailing whitespace survives byte for byte.
  {
    const body = ['- [ ] the widget renders — 01   ', '- [ ] the gadget spins — 02   '].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line should match a no-note line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02   '].join('\n'),
      'the edited line drops its trailing whitespace; the untouched line keeps its own: ' + r.out
    );

    const notedBody = '- [ ] the widget renders — 01 — not met: no evidence yet   ';
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], notedBody);
    assert.ok(r.ok, 'dod-line should match a with-note line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: ok',
      'the re-write drops the trailing whitespace along with the earlier note: ' + r.out
    );
  }

  // dod-line: refusals — zero matches, two-or-more matches, a bad --verdict, a missing --match.
  {
    r = call(['dod-line', '--match', 'nothing matches this', '--verdict', 'met', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse on zero matches');
    assert.strictEqual(r.out, '', 'a zero-match refusal prints nothing');

    r = call(
      ['dod-line', '--match', 'dup', '--verdict', 'met', '--note', 'x'],
      ['- [ ] dup — 01', '- [ ] dup — 02'].join('\n')
    );
    assert.ok(!r.ok, 'dod-line should refuse on two matches');
    assert.strictEqual(r.out, '', 'a two-match refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'bogus', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a bad --verdict');
    assert.strictEqual(r.out, '', 'a bad-verdict refusal prints nothing');

    r = call(['dod-line', '--verdict', 'met', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a missing --match');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a missing --note');
    assert.strictEqual(r.out, '', 'a missing-note refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met', '--note', 'evidence\ninjected line'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a --note containing a newline');
    assert.strictEqual(r.out, '', 'a newline-note refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met', '--note', 'evidence\rinjected'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a --note containing a carriage return');
    assert.strictEqual(r.out, '', 'a carriage-return-note refusal prints nothing');
  }

  // dod-line: --line mode transforms a single line, for the Jira ADF text node.
  {
    r = call(
      ['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '[ ] the widget renders — 01'
    );
    assert.ok(r.ok, '--line mode should pass: ' + (r.err || ''));
    assert.strictEqual(r.out, '[x] the widget renders — 01 — met: ok', '--line mode transforms the one line: ' + r.out);
  }

  // dod-line: a Jira issue-key tag (`PROJ-<n>`, references/issue-tracker-jira.md's own rewritten
  // notation), single and as part of a comma list, in both --line and body mode.
  {
    r = call(
      ['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '[ ] the widget renders — PROJ-12'
    );
    assert.ok(r.ok, 'dod-line should accept a Jira issue-key tag: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '[x] the widget renders — PROJ-12 — met: ok',
      '--line mode keeps the Jira issue-key tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '- [ ] the widget renders — PROJ-12, PROJ-13'
    );
    assert.ok(r.ok, 'dod-line should accept a comma list of Jira issue-key tags: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — PROJ-12, PROJ-13 — met: ok',
      'body mode keeps the Jira issue-key comma list: ' + r.out
    );
  }

  // dod-line: body mode's real stdout (a subprocess, not the mocked console.log above) reproduces the
  // input byte for byte everywhere but the edited line, including the input's own trailing newline —
  // it gains no second one.
  {
    const body = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02', ''].join('\n');
    const out = execFileSync(process.execPath, [scopePath, ...fileArgs(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'])], {
      input: body,
      encoding: 'utf8',
    });
    assert.strictEqual(
      out,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02', ''].join('\n'),
      'a body ending in a trailing newline gains no second one: ' + JSON.stringify(out)
    );

    const noTrailing = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02'].join('\n');
    const out2 = execFileSync(process.execPath, [scopePath, ...fileArgs(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'])], {
      input: noTrailing,
      encoding: 'utf8',
    });
    assert.strictEqual(
      out2,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02'].join('\n'),
      'a body with no trailing newline gains none either: ' + JSON.stringify(out2)
    );
  }

  // dod-line: an untagged criterion — a single-slice feature's own DoD (plan-contract.md's `###
  // Criterion tags`), a run from before tagging existed, or one untagged line inside an otherwise
  // tagged DoD — ticks with no tag segment, in body mode.
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'e'],
      '- [ ] Old criterion with no tag'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: e',
      'an untagged line ticks with no tag segment: ' + r.out
    );

    const body = ['- [ ] the widget renders — 01', '- [ ] an untagged line among tagged ones'].join('\n');
    r = call(
      ['dod-line', '--match', 'an untagged line among tagged ones', '--verdict', 'not-met', '--note', 'why'],
      body
    );
    assert.ok(r.ok, 'dod-line should accept an untagged line beside tagged ones: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] an untagged line among tagged ones — not met: why'),
      'the untagged line among tagged ones stays untagged: ' + r.out
    );
    assert.ok(r.out.includes('- [ ] the widget renders — 01'), 'the tagged sibling is untouched: ' + r.out);
  }

  // dod-line: the same untagged shape in --line mode, for the Jira ADF text node.
  {
    r = call(
      ['dod-line', '--line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'e'],
      '[ ] Old criterion with no tag'
    );
    assert.ok(r.ok, '--line mode should accept an untagged line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '[x] Old criterion with no tag — met: e',
      '--line mode ticks an untagged line with no tag segment: ' + r.out
    );
  }

  // dod-line: an untagged criterion whose own text looks like a tag suffix still round-trips as one
  // whole, untagged criterion — no real tag exists to split off.
  {
    r = call(
      ['dod-line', '--match', 'Reachable: none — entrance unchanged', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Reachable: none — entrance unchanged'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged criterion carrying its own " — ": ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Reachable: none — entrance unchanged — met: ok',
      'the whole criterion round-trips untagged: ' + r.out
    );
  }

  // dod-line: an untagged noted line (no tag between the criterion and the verdict) still matches and
  // re-writes, keeping the untagged shape.
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'second'],
      '- [ ] Old criterion with no tag — not met: first'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged noted line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: second',
      'an untagged noted line re-writes, still untagged: ' + r.out
    );
  }

  // dod-line: the fourth verdict, `accepted` (ADR 0095, triage #679) — an operator-accepted unmet
  // criterion renders unticked, exactly like not-met/ceiling, with its own `accepted:` label. It parses
  // back on a later read exactly like the other three.
  {
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'accepted', '--note', 'operator decision, 2026-09-25'],
      '- [ ] the widget renders — 01'
    );
    assert.ok(r.ok, 'dod-line accepted should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [ ] the widget renders — 01 — accepted: operator decision, 2026-09-25',
      'dod-line renders an accepted line unticked, keeping the tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'later evidence'],
      r.out
    );
    assert.ok(r.ok, 'a later met write still parses an accepted line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: later evidence',
      'the accepted line still round-trips through a later judgment: ' + r.out
    );
  }

  // dod-line: --note-file and --match-file (triage #680) — the verb reads the text from a file,
  // one trailing newline stripped, verbatim otherwise: a quote, a backtick, a
  // `$(`, all survive.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-line-files-'));
    const notePath = path.join(dir, 'note.txt');
    const matchPath = path.join(dir, 'match.txt');
    const trickyNote = 'evidence: `$(rm -rf /)` and "quotes" too';
    fs.writeFileSync(notePath, trickyNote + '\n', 'utf8');
    fs.writeFileSync(matchPath, 'the widget renders\n', 'utf8');

    r = call(
      ['dod-line', '--match-file', matchPath, '--verdict', 'met', '--note-file', notePath],
      '- [ ] the widget renders — 01'
    );
    assert.ok(r.ok, 'dod-line --match-file/--note-file should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      `- [x] the widget renders — 01 — met: ${trickyNote}`,
      'dod-line renders the file-supplied note verbatim, trailing newline stripped: ' + r.out
    );

    // A note-file whose content carries an internal newline (past the one trailing newline stripped)
    // is refused.
    fs.writeFileSync(notePath, 'line one\nline two\n', 'utf8');
    r = call(
      ['dod-line', '--match-file', matchPath, '--verdict', 'met', '--note-file', notePath],
      '- [ ] the widget renders — 01'
    );
    assert.ok(!r.ok && /newline/.test(r.err), 'dod-line refuses a --note-file with an embedded newline: ' + r.err);

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // dod-line: an inline --match or --note refuses, names its file form, and prints nothing.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-line-inline-'));
    const notePath = path.join(dir, 'note.txt');
    const matchPath = path.join(dir, 'match.txt');
    fs.writeFileSync(notePath, 'ok\n', 'utf8');
    fs.writeFileSync(matchPath, 'the widget renders\n', 'utf8');
    const body = '- [ ] the widget renders — 01';

    r = rawCall(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note-file', notePath], body);
    assert.ok(!r.ok, 'an inline --match refuses');
    assert.ok(/--match-file/.test(r.err), 'the refusal names --match-file: ' + r.err);
    assert.strictEqual(r.out, '', 'an inline --match prints nothing');

    r = rawCall(['dod-line', '--match-file', matchPath, '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(!r.ok, 'an inline --note refuses');
    assert.ok(/--note-file/.test(r.err), 'the refusal names --note-file: ' + r.err);
    assert.strictEqual(r.out, '', 'an inline --note prints nothing');

    // `--match` takes `-h` as its value, so the refusal fires and no usage text replaces the body.
    r = rawCall(['dod-line', '--match', '-h', '--verdict', 'met', '--note-file', notePath], body);
    assert.ok(!r.ok, 'dod-line --match -h refuses with a non-zero exit');
    assert.ok(/--match-file/.test(r.err), 'the refusal names --match-file: ' + r.err);
    assert.strictEqual(r.out, '', 'dod-line --match -h prints no usage');

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // dod-line: an untagged criterion ending in something shaped like a tag (`— 3`) is not misread as
  // tagged — the whole line is still the criterion, since no real tag exists to split off (triage #679's
  // C.1). Tag parsing still works for a genuinely tagged line ending the same way.
  {
    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Retries capped — 3'
    );
    assert.ok(r.ok, 'dod-line matches an untagged criterion ending in a number-shaped suffix: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Retries capped — 3 — met: ok',
      'the whole line round-trips as one untagged criterion: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'Retries capped', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Retries capped — 01'
    );
    assert.ok(r.ok, 'a genuinely tagged line still matches its bare criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Retries capped — 01 — met: ok',
      'tag parsing is unaffected for a real tag: ' + r.out
    );
  }

  // dod-line: `docs` is a whole tag, like `scope` (ADR 0161). It survives a tick, an untick, and a
  // re-judge in body mode and in `--line` mode; a criterion that merely ends in "— docs" still matches
  // by its untagged spelling; and `docs` combined with a slice id is no tag at all.
  {
    for (const mode of [[], ['--line']]) {
      r = call(['dod-line', ...mode, '--match', 'AGENTS.md names the verb', '--verdict', 'met', '--note', 'e'],
        '- [ ] AGENTS.md names the verb — docs');
      assert.ok(r.ok, `dod-line ticks a docs-tagged line (${mode}): ` + (r.err || ''));
      assert.strictEqual(r.out, '- [x] AGENTS.md names the verb — docs — met: e',
        `the docs tag survives a tick (${mode}): ` + r.out);
      r = call(['dod-line', ...mode, '--match', 'AGENTS.md names the verb', '--verdict', 'not-met', '--note', 'f'],
        r.out);
      assert.strictEqual(r.out, '- [ ] AGENTS.md names the verb — docs — not met: f',
        `the docs tag survives an untick of a noted line (${mode}): ` + r.out);
    }

    r = call(['dod-line', '--match', 'Split the section — docs', '--verdict', 'met', '--note', 'e'],
      '- [ ] Split the section — docs');
    assert.ok(r.ok, 'an untagged criterion ending in "— docs" matches by its whole text: ' + (r.err || ''));
    assert.strictEqual(r.out, '- [x] Split the section — docs — met: e');

    r = call(['dod-line', '--match', 'the widget renders — docs, 01', '--verdict', 'met', '--note', 'e'],
      '- [ ] the widget renders — docs, 01');
    assert.ok(r.ok, 'docs combined with an id reads as part of the criterion: ' + (r.err || ''));
    assert.strictEqual(r.out, '- [x] the widget renders — docs, 01 — met: e');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'e'],
      '- [ ] the widget renders — docs, 01');
    assert.ok(!r.ok, 'docs combined with an id is no tag, so the bare criterion matches nothing');
  }

  // dod-line: the same untagged-fallback offer reaches the tag-with-note shape too — an untagged
  // criterion ending in something tag-shaped is still readable once it already carries a note (Minor
  // review find #4). Tick the line, then re-judge it against the same untagged `--match`.
  {
    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'met', '--note', 'e'],
      '- [ ] Retries capped — 3'
    );
    assert.ok(r.ok, 'first tick: ' + (r.err || ''));
    assert.strictEqual(r.out, '- [x] Retries capped — 3 — met: e');

    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'not-met', '--note', 'regressed'],
      r.out
    );
    assert.ok(r.ok, 'a ticked line with a tag-shaped suffix still matches the same untagged criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [ ] Retries capped — 3 — not met: regressed',
      'the whole line still round-trips as one untagged criterion: ' + r.out
    );
  }

  // dod-line: the untagged fallback trims trailing whitespace off the criterion it renders (triage
  // #679's C.2).
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Old criterion with no tag   '
    );
    assert.ok(r.ok, 'dod-line should match an untagged line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: ok',
      'the untagged fallback trims trailing whitespace off the criterion: ' + r.out
    );
  }

  // dod-line: body mode scopes an untagged match to the `## Definition of Done` section when the body
  // carries one (triage #679's C.3) — an identical checkbox outside that section is ignored, and a
  // second one inside it still refuses as ambiguous.
  {
    const body = [
      '# dod.md',
      '',
      '## Out of scope',
      '',
      '- [ ] Old criterion with no tag',
      '',
      '## Definition of Done',
      '',
      '- [ ] the widget renders — 01',
      '',
      '## Notes',
      '',
      '- [ ] Old criterion with no tag',
    ].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line matches inside the DoD section: ' + (r.err || ''));
    assert.ok(r.out.includes('- [x] the widget renders — 01 — met: ok'), 'the DoD-section line is ticked: ' + r.out);

    r = call(['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(!r.ok, 'a checkbox outside the DoD section is never a match candidate, even though two copies exist');

    // A body with no "Definition of Done" heading still matches over the whole body, as before.
    const noHeading = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02'].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], noHeading);
    assert.ok(r.ok, 'a body with no DoD heading still matches over the whole body: ' + (r.err || ''));
  }

  // dod-line: a note already opening with the verdict's own label carries that label once.
  {
    const body = '- [ ] the widget renders — 01';
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'met: ok'], body);
    assert.strictEqual(r.out, '- [x] the widget renders — 01 — met: ok', 'own label written once: ' + r.out);
    r = call(['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'not-met', '--note', 'not met: red'], body);
    assert.ok(r.out.includes('— not met: red') && !r.out.includes('not met: not met'), '--line: own label once: ' + r.out);
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'not met: x'], body);
    assert.ok(r.out.includes('— met: not met: x'), "another verdict's label is note text, kept: " + r.out);
  }

  // dod-line fails closed: no matching line → nothing on stdout, the criterion on stderr, exit 1 —
  // the empty stdout is what a store's gated body edit refuses to send (ADR 0115).
  for (const mode of [[], ['--line']]) {
    const res = cp.spawnSync(
      process.execPath,
      [scopePath, ...fileArgs(['dod-line', ...mode, '--match', 'absent criterion', '--verdict', 'met', '--note', 'ok'])],
      { input: '- [ ] the widget renders — 01', encoding: 'utf8', timeout: 30000 }
    );
    assertSpawnDecided(res, 'dod-line no-match ' + mode.join(''));
    assert.strictEqual(res.status, 1, 'no match exits 1');
    assert.strictEqual(res.stdout, '', 'no match prints nothing on stdout');
    assert.ok(res.stderr.includes('absent criterion'), 'no match names the criterion on stderr: ' + res.stderr);
  }
} finally {
  fs.rmSync(fileDir, { recursive: true, force: true });
  cleanup();
}
