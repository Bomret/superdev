import { test, expect } from 'claude-code/testing'
import { closedAt, eventLog, frontmatter, header, intent, progress, queuedMinors, slices, untrace } from './parse'
import { LEDGER_LINES, LEDGER_QUEUE_LINES, LEDGER_STEP_LINES } from './ledger-fixtures'
import { TRACE_LINES } from './trace-fixtures'

test('a header the ledger lacks reads empty', () => {
  expect(header(LEDGER_LINES.join('\n'), 'PR')).toBe('')
})

test('reads the step of a ledger that carries one', () => {
  expect(header(LEDGER_STEP_LINES.join('\n'), 'Step')).toBe('review')
})

test('reads the Minor queue of a ledger that carries one, and an empty queue otherwise', () => {
  expect(queuedMinors(LEDGER_QUEUE_LINES.join('\n'))).toEqual(['01'])
  expect(queuedMinors(LEDGER_LINES.join('\n'))).toEqual([])
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

test('a trace field decodes every escape, and `-` and undefined decode to the empty string', () => {
  expect(untrace('a\\nb\\rc\\td\\\\e\\u00e9f')).toBe('a\nb\rc\td\\eéf')
  expect(untrace('\\\\n')).toBe('\\n')
  expect(untrace('-')).toBe('')
  expect(untrace(undefined)).toBe('')
})

test('frontmatter of a page with none gives an empty title and the upsert action, and CRLF line ends read like LF', () => {
  expect(frontmatter('# just a body\n')).toEqual({ title: '', action: 'upsert' })
  expect(frontmatter('---\r\ntitle: Page\r\naction: patch\r\n---\r\nbody')).toEqual({ title: 'Page', action: 'patch' })
})

test('a closed stage write with an unparseable time gives no close time', () => {
  expect(closedAt('not-a-time scope main ledger stage set closed\n')).toBeNull()
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
  const kinds = log.entries.map(e => (e.kind === 'command' ? e.name : e.kind === 'commandEnd' ? `end ${e.name}` : e.kind))
  expect(kinds.slice(0, 8)).toEqual(['plan', 'end plan', 'implement', 'slice', 'end implement', 'wait', 'review', 'run'])
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

const ends = (log: ReturnType<typeof eventLog>) => log.entries.filter(e => e.kind === 'commandEnd').map(e => e.kind === 'commandEnd' && [e.name, e.ms, e.isBlocked, e.at])
const seq = (log: ReturnType<typeof eventLog>) => log.entries.map(e => (e.kind === 'command' ? `+${e.name}` : e.kind === 'commandEnd' ? `-${e.name}` : e.kind))

test('step set plan and its step clear draw a plan header and an end line with the duration between them', () => {
  const lines = [`${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:10:00')} scope main ledger step set plan`, `${at('09:40:00')} scope main ledger step clear`]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('12:00:00'))
  expect(seq(log)).toEqual(['+plan', '-plan'])
  expect(heads(log)).toEqual([['plan', true, 1800e3]])
  expect(ends(log)).toEqual([['plan', 1800e3, false, t('09:40:00')]])
  expect(log.entries[0]).toMatchObject({ at: t('09:10:00') })
})

test('a plan with no end draws running with its elapsed time, and implement starting ends it at the stage write', () => {
  const lines = [`${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:10:00')} scope main ledger step set plan`]
  expect(heads(eventLog(LEDGER_OPEN, lines.join('\n'), t('09:30:00')))).toEqual([['plan', false, 1200e3]])
  expect(ends(eventLog(LEDGER_OPEN, lines.join('\n'), t('09:30:00')))).toEqual([])
  const next = [...lines, `${at('09:50:00')} scope main ledger stage set implementing`, `${at('09:50:00')} scope main ledger step set implement`]
  const log = eventLog(LEDGER_OPEN, next.join('\n'), t('10:00:00'))
  expect(seq(log)).toEqual(['+plan', '-plan', '+implement'])
  expect(ends(log)).toEqual([['plan', 2400e3, false, t('09:50:00')]])
})

test('two step set review lines with no end between draw two headers, the first ended at the second start', () => {
  const lines = [`${at('10:00:00')} scope main ledger step set review`, `${at('10:05:00')} scope main ledger step set review`]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('10:06:00'))
  expect(seq(log)).toEqual(['+review', '-review', '+review'])
  expect(heads(log)).toEqual([['review', true, 300e3], ['review', false, 60e3]])
})

test('a step block draws a stopped header and a blocked end line, and a later step set draws a new header', () => {
  const lines = [`${at('10:00:00')} scope main ledger step set review`, `${at('10:05:00')} scope main ledger step block review`, `${at('10:20:00')} scope main ledger step set review`]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('10:21:00'))
  expect(seq(log)).toEqual(['+review', '-review', 'wait', '+review'])
  expect(log.entries[0]).toMatchObject({ kind: 'command', isDone: true, isBlocked: true })
  expect(ends(log)).toEqual([['review', 300e3, true, t('10:05:00')]])
})

test('a step clear or step block with no open command draws no line', () => {
  const lines = [`${at('10:00:00')} scope main ledger step clear`, `${at('10:01:00')} scope main ledger step block review`, `${at('10:02:00')} scope main ledger step set document`, `${at('10:03:00')} scope main ledger step clear`, `${at('10:04:00')} scope main ledger step clear`, `${at('10:05:00')} scope main ledger step block document`]
  expect(seq(eventLog(LEDGER_OPEN, lines.join('\n'), t('10:06:00')))).toEqual(['+document', '-document'])
})

test('a step set implement right after the implementing stage write moves the implement start to the step line', () => {
  const lines = [`${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:30:00')} scope main ledger stage set implementing`, `${at('09:30:30')} scope main ledger step set implement`]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('10:00:00'))
  expect(seq(log)).toEqual(['+plan', '-plan', '+implement'])
  expect(log.entries.filter(e => e.kind === 'command' && e.name === 'implement')).toEqual([expect.objectContaining({ at: t('09:30:30') })])
})

