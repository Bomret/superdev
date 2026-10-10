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

test('each slice shows its id, status, and slicetree mark, with its agents as full cards, and an unknown slice\'s agent under Scope-level', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    expect(await ui.find({ type: 'Text', text: /^▶ 02 in-progress · slicetree$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ 01 merged$/ })).toBeDefined()
    if (surface === 'terminal' || surface === 'desktop') {
      const client = await ui.find({ type: 'Client', key: 'card-tu2' })
      expect(client?.props.width).toBe('100%')
      expect(client?.props.props).not.toHaveProperty('isCompact')
      await ui.post({ key: 'tu2' }, { in: 'card-tu2' })
      const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu2' }))
      expect(drawn).toMatch(/implementer/)
      expect(drawn).toMatch(/running/)
      expect(drawn).toMatch(/⏱/)
      expect(drawn).toMatch(/Build 02/)
      expect(drawn).toMatch(/a · 02/)
    } else {
      expect(await ui.find({ type: 'Text', text: /^implementer · a · 02 · Build 02 · running · started \d\d:\d\d:\d\d · as of \d\d:\d\d:\d\d$/ })).toBeDefined()
    }
    const scoped = await ui.find({ key: 'lane-scope' })
    expect(JSON.stringify(scoped)).toMatch(/tu9|final-reviewer/)
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test("a done trace agent's card shows its run time, dispatch to dispatch-end, on every surface", async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = [
    '2026-01-01T00:00:00Z 03 main dispatch superdev:slice-reviewer tu3 Review\\x2003',
    '2026-01-01T00:05:00Z 03 main dispatch-end superdev:slice-reviewer tu3',
  ].join('\n')
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    const drawn = JSON.stringify(await ui.find({ type: 'Box', key: 'card-tu3' }))
    expect(drawn).toMatch(/⏱ 05:00/)
    expect(drawn).toMatch(/done/)
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

// Every Client of a page shares one message budget, so the pane draws a done agent's card itself, and
// nothing posts for it.
test("a done agent's card is no Client and posts nothing", async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = [
    '2026-01-01T00:00:00Z 03 main dispatch superdev:slice-reviewer tu3 Review\\x2003',
    '2026-01-01T00:05:00Z 03 main dispatch-end superdev:slice-reviewer tu3',
  ].join('\n')
  const clock = fakeRepo(on, files, lists)
  // a post's answer reads the trace activity, so each read once the scan has settled is one post or redraw
  let reads = 0
  let isCounting = false
  on('state.get', async (_$, e, next) => {
    if (isCounting && e.key === 'traceActivity') reads++
    return next(e)
  })
  await $.command.run(runCommand)
  const ui = await open($, 'desktop')
  await clock.settle()
  expect((await ui.findAll({ type: 'Client' })).map(c => c.key)).not.toContain('card-tu3')
  expect(JSON.stringify(await ui.find({ type: 'Box', key: 'card-tu3' }))).toMatch(/trace events/)
  isCounting = true
  for (let n = 0; n < 10; n++) {
    await ui.advance(1000)
    await clock.settle()
  }
  expect(reads).toBe(0)
  // the count is live: the pane's own redraw reads the trace activity for the done card
  await ui.redraw()
  expect(reads).toBeGreaterThan(0)
})

test("a trace-only running card's first props carry its trace fields, so a redraw keeps its height", async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = '2026-01-01T00:00:00Z 03 main dispatch superdev:implementer tu4 Build\\x2003'
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await open($, 'desktop')
  const props = (await ui.find({ type: 'Client', key: 'card-tu4' }))?.props.props
  expect(props).toMatchObject({ isDone: false, isLive: false, events: 0, last: 'dispatched · 00:00:00' })
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

test("a slice lane groups its agents into review cycles, each headed with its verdict, on every surface", async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = [
    '2026-01-01T00:00:00Z 02 main dispatch superdev:implementer i1 Build',
    '2026-01-01T00:00:01Z 02 main dispatch-end superdev:implementer i1',
    '2026-01-01T00:00:02Z 02 main dispatch superdev:slice-reviewer r1 Review',
    '2026-01-01T00:00:03Z 02 main verdict r1 fail changes-needed 0 i1',
    '2026-01-01T00:00:04Z 02 main dispatch-end superdev:slice-reviewer r1',
    '2026-01-01T00:00:05Z 02 main dispatch superdev:implementer i2 Fix',
    '2026-01-01T00:00:06Z 02 main dispatch-end superdev:implementer i2',
    '2026-01-01T00:00:07Z 02 main dispatch superdev:slice-reviewer r2 Re-review',
    '2026-01-01T00:00:08Z 02 main verdict r2 pass approved 1 i2',
    '2026-01-01T00:00:09Z 02 main dispatch-end superdev:slice-reviewer r2',
    '2026-01-01T00:00:10Z 02 main dispatch superdev:simplicity-reviewer s1 Simplicity\\x20review',
    '2026-01-01T00:00:11Z 02 main dispatch-end superdev:simplicity-reviewer s1',
  ].join('\n')
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    const heads = await ui.findAll({ type: 'Text', text: /^(Cycle \d.*|Simplicity)$/ })
    expect(heads.map(t => t.text)).toEqual(['Cycle 0 · review ✗ specification, changes-needed', 'Cycle 1 · review ✓', 'Simplicity'])
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('a cycle whose review has no verdict line is headed by its title alone', async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = [
    '2026-01-01T00:00:00Z 02 main dispatch superdev:implementer i1 Build',
    '2026-01-01T00:00:01Z 02 main dispatch-end superdev:implementer i1',
    '2026-01-01T00:00:02Z 02 main dispatch superdev:slice-reviewer r1 Review',
    '2026-01-01T00:00:03Z 02 main dispatch-end superdev:slice-reviewer r1',
    '2026-01-01T00:00:04Z 02 main dispatch superdev:implementer i2 Fix',
    '2026-01-01T00:00:05Z 02 main dispatch-end superdev:implementer i2',
  ].join('\n')
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    const heads = await ui.findAll({ type: 'Text', text: /^(Cycle \d.*|Simplicity)$/ })
    expect(heads.map(t => t.text)).toEqual(['Cycle 0', 'Cycle 1'])
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})
