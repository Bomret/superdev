import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { PANE, R, dir, fakeRepo, ledger, runCommand } from './testkit'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const A = `${R}/scopes/a`
const repo = () => ({
  files: {
    [`${A}/ledger.md`]: ledger('implementing', [['01', 'merged'], ['02', 'in-progress', '01'], ['03', 'todo', '01'], ['04', 'todo', '01'], ['05', 'todo', '02, 03, 04']]),
    [`${A}/dod.md`]: '- [x] one\n- [ ] two\n',
    [`${A}/trace.log`]: [
      '2026-01-01T00:00:00Z 02 main dispatch superdev:implementer tu2 Build\\x2002',
      '2026-01-01T00:00:01Z 09 main dispatch superdev:final-reviewer tu9 Review',
    ].join('\n'),
  } as Record<string, string>,
  lists: { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('a')], [A]: [dir('slicetrees')], [`${A}/slicetrees`]: [dir('02')] } as Record<string, ReturnType<typeof dir>[]>,
})

const open = async ($: Engine, surface: (typeof SURFACES)[number]) => {
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
  if (await ui.find({ key: 'scope-a' })) await ui.press({ key: 'scope-a' })
  return ui
}

test('the scope page draws its header and its slices in dependency waves, with no Svg, on every surface', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    expect((await ui.find({ key: 'back' }))?.props.hotkey).toBe('b')
    expect(await ui.find({ type: 'Text', text: /^feat\/x$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^DoD 1\/2 · 2 live$/ })).toBeDefined()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const heads = texts.filter(t => /^(Wave \d|Scope-level)$/.test(t))
    expect(heads).toEqual(['Wave 1', 'Wave 2', 'Wave 3', 'Scope-level'])
    const order = texts.filter(t => /^Slice \d\d$/.test(t))
    expect(order).toEqual(['Slice 01', 'Slice 02', 'Slice 03', 'Slice 04', 'Slice 05'])
    expect(texts.indexOf('Wave 2')).toBeLessThan(texts.indexOf('Slice 02'))
    expect(texts.indexOf('Wave 3')).toBeLessThan(texts.indexOf('Slice 05'))
    expect(texts.indexOf('Wave 3')).toBeGreaterThan(texts.indexOf('Slice 04'))
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('each slice shows its id, status, and slicetree mark, with its agents as compact entries, and an unknown slice\'s agent under Scope-level', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    expect(await ui.find({ type: 'Text', text: /^▶ 02 in-progress · slicetree$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ 01 merged$/ })).toBeDefined()
    if (surface === 'terminal' || surface === 'desktop') {
      expect((await ui.find({ type: 'Client', key: 'card-tu2' }))?.props.props).toMatchObject({ isCompact: true })
      await ui.post({ key: 'tu2', isCompact: true }, { in: 'card-tu2' })
      const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu2' }))
      expect(drawn).toMatch(/implementer/)
      expect(drawn).toMatch(/⏱/)
      expect(drawn).not.toMatch(/Build/)
    } else {
      expect(await ui.find({ type: 'Text', text: /^implementer · running · \d+[smh]$/ })).toBeDefined()
    }
    const scoped = await ui.find({ key: 'lane-scope' })
    expect(JSON.stringify(scoped)).toMatch(/tu9|final-reviewer/)
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test("a done trace agent's entry shows its run time, dispatch to dispatch-end, on every surface", async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = [
    '2026-01-01T00:00:00Z 03 main dispatch superdev:slice-reviewer tu3 Review\\x2003',
    '2026-01-01T00:05:00Z 03 main dispatch-end superdev:slice-reviewer tu3',
  ].join('\n')
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    if (surface === 'terminal' || surface === 'desktop') {
      await ui.post({ key: 'tu3', isCompact: true }, { in: 'card-tu3' })
      expect(JSON.stringify(await ui.drawn({ in: 'card-tu3' }))).toMatch(/⏱ 05:00/)
    } else {
      expect(await ui.find({ type: 'Text', text: /^slice-reviewer · done · 5m$/ })).toBeDefined()
    }
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('back returns to the overview, and a scope that closes while its page is open returns the pane to the overview', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await open($, 'terminal')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
  await ui.press({ key: 'scope-a' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
  files[`${A}/ledger.md`] = ledger('closed', [['01', 'merged']])
  await $.command.run(runCommand)
  await ui.redraw()
  expect(await ui.find({ key: 'back' })).toBeUndefined()
  expect(await ui.find({ key: 'section-scopes' })).toBeDefined()
})
