import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { PANE, R, dir, fakeRepo, ledger, runCommand } from './testkit'

const A = `${R}/scopes/a`
const B = `${R}/scopes/b`
const repo = () => ({
  files: { [`${A}/ledger.md`]: ledger('implementing', [['01', 'in-progress'], ['02', 'todo']]), [`${B}/ledger.md`]: ledger('implementing', [['01', 'in-progress']]) } as Record<string, string>,
  lists: { [R]: [dir('scopes')], [`${R}/scopes`]: [dir('a'), dir('b')], [A]: [], [B]: [] } as Record<string, ReturnType<typeof dir>[]>,
})

const ENGINE = { plugin: 'engine', tier: 'core' } as const
const spawnArgs = (tu: string, prompt: string, type = 'superdev:implementer', description = 'Build slice 01') => ({
  tool_use_id: tu, prompt, description, subagentType: type, provider: ENGINE, parentModel: 'opus', background: false, fork: false,
})

// Beneath the plugin: a spawn resolves an agent id, a tool call answers, a step reports usage.
const engine = (on: On, ids: Record<string, string>) => {
  on('agent.spawn', async (_$, e) => ({ model: 'sonnet', agentId: ids[e.tool_use_id] ?? 'x' }))
  on('tool.call', async (_$, e) => ({ result: { echo: e.tool }, text: `ran ${e.tool}` }))
  on('turn.complete', async (_$, e) => ({ text: `beneath ${e.turnId}` }))
}

// A tool call made inside a subagent's loop. The engine stamps `agentId` on such a call; the argument type of
// `$.tool.call` does not name it, nor every tool this test invents.
const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)

const step = async ($: Engine, agentId: string | undefined, usage: unknown) => {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, agentId })
  let r = await s.next()
  while (!r.done) r = await s.next()
  return r.value
}

// The keys drawn inside the element keyed `key`, from the pane's drawn tree.
const keysIn = async (ui: { drawn: () => Promise<unknown> }, key: string): Promise<string[]> => {
  const find = (n: unknown): unknown => {
    if (!n || typeof n !== 'object') return undefined
    const o = n as { key?: unknown; props?: { key?: unknown }; children?: unknown[] }
    if (o.key === key || o.props?.key === key) return n
    for (const c of o.children ?? []) { const f = find(c); if (f) return f }
    return undefined
  }
  const out: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const o = n as { key?: unknown; props?: { key?: unknown }; children?: unknown[] }
    const k = o.key ?? o.props?.key
    if (typeof k === 'string') out.push(k)
    for (const c of o.children ?? []) walk(c)
  }
  walk(find(await ui.drawn()))
  return out
}

const openScope = async <P extends 'terminal' | 'desktop' | 'vscode' | 'mobile'>($: Engine, surface: P, scope: string) => {
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
  // the picked scope persists across mounts, so a later surface opens on it already
  if (await ui.find({ key: `scope-${scope}` })) await ui.press({ key: `scope-${scope}` })
  return ui
}

test('a dispatch attributed to a slice shows as a live card in that scope only', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1', tu2: 'ag2' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await $.agent.spawn(spawnArgs('tu2', `Work in ${B}/slicetrees/01`, 'superdev:slice-reviewer', 'Review B'))
  await $.agent.spawn(spawnArgs('tu3', `Review ${A}/scopetree`, 'superdev:final-reviewer', 'Review A'))
  await $.agent.spawn(spawnArgs('tu4', `${A}/slicetrees/01 and ${A}/slicetrees/02`, 'superdev:implementer', 'Two'))
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await openScope($, surface, 'a')
    expect(await ui.find({ type: 'Client', key: 'card-tu1' })).toBeDefined()
    expect(await ui.find({ type: 'Client', key: 'card-tu2' })).toBeUndefined()
    await ui.unmount()
  }
  const ui = await openScope($, 'terminal', 'a')
  expect(await keysIn(ui, 'lane-01')).toContain('card-tu1')
  expect(await keysIn(ui, 'lane-scope')).toEqual(expect.arrayContaining(['card-tu3', 'card-tu4']))
  expect(await keysIn(ui, 'lane-01')).not.toContain('card-tu3')
})

