import { test, expect } from 'claude-code/testing'
import { register } from './register'
import { R as ROOT, dir as d, fakeRepo, ledger, runCommand, PANE as P, scopeLink } from './testkit'

const R = '/r/.superdev'
const S = `${R}/scopes/pin`
const FILES: Record<string, string> = {
  [`${S}/ledger.md`]: '**Stage:** implementing\n**Branch:** fix/pin\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | Pin it | behavior | — | in-progress | — |\n',
  [`${S}/trace.log`]: [
    '2026-01-01T00:00:00Z 01 main dispatch superdev:implementer tu1 Build',
    '2026-01-01T00:00:01Z 01 main dispatch superdev:slice-reviewer tu2 Review',
    '2026-01-01T00:00:02Z 01 main dispatch-end superdev:slice-reviewer tu2',
  ].join('\n'),
}
const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
const file = (name: string) => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })
const LISTS: Record<string, (ReturnType<typeof dir> | ReturnType<typeof file>)[]> = { [R]: [dir('scopes'), file('afk-blocks'), dir('kb-backup')], [`${R}/scopes`]: [dir('pin')], [S]: [] }
const PANE = {
  component: 'Pane', requestId: 'superdev-view',
  props: { title: 'superdev', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('clicking an active scope shows its log, back returns', async ($, on) => {
  on('session.cwd', async () => ({ value: '/r' }))
  on('env.get', async () => ({ value: undefined }))
  on('process.run', async () => ({ value: { exitCode: 0, stdout: '/r/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.exists', async (_$, e) => ({ value: e.path === R }))
  on('fs.list', async (_$, e) => {
    const l = LISTS[e.path]
    return l ? { value: l } : { deny: 'ENOENT' }
  })
  on('fs.read', async (_$, e) => {
    const f = FILES[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('fs.stat', async () => ({ deny: 'ENOENT' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  await $.command.run({ command: 'superdev-view', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    await ui.press(scopeLink('pin'))
    expect(await ui.find({ type: 'Text', text: /^DoD 0\/0$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^● 1 running$/ })).toBeDefined()
    expect(await ui.find({ type: 'Box', key: 'log' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /afk-blocks|kb-backup/ })).toBeUndefined()
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    await ui.unmount()
  }
})

// A run with no end draws its elapsed time, which a rescan advances, so this trace ends every run.
test('a rescan with nothing changed writes no snapshot, so the pane does not redraw', async ($, on) => {
  const files = { ...FILES, [`${S}/trace.log`]: `${FILES[`${S}/trace.log`]}\n2026-01-01T00:00:03Z 01 main dispatch-end superdev:implementer tu1 completed` }
  let writes = 0
  on('state.set', async ($, e, next) => {
    if (e.key === 'snapshot') writes++
    return next(e)
  })
  on('session.cwd', async () => ({ value: '/r' }))
  on('env.get', async () => ({ value: undefined }))
  on('process.run', async () => ({ value: { exitCode: 0, stdout: '/r/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.exists', async (_$, e) => ({ value: e.path === R }))
  on('fs.list', async (_$, e) => {
    const l = LISTS[e.path]
    return l ? { value: l } : { deny: 'ENOENT' }
  })
  on('fs.read', async (_$, e) => {
    const f = files[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('fs.stat', async () => ({ deny: 'ENOENT' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  const run = () => $.command.run({ command: 'superdev-view', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  await run()
  await run()
  expect(writes).toBe(1)
})

test('the mod registers no hook on a subagent spawn, a tool call, a model step, or a turn end (INV-0135)', async () => {
  const events: string[] = []
  register(((event: string) => { events.push(event) }) as never)
  expect(events.filter(e => ['agent.spawn', 'tool.call', 'turn.step', 'turn.complete', 'ui.message'].includes(e))).toEqual([])
  expect(events).toContain('ui.render')
})

const repo = () => ({
  files: { [`${ROOT}/scopes/a/ledger.md`]: ledger('implementing', [['01', 'in-progress']]), [`${ROOT}/scopes/b/ledger.md`]: ledger('implementing', [['01', 'in-progress']]) } as Record<string, string>,
  lists: { [ROOT]: [d('scopes')], [`${ROOT}/scopes`]: [d('a'), d('b')], [`${ROOT}/scopes/a`]: [], [`${ROOT}/scopes/b`]: [] } as Record<string, ReturnType<typeof d>[]>,
})
const A = `${ROOT}/scopes/a`

test('a session started inside a scopetree shows the main working tree', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists, `${A}/scopetree`)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^~$/ })).toBeDefined()
})

test('a scan whose scopes read fails keeps the scopes the last scan stored', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  let stored: { scopes?: { name: string }[] | null } | null = null
  on('state.set', async (_$, e, next) => {
    if (e.key === 'snapshot') stored = e.value as typeof stored
    return next(e)
  })
  await $.command.run(runCommand)
  delete lists[`${ROOT}/scopes`]
  await $.command.run(runCommand)
  await clock.settle()
  expect(stored!.scopes?.map(s => s.name)).toEqual(['a', 'b'])
})

test('a held run lock draws its age on the overview row and on the scope page', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists, '/r', undefined, { [`${A}/run.lock`]: Date.now() - 5 * 60e3 })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ type: 'Text', text: /1 slices · DoD 0\/0 · 0 running · lock 5m/ })).toBeDefined()
  await ui.press(scopeLink('b'))
  expect(await ui.find({ type: 'Text', text: /· lock / })).toBeUndefined()
  await ui.press({ key: 'back' })
  await ui.press(scopeLink('a'))
  expect(await ui.find({ type: 'Text', text: /^DoD 0\/0 · lock 5m$/ })).toBeDefined()
})

for (const [what, ms, drawn] of [['under a minute draws in seconds', 30e3, '(30|31)s'], ['over an hour draws in hours', 2 * 3600e3, '2h']] as const) {
  test(`a lock age ${what}`, async ($, on) => {
    const { files, lists } = repo()
    fakeRepo(on, files, lists, '/r', undefined, { [`${A}/run.lock`]: Date.now() - ms })
    await $.command.run(runCommand)
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
    await ui.press(scopeLink('a'))
    expect(await ui.find({ type: 'Text', text: new RegExp(`^DoD 0/0 · lock ${drawn}$`) })).toBeDefined()
  })
}

test('no .superdev folder draws the error with the root', async ($, on) => {
  fakeRepo(on, {}, {}, '/r', undefined, {}, false)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ type: 'Text', text: /^no \.superdev folder \(~\/\.superdev\)$/ })).toBeDefined()
})

test('a session start scans, so the pane then draws the scopes', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  const registered: string[] = []
  on('command.register', async (_$, e) => { registered.push(e.name); return { value: undefined as never } })
  on('session.start', async () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r' } as never)
  await clock.settle()
  expect(registered).toEqual(['superdev-view'])
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
})

test('a render before the first scan draws the scanning note', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ type: 'Text', text: /^Scanning \.superdev…$/ })).toBeDefined()
})
