'use strict';

// candidates.js: the `candidates` verb, the empty-argument cascade's verdict over the run roots (`references/scope-mode.md`'s
// `## Resolving an empty argument`, INV-0196). It reads ledgers only and writes nothing.

const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, getHeader, SLUG_RE, STAGES } = require('./ledger.js');
const { scanRunRoots } = require('./run-roots.js');

// Prints `one <slug> <stage>`; `several` then one `<slug> <stage>` line per candidate; or `none` then one line per run root with its
// stage. A run root whose ledger names no stage reads `absent`, and one whose ledger cannot be read or names a stage outside the ledger's
// stages reads `unreadable`: neither qualifies. A run root whose directory name fails the slug charset is left out, so every slug is one token.
function verbCandidates(cwd, args) {
  const i = args.indexOf('--stage');
  if (i < 0 || !args[i + 1]) fail('candidates: --stage <stage>[,<stage>] is required');
  const wanted = args[i + 1].split(',');
  args.splice(i, 2);
  if (args.length) fail(`candidates: unrecognized argument "${args[0]}"`);
  const unknown = wanted.find((s) => !STAGES.includes(s));
  if (unknown !== undefined) fail(`candidates: unknown stage "${unknown}" (stages: ${STAGES.join(', ')})`);
  const { scopesDir, names } = scanRunRoots(cwd);
  const roots = names.filter((slug) => SLUG_RE.test(slug)).sort().map((slug) => {
    let stage;
    try {
      stage = getHeader(readLines(path.join(scopesDir, slug)), 'Stage') || 'absent';
    } catch {
      stage = 'unreadable';
    }
    return { slug, stage: stage === 'absent' || STAGES.includes(stage) ? stage : 'unreadable' };
  });
  const found = roots.filter((r) => wanted.includes(r.stage));
  const line = (r) => `${r.slug} ${r.stage}`;
  if (found.length === 1) console.log(`one ${line(found[0])}`);
  else console.log([found.length ? 'several' : 'none', ...(found.length ? found : roots).map(line)].join('\n'));
}

module.exports = { verbCandidates };