test('a dispatch naming a slice the ledger lacks shows in the scope-level column', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu9: 'ag9' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu9', `Work in ${A}/slicetrees/09`))
  await clock.settle()
  const ui = await openScope($, 'terminal', 'a')
  expect(await keysIn(ui, 'lane-scope')).toContain('card-tu9')
})

test("another repository's scope of the same name shows nowhere on this pane", async ($, on) => {
  const { files, lists } = repo()
  files['/other/.superdev/scopes/a/ledger.md'] = ledger('implementing', [['01', 'in-progress']])
  const clock = fakeRepo(on, files, lists)
  engine(on, { o1: 'ago' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('o1', 'Work in /other/.superdev/scopes/a/slicetrees/01'))
  await clock.settle()
  const ui = await openScope($, 'terminal', 'a')
  expect(await ui.find({ type: 'Client', key: 'card-o1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^DoD 0\/0 · 0 live$/ })).toBeDefined()
})

test('a session started inside a scopetree shows the main working tree', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists, `${A}/scopetree`)
  await $.command.run(runCommand)
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ key: 'scope-a' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/r\/\.superdev/ })).toBeDefined()
})

test('a dispatch naming no single scope shows nowhere and counts nowhere', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, {})
  await $.command.run(runCommand)
  for (const [i, prompt] of ['no run root', `${A}/slicetrees/01 and ${B}/slicetrees/01`, `${R}/scopes/nope/slicetrees/01`].entries()) {
    await $.agent.spawn(spawnArgs(`n${i}`, prompt))
  }
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /· 0 live$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /· [1-9]\d* live$/ })).toBeUndefined()
})

test('a live card pulls its last 2 calls, masked, its ctx, and its clock without a pane redraw', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
  })
  let writes = 0
  on('state.set', async (_$, e, next) => {
    if (e.key === 'snapshot' || e.key === 'liveIndex') writes++
    return next(e)
  })
  await $.command.run(runCommand)
  const idle = writes
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await clock.settle()
  expect(writes).toBe(idle + 1)
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu1' }))).toMatch(/ctx —/)
  const before = writes
  await call($, { tool: 'Read', file_path: '/x/a.ts', agentId: 'ag1' })
  await call($, { tool: 'Write', file_path: '/x/b.ts', content: 'body', agentId: 'ag1' })
  await call($, { tool: 'Grep', pattern: 'foo', agentId: 'ag1' })
  await call($, { tool: 'Bash', command: 'GITEA_TOKEN=abc tea api x', agentId: 'ag1' })
  await step($, 'ag1', null)
  await clock.settle()
  expect(writes).toBe(before)
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  const card = (await ui.find({ type: 'Client', key: 'card-tu1' }))?.props as { props?: { card?: { calls: string[]; ctx: number | null; isDone: boolean } } } | undefined
  const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
  expect(drawn).toMatch(/Bash GITEA_TOKEN=\*\*\* tea api x/)
  expect(drawn).toMatch(/Grep foo/)
  expect(drawn).not.toMatch(/Write \/x\/b\.ts|Read \/x\/a\.ts/)
  expect(drawn).not.toMatch(/body|abc/)
  expect(drawn).toMatch(/ctx 1,012/)
  expect(drawn).toMatch(/running/)
  void card
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  expect(writes).toBe(before + 1)
})

test('a tool call made before the spawn hook hands back is kept on the card', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  // the subagent's first call lands while its spawn is still on its way back up through the pane's hook
  on('agent.spawn', async (_$, e) => {
    await call($, { tool: 'Read', file_path: '/x/early.ts', agentId: 'ag1' })
    return { model: 'sonnet', agentId: e.tool_use_id === 'tu1' ? 'ag1' : 'x' }
  })
  on('tool.call', async (_$, e) => ({ result: { echo: e.tool }, text: `ran ${e.tool}` }))
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await clock.settle()
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu1' }))).toMatch(/Read \/x\/early\.ts/)
})