test('an implement run from before the step lines keeps its header when a later resumed run writes step set implement', () => {
  const lines = [
    `${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:30:00')} scope main ledger stage set implementing`,
    `${at('09:31:00')} 01 main ledger slice 01 in-progress`, `${at('10:30:00')} scope main ledger step set implement`,
  ]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('11:00:00'))
  expect(log.entries.filter(e => e.kind === 'command' && e.name === 'implement').map(e => e.at)).toEqual([t('09:30:00'), t('10:30:00')])
})

test('a line drawn into a slice group since the fallback implement header keeps that header when step set implement follows', () => {
  const opened = [`${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:20:00')} 01 main run path pass 6e9 dirty a.js`, `${at('09:30:00')} scope main ledger stage set implementing`]
  const heads = (lines: string[]) => eventLog(LEDGER_OPEN, lines.join('\n'), t('11:00:00')).entries.filter(e => e.kind === 'command' && e.name === 'implement').map(e => e.at)
  // A trace line that only opens the slice's group, and a dispatch drawn inside a group that already sits in the log.
  expect(heads([...opened.slice(0, 1), opened[2]!, `${at('09:31:00')} 02 main edit impl b.js`, `${at('10:30:00')} scope main ledger step set implement`])).toEqual([t('09:30:00'), t('10:30:00')])
  expect(heads([...opened, `${at('09:31:00')} 01 main dispatch superdev:implementer i1 Build s1`, `${at('10:30:00')} scope main ledger step set implement`])).toEqual([t('09:30:00'), t('10:30:00')])
})

test('a plan run from before the step lines keeps its header when a later plan run writes step set plan', () => {
  const lines = [`${at('09:00:00')} scope main ledger init fix/x planned`, `${at('10:00:00')} scope main ledger init fix/x planned`, `${at('10:00:10')} scope main ledger step set plan`]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('11:00:00'))
  expect(log.entries.filter(e => e.kind === 'command').map(e => e.at)).toEqual([t('09:00:00'), t('10:00:10')])
})

test('step clear then stage set merged at one timestamp draw one implement end line', () => {
  const lines = [`${at('10:00:00')} scope main ledger step set implement`, `${at('10:07:00')} scope main ledger step clear`, `${at('10:07:00')} scope main ledger stage set merged`]
  expect(ends(eventLog(LEDGER_OPEN, lines.join('\n'), t('11:00:00')))).toEqual([['implement', 420e3, false, t('10:07:00')]])
})

