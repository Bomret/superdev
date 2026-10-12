import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { PANE, R, dir, fakeRepo, ledger, runCommand } from './testkit'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const A = `${R}/scopes/a`
const at = (hms: string, day = '11') => `2026-10-${day}T${hms}.000Z`
// Local wall-clock HH:MM of a trace time, as the log draws it.
const hm = (ts: string) => new Date(Date.parse(ts)).toTimeString().slice(0, 5)
// A run shaped like scope-cli-findings, cut after its review started.
const TRACE = [
  `${at('09:00:00')} scope main ledger init feat/x planned`,
  `${at('10:00:00')} scope main ledger stage set implementing`,
  `${at('10:01:00')} 02 main dispatch superdev:implementer i1 Build s1`,
  `${at('10:03:00')} 02 main dispatch-end superdev:implementer i1 failed`,
  `${at('10:04:00')} 02 main dispatch-resume i1 ag1 s1 sm1`,
  `${at('10:05:00')} 02 main dispatch-end superdev:implementer i1 completed`,
  `${at('10:05:30')} 02 main dispatch superdev:slice-reviewer r1 Review s1`,
  `${at('10:05:40')} 02 main verdict r1 fail changes-needed 0 i1`,
  `${at('10:05:50')} 02 main dispatch-end superdev:slice-reviewer r1 completed`,
  `${at('10:05:55')} 01 main ledger slice 01 merged a..b`,
  `${at('10:06:00')} scope main ledger stage set merged`,
  `${at('10:10:00')} scope main ledger step set review`,
  `${at('10:11:00')} scope main dispatch superdev:final-reviewer f1 Final s1`,
]
const repo = (trace: string[] = TRACE, stage = 'merged') => ({
  files: {
    [`${A}/ledger.md`]: ledger(stage, [['01', 'merged'], ['02', 'merged', '01']]),
    [`${A}/dod.md`]: '- [x] one\n- [ ] two\n',
    ...(trace.length ? { [`${A}/trace.log`]: trace.join('\n') } : {}),
  } as Record<string, string>,
  lists: { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('a')], [A]: [] } as Record<string, ReturnType<typeof dir>[]>,
})

const open = async ($: Engine, surface: (typeof SURFACES)[number]) => {
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
  if (await ui.find({ key: 'scope-a' })) await ui.press({ key: 'scope-a' })
  return ui
}
type Node = { type?: string; props?: { key?: string; wrap?: string }; children?: (Node | string)[] }
// The outermost Text nodes inside the Box keyed `log`, top to bottom, each with its text and wrap.
const logTexts = async (ui: Awaited<ReturnType<typeof open>>) => {
  const find = (n: Node | string): Node | undefined =>
    typeof n === 'string' ? undefined : n.props?.key === 'log' ? n : (n.children ?? []).map(find).find(Boolean)
  const text = (n: Node | string): string => (typeof n === 'string' ? n : (n.children ?? []).map(text).join(''))
  const out: { text: string; wrap?: string }[] = []
  const walk = (n: Node | string) => {
    if (typeof n === 'string') return
    if (n.type === 'Text') out.push({ text: text(n), wrap: n.props?.wrap })
    else (n.children ?? []).forEach(walk)
  }
  const log = find((await ui.drawn()) as Node)
  if (log) walk(log)
  return out
}
const logLines = async (ui: Awaited<ReturnType<typeof open>>) => (await logTexts(ui)).map(t => t.text)