test('an agent ends on completion, interruption, or failure, foreground or background', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { f1: 'agf', b1: 'agb', x1: 'agx' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('f1', `${A}/slicetrees/01`))
  await $.agent.spawn({ ...spawnArgs('b1', `${A}/slicetrees/02`), background: true })
  await $.agent.spawn(spawnArgs('x1', `${A}/scopetree`, 'superdev:final-reviewer', 'Review'))
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 5, isAborted: false, agentId: 'agf', reason: 'answer' })
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 5, isAborted: true, agentId: 'agb', reason: 'aborted' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'x1', prompt: 'p', description: 'Review', subagent_type: 'superdev:final-reviewer' })
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await openScope($, surface, 'a')
    for (const k of ['f1', 'b1', 'x1']) {
      await ui.post({ key: k }, { in: `card-${k}` })
      expect(JSON.stringify(await ui.drawn({ in: `card-${k}` }))).toMatch(/done/)
    }
    await ui.unmount()
  }
})

test('a background launch is no end', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  on('agent.spawn', async () => ({ model: 'sonnet', agentId: 'agb' }))
  on('tool.call', async () => ({ result: { status: 'async_launched', agentId: 'agb' }, text: 'launched' }))
  await $.command.run(runCommand)
  await $.agent.spawn({ ...spawnArgs('b1', `${A}/slicetrees/01`), background: true })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'b1', prompt: 'p', description: 'x', subagent_type: 'superdev:implementer', run_in_background: true })
  await clock.settle()
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'b1' }, { in: 'card-b1' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-b1' }))).toMatch(/running/)
})

test('a trace-only agent keeps its trace card, turns done on dispatch-end, and never shows twice', async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = '2026-01-01T00:00:00Z 01 main dispatch superdev:implementer tu7 Old\\x20work\n2026-01-01T00:00:01Z 01 ag7 edit impl x.js\n'
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  files[`${A}/trace.log`] += '2026-01-01T00:00:02Z 01 main dispatch superdev:implementer tu1 Build\\x20slice\\x2001\n'
  await $.command.run(runCommand)
  await clock.settle()
  const ui = await openScope($, 'terminal', 'a')
  expect((await ui.findAll({ type: 'Client', key: 'card-tu1' })).length).toBe(1)
  expect(await ui.find({ type: 'Client', key: 'card-tu7' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'card-ag7' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^DoD 0\/0 · 2 live$/ })).toBeDefined()
  await ui.post({ key: 'tu7' }, { in: 'card-tu7' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu7' }))).toMatch(/running/)
  files[`${A}/trace.log`] += '2026-01-01T00:00:03Z 01 main dispatch-end superdev:implementer tu7\n'
  await $.command.run(runCommand)
  await ui.post({ key: 'tu7' }, { in: 'card-tu7' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu7' }))).toMatch(/done/)
})

test("VS Code and mobile show a running agent's fields as static text, as of the pane's last redraw", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1', tu2: 'ag2' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`, 'superdev:implementer', 'Build slice 01'))
  await $.agent.spawn(spawnArgs('tu2', `${A}/slicetrees/02`, 'superdev:implementer', 'Build slice 02'))
  await call($, { tool: 'Read', file_path: '/x/a.ts', agentId: 'ag1' })
  await call($, { tool: 'Grep', pattern: 'foo', agentId: 'ag1' })
  await step($, 'ag1', null)
  await clock.settle()
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /^implementer · a · 01 · Build slice 01 · running · started \d\d:\d\d:\d\d · .*Grep foo · .*ctx 1,012 · as of \d\d:\d\d:\d\d$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^implementer · a · 02 · Build slice 02 · running · started \d\d:\d\d:\d\d · ctx — · as of \d\d:\d\d:\d\d$/ })).toBeDefined()
    // a tool call redraws nothing: the text holds until the pane's next redraw
    await call($, { tool: 'Bash', command: `ls ${surface}`, agentId: 'ag1' })
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: new RegExp(`Bash ls ${surface}`) })).toBeUndefined()
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: new RegExp(`Build slice 01 · running · started \\d\\d:\\d\\d:\\d\\d · Bash ls ${surface} · `) })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane only watches: every hook hands back what beneath answered, and a malformed event fails none (INV-0135)', async ($, on) => {
  const { files, lists } = repo()
  fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'a', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.command.run(runCommand)
  const spawned = await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  expect(spawned).toEqual({ model: 'sonnet', agentId: 'ag1' })
  expect(await call($, { tool: 'Read', file_path: '/x', agentId: 'ag1' })).toMatchObject({ result: { echo: 'Read' }, text: 'ran Read' })
  expect(await call($, { tool: 'Read', file_path: '/x' })).toMatchObject({ text: 'ran Read' })
  expect(await call($, { tool: 'Mystery', agentId: 'nobody' })).toMatchObject({ text: 'ran Mystery' })
  expect(await step($, 'ag1', null)).toMatchObject({ answer: 'a', usage: null })
  expect(await step($, undefined, null)).toMatchObject({ answer: 'a' })
  expect(await $.turn.complete({ turnId: 'z', answer: '', durationMs: 1, isAborted: false, agentId: 'nobody', reason: 'answer' })).toEqual({ text: 'beneath z' })
})