test('a trace with a plan or implement step line starts that command there, not at the init or the implementing stage', () => {
  const lines = [
    `${at('09:00:00')} scope main ledger init fix/x planned`, `${at('09:10:00')} scope main ledger step set plan`,
    `${at('09:40:00')} scope main ledger step clear`, `${at('10:00:00')} scope main ledger stage set implementing`,
    `${at('10:01:00')} scope main ledger step set implement`, `${at('10:07:00')} scope main ledger step clear`, `${at('10:07:00')} scope main ledger stage set merged`,
  ]
  const log = eventLog(LEDGER_OPEN, lines.join('\n'), t('12:00:00'))
  expect(seq(log)).toEqual(['+plan', '-plan', 'wait', '+implement', '-implement'])
  expect(heads(log)).toEqual([['plan', true, 1800e3], ['implement', true, 360e3]])
})

test('a trace parked at merged before its first step line draws no stage line and shows the commands ahead', () => {
  const parked = STEPPED.slice(0, 5)
  const log = eventLog(LEDGER_OPEN, parked.join('\n'), t('10:08:00'))
  expect(log.entries.some(e => e.kind === 'stage')).toBe(false)
  expect(log.ahead).toEqual(['review', 'document', 'submit', 'ship', 'wrap-up'])
})

test('each dispatch run is one entry at its start time, carrying type, slice, resumed, duration, and an outcome; an older trace\'s verdict lines draw nothing', () => {
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
    `${at('10:13:00')} 03 main dispatch superdev:slice-reviewer r3 Review s1`,
    `${at('10:14:00')} 03 main dispatch-end superdev:slice-reviewer r3 completed`,
    `${at('10:15:00')} 03 main verdict r3 pass changes-needed 0 i1`,
    `${at('10:16:00')} 03 main dispatch superdev:implementer i4 Fix s1`,
  ].join('\n')
  const log = eventLog(LEDGER_OPEN, trace, t('11:00:00'))
  const { running } = log
  const entries = log.entries.flatMap(e => (e.kind === 'slice' ? e.entries : [e]))
  expect(entries.map(e => e.kind)).toEqual(['run', 'run', 'run', 'run', 'run', 'run', 'run'])
  expect(entries).toEqual([
    { kind: 'run', at: t('10:00:00'), type: 'superdev:implementer', slice: '02', isResumed: false, isEnded: true, ms: 120e3, outcome: 'completed' },
    { kind: 'run', at: t('10:03:00'), type: 'superdev:implementer', slice: '02', isResumed: true, isEnded: true, ms: 60e3, outcome: 'failed' },
    { kind: 'run', at: t('10:05:00'), type: 'superdev:slice-reviewer', slice: '02', isResumed: false, isEnded: true, ms: 120e3, outcome: 'completed' },
    { kind: 'run', at: t('10:08:00'), type: 'superdev:final-reviewer', slice: 'scope', isResumed: false, isEnded: true, ms: 120e3, outcome: '' },
    { kind: 'run', at: t('10:11:00'), type: 'superdev:slice-reviewer', slice: 'scope', isResumed: false, isEnded: true, ms: 60e3, outcome: 'completed' },
    { kind: 'run', at: t('10:13:00'), type: 'superdev:slice-reviewer', slice: '03', isResumed: false, isEnded: true, ms: 60e3, outcome: 'completed' },
    { kind: 'run', at: t('10:16:00'), type: 'superdev:implementer', slice: '03', isResumed: false, isEnded: false, ms: t('11:00:00') - t('10:16:00'), outcome: '' },
  ])
  expect(running).toBe(1)
})

test('a run crossing midnight gets a date line before the first line of each new day', () => {
  const trace = [
    `${at('12:00:00', '11')} scope main dispatch superdev:implementer i1 Build s1`,
    `${at('12:30:00', '11')} scope main dispatch-end superdev:implementer i1 completed`,
    `${at('12:00:00', '12')} scope main dispatch superdev:implementer i2 Fix s1`,
    `${at('12:10:00', '12')} scope main dispatch-end superdev:implementer i2 completed`,
  ].join('\n')
  const kinds = eventLog(LEDGER_OPEN, trace, t('13:00:00', '12')).entries.map(e => e.kind)
  expect(kinds).toEqual(['run', 'date', 'run'])
})

