'use strict';

// Suite for plugin/scripts/scope.js's `section` verb: one markdown section of a file, its heading line read from stdin.
// The verb only reads, so every case shares one temporary directory of fixture files.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-section-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const put = (name, text) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const section = (file, heading, cwd) => call(['section', file], heading + '\n', cwd || dir);

const doc = put(
  'doc.md',
  [
    '# Title',
    '',
    '## A',
    'a1',
    '### A deeper',
    'a2',
    '```sh',
    '## not a heading',
    '```',
    'a3',
    '## B',
    'b1',
    '## A longer',
    'c1',
    '',
  ].join('\n'),
);

// The section runs from its heading to the next heading of the same or a higher level; a deeper heading stays inside.
{
  const r = section(doc, '## A');
  assert.equal(r.ok, true);
  assert.equal(r.out, ['## A', 'a1', '### A deeper', 'a2', '```sh', '## not a heading', '```', 'a3'].join('\n'));
}
{
  const r = section(doc, '### A deeper');
  assert.equal(r.out, ['### A deeper', 'a2', '```sh', '## not a heading', '```', 'a3'].join('\n'), 'a sibling or a higher heading ends it');
}
{
  const r = section(doc, '## A longer');
  assert.equal(r.out, ['## A longer', 'c1'].join('\n'), 'the last section ends at end of file');
}
{
  const r = section(doc, '# Title');
  assert.ok(r.out.includes('## B') && r.out.includes('c1'), 'a level-one section holds every deeper section');
}

// A heading inside a fence neither starts nor ends a section.
{
  const f = put('fence.md', ['## X', 'x1', '```md', '## X', '## Y', '```', 'x2', '## Z', 'z1'].join('\n'));
  assert.equal(section(f, '## X').out, ['## X', 'x1', '```md', '## X', '## Y', '```', 'x2'].join('\n'));
}

// The level and the whole heading text match: a longer heading sharing a prefix, or a deeper level, never matches.
{
  assert.equal(section(doc, '## A').out.includes('c1'), false, '## A never matches ## A longer');
  assert.equal(section(doc, '## A deeper').ok, false, '## A deeper is no heading of the file');
  assert.equal(section(doc, '### A').ok, false, '### A is no heading of the file');
}

// Closing #s, extra whitespace, and CRLF match the heading.
{
  assert.equal(section(doc, '##   A  ##').out.split('\n')[0], '## A');
  const f = put('crlf.md', '## A\r\na1\r\n## B\r\nb1\r\n');
  assert.equal(section(f, '## A').out, '## A\na1');
  const g = put('closing.md', '## A ##\na1\n## B\n');
  assert.equal(section(g, '## A').out, '## A ##\na1');
}

// Each refusal names the file and prints nothing on stdout.
{
  const refused = (r, file) => {
    assert.equal(r.ok, false);
    assert.equal(r.out, '', 'nothing printed');
    assert.ok(r.err.includes(file), 'the refusal names the file: ' + r.err);
    assert.equal(r.err.includes('\n'), false, 'one line');
  };
  refused(section(path.join(dir, 'absent.md'), '## A'), 'absent.md');
  refused(section(doc, '## Nope'), 'doc.md');
  const twice = put('twice.md', '## A\none\n## B\n## A\ntwo\n');
  refused(section(twice, '## A'), 'twice.md');
  const onlyFenced = put('only-fenced.md', '## B\n```\n## A\n```\n');
  const r = section(onlyFenced, '## A');
  refused(r, 'only-fenced.md');
  assert.match(r.err, /fence/);
  const open = put('open.md', '## A\n```\n## B\n');
  const u = section(open, '## A');
  refused(u, 'open.md');
  assert.doesNotMatch(u.err, /staged body/);
  refused(call(['section', doc], '\n', dir), 'doc.md');
  refused(call(['section', doc], 'not a heading\n', dir), 'doc.md');
}

// A setext heading in the printed span cannot be placed by the verb, so it refuses and names the file.
{
  const f = put('setext.md', '## A\na1\nTitle\n=====\nt1\n## B\nb1\n');
  const r = section(f, '## A');
  assert.equal(r.ok, false);
  assert.equal(r.out, '', 'nothing printed');
  assert.ok(r.err.includes('setext.md') && /setext/.test(r.err), 'the refusal names the file and the setext heading: ' + r.err);
  const fenced = put('setext-fenced.md', '## A\n```\nTitle\n=====\n```\na1\n## B\n');
  assert.equal(section(fenced, '## A').out, '## A\n```\nTitle\n=====\n```\na1', 'an underline inside a fence is no setext heading');
  const rule = put('rule.md', '## A\na1\n\n---\nb\n## B\n');
  assert.equal(section(rule, '## A').out, '## A\na1\n\n---\nb', 'a thematic break after a blank line is no setext underline');
}

// A heading holding backticks, apostrophes, and angle brackets matches as typed.
{
  const f = put('odd.md', "## The `base` merge's <x>\nbody\n## Next\n");
  assert.equal(section(f, "## The `base` merge's <x>").out, "## The `base` merge's <x>\nbody");
}