test('the pane delays no spawn, tool call, step, or turn end: each hands back while its bookkeeping still waits (INV-0135)', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'a', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  // once held, every state write the pane's bookkeeping makes waits until the test moves the clock
  let isHeld = false
  let waiting = 0
  on('state.set', async (_$, e, next) => {
    if (isHeld && e.plugin === 'superdev-view') {
      waiting++
      await clock.sleep(60_000)
      waiting--
    }
    return next(e)
  })
  await $.command.run(runCommand)
  isHeld = true
  expect(await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))).toEqual({ model: 'sonnet', agentId: 'ag1' })
  expect(await call($, { tool: 'Read', file_path: '/x', agentId: 'ag1' })).toMatchObject({ text: 'ran Read' })
  expect(await step($, 'ag1', null)).toMatchObject({ answer: 'a' })
  expect(await $.turn.complete({ turnId: 'z', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })).toEqual({ text: 'beneath z' })
  expect(waiting).toBeGreaterThan(0)
  await clock.advance(60_000)
})

// An agent's two ends (its turn's end and its Agent tool result) both bookkeep its end. Each end's read of
// the detail is held, the later end's longest: in either order the first end to land ends the agent, and
// the other leaves its done card as it was.
for (const order of ['turn end first', 'tool result first'] as const) {
  test(`racing ends keep a done card's calls and ctx (${order})`, async ($, on) => {
    const { files, lists } = repo()
    const clock = fakeRepo(on, files, lists)
    engine(on, { tu1: 'ag1' })
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
    })
    let held = 0
    let isHolding = false
    on('state.get', async (_$, e, next) => {
      if (isHolding && e.key === 'liveDetail' && held < 2) await clock.sleep(1000 * ++held)
      return next(e)
    })
    await $.command.run(runCommand)
    await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
    await clock.settle()
    await call($, { tool: 'Grep', pattern: 'foo', agentId: 'ag1' })
    await step($, 'ag1', null)
    await clock.settle()
    isHolding = true
    const turnEnd = () => $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
    const toolEnd = () => $.tool.call({ tool: 'Agent', tool_use_id: 'tu1', prompt: 'p', description: 'x', subagent_type: 'superdev:implementer' })
    if (order === 'turn end first') { await turnEnd(); await toolEnd() } else { await toolEnd(); await turnEnd() }
    await clock.advance(1000)
    await clock.settle()
    await clock.advance(1000)
    await clock.settle()
    const ui = await openScope($, 'desktop', 'a')
    await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
    const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
    expect(drawn).toMatch(/done/)
    expect(drawn).toMatch(/Grep foo/)
    expect(drawn).toMatch(/ctx 1,012/)
  })
}