test('a missing or empty trace draws nothing; a torn line, a bad time, and an unknown kind are skipped', () => {
  expect(eventLog(LEDGER_OPEN, '', 0)).toEqual({ entries: [], running: 0, ahead: null })
  const trace = [
    `${at('10:00:00')} scope main dispatch superdev:implementer i1 Build s1`,
    `${at('10:00:30')} scope main fail-to-pass a..b fail-to-pass control=0,put-back=1`,
    `${at('10:00:40')} scope main run unit pass`,
    `not-a-time scope main dispatch-end superdev:implementer i1 completed`,
    `${at('10:01:00')} scope main dispatch-end superdev:implementer i1 completed`,
    `${at('10:02:00')} scope ma`,
  ].join('\n')
  expect(eventLog(LEDGER_OPEN, trace, t('11:00:00')).entries.map(e => e.kind)).toEqual(['run'])
})

// --- slice groups (ADR 0141) ---

const SLICES = '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | Draw tiles | behavior | — | merged | — |\n| 02 | #2 | Draw map | behavior | — | merged | — |\n| 03 | #3 | Never ran | behavior | — | todo | — |\n'
const logOf = (trace: string[], now = t('12:00:00')) => eventLog(LEDGER_OPEN + SLICES, trace.join('\n'), now)
type Group = Extract<ReturnType<typeof eventLog>['entries'][number], { kind: 'slice' }>
const groups = (trace: string[], now?: number) => logOf(trace, now).entries.filter((e): e is Group => e.kind === 'slice')
const none = { fail: 0, pass: 0 }