test('the scope page draws the run as one oldest-first log, with no wave, scope-level, cycle, or simplicity label, on every surface', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  for (const surface of SURFACES) {
    const ui = await open($, surface)
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    expect(await ui.findAll({ type: 'Client' })).toEqual([])
    expect(await ui.find({ type: 'Text', text: /^feat\/x$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^DoD 1\/2$/ })).toBeDefined()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.filter(t => /Wave|Scope-level|Cycle|Simplicity/.test(t))).toEqual([])
    expect(await logLines(ui)).toEqual([
      '✓ plan', '1:00:00',
      '✓ implement', '06:00',
      `${hm(at('10:01:00'))} ▶ implementer 02`,
      `${hm(at('10:03:00'))} ■ implementer 02 · failed · 02:00`,
      `${hm(at('10:04:00'))} ▶ implementer 02 · resumed`,
      `${hm(at('10:05:00'))} ■ implementer 02 · 01:00`,
      `${hm(at('10:05:30'))} ▶ slice-reviewer 02`,
      `${hm(at('10:05:50'))} ■ slice-reviewer 02 · fail changes-needed · 00:20`,
      `${hm(at('10:05:55'))} ✓ slice 01 merged`,
      '⋯ 04:00',
      '● review', expect.stringMatching(/^\d+:\d\d:\d\d$/),
      `${hm(at('10:11:00'))} ▶ final-reviewer scope`,
      '○ document · submit · ship · wrap-up',
    ])
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('a line above the log counts the running dispatches, and is absent when none runs', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await open($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /^● 1 running$/ })).toBeDefined()
  await ui.press({ key: 'back' })
  files[`${A}/trace.log`] = [...TRACE, `${at('10:12:00')} scope main final-verdict f1 yes 0`, `${at('10:13:00')} scope main dispatch-end superdev:final-reviewer f1 completed`].join('\n')
  await $.command.run(runCommand)
  await ui.press({ key: 'scope-a' })
  expect(await ui.find({ type: 'Text', text: /running$/ })).toBeUndefined()
  expect((await logLines(ui)).at(-2)).toBe(`${hm(at('10:13:00'))} ■ final-reviewer scope · yes · 02:00`)
})

test('a trace without step lines draws its stage writes after implement under no command, and no commands-ahead line', async ($, on) => {
  const trace = [...TRACE.slice(0, 11), `${at('10:20:00')} scope main ledger stage set reviewed`, `${at('10:30:00')} scope main ledger stage set documented`]
  const { files, lists } = repo(trace, 'documented')
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await open($, 'terminal')
  const lines = await logLines(ui)
  expect(lines.slice(-3)).toEqual([`${hm(at('10:06:00'))} stage merged`, `${hm(at('10:20:00'))} stage reviewed`, `${hm(at('10:30:00'))} stage documented`])
  expect(lines.filter(l => /^[✓●] /.test(l))).toEqual(['✓ plan', '✓ implement'])
})

test('a scope with no trace opens a page with no log lines; every log line is cut to one row', async ($, on) => {
  const { files, lists } = repo([])
  fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  const ui = await open($, 'desktop')
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(await logLines(ui)).toEqual([])
  await ui.press({ key: 'back' })
  files[`${A}/trace.log`] = TRACE.join('\n')
  await $.command.run(runCommand)
  await ui.press({ key: 'scope-a' })
  const texts = await logTexts(ui)
  expect(texts.length).toBeGreaterThan(0)
  expect(texts.filter(t => t.wrap !== 'truncate-end')).toEqual([])
})

test('back returns to the overview, and a scope that closes while its page is open keeps its page, ending on closed', async ($, on) => {
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
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect((await logLines(ui)).at(-1)).toBe('■ closed')
})

test("the log draws agents from the run trace alone: another session's dispatch shows like this session's, and a spawn the trace lacks shows nowhere", async ($, on) => {
  const { files, lists } = repo([
    `${at('10:00:00')} 02 main dispatch superdev:implementer i1 Build s1`,
    `${at('10:01:00')} 02 main dispatch superdev:implementer i2 Build s9`,
  ])
  const clock = fakeRepo(on, files, lists)
  on('agent.spawn', async () => ({ model: 'sonnet', agentId: 'ag7' }))
  await $.command.run(runCommand)
  await $.agent.spawn({ tool_use_id: 'tu7', prompt: `${A}/slicetrees/02`, description: 'Live', subagentType: 'superdev:implementer', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false })
  await clock.settle()
  await $.command.run(runCommand)
  const ui = await open($, 'desktop')
  expect(await logLines(ui)).toEqual([`${hm(at('10:00:00'))} ▶ implementer 02`, `${hm(at('10:01:00'))} ▶ implementer 02`])
  expect(await ui.find({ type: 'Text', text: /^● 2 running$/ })).toBeDefined()
})
