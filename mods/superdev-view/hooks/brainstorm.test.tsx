import { test, expect } from 'claude-code/testing'
import { intent } from './parse'
import { PANE, R, dir, fakeRepo, file, runCommand } from './testkit'

test('an intent is a draft only when its frontmatter says status: draft', () => {
  expect(intent('a', '---\nstatus: draft\n---\n# Intent: A\n').isDraft).toBe(true)
  expect(intent('b', '---\nstatus: ready\n---\n# Intent: B\n').isDraft).toBe(false)
  expect(intent('c', '# Intent: C\n\n**Status: draft, still open.**\n').isDraft).toBe(false)
  expect(intent('d', '---\ntitle: D\n---\n# D\n').isDraft).toBe(false)
  expect(intent('e', '---\nstatus: something\n---\n').isDraft).toBe(false)
  expect(intent('f', '---\r\nstatus: draft\r\n---\r\n# Intent: F\r\n').isDraft).toBe(true)
  expect(intent('c', '# Intent: C\n\n**Status: draft, still open.**\n').status).toBe('draft, still open')
})

test('every surface shows a draft intent as draft and a ready one as ready, and nothing in it presses', async ($, on) => {
  const files: Record<string, string> = {
    [`${R}/brainstorm/a.md`]: '---\nstatus: draft\n---\n# Intent: Alpha\n',
    [`${R}/brainstorm/b.md`]: '# Intent: Beta\n\n**Status: ready to plan.**\n',
    [`${R}/scopes/s/ledger.md`]: '**Stage:** implementing\n**Branch:** feat/s\n',
  }
  fakeRepo(on, files, { [R]: [dir('brainstorm'), dir('scopes')], [`${R}/brainstorm`]: [file('a.md'), file('b.md')], [`${R}/scopes`]: [dir('s')], [`${R}/scopes/s`]: [] })
  await $.command.run(runCommand)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.find({ key: 'section-brainstorm' }))?.text).toMatch(/Brainstorm$/)
    expect((await ui.find({ key: 'value-brainstorm' }))?.text).toBe('2')
    await ui.press({ key: 'section-brainstorm' })
    expect([(await ui.find({ key: 'intent-a' }))?.text, (await ui.find({ key: 'intent-a-value' }))?.text]).toEqual(['Alpha', 'draft'])
    expect([(await ui.find({ key: 'intent-b' }))?.text, (await ui.find({ key: 'intent-b-value' }))?.text]).toEqual(['Beta', 'ready'])
    expect(await ui.find({ type: 'Text', text: /^ready to plan$/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['section-brainstorm', 'section-scopes', 'scope-s'])
    await ui.press({ key: 'section-brainstorm' })
    await ui.unmount()
  }
})

test('a missing brainstorm folder draws the pane with no error and no Brainstorm section', async ($, on) => {
  fakeRepo(on, { [`${R}/scopes/s/ledger.md`]: '**Stage:** implementing\n' }, { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('s')], [`${R}/scopes/s`]: [] })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ key: 'scope-s' })).toBeDefined()
  expect(await ui.find({ key: 'section-brainstorm' })).toBeUndefined()
})

test('intents with no scopes folder still show the Brainstorm section', async ($, on) => {
  fakeRepo(on, { [`${R}/brainstorm/a.md`]: '---\nstatus: draft\n---\n# Intent: Alpha\n' }, { [R]: [dir('brainstorm')], [`${R}/brainstorm`]: [file('a.md')] })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /no active scope/ })).toBeDefined()
  await ui.press({ key: 'section-brainstorm' })
  expect((await ui.find({ key: 'intent-a-value' }))?.text).toBe('draft')
})