// An agent's last tool call can still be in its bookkeeping when its end's bookkeeping starts: the call's
// write of the detail is held here. The done card still shows that call, and no detail for the ended agent
// is left behind.
test("a done card keeps a last call whose bookkeeping finishes after the agent's end", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  let isHeld = false
  let detail: Record<string, unknown> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveDetail' && !isHeld && JSON.stringify(e.value).includes('Grep last')) { isHeld = true; await clock.sleep(1000) }
    if (e.key === 'liveDetail') detail = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await call($, { tool: 'Grep', pattern: 'first', agentId: 'ag1' })
  await clock.settle()
  await call($, { tool: 'Grep', pattern: 'last', agentId: 'ag1' })
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  await clock.advance(1000)
  await clock.settle()
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
  expect(drawn).toMatch(/done/)
  expect(drawn).toMatch(/Grep last/)
  expect(drawn).toMatch(/Grep first/)
  expect(detail).not.toHaveProperty('ag1')
})

// A call whose hook fires only after the agent's end has been bookkept goes onto the done card too.
test("a call bookkept after an agent's end lands on its done card, not in fresh detail", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  let detail: Record<string, unknown> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveDetail') detail = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await call($, { tool: 'Grep', pattern: 'first', agentId: 'ag1' })
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  await call($, { tool: 'Grep', pattern: 'late', agentId: 'ag1' })
  await clock.settle()
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
  expect(drawn).toMatch(/Grep late/)
  expect(drawn).toMatch(/Grep first/)
  expect(detail).not.toHaveProperty('ag1')
})

// Engine forks and remote agents may never send a turn's end, so detail for ids no scope attributes is
// held only in a small buffer of the latest ones, while every running attributed agent keeps its own.
test('detail for agents no scope attributes stays bounded, and an attributed agent keeps its own', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  let held: Record<string, unknown> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveDetail') held = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await call($, { tool: 'Grep', pattern: 'kept', agentId: 'ag1' })
  for (let i = 0; i < 50; i++) {
    await call($, { tool: 'Read', file_path: `/x/${i}.ts`, agentId: `stray${i}` })
    await clock.settle()
  }
  expect(Object.keys(held).length).toBeLessThanOrEqual(9)
  expect(held).toHaveProperty('stray49')
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu1' }))).toMatch(/Grep kept/)
})

// A call or a step whose hook fires after the agent's end redraws nothing: only the done card's own pull
// reads it.
test("a call or step bookkept after an agent's end writes nothing the pane reads", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
  })
  let writes = 0
  on('state.set', async (_$, e, next) => {
    if (e.key === 'snapshot' || e.key === 'liveIndex' || e.key === 'selected') writes++
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  const ended = writes
  await call($, { tool: 'Grep', pattern: 'late', agentId: 'ag1' })
  await step($, 'ag1', null)
  await clock.settle()
  expect(writes).toBe(ended)
  const ui = await openScope($, 'desktop', 'a')
  await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
  const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
  expect(drawn).toMatch(/Grep late/)
  expect(drawn).toMatch(/ctx 1,012/)
})

// An end's hook fires before a call's: the end's first read of the index is held, and the call still
// queues behind the end, so the call lands on the done card and never in the running agent's detail.
for (const by of ['turn end', 'tool result'] as const) {
  test(`a call whose hook fires after an agent's end never goes ahead of it (${by})`, async ($, on) => {
    const { files, lists } = repo()
    const clock = fakeRepo(on, files, lists)
    engine(on, { tu1: 'ag1' })
    let isHolding = false
    let isLateInDetail = false
    on('state.get', async (_$, e, next) => {
      if (isHolding && e.key === 'liveIndex') { isHolding = false; await clock.sleep(1000) }
      return next(e)
    })
    on('state.set', async (_$, e, next) => {
      if (e.key === 'liveDetail' && JSON.stringify(e.value).includes('Grep late')) isLateInDetail = true
      return next(e)
    })
    await $.command.run(runCommand)
    await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
    await clock.settle()
    await call($, { tool: 'Grep', pattern: 'first', agentId: 'ag1' })
    await clock.settle()
    isHolding = true
    if (by === 'turn end') await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
    else await $.tool.call({ tool: 'Agent', tool_use_id: 'tu1', prompt: 'p', description: 'x', subagent_type: 'superdev:implementer' })
    await call($, { tool: 'Grep', pattern: 'late', agentId: 'ag1' })
    await clock.settle()
    await clock.advance(1000)
    await clock.settle()
    expect(isLateInDetail).toBe(false)
    const ui = await openScope($, 'desktop', 'a')
    await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
    const drawn = JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
    expect(drawn).toMatch(/done/)
    expect(drawn).toMatch(/Grep late/)
  })
}

