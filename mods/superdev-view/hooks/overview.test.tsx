import { test, expect } from 'claude-code/testing'
import { PANE, R, dir, fakeRepo, file, ledger, runCommand } from './testkit'
import type { Entry } from './testkit'
// --- the overview: collapsible text sections on every surface ---

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const overviewRepo = () => {
  const A = `${R}/scopes/a`
  const files: Record<string, string> = {
    [`${R}/info.json`]: '{"issue-tracker":{"assignee":"stefan"}}',
    [`${A}/ledger.md`]: ledger('implementing', [['01', 'merged'], ['02', 'in-progress'], ['03', 'todo']]),
    [`${A}/dod.md`]: '- [x] one\n- [ ] two\n',
    [`${R}/scopes/c/ledger.md`]: ledger('closed', [['01', 'merged']]),
    [`${R}/brainstorm/i.md`]: '---\nstatus: draft\n---\n# Intent: Idea\n',
    [`${R}/kb-pending/a/p.md`]: '---\ntitle: Page\naction: patch\n---\nbody',
    [`${R}/dod-draft-x.md`]: '- [ ] a\n- [ ] b\n',
  }
  const lists: Record<string, Entry[]> = {
    [R]: [file('info.json'), dir('scopes'), dir('brainstorm'), dir('kb-pending'), dir('design'), file('dod-draft-x.md')],
    [`${R}/scopes`]: [dir('a'), dir('c')], [A]: [], [`${R}/scopes/c`]: [],
    [`${R}/brainstorm`]: [file('i.md')], [`${R}/kb-pending`]: [dir('a')], [`${R}/kb-pending/a`]: [file('p.md')],
    [`${R}/design`]: [file('sk.html')],
  }
  return { files, lists }
}
const buttons = async (ui: { findAll: (q: { type: string }) => Promise<{ key: string | undefined }[]> }) => (await ui.findAll({ type: 'Button' })).map(b => b.key)

test('the overview draws text sections in order, Running now and Scopes open, the others closed, on every surface', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    expect(await buttons(ui)).toEqual(['section-running', 'section-scopes', 'scope-a', 'section-brainstorm', 'section-kb', 'section-design', 'section-drafts'])
    expect(await ui.find({ type: 'Text', text: /nothing running/ })).toBeDefined()
    for (const hidden of [/Idea/, /Page/, /^sk$/, /2 criteria/]) expect(await ui.find({ type: 'Text', text: hidden })).toBeUndefined()
    await ui.unmount()
  }
})

test('pressing a section header opens or closes it, and the state survives a scope page', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    await ui.press({ key: 'section-kb' })
    expect(await ui.find({ type: 'Text', text: /^Page · patch · scope a$/ })).toBeDefined()
    await ui.press({ key: 'section-scopes' })
    expect(await ui.find({ key: 'scope-a' })).toBeUndefined()
    await ui.press({ key: 'section-scopes' })
    await ui.press({ key: 'scope-a' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /^Page · patch · scope a$/ })).toBeDefined()
    expect(await ui.find({ key: 'scope-a' })).toBeDefined()
    await ui.press({ key: 'section-kb' })
    expect(await ui.find({ type: 'Text', text: /Page/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a section with no item is absent, and Scopes with no active scope says so', async ($, on) => {
  fakeRepo(on, { [`${R}/scopes/c/ledger.md`]: ledger('closed', [['01', 'merged']]) }, { [R]: [dir('scopes'), dir('brainstorm'), dir('design')], [`${R}/scopes`]: [dir('c')], [`${R}/scopes/c`]: [], [`${R}/brainstorm`]: [], [`${R}/design`]: [] })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await buttons(ui)).toEqual(['section-running', 'section-scopes'])
  expect(await ui.find({ type: 'Text', text: /no active scope/ })).toBeDefined()
})

test('a scope row shows its mark, name, stage, a bar segment per slice, and its counts, and opens the scope', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    const row = await ui.find({ key: 'scope-a' })
    expect(row?.text).toMatch(/^● a implementing$/)
    expect(JSON.stringify(row?.children)).toMatch(/"color":"yellow"/)
    const bar = await ui.find({ key: 'bar-a' })
    expect((bar?.children as { props: { color: string } }[]).map(c => c.props.color)).toEqual(['green', 'yellow', 'gray'])
    expect(await ui.find({ type: 'Text', text: /^1\/3 slices · DoD 1\/2 · 0 live$/ })).toBeDefined()
    await ui.press({ key: 'scope-a' })
    expect(await ui.find({ key: 'back' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('the Scopes header shows the active and the closed counts', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect((await ui.find({ key: 'section-scopes' }))?.text).toMatch(/Scopes · 1 active · 1 closed$/)
})

test('the overview ends with a footer naming the assignee and the root path', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'mobile', ...PANE })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.slice(-2)).toEqual(['assignee stefan', R])
})

test('a press writes no file', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  let writes = 0
  on('fs.write', async () => {
    writes++
    return { deny: 'no writes' }
  })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  for (const key of ['section-brainstorm', 'section-scopes', 'section-scopes', 'scope-a', 'back']) await ui.press({ key })
  expect(writes).toBe(0)
})
