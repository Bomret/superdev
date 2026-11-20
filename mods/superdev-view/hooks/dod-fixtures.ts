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

// The lines scope.js's `dod-line` writes for the same criterion with a note that carries a look-alike verdict: not-met
// with note `was — met: x`, then met with note `was — not met: x`, each tagged then untagged. The leftmost boundary
// decides the label, so the not-met lines count open and the met lines done. tests/scope-dod-line.test.js asserts
// scope.js writes exactly these lines; parse.test.ts asserts how `progress` counts them.
export const DOD_LOOKALIKE_LINES: string[] = /* dod-lookalike:start */ [
  "- [ ] the widget renders — 01 — not met: was — met: x",
  "- [ ] the widget renders — not met: was — met: x",
  "- [x] the widget renders — 01 — met: was — not met: x",
  "- [x] the widget renders — met: was — not met: x"
] /* dod-lookalike:end */

// Lines the shortest-criterion rule reads (plugin/lib/dod-line.js): an untagged line whose note quotes a tag and a
// verdict reads open at its own label, and a line holding U+2028 is one line that counts in the total.
// parse.test.ts asserts how `progress` counts them.
export const DOD_SHORTEST_LINES: string[] = [
  '- [ ] Retries are capped — not met: earlier note read "x — 3 — met: y"',
  '- [ ] Retries are capped — 3 — not met: see — met: y',
  '- [ ] Cr\u2028it — 01 — met: n\u2029ote',
]

// Open lines scope.js never writes: a bare tick, an unjudged line, and a tick beside a note that settles nothing.
export const DOD_OPEN_LINES: string[] = [
  '- [x] the widget renders',
  '- [ ] the widget renders',
  '- [x] the widget renders — 01 — not met: the note',
  '- [x] the widget renders — ceiling: the note',
]
