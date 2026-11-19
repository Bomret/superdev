'use strict';

// tier.js: the `tier` verb, the execution tier and the simplicity skip read from the ledger's slice rows. It reads the ledger and writes nothing; the tier is never stored (INV-0056).

const { fail } = require('./refusal.js');
const { readLines, tableRowIndexes, splitRow } = require('./ledger.js');

const TYPES = ['behavior', 'mechanical', 'docs'];
// The one threshold: more than this many `behavior` rows is the full tier.
const FULL_OVER = 3;

// The first reason the rows leave the tier `unknown`: no rows, a row without the 7 columns, or a type outside the three; '' where
// none applies.
function unknownReason(rows) {
  if (!rows.length) return 'no slice rows in the ledger';
  const bad = rows.find((r) => r.cells.length !== 7);
  if (bad) return `malformed slice row: ${bad.raw}`;
  const odd = rows.find((r) => !TYPES.includes(r.cells[3]));
  return odd ? `slice ${odd.cells[0]} has type "${odd.cells[3]}", outside behavior, mechanical, docs` : '';
}

// `tier --root <run-root>` prints `tier: full|lite|unknown`, `simplicity: skip|dispatch`, and, for `unknown`, a third
// `reason:` line naming the row or the absence. `full` is more than 3 `behavior` rows and `lite` is 3 or fewer; `mechanical` and
// `docs` rows never count and a row of any status does. The simplicity reviewer is skipped only for a `full` run whose every row is
// `behavior` (INV-0055). A row that does not carry the 7 columns, a type outside the three (matched case-sensitively), or
// no rows is `unknown`.
function verbTier(root, args) {
  if (args.length) fail(`tier: unrecognized argument "${args[0]}"`);
  const lines = readLines(root);
  const rows = tableRowIndexes(lines).map((i) => ({ raw: lines[i].trim(), cells: splitRow(lines[i]) }));
  const reason = unknownReason(rows);
  if (reason) {
    console.log(['tier: unknown', 'simplicity: dispatch', `reason: ${reason}`].join('\n'));
    return;
  }
  const behavior = rows.filter((r) => r.cells[3] === 'behavior').length;
  const full = behavior > FULL_OVER;
  console.log([`tier: ${full ? 'full' : 'lite'}`, `simplicity: ${full && behavior === rows.length ? 'skip' : 'dispatch'}`].join('\n'));
}

module.exports = { verbTier };
