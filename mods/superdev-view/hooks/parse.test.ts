import { test, expect } from 'claude-code/testing'
import { eventLog, frontmatter, header, intent, progress, slices, untrace } from './parse'
import { LEDGER_LINES, LEDGER_STEP_LINES } from './ledger-fixtures'
import { TRACE_LINES } from './trace-fixtures'

test('a header the ledger lacks reads empty', () => {
  expect(header(LEDGER_LINES.join('\n'), 'PR')).toBe('')
})

test('reads the step of a ledger that carries one', () => {
  expect(header(LEDGER_STEP_LINES.join('\n'), 'Step')).toBe('review')
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

test('a trace field reads back unescaped', () => {
  expect(untrace('a\\x20b')).toBe('a b')
})

test('parses dod progress, intents, and staged page frontmatter', () => {
  expect(progress('- [x] a\n- [ ] b\n  - [X] c\n')).toEqual({ done: 2, total: 3 })
  expect(intent('x', '# Intent: Help\n\n**Status: ready to plan.** more')).toEqual({ name: 'x', title: 'Help', status: 'ready to plan', isDraft: false })
  expect(frontmatter('---\ntitle: "Page"\naction: patch\n---\nbody')).toEqual({ title: 'Page', action: 'patch' })
})

// --- the event log (ADR 0141) ---

const LEDGER_OPEN = '**Stage:** merged\n'
const LEDGER_CLOSED = '**Stage:** closed\n'
const at = (hms: string, day = '11') => `2026-10-${day}T${hms}.000Z`
const t = (hms: string, day = '11') => Date.parse(at(hms, day))
// A run shaped like scope-cli-findings: plan, implement with three slices, then step lines for every later command.
const STEPPED = [
  `${at('09:00:00')} scope main ledger init fix/x planned`,
  `${at('10:00:00')} scope main ledger stage set implementing`,
  `${at('10:01:00')} 01 main ledger slice 01 in-progress`,
  `${at('10:05:00')} 01 main ledger slice 01 merged a..b`,
  `${at('10:06:00')} scope main ledger stage set merged`,
  `${at('10:10:00')} scope main ledger step set review`,
  `${at('10:11:00')} scope main dispatch superdev:final-reviewer f1 Final\\x20review s1`,
  `${at('10:12:00')} scope main final-verdict f1 yes 0`,
  `${at('10:13:00')} scope main dispatch-end superdev:final-reviewer f1 completed`,
  `${at('10:14:00')} scope main ledger step clear`,
  `${at('10:14:00')} scope main ledger stage set reviewed`,
  `${at('10:14:30')} scope main ledger step set document`,
  `${at('10:15:00')} scope main ledger step clear`,
  `${at('10:15:00')} scope main ledger stage set documented`,
  `${at('10:15:10')} scope main ledger step set submit`,
  `${at('10:16:00')} scope main ledger step clear`,
  `${at('10:16:00')} scope main ledger stage set submitted`,
  `${at('10:16:20')} scope main ledger step set ship`,
  `${at('10:17:00')} scope main ledger step clear`,
  `${at('10:17:00')} scope main ledger stage set shipped`,
  `${at('11:17:00')} scope main ledger step set wrap-up`,
  `${at('11:18:00')} scope main ledger step clear`,
  `${at('11:18:00')} scope main ledger stage set closed`,
]
const heads = (log: ReturnType<typeof eventLog>) => log.entries.filter(e => e.kind === 'command').map(e => e.kind === 'command' && [e.name, e.isDone, e.ms])

test('a trace with step lines draws each started command, done with its duration, waits between them, and closed at the end', () => {
  const log = eventLog(LEDGER_CLOSED, STEPPED.join('\n'), t('12:00:00'))
  expect(heads(log)).toEqual([
    ['plan', true, 3600e3], ['implement', true, 360e3], ['review', true, 240e3], ['document', true, 30e3],
    ['submit', true, 50e3], ['ship', true, 40e3], ['wrap-up', true, 60e3],
  ])
  // a wait of a minute or more: implement's end at 10:06 to review at 10:10, ship's end at 10:17 to wrap-up at 11:17
  expect(log.entries.filter(e => e.kind === 'wait').map(e => e.kind === 'wait' && e.ms)).toEqual([240e3, 3600e3])
  const kinds = log.entries.map(e => (e.kind === 'command' ? e.name : e.kind))
  expect(kinds.slice(0, 6)).toEqual(['plan', 'implement', 'slice', 'wait', 'review', 'start'])
  expect(log.ahead).toEqual('closed')
  expect(log.entries.some(e => e.kind === 'stage')).toBe(false)
})

test('on a running scope the last command reads running, the ahead line skips verify-ship, and running dispatches count', () => {
  const lines = [...STEPPED.slice(0, 7)]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('10:20:00'))
  expect(heads(log).at(-1)).toEqual(['review', false, 600e3])
  expect(log.ahead).toEqual(['document', 'submit', 'ship', 'wrap-up'])
  expect(log.running).toBe(1)
  expect(eventLog(LEDGER_OPEN, STEPPED.slice(0, 9).join('\n'), t('10:20:00')).running).toBe(0)
  const shipped = eventLog(LEDGER_OPEN, STEPPED.slice(0, 20).join('\n'), t('10:20:00'))
  expect(shipped.ahead).toEqual(['wrap-up'])
  const verifying = eventLog(LEDGER_OPEN, [...STEPPED.slice(0, 20), `${at('10:30:00')} scope main ledger step set verify-ship`].join('\n'), t('10:31:00'))
  expect(heads(verifying).at(-1)).toEqual(['verify-ship', false, 60e3])
  expect(verifying.ahead).toEqual(['wrap-up'])
})

test('a trace without step lines draws plan and implement, then every stage write as a plain line under no command', () => {
  const lines = STEPPED.filter(l => !/ ledger step /.test(l))
  const open = eventLog(LEDGER_OPEN, lines.slice(0, 12).join('\n'), t('12:00:00'))
  expect(heads(open)).toEqual([['plan', true, 3600e3], ['implement', true, 360e3]])
  expect(open.entries.filter(e => e.kind === 'stage').map(e => e.kind === 'stage' && e.stage)).toEqual(['merged', 'reviewed', 'documented', 'submitted', 'shipped'])
  expect(open.ahead).toBeNull()
  const closed = eventLog(LEDGER_CLOSED, lines.join('\n'), t('12:00:00'))
  expect(closed.ahead).toEqual('closed')
  expect(heads(closed).map(h => h && h[0])).toEqual(['plan', 'implement'])
  // still in implement: nothing after implement yet, so the commands ahead show
  expect(eventLog(LEDGER_OPEN, lines.slice(0, 3).join('\n'), t('12:00:00')).ahead).toEqual(['review', 'document', 'submit', 'ship', 'wrap-up'])
})

test('a trace parked at merged before its first step line draws no stage line and shows the commands ahead', () => {
  const parked = STEPPED.slice(0, 5)
  const log = eventLog(LEDGER_OPEN, parked.join('\n'), t('10:08:00'))
  expect(log.entries.some(e => e.kind === 'stage')).toBe(false)
  expect(log.ahead).toEqual(['review', 'document', 'submit', 'ship', 'wrap-up'])
})

test('start and end lines carry type, slice, resumed, duration, verdict, ready-to-merge answer, and an outcome', () => {
  const trace = [
    `${at('10:00:00')} 02 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:02:00')} 02 main dispatch-end superdev:implementer i1 completed`,
    `${at('10:03:00')} 02 main dispatch-resume i1 ag1 s1 sm1`,
    `${at('10:04:00')} 02 main dispatch-end superdev:implementer i1 failed`,
    `${at('10:05:00')} 02 main dispatch superdev:slice-reviewer r1 Review s1`,
    `${at('10:06:00')} 02 main verdict r1 fail changes-needed 0 i1`,
    `${at('10:06:00')} 02 main verdict r1 pass approved 0 i1`,
    `${at('10:07:00')} 02 main dispatch-end superdev:slice-reviewer r1 completed`,
    `${at('10:07:01')} 02 main dispatch-end superdev:slice-reviewer r1 denied`,
    `${at('10:08:00')} scope main dispatch superdev:final-reviewer f1 Final s1`,
    `${at('10:09:00')} scope main final-verdict f1 with-fixes 0`,
    `${at('10:09:00')} scope main final-verdict f1 no 0`,
    `${at('10:10:00')} scope main dispatch-end superdev:final-reviewer f1`,
    `${at('10:11:00')} scope main dispatch superdev:slice-reviewer r2 Review s1`,
    `${at('10:12:00')} scope main dispatch-end superdev:slice-reviewer r2 completed`,
  ].join('\n')
  const { entries } = eventLog(LEDGER_OPEN, trace, t('11:00:00'))
  expect(entries.filter(e => e.kind === 'start')).toEqual([
    { kind: 'start', at: t('10:00:00'), type: 'superdev:implementer', slice: '02', isResumed: false },
    { kind: 'start', at: t('10:03:00'), type: 'superdev:implementer', slice: '02', isResumed: true },
    { kind: 'start', at: t('10:05:00'), type: 'superdev:slice-reviewer', slice: '02', isResumed: false },
    { kind: 'start', at: t('10:08:00'), type: 'superdev:final-reviewer', slice: 'scope', isResumed: false },
    { kind: 'start', at: t('10:11:00'), type: 'superdev:slice-reviewer', slice: 'scope', isResumed: false },
  ])
  expect(entries.filter(e => e.kind === 'end')).toEqual([
    { kind: 'end', at: t('10:02:00'), type: 'superdev:implementer', slice: '02', ms: 120e3, outcome: 'completed' },
    { kind: 'end', at: t('10:04:00'), type: 'superdev:implementer', slice: '02', ms: 60e3, outcome: 'failed' },
    { kind: 'end', at: t('10:07:00'), type: 'superdev:slice-reviewer', slice: '02', ms: 120e3, outcome: 'completed', review: { spec: 'fail', quality: 'changes-needed' } },
    { kind: 'end', at: t('10:10:00'), type: 'superdev:final-reviewer', slice: 'scope', ms: 120e3, outcome: '', ready: 'with-fixes' },
    { kind: 'end', at: t('10:12:00'), type: 'superdev:slice-reviewer', slice: 'scope', ms: 60e3, outcome: 'completed' },
  ])
})

test('a run crossing midnight gets a date line before the first line of each new day', () => {
  const trace = [
    `${at('12:00:00', '11')} 02 main dispatch superdev:implementer i1 Build s1`,
    `${at('12:30:00', '11')} 02 main dispatch-end superdev:implementer i1 completed`,
    `${at('12:00:00', '12')} 02 main dispatch superdev:implementer i2 Fix s1`,
    `${at('12:10:00', '12')} 02 main dispatch-end superdev:implementer i2 completed`,
  ].join('\n')
  const kinds = eventLog(LEDGER_OPEN, trace, t('13:00:00', '12')).entries.map(e => e.kind)
  expect(kinds).toEqual(['start', 'end', 'date', 'start', 'end'])
})

test('a missing or empty trace draws nothing; a torn line, a bad time, and an unknown kind are skipped', () => {
  expect(eventLog(LEDGER_OPEN, '', 0)).toEqual({ entries: [], running: 0, ahead: null })
  const trace = [
    `${at('10:00:00')} 02 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:00:30')} 02 main fail-to-pass a..b fail-to-pass control=0,put-back=1`,
    `${at('10:00:40')} 02 main run unit pass`,
    `not-a-time 02 main dispatch-end superdev:implementer i1 completed`,
    `${at('10:01:00')} 02 main dispatch-end superdev:implementer i1 completed`,
    `${at('10:02:00')} 02 ma`,
  ].join('\n')
  expect(eventLog(LEDGER_OPEN, trace, t('11:00:00')).entries.map(e => e.kind)).toEqual(['start', 'end'])
})

test('a slice line of merged or blocked joins the log; other statuses do not', () => {
  const trace = [
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:01:00')} 01 main ledger slice 01 merged a..b`,
    `${at('10:02:00')} 02 main ledger slice 02 blocked`,
  ].join('\n')
  expect(eventLog(LEDGER_OPEN, trace, 0).entries).toEqual([
    { kind: 'slice', at: t('10:01:00'), id: '01', status: 'merged' },
    { kind: 'slice', at: t('10:02:00'), id: '02', status: 'blocked' },
  ])
})

test('reads the ledger and dispatch lines of the shared trace fixture', () => {
  const trace = TRACE_LINES.map((l, i) => `2026-10-11T10:00:${String(i).padStart(2, '0')}.000Z ${l}`).join('\n')
  const log = eventLog(LEDGER_OPEN, trace, t('11:00:00'))
  const kinds = log.entries.map(e => (e.kind === 'command' ? e.name : e.kind === 'slice' ? `${e.id} ${e.status}` : e.kind))
  expect(kinds.filter(k => !['start', 'end'].includes(k))).toEqual(['plan', 'implement', '04 merged', '05 blocked', 'review'])
  expect(log.entries.find(e => e.kind === 'end' && e.type === 'superdev:final-reviewer')).toMatchObject({ ready: 'with-fixes' })
  expect(log.running).toBe(1)
})
