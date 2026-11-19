'use strict';

// denial.js: the `denial` verb, the verdict for a denied dispatch the caller already recorded. It reads the ledger and writes nothing (INV-0196, ADR 0263).

const { fail } = require('./refusal.js');
const { tierOf } = require('./tier.js');
const { denialCount } = require('./ledger-records.js');

const AUTHORING = ['implementer', 'fix'];
const VERIFICATION = ['final-reviewer', 'slice-reviewer', 'doc-reader'];
// The recorded denial count at which an unattended verification denial blocks whoever authored the work.
const BLOCK_AT = 2;

// `denial <pass> [--unattended] --root` prints one verdict: `inline`, `block implementer`, `block unknown-tier`, `block authored`, or
// `block second-denial`. Attended, every denial is `inline`. Unattended, a denied implementer or fix blocks; a verification pass
// blocks on an unknown tier (INV-0056), on work the controller authored (a lite run, or a full run with a `docs` or `mechanical`
// row; never for a slice review, which verifies a `behavior` slice a dispatched implementer built), and from the second denial since the last reset. A verification pass with no recorded denial since the last reset is refused.
function verbDenial(root, args) {
  const unattended = args.includes('--unattended');
  const rest = args.filter((a) => a !== '--unattended');
  const [pass, ...extra] = rest;
  if (pass === undefined) fail('denial needs a pass: implementer, fix, final-reviewer, slice-reviewer, or doc-reader');
  if (extra.length) fail(`denial: unrecognized argument "${extra[0]}"`);
  if (!AUTHORING.includes(pass) && !VERIFICATION.includes(pass)) {
    fail(`denial: "${pass}" is no known pass; the passes are ${[...AUTHORING, ...VERIFICATION].join(', ')}`);
  }
  if (AUTHORING.includes(pass)) {
    console.log(unattended ? 'block implementer' : 'inline');
    return;
  }
  const count = denialCount(root);
  if (count === 0) fail(`denial: no verification denial recorded since the last reset; record it with degraded add-denial first`);
  if (!unattended) {
    console.log('inline');
    return;
  }
  const t = tierOf(root);
  const verdict = t.tier === 'unknown' ? 'unknown-tier'
    : pass !== 'slice-reviewer' && (t.tier === 'lite' || !t.allBehavior) ? 'authored'
      : count >= BLOCK_AT ? 'second-denial' : '';
  console.log(verdict ? `block ${verdict}` : 'inline');
}

module.exports = { verbDenial };
