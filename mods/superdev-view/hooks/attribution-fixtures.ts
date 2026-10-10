// Dispatch prompts and the scope and slice each one attributes to (INV-0136). `{A}` and `{B}` stand for
// two run roots that hold a ledger, `{NOLEDGER}` for one that holds none. tests/run-trace.test.js parses
// the JSON between the two markers and runs every entry through plugin/hooks/run-trace.js; the mod's own
// suite runs every entry through `attribute`. Both must agree, so edit this list, not either test. The `{A}.x`
// entry sits on scope.js's SLUG_RE boundary: a `.` ends the slug, so a slug pattern that admits it fails one suite.
export type AttributionFixture = { prompt: string; root: 'A' | 'B' | null; slice: string | null }

export const FIXTURES: AttributionFixture[] = /* fixtures:start */ [
  { "prompt": "Work in {A}/slicetrees/04 please", "root": "A", "slice": "04" },
  { "prompt": "Append to {A}/reports/04/progress.md", "root": "A", "slice": "04" },
  { "prompt": "{A}/slicetrees/04 and {A}/reports/04/progress.md", "root": "A", "slice": "04" },
  { "prompt": "{A}/slicetrees/04 and {A}/slicetrees/05", "root": "A", "slice": "scope" },
  { "prompt": "Review the scope at {A}/scopetree against {A}/dod.md", "root": "A", "slice": "scope" },
  { "prompt": "Work in {A}/. and {A}, then {A}/slicetrees/04.", "root": "A", "slice": "04" },
  { "prompt": "Work in {A}.x/slicetrees/04", "root": "A", "slice": "scope" },
  { "prompt": "no run root here", "root": null, "slice": null },
  { "prompt": "{A}/slicetrees/04 and {B}/slicetrees/01", "root": null, "slice": null },
  { "prompt": "{NOLEDGER}/slicetrees/01", "root": null, "slice": null }
] /* fixtures:end */
