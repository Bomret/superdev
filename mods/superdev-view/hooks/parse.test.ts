import { test, expect } from 'claude-code/testing'
import { frontmatter, header, intent, progress, slices, traceAgents, untrace, waves } from './parse'
import { LEDGER_LINES } from './ledger-fixtures'
import { TRACE_LINES } from './trace-fixtures'

test('a header the ledger lacks reads empty', () => {
  expect(header(LEDGER_LINES.join('\n'), 'PR')).toBe('')
})

test('reads the ledger scope.js writes', () => {
  const written = LEDGER_LINES.join('\n')
  expect([header(written, 'Stage'), header(written, 'Branch'), header(written, 'Anchor')]).toEqual(['implementing', 'feat/view', '#9 — Show the pane'])
  expect(slices(written)).toEqual([
    { id: '01', title: 'Draw the tiles', status: 'merged', dependsOn: [] },
    { id: '02', title: 'Draw the scope map', status: 'in-progress', dependsOn: ['01'] },
    { id: '03', title: 'Document the mod', status: 'todo', dependsOn: ['02'] },
    { id: '04', title: 'Split | merge the panes', status: 'todo', dependsOn: ['03'] },
  ])
})

test('trace agents come from dispatches alone; a bound id folds in, an unbound one is dropped', () => {
  const trace = [
    'T1 01 main dispatch superdev:implementer tu1 Build\\x20slice',
    'T2 01 main dispatch-bind superdev:implementer tu1 a77',
    'T3 01 a77 edit impl x.js',
    'T4 01 main dispatch-end superdev:implementer tu1',
    'T5 02 a99 run path fail',
    'T6 01 a55 edit impl y.js',
  ].join('\n')
  expect(untrace('a\\x20b')).toBe('a b')
  expect(traceAgents(trace)).toEqual({
    agents: [
      { key: 'tu1', type: 'superdev:implementer', desc: 'Build slice', slice: '01', isDone: true, start: null, end: null },
    ],
    activity: {
      tu1: { last: 'T4', lastKind: 'ended', events: 1 },
    },
  })
})

// scope.js fail-to-pass writes this line, not the run-trace hook, so it stays out of trace-fixtures.ts.
test('a fail-to-pass outcome line adds no agent, ends none, and folds into none', () => {
  const trace = [
    'T1 scope main dispatch superdev:final-reviewer tu1 Final\\x20review',
    '2026-10-10T16:26:24.706Z scope main fail-to-pass 0cdd06b7cbe5328b5fb7d99424a724b1d9268578..7813b9b7d31d5ee21894d1fb6891b0d17721fc15 fail-to-pass control=0,put-back=1',
  ].join('\n')
  expect(traceAgents(trace)).toEqual({
    agents: [{ key: 'tu1', type: 'superdev:final-reviewer', desc: 'Final review', slice: 'scope', isDone: false, start: null, end: null }],
    activity: { tu1: { last: 'T1', lastKind: 'dispatched', events: 0 } },
  })
})

test("a trace agent's start is its dispatch line's time", () => {
  expect(traceAgents('2026-01-01T00:00:00.000Z 01 main dispatch superdev:implementer tu1 Build').agents[0]?.start).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
})

test('reads the trace lines the run-trace hook writes', () => {
  const trace = TRACE_LINES.map((l, i) => `T${i} ${l}`).join('\n')
  expect(traceAgents(trace).agents).toEqual([
    { key: 'tu1', type: 'superdev:implementer', desc: 'Build slice 04', slice: '04', isDone: true, start: null, end: null },
    { key: 'tu2', type: 'superdev:final-reviewer', desc: 'Final review', slice: 'scope', isDone: true, start: null, end: null },
    { key: 'tu3', type: 'superdev:implementer', desc: 'Build slice 05', slice: '05', isDone: false, start: null, end: null },
    {
      key: 'tu4', type: 'superdev:slice-reviewer', desc: 'Review slice 04', slice: '04', isDone: true, start: null, end: null,
      review: { spec: 'fail', quality: 'changes-needed', cycle: 0, reviewed: 'tu1' },
    },
  ])
})

test('a verdict line attaches to its reviewer only; one naming no dispatch is ignored, and `-` reviews no implementer', () => {
  const trace = [
    'T1 03 main dispatch superdev:slice-reviewer r1 Review',
    'T2 03 main verdict r1 pass approved 2 -',
    'T3 03 main dispatch superdev:slice-reviewer r2 Re-review',
    'T4 03 main verdict nobody pass approved 0 -',
  ].join('\n')
  const { agents } = traceAgents(trace)
  expect(agents.map(a => a.review)).toEqual([{ spec: 'pass', quality: 'approved', cycle: 2, reviewed: '' }, undefined])
})

test('a second verdict line for one dispatch is ignored: the first wins', () => {
  const trace = [
    'T1 03 main dispatch superdev:slice-reviewer r1 Review',
    'T2 03 main verdict r1 pass approved 1 -',
    'T3 03 main verdict r1 fail changes-needed 1 -',
  ].join('\n')
  const { agents } = traceAgents(trace)
  expect(agents[0].review).toEqual({ spec: 'pass', quality: 'approved', cycle: 1, reviewed: '' })
})

test('a depends-on cell of several ids splits on commas, and an empty cell names none', () => {
  const row = (deps: string) => `| 05 | #5 | T | behavior | ${deps} | todo | — |`
  expect(slices(row('02, 03,04')).map(x => x.dependsOn)).toEqual([['02', '03', '04']])
  expect(slices(row('')).map(x => x.dependsOn)).toEqual([[]])
})

const sl = (id: string, ...dependsOn: string[]) => ({ id, title: id, status: 'todo', dependsOn })

test('a slice sits in the first wave after every slice it depends on', () => {
  expect(waves([sl('01'), sl('02', '01'), sl('03', '01'), sl('04', '01'), sl('05', '02', '03', '04')]).map(w => w.map(x => x.id))).toEqual([['01'], ['02', '03', '04'], ['05']])
})

test('a depends-on naming a missing slice counts as met, and a cycle goes into one last wave', () => {
  expect(waves([sl('01', '09'), sl('02', '03'), sl('03', '02')]).map(w => w.map(x => x.id))).toEqual([['01'], ['02', '03']])
})

test('parses dod progress, intents, and staged page frontmatter', () => {
  expect(progress('- [x] a\n- [ ] b\n  - [X] c\n')).toEqual({ done: 2, total: 3 })
  expect(intent('x', '# Intent: Help\n\n**Status: ready to plan.** more')).toEqual({ name: 'x', title: 'Help', status: 'ready to plan', isDraft: false })
  expect(frontmatter('---\ntitle: "Page"\naction: patch\n---\nbody')).toEqual({ title: 'Page', action: 'patch' })
})
