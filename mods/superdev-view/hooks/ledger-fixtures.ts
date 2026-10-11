// The ledger plugin/scripts/scope.js writes for scope `view`, one line per entry: `init feat/view planned`
// with four slices (slice 04's title holds a `|`, which scope.js writes as `\|`), `stage set implementing`, slice 01 `merged` with a range, slice 02 `in-progress`.
// tests/scope.test.js parses the JSON between the two markers and asserts scope.js writes exactly these
// lines; parse.test.ts asserts `header` and `slices` read them. A layout change on either side fails one
// suite, so edit this list, not either test.
export const LEDGER_LINES: string[] = /* ledger:start */ [
  "# Ledger — view",
  "",
  "**Stage:** implementing",
  "**Branch:** feat/view",
  "**Anchor:** #9 — Show the pane",
  "",
  "| id | issue | title | type | depends-on | status | range |",
  "|---|---|---|---|---|---|---|",
  "| 01 | #10 | Draw the tiles | behavior | — | merged | a1b2c3d..e4f5a6b |",
  "| 02 | #11 | Draw the scope map | behavior | 01 | in-progress | — |",
  "| 03 | #12 | Document the mod | docs | 02 | todo | — |",
  "| 04 | #13 | Split \\| merge the panes | behavior | 03 | todo | — |",
  ""
] /* ledger:end */

// The ledger of a run that has started `/superdev:review`: scope `view`, one slice `merged`, stage `merged`, then `step set review`.
// tests/scope.test.js asserts scope.js writes exactly these lines, the way it does for LEDGER_LINES.
export const LEDGER_STEP_LINES: string[] = /* ledger-step:start */ [
  "# Ledger — view",
  "",
  "**Stage:** merged",
  "**Step:** review",
  "**Branch:** feat/view",
  "**Anchor:** #9 — Show the pane",
  "",
  "| id | issue | title | type | depends-on | status | range |",
  "|---|---|---|---|---|---|---|",
  "| 01 | #10 | Draw the tiles | behavior | — | merged | a1b2c3d..e4f5a6b |",
  ""
] /* ledger-step:end */
