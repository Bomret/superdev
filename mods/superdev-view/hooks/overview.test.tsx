import { test, expect } from 'claude-code/testing'
import { PANE, R, dir, fakeRepo, file, ledger, runCommand } from './testkit'
import type { Entry } from './testkit'
// --- the overview: collapsible cards on every surface ---

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

test('the overview draws framed cards in order, Scopes open, the others closed, each with its value on the right, on every surface', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.findAll({ type: 'Svg' })).length > 0).toBe(surface !== 'terminal')
    expect(await buttons(ui)).toEqual(['section-brainstorm', 'section-scopes', 'scope-a', 'scope-c', 'section-kb', 'section-design', 'section-drafts'])
    expect((await ui.find({ key: 'section-kb' }))?.text).toMatch(/Pending knowledge-base pages$/)
    for (const [id, value] of [['brainstorm', '1'], ['scopes', '1 active · 1 closed'], ['kb', '1'], ['design', '1'], ['drafts', '1']]) {
      const card = await ui.find({ key: `card-${id}` })
      expect([card?.props.borderStyle, card?.props.borderDimColor]).toEqual(['round', true])
      expect((await ui.find({ key: `value-${id}` }))?.text).toBe(value)
    }
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
    expect([(await ui.find({ key: 'kb-a-p.md' }))?.text, (await ui.find({ key: 'kb-a-p.md-value' }))?.text]).toEqual(['Page', 'patch · scope a'])
    await ui.press({ key: 'section-scopes' })
    expect(await ui.find({ key: 'scope-a' })).toBeUndefined()
    await ui.press({ key: 'section-scopes' })
    await ui.press({ key: 'scope-a' })
    await ui.press({ key: 'back' })
    expect([(await ui.find({ key: 'kb-a-p.md' }))?.text, (await ui.find({ key: 'kb-a-p.md-value' }))?.text]).toEqual(['Page', 'patch · scope a'])
    expect(await ui.find({ key: 'scope-a' })).toBeDefined()
    await ui.press({ key: 'section-kb' })
    expect(await ui.find({ type: 'Text', text: /Page/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a design sketch row has nothing on its right, and a DoD draft row has its criteria count there', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const first = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  await first.press({ key: 'section-design' })
  await first.press({ key: 'section-drafts' })
  await first.unmount()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.find({ key: 'design-sk' }))?.text).toBe('sk')
    expect(await ui.find({ key: 'design-sk-value' })).toBeUndefined()
    expect([(await ui.find({ key: 'draft-x' }))?.text, (await ui.find({ key: 'draft-x-value' }))?.text]).toEqual(['x', '2 criteria'])
    await ui.unmount()
  }
})

const HEX = { merged: '#4c9a6a', 'in-progress': '#d4a72c', 'in-review': '#4a7fd6', blocked: '#d0573f', todo: '#6b6b6b', other: '#6b6b6b' }
// The Svg a keyed Box holds: the harness keeps no key on a leaf, so the pane keys the Box around it.
const svgIn = (box: { children?: unknown } | undefined) => ((box?.children as { props: { source: string; height?: number; width?: number } }[] | undefined) ?? [])[0]?.props
const fills = (svg: string) => [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]+)"/g)].map(m => m[1]).filter(f => f !== '#3a3a3a')
const widths = (svg: string) => [...svg.matchAll(/<rect [^>]*width="([\d.]+)"[^>]*fill="(#[0-9a-f]+)"/g)].filter(m => m[2] !== '#3a3a3a').map(m => Number(m[1]))

test('off the terminal each bar is an Svg with no text, the stacked bar 6 px and a scope bar 4 px high, and a status has one color on its square and both bars', async ($, on) => {
  const { files, lists } = statusRepo([['01', 'todo'], ['02', 'merged'], ['03', 'blocked']])
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    const total = svgIn(await ui.find({ key: 'total-bar' }))
    const scope = svgIn(await ui.find({ key: 'bar-a' }))
    for (const svg of [total, scope]) expect(String(svg?.source)).not.toMatch(/<text/)
    expect([total?.height, scope?.height]).toEqual([6, 4])
    expect(total?.width).toBeUndefined()
    expect(fills(String(total?.source))).toEqual([HEX.merged, HEX.blocked, HEX.todo])
    expect(fills(String(scope?.source))).toEqual([HEX.todo, HEX.merged, HEX.blocked])
    const squares = await Promise.all(['merged', 'blocked', 'todo'].map(async s => fills(String(svgIn(await ui.find({ key: `swatch-${s}` }))?.source))[0]))
    expect(squares).toEqual([HEX.merged, HEX.blocked, HEX.todo])
    await ui.unmount()
  }
})

