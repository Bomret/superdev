import { expect } from 'claude-code/testing'
import { register } from './register'
import { R as ROOT, dir as d, fakeRepo, ledger, runCommand, PANE as P, scopeLink, test } from './testkit'

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
  on('process.run', async (_$, e) => ({ value: { exitCode: e.argv.includes('--git-common-dir') ? 0 : 1, stdout: '/r/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.exists', async (_$, e) => ({ value: e.path === R }))
  on('fs.list', async (_$, e) => {
    const l = LISTS[e.path]
    return l ? { value: l } : { deny: 'ENOENT' }
  })
  on('fs.read', async (_$, e) => {
    const f = FILES[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  // A run lock touched now: the never-ended implementer reads `running`, not `lock stale`.
  on('fs.stat', async (_$, e) => (e.path === `${S}/run.lock` ? { value: { mtimeMs: Date.now() } as never } : { deny: 'ENOENT' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  await $.command.run({ command: 'superdev-view', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    await ui.press(scopeLink('pin'))
    expect(await ui.find({ type: 'Text', text: /^DoD 0\/0 · lock \d+s$/ })).toBeDefined()
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
  const files: Record<string, string> = { ...FILES, [`${S}/trace.log`]: `${FILES[`${S}/trace.log`]}\n2026-01-01T00:00:03Z 01 main dispatch-end superdev:implementer tu1 completed` }
  let writes = 0
  on('state.set', async ($, e, next) => {
    if (e.key === 'snapshot') writes++
    return next(e)
  })
  on('session.cwd', async () => ({ value: '/r' }))
  on('env.get', async () => ({ value: undefined }))
  on('process.run', async (_$, e) => ({ value: { exitCode: e.argv.includes('--git-common-dir') ? 0 : 1, stdout: '/r/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
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
  register(((event: string) => { events.push(event) }) as never, {} as never)
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

test('a .superdev listing denied after the existence check keeps the last snapshot, and the next good scan updates it', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  on('command.register', async () => ({ value: undefined as never }))
  on('session.start', async () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r' } as never)
  await clock.settle()
  const top = lists[ROOT]!
  delete lists[ROOT]
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
  lists[ROOT] = top
  lists[`${ROOT}/scopes`] = [d('a'), d('b'), d('c')]
  files[`${ROOT}/scopes/c/ledger.md`] = ledger('implementing', [['01', 'todo']])
  lists[`${ROOT}/scopes/c`] = []
  await clock.advance(3000)
  await ui.redraw()
  expect(await ui.find({ key: 'scope-c' })).toBeDefined()
})

// A gate on the scans: each scan's existence check of the root waits on the gate the test holds, and the test counts the
// scans that started.
const gated = () => {
  let started = 0
  const gates: (() => void)[] = []
  const hold = async (path: string) => {
    if (path !== ROOT) return
    started++
    await new Promise<void>(open => gates.push(open))
  }
  return { hold, started: () => started, open: () => gates.shift()?.() }
}

test('scan requests while a scan runs start exactly one more scan, once the running one ends', async ($, on) => {
  const { files, lists } = repo()
  const g = gated()
  const clock = fakeRepo(on, files, lists, '/r', g.hold)
  const first = $.command.run(runCommand)
  await clock.settle()
  expect(g.started()).toBe(1)
  const second = $.command.run(runCommand)
  const third = $.command.run(runCommand)
  await clock.settle()
  expect(g.started()).toBe(1)
  g.open()
  await first
  await clock.settle()
  expect(g.started()).toBe(2)
  g.open()
  await Promise.all([second, third])
  await clock.settle()
  expect(g.started()).toBe(2)
})

test('the command resolves only after a scan that started after its request has finished', async ($, on) => {
  const { files, lists } = repo()
  const g = gated()
  const clock = fakeRepo(on, files, lists, '/r', g.hold)
  void $.command.run(runCommand)
  await clock.settle()
  let isDone = false
  const second = $.command.run(runCommand).then(() => { isDone = true })
  g.open()
  await clock.settle()
  expect(isDone).toBe(false)
  g.open()
  await second
  expect(g.started()).toBe(2)
})

test('a scope press during a held scan shows that scope from a scan that started after the press', async ($, on) => {
  const { files, lists } = repo()
  const g = gated()
  const clock = fakeRepo(on, files, lists, '/r', g.hold)
  const first = $.command.run(runCommand)
  await clock.settle()
  g.open()
  await first
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  const held = $.command.run(runCommand)
  await clock.settle()
  files[`${A}/ledger.md`] = ledger('implementing', [['01', 'in-progress'], ['02', 'todo']])
  let isPressed = false
  const press = ui.press(scopeLink('a')).then(() => { isPressed = true })
  await clock.settle()
  g.open()
  await held
  await clock.settle()
  expect(isPressed).toBe(false)
  expect(g.started()).toBe(3)
  g.open()
  await press
  await ui.redraw()
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^DoD 0\/0/ })).toBeDefined()
})

for (const step of ['session.cwd', 'fs.exists', 'process.run', 'fs.list'] as const)
  test(`a scan whose ${step} fails releases the single flight and runs the queued follow-up`, async ($, on) => {
    const { files, lists } = repo()
    const failing = new Set<string>([step])
    const clock = fakeRepo(on, files, lists, '/r', undefined, {}, true, failing)
    await $.command.run(runCommand)
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
    if (step !== 'process.run') expect(await ui.find({ type: 'Text', text: /^Scanning \.superdev…$/ })).toBeDefined()
    failing.clear()
    await $.command.run(runCommand)
    await clock.settle()
    await ui.redraw()
    expect(await ui.find({ key: 'scope-a' })).toBeDefined()
  })

// --- the main working tree and the session checkout ---

const SUB = '/r/sub/.superdev'
test('a session in a submodule reads the submodule checkout, which its git directory\'s core.worktree names', async ($, on) => {
  // The folder's own entry in `files` makes it exist; the fixture's own root, /r/.superdev, does not.
  const files: Record<string, string> = { [SUB]: '', [`${SUB}/scopes/s/ledger.md`]: ledger('implementing', [['01', 'todo']]) }
  const lists: Record<string, ReturnType<typeof d>[]> = { [SUB]: [d('scopes')], [`${SUB}/scopes`]: [d('s')], [`${SUB}/scopes/s`]: [] }
  fakeRepo(on, files, lists, '/r/sub', undefined, {}, false, new Set(), { commonDir: '/r/.git/modules/sub', worktree: '../../../sub' })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ key: 'scope-s' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^~\/sub$/ })).toBeDefined()
})

// Git on Windows prints the shared git directory with its drive, `C:/Users/x/.git`. The kit's file calls answer a
// drive path as absent, so the notice names the root the scan looked in.
test('a git directory with a drive letter reads the main tree under that drive, with no leading slash', async ($, on) => {
  fakeRepo(on, {}, {}, 'C:/Users/x', undefined, {}, false, new Set(), { commonDir: 'C:/Users/x/.git' })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  expect(await ui.find({ type: 'Text', text: 'no .superdev folder (C:/Users/x/.superdev)' })).toBeDefined()
})

// A main tree at /r with a draft `m`, a draft `both`, and a sketch `ms`; a linked worktree at /w.
const W = '/w/.superdev'
const twoTrees = (main: { design?: boolean; drafts?: boolean } = {}) => {
  const files: Record<string, string> = {
    [`${ROOT}/dod-draft-m.md`]: '- [ ] a\n',
    [`${ROOT}/dod-draft-both.md`]: '- [ ] a\n',
    [W]: '',
    [`${W}/dod-draft-x.md`]: '- [ ] a\n- [ ] b\n',
    [`${W}/dod-draft-both.md`]: '- [ ] a\n- [ ] b\n- [ ] c\n',
  }
  const top = [...(main.drafts === false ? [] : [d('dod-draft-m.md'), d('dod-draft-both.md')].map(e => ({ ...e, kind: 'file' as const }))), ...(main.design === false ? [] : [d('design')])]
  const lists: Record<string, ReturnType<typeof d>[]> = {
    [ROOT]: top as ReturnType<typeof d>[],
    [`${ROOT}/design`]: [{ ...d('ms.html'), kind: 'file' as never }],
    [W]: [{ ...d('dod-draft-x.md'), kind: 'file' as never }, { ...d('dod-draft-both.md'), kind: 'file' as never }, d('design')],
    [`${W}/design`]: [{ ...d('y.html'), kind: 'file' as never }],
  }
  if (main.drafts === false) { delete files[`${ROOT}/dod-draft-m.md`]; delete files[`${ROOT}/dod-draft-both.md`] }
  return { files, lists }
}
const cards = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
  for (const key of ['section-design', 'section-drafts']) if (await ui.find({ key })) await ui.press({ key })
  const drafts = (await ui.findAll({ type: 'Box' })).map(b => b.key).filter((k): k is string => !!k && /^draft-.+-row$/.test(k))
  const counts = await Promise.all(drafts.map(async k => (await ui.find({ key: k.replace(/-row$/, '-value') }))?.text))
  const designs = (await ui.findAll({ type: 'Box' })).map(b => b.key).filter((k): k is string => !!k && /^design-.+-row$/.test(k))
  await ui.unmount()
  return { drafts: drafts.map((k, n) => `${k.replace(/^draft-|-row$/g, '')} ${counts[n]}`), designs: designs.map(k => k.replace(/^design-|-row$/g, '')) }
}

test("a session in a linked worktree lists that checkout's drafts and sketches beside the main tree's, its copy winning a shared slug", async ($, on) => {
  const { files, lists } = twoTrees()
  fakeRepo(on, files, lists, '/w', undefined, {}, true, new Set(), { toplevel: '/w' })
  await $.command.run(runCommand)
  const got = await cards($)
  expect([...got.drafts].sort()).toEqual(['both 3 criteria', 'm 1 criteria', 'x 2 criteria'])
  expect([...got.designs].sort()).toEqual(['ms', 'y'])
})

const MAIN_ONLY = { drafts: ['both 1 criteria', 'm 1 criteria'], designs: ['ms'] }
const sorted = (got: { drafts: string[]; designs: string[] }) => ({ drafts: [...got.drafts].sort(), designs: [...got.designs].sort() })
for (const [what, cwd, git, change] of [
  ['a session in the main tree', '/r', { toplevel: '/r' }, undefined],
  ['a main tree spelled with a trailing slash', '/r', { toplevel: '/r/' }, undefined],
  ['a main tree reached through a symlink', '/link', { toplevel: '/link', realPaths: { '/link': '/r', '/r': '/r' } }, undefined],
  ['a linked worktree with no .superdev', '/w', { toplevel: '/w' }, 'absent'],
  ['a linked worktree whose .superdev cannot be listed', '/w', { toplevel: '/w' }, 'unlisted'],
  ['a failing --show-toplevel', '/w', {}, undefined],
] as const)
  test(`${what} lists the main tree's drafts and sketches only, each once`, async ($, on) => {
    const { files, lists } = twoTrees()
    if (change === 'absent') delete files[W]
    if (change === 'unlisted') delete lists[W]
    // Through the symlink's spelling the folder lists a draft `z`, which a second read of the main tree would show.
    files['/link/.superdev'] = ''
    files['/link/.superdev/dod-draft-z.md'] = '- [ ] a\n'
    lists['/link/.superdev'] = [{ ...d('dod-draft-z.md'), kind: 'file' as never }]
    fakeRepo(on, files, lists, cwd, undefined, {}, true, new Set(), git)
    await $.command.run(runCommand)
    expect(sorted(await cards($))).toEqual(MAIN_ONLY)
  })

for (const [what, main, drafts, designs] of [
  ['no design folder', { design: false }, ['both 3 criteria', 'm 1 criteria', 'x 2 criteria'], ['y']],
  ['no drafts', { drafts: false }, ['both 3 criteria', 'x 2 criteria'], ['ms', 'y']],
] as const)
  test(`the session checkout's drafts and sketches show when the main tree has ${what}`, async ($, on) => {
    const { files, lists } = twoTrees(main)
    fakeRepo(on, files, lists, '/w', undefined, {}, true, new Set(), { toplevel: '/w' })
    await $.command.run(runCommand)
    expect(sorted(await cards($))).toEqual({ drafts: [...drafts], designs: [...designs] })
  })

for (const [what, mtimes, count] of [['a stale', () => ({ [`${A}/run.lock`]: Date.now() - 2 * 3600e3 }), 0], ['a held', () => ({ [`${A}/run.lock`]: Date.now() }), 1]] as const)
  test(`the overview's running count ${count ? 'counts' : 'leaves out'} a never-ended dispatch under ${what} run lock`, async ($, on) => {
    const { files, lists } = repo()
    files[`${A}/ledger.md`] = ledger('implementing', [['01', 'todo']])
    files[`${A}/trace.log`] = '2026-01-01T00:00:00Z scope main dispatch superdev:final-reviewer f1 Final s1'
    delete files[`${ROOT}/scopes/b/ledger.md`]
    fakeRepo(on, files, lists, '/r', undefined, mtimes())
    await $.command.run(runCommand)
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...P })
    expect(await ui.find({ type: 'Text', text: new RegExp(`^0/1 slices · DoD 0/0 · ${count} running · lock `) })).toBeDefined()
  })
