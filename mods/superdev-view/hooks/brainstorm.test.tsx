import { test, expect } from 'claude-code/testing'
import { intent } from './parse'
import { pipeline } from './svg'
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

test('the pipeline opens with a brainstorm column of draft and ready dots, linked to no scope', () => {
  const d = pipeline([], [{ name: 'a', title: 'Alpha & co', status: '', isDraft: true }, { name: 'b', title: 'Beta', status: '', isDraft: false }])
  const label = (t: string) => d.source.indexOf(`>${t}</text>`)
  expect(label('brainstorm')).toBeGreaterThan(-1)
  expect(label('brainstorm')).toBeLessThan(label('planned'))
  expect(d.source).toMatch(/class="dot draft"[^>]*><title>Alpha &amp; co \(draft\)<\/title>/)
  expect(d.source).toMatch(/class="dot ready"[^>]*><title>Beta \(ready\)<\/title>/)
  expect(d.source).not.toMatch(/<a\b/)
  expect(d.alt).toMatch(/1 draft and 1 ready intent/)
})

test('no intents, or no brainstorm folder, draws an empty column', () => {
  for (const intents of [[], null]) {
    const d = pipeline([], intents)
    expect(d.source).toMatch(/>brainstorm<\/text>/)
    expect(d.source).not.toMatch(/class="dot /)
  }
})

test('the terminal names the brainstorm column first, and nothing in it presses', async ($, on) => {
  const files: Record<string, string> = {
    [`${R}/brainstorm/a.md`]: '---\nstatus: draft\n---\n# Intent: Alpha\n',
    [`${R}/brainstorm/b.md`]: '# Intent: Beta\n\n**Status: ready to plan.**\n',
    [`${R}/scopes/s/ledger.md`]: '**Stage:** implementing\n**Branch:** feat/s\n',
  }
  fakeRepo(on, files, { [R]: [dir('brainstorm'), dir('scopes')], [`${R}/brainstorm`]: [file('a.md'), file('b.md')], [`${R}/scopes`]: [dir('s')], [`${R}/scopes/s`]: [] })
  await $.command.run(runCommand)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^stages: brainstorm \(1 draft, 1 ready\) · implementing \(1\)$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /draft Alpha — a$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /ready Beta — ready to plan$/ })).toBeDefined()
    }
    else expect(String((await ui.findAll({ type: 'Svg' })).map(s => s.props.source).join())).toMatch(/class="dot draft"/)
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['scope-s'])
    await ui.unmount()
  }
})

test('a missing brainstorm folder draws the pane with no error', async ($, on) => {
  fakeRepo(on, { [`${R}/scopes/s/ledger.md`]: '**Stage:** implementing\n' }, { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('s')], [`${R}/scopes/s`]: [] })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^stages: brainstorm \(0\) · implementing \(1\)$/ })).toBeDefined()
})

test('intents with no scopes folder still draw the brainstorm column', async ($, on) => {
  fakeRepo(on, { [`${R}/brainstorm/a.md`]: '---\nstatus: draft\n---\n# Intent: Alpha\n' }, { [R]: [dir('brainstorm')], [`${R}/brainstorm`]: [file('a.md')] })
  await $.command.run(runCommand)
  const term = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: /^stages: brainstorm \(1 draft, 0 ready\)$/ })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect(String((await desk.findAll({ type: 'Svg' })).map(s => s.props.source).join())).toMatch(/class="dot draft"/)
})