// An agent can end while its spawn's bookkeeping still checks which run roots hold a ledger: that check is
// held here past both ends. The spawn's index write still goes ahead of the end, so the card shows done.
for (const by of ['turn end', 'tool result'] as const) {
  test(`an agent that ends while its spawn is still bookkept shows as done (${by})`, async ($, on) => {
    const { files, lists } = repo()
    let isHolding = false
    const clock = fakeRepo(on, files, lists, '/r', async path => {
      if (isHolding && path.endsWith('/ledger.md')) { isHolding = false; await clock.sleep(1000) }
    })
    engine(on, { tu1: 'ag1' })
    await $.command.run(runCommand)
    await clock.settle()
    isHolding = true
    await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
    if (by === 'turn end') await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
    else await $.tool.call({ tool: 'Agent', tool_use_id: 'tu1', prompt: 'p', description: 'x', subagent_type: 'superdev:implementer' })
    await clock.settle()
    await clock.advance(1000)
    await clock.settle()
    const ui = await openScope($, 'desktop', 'a')
    await ui.post({ key: 'tu1' }, { in: 'card-tu1' })
    expect(JSON.stringify(await ui.drawn({ in: 'card-tu1' }))).toMatch(/done/)
  })
}

// A card already open when its agent ends keeps pulling for a short grace, so a call bookkept just after
// the end still reaches it; once the grace has passed the card stops pulling. The scope page's compact card
// draws only its mark, so the pulls are counted at the reads that answer them.
test('an open done card keeps pulling just after the end, then stops', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  let pulls = 0
  on('state.get', async (_$, e, next) => {
    if (e.key === 'liveFinal') pulls++
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await clock.settle()
  const ui = await openScope($, 'desktop', 'a')
  const drawn = async () => JSON.stringify(await ui.drawn({ in: 'card-tu1' }))
  await call($, { tool: 'Grep', pattern: 'first', agentId: 'ag1' })
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  await ui.advance(1000)
  await clock.settle()
  expect(await drawn()).toMatch(/■/)
  const during = pulls
  await ui.advance(1000)
  await clock.settle()
  expect(pulls).toBeGreaterThan(during)
  await ui.advance(60_000)
  await clock.settle()
  const after = pulls
  await ui.advance(5000)
  await clock.settle()
  expect(pulls).toBe(after)
})

// The session state holds an ended agent only while its scope is active here, so it does not grow with
// every agent a long session spawns.
test("an ended agent's entries leave the session state once its scope is no longer active", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  const held: Record<string, Record<string, unknown>> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveIndex' || e.key === 'liveFinal') held[e.key] = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  expect(held.liveFinal).toHaveProperty('tu1')
  files[`${A}/ledger.md`] = ledger('closed', [['01', 'merged'], ['02', 'merged']])
  await $.command.run(runCommand)
  await clock.settle()
  expect({ ...held.liveIndex, ...held.liveFinal }).not.toHaveProperty('tu1')
})

// A scan whose `scopes/` read fails knows no scope's stage, so it reads as no evidence that a scope ended.
test("a scan whose scopes read fails keeps an ended agent's entries", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  const held: Record<string, Record<string, unknown>> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveIndex' || e.key === 'liveFinal') held[e.key] = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  delete lists[`${R}/scopes`]
  await $.command.run(runCommand)
  await clock.settle()
  expect(held.liveFinal).toHaveProperty('tu1')
})

// A failed `scopes/` read shows no scope ended either: the pane keeps the scopes it last saw.
test('a scan whose scopes read fails keeps the scopes the last scan stored', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  let stored: { scopes?: { name: string }[] | null } | null = null
  on('state.set', async (_$, e, next) => {
    if (e.key === 'snapshot') stored = e.value as typeof stored
    return next(e)
  })
  await $.command.run(runCommand)
  delete lists[`${R}/scopes`]
  await $.command.run(runCommand)
  await clock.settle()
  expect(stored!.scopes?.map(s => s.name)).toEqual(['a', 'b'])
})