test('on the terminal no Svg draws, the stacked bar is colored glyphs as wide as the card, and one slice among many keeps a glyph', async ($, on) => {
  const rows: [string, string][] = Array.from({ length: 60 }, (_, n) => [String(n + 1).padStart(2, '0'), 'merged'])
  rows.push(['99', 'blocked'])
  const { files, lists } = statusRepo(rows)
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 20 } })
  expect(await ui.findAll({ type: 'Svg' })).toEqual([])
  const parts = ((await ui.find({ key: 'total-bar' }))?.children ?? []) as { props: { color: string }; children: unknown }[]
  const cells = parts.map(p => [p.children].flat().join('').length)
  expect(parts.map(p => p.props.color)).toEqual(['green', 'red'])
  expect(cells.reduce((a, b) => a + b, 0)).toBe(16)
  expect(cells[1]).toBeGreaterThanOrEqual(1)
})

test('on a narrow terminal every status with a slice keeps a glyph in the stacked bar, and the glyphs fill the card', async ($, on) => {
  const counts: [string, number][] = [['merged', 1], ['in-progress', 2], ['in-review', 16], ['blocked', 2], ['todo', 15]]
  const rows = counts.flatMap(([status, n], k) => Array.from({ length: n }, (_, i): [string, string] => [`${k}${String(i).padStart(2, '0')}`, status]))
  const { files, lists } = statusRepo(rows)
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 9 } })
  const parts = ((await ui.find({ key: 'total-bar' }))?.children ?? []) as { children: unknown }[]
  const cells = parts.map(p => [p.children].flat().join('').length)
  expect([Math.min(...cells), cells.reduce((a, b) => a + b, 0)]).toEqual([1, 5])
})

test('off the terminal every bar clips to its own id, so bars inlined into one document stay apart', async ($, on) => {
  const { files, lists } = statusRepo([['01', 'todo'], ['02', 'merged']])
  files[`${R}/scopes/b/ledger.md`] = ledger('implementing', [['01', 'merged']])
  lists[`${R}/scopes`] = [dir('a'), dir('b'), dir('c')]
  lists[`${R}/scopes/b`] = []
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  const ids = await Promise.all(['total-bar', 'bar-a', 'bar-b'].map(async k => {
    const svg = String(svgIn(await ui.find({ key: k }))?.source)
    const id = svg.match(/<clipPath id="([^"]+)"/)?.[1]
    return [id, svg.includes(`url(#${id})`), /^[a-zA-Z0-9_-]+$/.test(String(id))]
  }))
  expect(ids.every(([, used, clean]) => used && clean)).toBe(true)
  expect(new Set(ids.map(([id]) => id)).size).toBe(3)
})

test('no ledger text reaches an Svg source on desktop, neither a status nor a slice title', async ($, on) => {
  const { files, lists } = statusRepo([])
  files[`${R}/scopes/a/ledger.md`] = '**Stage:** implementing\n**Branch:** feat/x\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '| 01 | #01 | <text>evil</text> | behavior | — | <x | — |\n| 02 | #02 | Slice 02 | behavior | — | merged | — |\n'
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  const sources = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  expect([sources.length > 0, (await legend(ui)).includes('<x150%')]).toEqual([true, true])
  expect(sources.filter(s => s.includes('<x') || s.includes('evil') || s.includes('<text'))).toEqual([])
})

test('off the terminal one slice among many keeps a visible segment in the stacked bar', async ($, on) => {
  const rows: [string, string][] = Array.from({ length: 200 }, (_, n) => [String(n + 1).padStart(3, '0'), 'merged'])
  rows.push(['999', 'blocked'])
  const { files, lists } = statusRepo(rows)
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  const w = widths(String(svgIn(await ui.find({ key: 'total-bar' }))?.source))
  expect(w.length).toBe(2)
  expect(w[1]! >= 1.5).toBe(true)
  expect(Math.round(w.reduce((a, b) => a + b, 0))).toBe(100)
})