// Path resolution: a bare name under the plugin's references/ then agents/, a plugin-root path, then the current directory.
{
  assert.ok(section('test-selection.md', '## Complete selector').out.startsWith('## Complete selector'), 'bare name under references/');
  assert.ok(section('implementer.md', '## Report').ok, 'a bare name then agents/');
  assert.ok(section('references/test-selection.md', '## Complete selector').ok, 'a path under the plugin root');
  assert.ok(section('${CLAUDE_PLUGIN_ROOT}/references/test-selection.md', '## Complete selector').ok, 'a ${CLAUDE_PLUGIN_ROOT} path');
  // The same name under the plugin root and the current directory: the plugin's file wins.
  put('references/test-selection.md', '## Complete selector\nCWD-PATH-COPY\n');
  put('test-selection.md', '## Complete selector\nCWD-BARE-COPY\n');
  for (const name of ['test-selection.md', 'references/test-selection.md']) {
    const r = section(name, '## Complete selector');
    assert.ok(r.ok && !r.out.includes('CWD-'), `${name}: the plugin's file wins over the current directory's: ` + r.out);
  }
  // A bare `AGENTS.md` is the repository's own hierarchy root: the plugin's references/AGENTS.md, which carries the same DOX
  // headings, never stands in for it.
  put('AGENTS.md', '# Repo\n\n## Purpose\nCONSUMER-AGENTS\n');
  assert.equal(section('AGENTS.md', '## Purpose').out, '## Purpose\nCONSUMER-AGENTS', 'a bare AGENTS.md reads the current directory');
  put('docs/agents/own.md', '## Mine\nmine\n');
  assert.equal(section('docs/agents/own.md', '## Mine').out, '## Mine\nmine', 'any other relative path reads the current directory');
}

// Every "`<path>`'s `## <heading>`" citation of the shipped prose, and every heading a section map entry lists, is found through the verb.
{
  const repo = path.join(__dirname, '..');
  const { HEADING_CITATION_PATTERN, SECTION_MAP_PATTERN, HEADING_SPAN_PATTERN } = require('../scripts/drift/contracts.js');
  const prose = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.md')) prose.push(path.join(d, e.name));
    }
  };
  for (const d of ['skills', 'agents', 'references']) walk(path.join(repo, 'plugin', d));
  const cited = [];
  for (const file of prose) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(HEADING_CITATION_PATTERN)) cited.push([file, m[1], m[2], m[3]]);
    for (const m of text.matchAll(SECTION_MAP_PATTERN)) {
      for (const s of m[2].matchAll(HEADING_SPAN_PATTERN)) cited.push([file, m[1], s[1], s[2]]);
    }
  }
  assert.ok(cited.length > 100, 'the shipped prose cites many headings: ' + cited.length);
  const lost = [];
  for (const [file, name, level, text] of cited) {
    const r = call(['section', name], `${level} ${text.replace(/\s+/g, ' ').trim()}\n`, repo);
    if (!r.ok || r.out === '') lost.push(`${path.relative(repo, file)}: ${name} ${level} ${text}: ${r.err}`);
  }
  assert.deepEqual(lost, [], 'every citation is found');
}

// The merge guard lets a subagent's heredoc call of the verb through, a heading naming merge included. The hook's file name is
// joined at run time, so this suite's own text does not name it, which would select this suite for a change to the hook.
{
  const { decide } = require(path.join(__dirname, '..', 'plugin', 'hooks', ['merge', 'guard'].join('-') + '.js'));
  const command = "node \"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js\" section references/scope-branch.md <<'EOF'\n## The base merge\nEOF";
  assert.equal(decide({ agent_id: 'a1', tool_input: { command } }).block, false, 'the heredoc form passes');
}

// The verb writes nothing: a run root and the git state stay as they were.
{
  const { execFileSync } = require('node:child_process');
  const root = path.join(dir, 'run-root');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'ledger.md'), 'Stage: implement\n');
  const snap = () => {
    const files = fs.readdirSync(dir, { recursive: true }).sort().map((f) => [f, fs.statSync(path.join(dir, f)).isFile() ? fs.readFileSync(path.join(dir, f), 'utf8') : '']);
    return JSON.stringify(files);
  };
  const before = snap();
  section(doc, '## A');
  section(doc, '## Nope');
  assert.equal(snap(), before, 'no file appears, vanishes, or changes');
  const repoDir = path.join(__dirname, '..');
  const git = () => execFileSync('git', ['status', '--porcelain'], { cwd: repoDir, encoding: 'utf8' });
  const gitBefore = git();
  call(['section', 'test-selection.md'], '## Complete selector\n', repoDir);
  assert.equal(git(), gitBefore, 'the git state is unchanged');
}

// one fence rule: a ```js``` line and a tab-indented ``` line open no fence, so the next heading still ends the section
{
  const f = put('fence-rule.md', '## A\na1\n```js```\n\t```\n## B\nb1\n```x\nc\n```\n');
  const r = section(f, '## A');
  assert.ok(r.ok && r.out.includes('a1') && !r.out.includes('b1'), 'section A ends at ## B: ' + (r.err || r.out));
  const bad = put('fence-bad.md', '## A\n```\ncode\n\t```\n## B\n');
  const u = section(bad, '## A');
  assert.ok(!u.ok && /unterminated/.test(u.err), 'a tab-indented closer is refused');
}