test('a scan whose scopes read fails keeps what a trace card last showed', async ($, on) => {
  const { files, lists } = repo()
  files[`${A}/trace.log`] = '2026-01-01T00:00:00Z 01 main dispatch superdev:implementer tu7 Old\\x20work\n2026-01-01T00:00:01Z 01 ag7 edit impl x.js\n'
  const clock = fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  delete lists[`${R}/scopes`]
  await $.command.run(runCommand)
  await clock.settle()
  const ui = await openScope($, 'terminal', 'a')
  await ui.post({ key: 'tu7' }, { in: 'card-tu7' })
  expect(JSON.stringify(await ui.drawn({ in: 'card-tu7' }))).toMatch(/trace events/)
})

// A scope whose ledger read fails while the ledger is there has no known stage, so it reads as no evidence
// that the scope ended.
test("a scan whose ledger read fails for one scope keeps that scope's ended agent's entries", async ($, on) => {
  const { files, lists } = repo()
  // Once `refuse` is set, the ledger still exists, yet its read fails.
  let refuse = false
  const clock = fakeRepo(on, new Proxy(files, { get: (f, p: string) => (refuse && p === `${A}/ledger.md` ? undefined : f[p]) }), lists)
  engine(on, { tu1: 'ag1' })
  const held: Record<string, Record<string, unknown>> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveIndex' || e.key === 'liveFinal') held[e.key] = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  refuse = true
  await $.command.run(runCommand)
  await clock.settle()
  expect(held.liveFinal).toHaveProperty('tu1')
})

// A run root with no ledger is no scope: a half-removed run root ends its agents as a removed one does.
test("a scope directory with no ledger drops its ended agent's entries", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  const held: Record<string, Record<string, unknown>> = {}
  on('state.set', async (_$, e, next) => {
    if (e.key === 'liveIndex' || e.key === 'liveFinal') held[e.key] = e.value as Record<string, unknown>
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `${A}/slicetrees/01`))
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await clock.settle()
  delete files[`${A}/ledger.md`]
  await $.command.run(runCommand)
  await clock.settle()
  expect({ ...held.liveIndex, ...held.liveFinal }).not.toHaveProperty('tu1')
})

// --- Running now: every running agent of every active scope, newest dispatch first ---

const runningRepo = () => {
  const { files, lists } = repo()
  const at = (ms: number) => new Date(Date.now() + ms).toISOString()
  files[`${A}/trace.log`] = [
    `${at(-60_000)} 01 main dispatch superdev:implementer old Old\\x20work`,
    `${at(60_000)} 02 main dispatch superdev:slice-reviewer new New\\x20review`,
    `${at(-30_000)} 01 main dispatch superdev:implementer gone Done\\x20work`,
    `${at(-20_000)} 01 main dispatch-end superdev:implementer gone`,
  ].join('\n')
  const C = `${R}/scopes/c`
  files[`${C}/ledger.md`] = ledger('closed', [['01', 'merged']])
  files[`${C}/trace.log`] = `${at(0)} 01 main dispatch superdev:implementer shut Closed\\x20scope`
  lists[`${R}/scopes`] = [dir('a'), dir('b'), dir('c')]
  lists[C] = []
  return { files, lists }
}