// The Scopes card's summary and legend count the active scopes' slices only.
const statusRepo = (rows: [string, string][], closedRows: [string, string][] = [['01', 'merged']]) => {
  const files: Record<string, string> = {
    [`${R}/scopes/a/ledger.md`]: ledger('implementing', rows),
    [`${R}/scopes/c/ledger.md`]: ledger('closed', closedRows),
  }
  const lists: Record<string, Entry[]> = { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('a'), dir('c')], [`${R}/scopes/a`]: [], [`${R}/scopes/c`]: [] }
  return { files, lists }
}
const legend = async (ui: { findAll: (q: { type: string }) => Promise<{ key: string | undefined; text: string }[]> }) =>
  (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('legend-')).map(b => b.text)

test('the Scopes card counts the active scopes\' slices in its summary and legend, rounded, in status order, on every surface', async ($, on) => {
  const { files, lists } = statusRepo([['01', 'todo'], ['02', 'merged'], ['03', 'in-progress']], [['01', 'merged'], ['02', 'merged']])
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect([(await ui.find({ key: 'merged-share' }))?.text, (await ui.find({ key: 'slice-count' }))?.text]).toEqual(['33% merged', '1 / 3 slices'])
    expect(await legend(ui)).toEqual([`${surface === 'terminal' ? '■' : ''}merged133%`, `${surface === 'terminal' ? '■' : ''}in-progress133%`, `${surface === 'terminal' ? '■' : ''}todo133%`])
    await ui.unmount()
  }
})

test('the legend lists only statuses with a slice, an unknown status after the known ones in gray, and an empty status cell as —', async ($, on) => {
  const { files, lists } = statusRepo([['01', 'blocked'], ['02', 'weird'], ['03', ''], ['04', 'merged'], ['05', 'merged'], ['06', 'merged']])
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await legend(ui)).toEqual(['■merged350%', '■blocked117%', '■weird117%', '■—117%'])
  expect((await ui.find({ key: 'merged-share' }))?.text).toBe('50% merged')
  const swatches = (await ui.findAll({ type: 'Text', text: '■' })).map(s => s.props.color)
  expect(swatches).toEqual(['green', 'red', 'gray', 'gray'])
})

test('with no active scope no summary or legend draws', async ($, on) => {
  fakeRepo(on, { [`${R}/scopes/c/ledger.md`]: ledger('closed', [['01', 'merged']]) }, { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('c')], [`${R}/scopes/c`]: [] })
  await $.command.run(runCommand)
  const none = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect(await none.find({ key: 'slice-count' })).toBeUndefined()
  expect(await legend(none)).toEqual([])
})

test('active scopes that hold no slice read 0 / 0 slices with no bar or legend', async ($, on) => {
  const empty = statusRepo([])
  fakeRepo(on, empty.files, empty.lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect((await ui.find({ key: 'slice-count' }))?.text).toBe('0 / 0 slices')
  expect(await legend(ui)).toEqual([])
  expect(await ui.find({ key: 'total-bar' })).toBeUndefined()
})

test('a section with no item is absent, and Scopes with no active scope says so above its closed scopes', async ($, on) => {
  fakeRepo(on, { [`${R}/scopes/c/ledger.md`]: ledger('closed', [['01', 'merged']]) }, { [R]: [dir('scopes'), dir('brainstorm'), dir('design')], [`${R}/scopes`]: [dir('c')], [`${R}/scopes/c`]: [], [`${R}/brainstorm`]: [], [`${R}/design`]: [] })
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await buttons(ui)).toEqual(['section-scopes', 'scope-c'])
  expect(await ui.find({ type: 'Text', text: /no active scope/ })).toBeDefined()
})

