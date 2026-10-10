import { test, expect } from 'claude-code/testing'

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

test('clicking an active scope shows its agents, back returns', async ($, on) => {
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
    await ui.press({ key: 'scope-pin' })
    expect(await ui.find({ type: 'Text', text: /^DoD 0\/0 · 1 live$/ })).toBeDefined()
    expect(await ui.find({ type: 'Client', key: 'card-tu1' })).toBeDefined()
    expect(await ui.find({ type: 'Box', key: 'card-tu2' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /afk-blocks|kb-backup/ })).toBeUndefined()
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a rescan with nothing changed writes no snapshot, so the pane does not redraw', async ($, on) => {
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
    const f = FILES[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('fs.stat', async () => ({ deny: 'ENOENT' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  const run = () => $.command.run({ command: 'superdev-view', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  await run()
  await run()
  expect(writes).toBe(1)
})
