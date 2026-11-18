// The Definition-of-Done lines plugin/scripts/scope.js's `dod-line` writes for criterion `the widget renders` and
// note `the note`, one line per verdict in the order met, not-met, ceiling, accepted: each first from the tagged
// line `- [ ] the widget renders — 01`, then from the untagged line `- [ ] the widget renders`.
// tests/scope-dod-line.test.js parses the JSON between the two markers and asserts scope.js writes exactly these
// lines; parse.test.ts asserts `progress` counts the met and accepted lines as done. A change on either side
// fails one suite, so edit this list, not either test.
export const DOD_WRITTEN_LINES: string[] = /* dod:start */ [
  "- [x] the widget renders — 01 — met: the note",
  "- [x] the widget renders — met: the note",
  "- [ ] the widget renders — 01 — not met: the note",
  "- [ ] the widget renders — not met: the note",
  "- [ ] the widget renders — 01 — ceiling: the note",
  "- [ ] the widget renders — ceiling: the note",
  "- [ ] the widget renders — 01 — accepted: the note",
  "- [ ] the widget renders — accepted: the note"
] /* dod:end */

// Open lines scope.js never writes: a bare tick, an unjudged line, and a tick beside a note that settles nothing.
export const DOD_OPEN_LINES: string[] = [
  '- [x] the widget renders',
  '- [ ] the widget renders',
  '- [x] the widget renders — 01 — not met: the note',
  '- [x] the widget renders — ceiling: the note',
]