test('a scope row shows its name, its stage in color on the right, a bar segment per slice, and its counts, and opens the scope', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.find({ key: 'scope-a' }))?.text).toBe('a')
    expect((await ui.find({ key: 'scope-a' }))?.props.dimColor).toBeFalsy()
    const name = await ui.find({ key: 'scope-name-a' })
    expect([name?.props.flexShrink, name?.props.minWidth]).toEqual([1, 0])
    const stage = await ui.find({ key: 'stage-a' })
    expect([stage?.text, stage?.props.flexShrink]).toEqual(['implementing', 0])
    expect((await ui.findAll({ type: 'Text', text: 'implementing' })).map(t => t.props.color)).toEqual(['yellow'])
    const bar = await ui.find({ key: 'bar-a' })
    if (surface === 'terminal') expect((bar?.children as { props: { color: string }; children: unknown }[]).map(c => [c.props.color, [c.children].flat().join('')])).toEqual([['green', '▬'], ['yellow', '▬'], ['gray', '▬']])
    else expect([svgIn(bar)?.height, fills(String(svgIn(bar)?.source))]).toEqual([4, [HEX.merged, HEX['in-progress'], HEX.todo]])
    expect(await ui.find({ type: 'Text', text: /^1\/3 slices · DoD 1\/2 · 0 running$/ })).toBeDefined()
    await ui.press({ key: 'scope-a' })
    expect(await ui.find({ key: 'back' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('the Scopes header shows the active and the closed counts on its right', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  expect((await ui.find({ key: 'section-scopes' }))?.text).toMatch(/Scopes$/)
  expect((await ui.find({ key: 'value-scopes' }))?.text).toBe('1 active · 1 closed')
})

test('in a narrow pane a card header keeps its value whole and lets the name give up width', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE, props: { ...PANE.props, bodyColumns: 20 } })
  for (const id of ['scopes', 'brainstorm', 'kb']) {
    const name = await ui.find({ key: `name-${id}` })
    const value = await ui.find({ key: `value-${id}` })
    expect([name?.props.flexShrink, name?.props.minWidth]).toEqual([1, 0])
    expect(value?.props.flexShrink).toBe(0)
  }
})

test('the overview starts with the assignee and the root path, with the home folder as ~', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'mobile', ...PANE })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.slice(0, 2)).toEqual(['🪪 stefan', '~/.superdev'])
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

test('the Scopes card lists closed scopes after active ones as dim rows with closed on the right, and a press opens its whole log', async ($, on) => {
  const { files, lists } = overviewRepo()
  files[`${R}/scopes/c/trace.log`] = '2026-10-11T10:00:00.000Z scope main ledger init feat/c planned\n2026-10-11T11:00:00.000Z scope main ledger stage set closed'
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await buttons(ui)).filter(b => b?.startsWith('scope-'))).toEqual(['scope-a', 'scope-c'])
    expect((await ui.findAll({ type: 'Text', text: /^closed$/ })).map(t => t.props.color)).toEqual(['gray'])
    expect((await ui.find({ key: 'scope-c' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ key: 'stage-c' }))?.text).toBe('closed')
    expect(await ui.find({ key: 'bar-c' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^1\/1 slices · DoD 0\/0 · 0 running$/ })).toBeUndefined()
    await ui.press({ key: 'scope-c' })
    expect(await ui.find({ key: 'back' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ plan$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^●$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^■ closed$/ })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test("with no scope page open the pane reads no closed scope's trace, and a closed scope's page reads its own alone", async ($, on) => {
  const { files, lists } = overviewRepo()
  files[`${R}/scopes/c/trace.log`] = '2026-10-11T10:00:00.000Z scope main ledger init feat/c planned'
  const reads: string[] = []
  const counted = new Proxy(files, { get: (t, k: string) => (k.endsWith('/trace.log') && reads.push(k), t[k]) })
  fakeRepo(on, counted, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(reads.filter(p => p.includes('/scopes/c/'))).toEqual([])
  await ui.press({ key: 'scope-c' })
  await $.command.run(runCommand)
  expect(reads.filter(p => p.includes('/scopes/c/')).length).toBeGreaterThan(0)
  expect(await ui.find({ type: 'Text', text: /^ plan$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^[✓●]$/ })).toBeDefined()
})

test('a closed scope whose run root is removed leaves the list, and its open page returns to the overview', async ($, on) => {
  const { files, lists } = overviewRepo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'desktop', ...PANE })
  await ui.press({ key: 'scope-c' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
  lists[`${R}/scopes`] = [dir('a')]
  delete files[`${R}/scopes/c/ledger.md`]
  await $.command.run(runCommand)
  await ui.redraw()
  expect(await ui.find({ key: 'back' })).toBeUndefined()
  expect(await ui.find({ key: 'scope-c' })).toBeUndefined()
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
})
