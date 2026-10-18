'use strict';

// citations.js: the `citations` verb, which finds a citation of an old ADR number or invariant id that a renumber missed (ADR 0156, INV-0134).

const { gitSpawn, refResolves } = require('./git-spawn.js');
const { collisionRefusal } = require('./collisions.js');

// After the base step renumbers a colliding number, no line the branch added since `rangeBase` may
// still cite the old one. This reads the added lines of `rangeBase..branch` from committed history and
// reports each that cites an old id as `ADR NNNN`, `INV-NNNN`, or a link to `NNNN-<slug>.md`, matched
// on whole numbers. Bare numbers in plural prose ("ADRs 0126 and 0131") are no citation. The diff is
// asked for by command-line flags that override the repository's diff configuration (`diff.relative`,
// `diff.noprefix`, `diff.mnemonicPrefix`, `diff.external`, `diff.interHunkContext`, `color.diff`, a
// textconv driver, a `-diff` attribute made text by `--text`), so the
// parse reads one fixed format from any subdirectory.

const CITATION_ID_RE = /^(?:\d{4}|INV-\d{4})$/;

// A `+++` path, prefix included, as git prints it: raw, with a trailing tab when the path holds a
// space, or C-quoted whole.
function diffPath(raw) {
  if (!raw.startsWith('"')) return raw.replace(/\t$/, '');
  const esc = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
  const bytes = [];
  const body = raw.slice(1, raw.lastIndexOf('"'));
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') { bytes.push(...Buffer.from(c)); continue; }
    const oct = body.slice(i + 1, i + 4).match(/^[0-7]{3}/);
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 3; } else bytes.push(...Buffer.from(esc[body[++i]] ?? body[i]));
  }
  return Buffer.from(bytes).toString('utf8');
}

function citationPattern(id) {
  const num = id.replace('INV-', '');
  return id.startsWith('INV-') ? new RegExp(`\\bINV-${num}(?!\\d)`) : new RegExp(`\\bADR\\s+${num}(?!\\d)|(?<!\\d)${num}-[^\\s/)]*\\.md`);
}

function findCitations(cwd, { rangeBase, branch, ids }) {
  for (const ref of [rangeBase, branch]) {
    if (!refResolves(ref, cwd)) throw collisionRefusal(`citations: "${ref}" resolves to no commit`);
  }
  const patterns = ids.map((id) => [id, citationPattern(id)]);
  const r = gitSpawn(
    ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-relative', '--submodule=short', '-M', '-U0', '--inter-hunk-context=0', '--text',
      '--src-prefix=a/', '--dst-prefix=b/', '--end-of-options', rangeBase, branch],
    cwd,
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw collisionRefusal(`citations: cannot diff "${rangeBase}" against "${branch}"`);
  const found = [];
  let file = null;
  let oldLeft = 0;
  let newLeft = 0;
  let line = 0;
  for (const text of r.stdout.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      // Inside a hunk the counts say which lines are content, so an added line that starts `++ ` is no header.
      if (text.startsWith('+')) {
        newLeft--;
        for (const [id, re] of patterns) if (re.test(text.slice(1))) found.push(`${file}:${line} ${id}`);
        line++;
      } else if (text.startsWith('-')) oldLeft--;
      else if (text.startsWith(' ')) { oldLeft--; newLeft--; line++; }
      continue;
    }
    if (text.startsWith('+++ ')) file = text.startsWith('+++ /dev/null') ? null : diffPath(text.slice(4)).slice(2);
    const h = text.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (h && file !== null) {
      oldLeft = h[1] === undefined ? 1 : Number(h[1]);
      newLeft = h[3] === undefined ? 1 : Number(h[3]);
      line = Number(h[2]);
    }
  }
  return found;
}

function verbCitations(cwd, args) {
  const flags = { '--range-base': 'rangeBase', '--branch': 'branch' };
  const opts = {};
  for (let i = 0; i < args.length; ) {
    const flag = args[i];
    if (!flags[flag]) { i++; continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw collisionRefusal(`citations: ${flag} needs a value`);
    const value = args.splice(i, 2)[1];
    if (opts[flags[flag]]) throw collisionRefusal(`citations: ${flag} given twice`);
    opts[flags[flag]] = value;
  }
  const missing = Object.keys(flags).find((f) => !opts[flags[f]]);
  if (missing) throw collisionRefusal(`citations needs ${missing} <ref>`);
  const unknown = args.find((a) => a.startsWith('--'));
  if (unknown) throw collisionRefusal(`citations: unrecognized flag "${unknown}"`);
  const ids = args;
  if (!ids.length) throw collisionRefusal('citations needs at least one <id>');
  const bad = ids.find((id) => !CITATION_ID_RE.test(id));
  if (bad) throw collisionRefusal(`citations: "${bad}" is no id: use a four-digit ADR number or INV-NNNN`);
  const found = findCitations(cwd, { ...opts, ids: [...new Set(ids)] });
  if (found.length) {
    console.log(found.join('\n'));
    process.exitCode = 1;
  }
}

module.exports = { verbCitations };
