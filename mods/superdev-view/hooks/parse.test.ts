import { test, expect } from 'claude-code/testing'
import { header, slices, traceAgents, untrace } from './parse'
import { LEDGER_LINES } from './ledger-fixtures'
import { TRACE_LINES } from './trace-fixtures'

test('a header the ledger lacks reads empty', () => {
  expect(header(LEDGER_LINES.join('\n'), 'PR')).toBe('')
})

test('reads the ledger scope.js writes', () => {
  const written = LEDGER_LINES.join('\n')
  expect([header(written, 'Stage'), header(written, 'Branch'), header(written, 'Anchor')]).toEqual(['implementing', 'feat/view', '#9 — Show the pane'])
  expect(slices(written)).toEqual([
    { id: '01', title: 'Draw the tiles', status: 'merged' },
    { id: '02', title: 'Draw the scope map', status: 'in-progress' },
    { id: '03', title: 'Document the mod', status: 'todo' },
    { id: '04', title: 'Split | merge the panes', status: 'todo' },
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
      { key: 'tu1', type: 'superdev:implementer', desc: 'Build slice', slice: '01', isDone: true },
    ],
    activity: {
      tu1: { last: 'T4', lastKind: 'ended', events: 1 },
    },
  })
})

test('reads the trace lines the run-trace hook writes', () => {
  const trace = TRACE_LINES.map((l, i) => `T${i} ${l}`).join('\n')
  expect(traceAgents(trace).agents).toEqual([
    { key: 'tu1', type: 'superdev:implementer', desc: 'Build slice 04', slice: '04', isDone: true },
    { key: 'tu2', type: 'superdev:final-reviewer', desc: 'Final review', slice: 'scope', isDone: true },
    { key: 'tu3', type: 'superdev:implementer', desc: 'Build slice 05', slice: '05', isDone: false },
  ])
})