test('an inline-tier slice draws one closed group at its start, with its status, duration, no review count, and its summary inside', () => {
  const log = logOf([
    `${at('09:59:00')} scope main ledger stage set implementing`,
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:01:00')} 01 main run path fail 6e9 dirty a.js`,
    `${at('10:02:00')} 01 main run path pass 6e9 dirty a.js`,
    `${at('10:02:30')} 01 main run path unknown 6e9 dirty a.js`,
    `${at('10:03:00')} 01 main run focused pass 6e9 clean -`,
    `${at('10:03:30')} 01 main run whole fail 6e9 clean -`,
    `${at('10:04:00')} 01 main fail-to-pass a..b fail-to-pass control=0,put-back=1`,
    `${at('10:05:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(log.entries.map(e => e.kind)).toEqual(['command', 'slice'])
  expect(log.entries[1]).toEqual({
    kind: 'slice', at: t('10:00:00'), id: '01', title: 'Draw tiles', status: 'merged', ms: 300e3, isRunning: false, review: 0, isOpenByDefault: false,
    entries: [{ kind: 'sliceSummary', at: t('10:05:00'), id: '01', path: { fail: 1, pass: 1 }, suite: { fail: 1, pass: 1 }, review: 0, f2p: 'fail-to-pass' }],
  })
})

test('a merged slice with four review rounds draws review ×4 and holds its runs and summary', () => {
  const round = (n: number, m: number, verdict: string) => [
    `${at(`10:${m}:00`)} 01 main dispatch superdev:slice-reviewer r${n} Review s1`,
    `${at(`10:${m}:10`)} 01 main verdict r${n} ${verdict} 0 i1`,
    `${at(`10:${m}:20`)} 01 main dispatch-end superdev:slice-reviewer r${n} completed`,
  ]
  const [g] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    ...round(1, 10, 'fail changes-needed'), ...round(2, 11, 'pass changes-needed'), ...round(3, 12, 'pass changes-needed'), ...round(4, 13, 'pass approved'),
    `${at('10:30:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(g).toMatchObject({ status: 'merged', review: 4, ms: 1800e3, isOpenByDefault: false })
  expect(g?.entries.map(e => e.kind)).toEqual(['run', 'run', 'run', 'run', 'sliceSummary'])
})

test('a slice blocked then merged draws one group: the blocked end line and both summaries inside, its header merged from the first start to the last end', () => {
  const log = logOf([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:01:00')} 01 main run path fail 6e9 dirty a.js`,
    `${at('10:02:00')} 01 main ledger slice 01 blocked`,
    `${at('10:10:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:11:00')} 01 main run path pass 6e9 dirty a.js`,
    `${at('10:15:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(log.entries.map(e => e.kind)).toEqual(['slice'])
  const [g] = log.entries as Group[]
  expect(g).toMatchObject({ status: 'merged', ms: 900e3 })
  expect(g?.entries).toEqual([
    { kind: 'sliceEnd', at: t('10:02:00'), status: 'blocked', ms: 120e3 },
    { kind: 'sliceSummary', at: t('10:02:00'), id: '01', path: { fail: 1, pass: 0 }, suite: none, review: 0, f2p: '' },
    { kind: 'sliceSummary', at: t('10:15:00'), id: '01', path: { fail: 0, pass: 1 }, suite: none, review: 0, f2p: '' },
  ])
})

test('a slice blocked then merged with no start between keeps the blocked end line, and its header runs to the merge', () => {
  const [g] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:02:00')} 01 main ledger slice 01 blocked`,
    `${at('10:05:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(g).toMatchObject({ status: 'merged', ms: 300e3 })
  expect(g?.entries).toEqual([{ kind: 'sliceEnd', at: t('10:02:00'), status: 'blocked', ms: 120e3 }])
})

test('a blocked slice starts open with ✗ status; a running slice starts open with its elapsed time to now', () => {
  const [blocked, running] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:02:00')} 01 main ledger slice 01 blocked`,
    `${at('10:03:00')} 02 main ledger slice 02 in-progress`,
  ], t('10:13:00'))
  expect(blocked).toMatchObject({ status: 'blocked', ms: 120e3, isRunning: false, isOpenByDefault: true })
  expect(running).toMatchObject({ status: 'in-progress', ms: 600e3, isRunning: true, isOpenByDefault: true })
})

test('a dispatch naming a slice after its merge, under a later command, draws inside that slice group, and the flat log keeps the rest', () => {
  const log = logOf([
    `${at('10:00:00')} scope main ledger step set implement`,
    `${at('10:01:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:02:00')} 01 main ledger slice 01 merged a..b`,
    `${at('10:03:00')} scope main ledger step set review`,
    `${at('10:04:00')} scope main dispatch superdev:final-reviewer f1 Final s1`,
    `${at('10:05:00')} 01 main dispatch superdev:implementer i1 Fix s1`,
    `${at('10:06:00')} 01 main dispatch-end superdev:implementer i1 completed`,
    `${at('10:07:00')} 01 main dispatch superdev:slice-reviewer r1 Review s1`,
    `${at('10:07:30')} 01 main dispatch-end superdev:slice-reviewer r1 completed`,
  ])
  expect(log.entries.map(e => e.kind)).toEqual(['command', 'slice', 'commandEnd', 'command', 'run'])
  const g = log.entries[1] as Group
  expect(g.entries.map(e => e.kind === 'run' && e.type)).toEqual(['superdev:implementer', 'superdev:slice-reviewer'])
  expect(g).toMatchObject({ status: 'merged', ms: 60e3, review: 1 })
})

test('two slices in progress at once draw two groups, each holding only its own lines', () => {
  const [one, two] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:00:10')} 02 main ledger slice 02 in-progress`,
    `${at('10:00:20')} 01 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:00:30')} 02 main dispatch superdev:implementer i2 Build s1`,
    `${at('10:01:00')} 01 main run path fail 6e9 dirty a.js`,
    `${at('10:01:10')} 02 main run full pass 6e9 clean -`,
    `${at('10:01:20')} scope main run full pass 6e9 clean -`,
    `${at('10:02:00')} 01 main ledger slice 01 merged a..b`,
    `${at('10:03:00')} 02 main ledger slice 02 merged a..b`,
  ])
  expect(one?.entries.map(e => (e.kind === 'run' ? e.slice : e.kind === 'sliceSummary' ? `${e.id} ${e.path.fail}${e.suite.pass}` : e.kind))).toEqual(['01', '01 10'])
  expect(two?.entries.map(e => (e.kind === 'run' ? e.slice : e.kind === 'sliceSummary' ? `${e.id} ${e.path.fail}${e.suite.pass}` : e.kind))).toEqual(['02', '02 01'])
})

test('a slice with dispatch lines and no in-progress line draws a group at its first line, with no status and no duration; a slice the trace never names draws none', () => {
  const log = logOf([
    `${at('10:00:00')} 02 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:01:00')} 02 main dispatch-end superdev:implementer i1 completed`,
  ])
  expect(log.entries).toEqual([{
    kind: 'slice', at: t('10:00:00'), id: '02', title: 'Draw map', status: '', isRunning: false, review: 0, isOpenByDefault: true,
    entries: [{ kind: 'run', at: t('10:00:00'), type: 'superdev:implementer', slice: '02', isResumed: false, isEnded: true, ms: 60e3, outcome: 'completed' }],
  }])
})

test('a merged group holding a run with no end starts open; in-review shows no status and no duration', () => {
  const [merged, reviewing] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:00:10')} 01 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:01:00')} 01 main ledger slice 01 merged a..b`,
    `${at('10:02:00')} 02 main ledger slice 02 in-progress`,
    `${at('10:03:00')} 02 main ledger slice 02 in-review`,
  ])
  expect(merged).toMatchObject({ status: 'merged', isOpenByDefault: true })
  expect(reviewing).toMatchObject({ status: 'in-review', isRunning: false, isOpenByDefault: true })
  expect(reviewing?.ms).toBeUndefined()
})

test('a merged with no start draws a group with no duration; a second merged changes nothing', () => {
  const [g] = groups([
    `${at('10:03:00')} 02 main ledger slice 02 merged a..b`,
    `${at('10:04:00')} 02 main ledger slice 02 merged a..b`,
  ])
  expect(g).toMatchObject({ at: t('10:03:00'), status: 'merged', entries: [] })
  expect(g?.ms).toBeUndefined()
})

test('a day change inside a group draws a date line inside it, and the flat log draws none for a day whose lines all moved into groups', () => {
  const log = eventLog(LEDGER_OPEN + SLICES, [
    `${at('11:00:00', '11')} scope main ledger step set implement`,
    `${at('11:10:00', '11')} 01 main ledger slice 01 in-progress`,
    `${at('11:20:00', '11')} 01 main dispatch superdev:implementer i1 Build s1`,
    `${at('11:50:00', '11')} 01 main dispatch-end superdev:implementer i1 completed`,
    `${at('12:20:00', '12')} 01 main dispatch superdev:implementer i2 Fix s1`,
    `${at('12:30:00', '12')} 01 main dispatch-end superdev:implementer i2 completed`,
  ].join('\n'), t('13:00:00', '12'))
  expect(log.entries.map(e => e.kind)).toEqual(['command', 'slice'])
  expect((log.entries[1] as Group).entries.map(e => e.kind)).toEqual(['run', 'date', 'run'])
})

test('a group whose first line falls on a later day than its header opens with a date line', () => {
  const [g] = groups([
    `${at('11:10:00', '11')} 01 main ledger slice 01 in-progress`,
    `${at('12:20:00', '12')} 01 main dispatch superdev:implementer i1 Build s1`,
  ], t('13:00:00', '12'))
  expect(g?.entries.map(e => e.kind)).toEqual(['date', 'run'])
})

test('the flat log dates a group by where it sits, not by its later in-progress header time', () => {
  const log = eventLog(LEDGER_OPEN + SLICES, [
    `${at('11:00:00', '11')} scope main ledger step set implement`,
    `${at('11:10:00', '11')} 01 main run path fail 6e9 dirty a.js`,
    `${at('11:20:00', '11')} scope main dispatch superdev:final-reviewer f1 Final\\x20review s1`,
    `${at('12:10:00', '12')} 01 main ledger slice 01 in-progress`,
  ].join('\n'), t('13:00:00', '12'))
  expect(log.entries.map(e => e.kind)).toEqual(['command', 'slice', 'run'])
})

test('reviews count across every stretch; a resumed reviewer counts once; a failed or denied reviewer counts none', () => {
  const [g] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:01:00')} 01 main dispatch superdev:slice-reviewer r1 Review s1`,
    `${at('10:01:10')} 01 main dispatch-end superdev:slice-reviewer r1 completed`,
    `${at('10:02:00')} 01 main dispatch-resume r1`,
    `${at('10:02:10')} 01 main dispatch-end superdev:slice-reviewer r1 completed`,
    `${at('10:02:20')} 01 main ledger slice 01 blocked`,
    `${at('10:03:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:03:10')} 01 main dispatch superdev:slice-reviewer r2 Review s1`,
    `${at('10:03:20')} 01 main dispatch-end superdev:slice-reviewer r2`,
    `${at('10:03:30')} 01 main dispatch superdev:slice-reviewer r3 Review s1`,
    `${at('10:03:40')} 01 main dispatch-end superdev:slice-reviewer r3 failed`,
    `${at('10:03:50')} 01 main dispatch superdev:slice-reviewer r4 Review s1`,
    `${at('10:03:55')} 01 main dispatch-end superdev:slice-reviewer r4 denied`,
    `${at('10:04:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(g?.review).toBe(2)
})

test('a slice with only unknown runs and no fail-to-pass holds no summary line', () => {
  const [g] = groups([
    `${at('10:00:00')} 01 main ledger slice 01 in-progress`,
    `${at('10:01:00')} 01 main run path unknown 6e9 dirty a.js`,
    `${at('10:02:00')} 01 main fail-to-pass a..b unknown control=1`,
    `${at('10:03:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(g?.entries).toEqual([])
})

test('a slice in progress with no end counts as running, and in-review leaves the count', () => {
  const lines = [`${at('10:00:00')} 01 main ledger slice 01 in-progress`, `${at('10:00:10')} 02 main ledger slice 02 in-progress`]
  expect(logOf(lines, t('11:00:00')).running).toBe(2)
  const reviewed = [...lines, `${at('10:01:00')} 02 main ledger slice 02 in-review`]
  const log = logOf(reviewed, t('11:00:00'))
  expect(log.running).toBe(2)
  expect(log.entries.map(e => e.kind)).toEqual(['slice', 'slice'])
  expect(logOf([...reviewed, `${at('10:02:00')} 02 main ledger slice 02 merged a..b`], t('11:00:00')).running).toBe(1)
})

test('a run line before any start counts into the stretch the merge ends, and a verdict line counts for nothing', () => {
  const [g] = groups([
    `${at('10:00:00')} 01 main run path pass 6e9 dirty a.js`,
    `${at('10:00:10')} 01 main dispatch superdev:slice-reviewer r1 Review s1`,
    `${at('10:00:20')} 01 main verdict r1 pass approved 0 i1`,
    `${at('10:01:00')} 01 main ledger slice 01 merged a..b`,
  ])
  expect(g).toMatchObject({ at: t('10:00:00'), status: 'merged' })
  expect(g?.entries.at(-1)).toMatchObject({ kind: 'sliceSummary', path: { fail: 0, pass: 1 }, review: 0 })
})

test('reads the ledger and dispatch lines of the shared trace fixture', () => {
  const trace = TRACE_LINES.map((l, i) => `2026-10-11T10:00:${String(i).padStart(2, '0')}.000Z ${l}`).join('\n')
  const log = eventLog(LEDGER_OPEN, trace, t('11:00:00'))
  const kinds = log.entries.map(e => (e.kind === 'command' ? e.name : e.kind === 'slice' ? `${e.id} ${e.status}` : e.kind))
  expect(kinds.filter(k => k !== 'run')).toEqual(['plan', 'commandEnd', 'implement', '04 merged', '05 blocked', 'commandEnd', 'review', 'commandEnd'])
  expect(log.entries.at(-1)).toMatchObject({ kind: 'commandEnd', name: 'review', isBlocked: true })
  expect(log.entries.filter(e => e.kind === 'run' && e.type === 'superdev:final-reviewer').map(e => e.kind === 'run' && e.isResumed)).toEqual([false, true])
  const runs = log.entries.flatMap(e => (e.kind === 'slice' ? e.entries : [e])).filter(e => e.kind === 'run')
  expect(runs.map(e => e.kind === 'run' && [e.type, e.slice, e.isResumed, e.isEnded])).toEqual([
    ['superdev:implementer', '04', false, true], ['superdev:implementer', '04', true, true], ['superdev:slice-reviewer', '04', false, true],
    ['superdev:implementer', '05', false, false], ['superdev:final-reviewer', 'scope', false, true], ['superdev:final-reviewer', 'scope', true, true],
  ])
  expect(log.entries.filter(e => e.kind === 'slice').map(e => e.kind === 'slice' && [e.id, e.review, e.isOpenByDefault])).toEqual([['04', 1, false], ['05', 0, true]])
  expect(log.running).toBe(1)
  const sum = log.entries.flatMap(e => (e.kind === 'slice' && e.id === '04' ? e.entries : [])).find(e => e.kind === 'sliceSummary')
  expect(sum).toMatchObject({ suite: { fail: 0, pass: 1 } })
})