test('Running now lists every running agent of every active scope once, newest dispatch first, with type and scope · slice', async ($, on) => {
  const { files, lists } = runningRepo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${B}/slicetrees/01`))
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.findAll({ type: 'Client' })).map(c => c.key)).toEqual(['running-new', 'running-tu1', 'running-old'])
    expect((await ui.find({ key: 'section-running' }))?.text).toMatch(/Running now \(3\)$/)
    for (const [key, type, where] of [['new', 'slice-reviewer', 'a · 02'], ['tu1', 'implementer', 'b · 01'], ['old', 'implementer', 'a · 01']]) {
      await ui.post({ key }, { in: `running-${key}` })
      const drawn = JSON.stringify(await ui.drawn({ in: `running-${key}` }))
      expect(drawn).toMatch(new RegExp(type))
      expect(drawn).toMatch(new RegExp(where))
    }
    await ui.unmount()
  }
})

test('a done agent and an agent of a closed scope are absent, and with none running the section says so', async ($, on) => {
  const { files, lists } = runningRepo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${B}/slicetrees/01`))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  const keys = (await ui.findAll({ type: 'Client' })).map(c => c.key)
  expect(keys).not.toContain('running-gone')
  expect(keys).not.toContain('running-shut')
  expect(await ui.find({ type: 'Text', text: /nothing running/ })).toBeUndefined()
  await ui.unmount()
  files[`${A}/trace.log`] = ''
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, agentId: 'ag1', reason: 'answer' })
  await $.command.run(runCommand)
  await clock.settle()
  const after = await $.ui.mount({ plugin: 'superdev-view', surface: 'terminal', ...PANE })
  expect(await after.findAll({ type: 'Client' })).toEqual([])
  expect(await after.find({ type: 'Text', text: /nothing running/ })).toBeDefined()
})

test("on vscode and mobile a trace-only running agent's Running now text carries its dispatch time", async ($, on) => {
  const { files, lists } = runningRepo()
  const clock = fakeRepo(on, files, lists)
  await $.command.run(runCommand)
  await clock.settle()
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => /Old work/.test(t ?? ''))).toMatch(/^implementer · a · 01 · Old work · running · started \d\d:\d\d:\d\d · as of \d\d:\d\d:\d\d$/)
    await ui.unmount()
  }
})

test("a running entry's post answer carries elapsed time, ctx, and the last two calls, and a tool call redraws no pane", async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
  })
  let writes = 0
  on('state.set', async (_$, e, next) => {
    if (e.key === 'snapshot' || e.key === 'liveIndex' || e.key === 'selected' || e.key === 'sections') writes++
    return next(e)
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    const before = writes
    await call($, { tool: 'Read', file_path: `/x/${surface}-1.ts`, agentId: 'ag1' })
    await call($, { tool: 'Grep', pattern: `${surface}-2`, agentId: 'ag1' })
    await call($, { tool: 'Grep', pattern: `${surface}-3`, agentId: 'ag1' })
    await step($, 'ag1', null)
    await clock.settle()
    expect(writes).toBe(before)
    await ui.post({ key: 'tu1' }, { in: 'running-tu1' })
    const drawn = JSON.stringify(await ui.drawn({ in: 'running-tu1' }))
    expect(drawn).toMatch(/⏱ \d\d:\d\d/)
    expect(drawn).toMatch(/ctx 1,012/)
    expect(drawn).toMatch(new RegExp(`Grep ${surface}-3`))
    expect(drawn).toMatch(new RegExp(`Grep ${surface}-2`))
    expect(drawn).not.toMatch(new RegExp(`${surface}-1`))
    expect(drawn).toMatch(/a · 01/)
    await ui.unmount()
  }
})

test('on vscode and mobile each running entry is text carrying the same fields', async ($, on) => {
  const { files, lists } = repo()
  const clock = fakeRepo(on, files, lists)
  engine(on, { tu1: 'ag1' })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2 } }
  })
  await $.command.run(runCommand)
  await $.agent.spawn(spawnArgs('tu1', `Work in ${A}/slicetrees/01`))
  await call($, { tool: 'Read', file_path: '/x/a.ts', agentId: 'ag1' })
  await call($, { tool: 'Grep', pattern: 'foo', agentId: 'ag1' })
  await call($, { tool: 'Grep', pattern: 'bar', agentId: 'ag1' })
  await step($, 'ag1', null)
  await clock.settle()
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'superdev-view', surface, ...PANE })
    expect(await ui.findAll({ type: 'Client' })).toEqual([])
    expect(await ui.find({ type: 'Text', text: /^implementer · a · 01 · Build slice 01 · running · started \d\d:\d\d:\d\d · Grep bar · Grep foo · ctx 1,012 · as of \d\d:\d\d:\d\d$/ })).toBeDefined()
    await ui.unmount()
  }
})
