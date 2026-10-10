import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Agent, CardData, Draft, Intent, KbPage, LiveAgent, LiveDetail, Scope, Snapshot } from '../types'
import { attribute, ctxOf, runRoots, target } from './live'
import { frontmatter, header, intent, progress, slices, traceAgents } from './parse'
import { STAGES, cards, pipeline, scopeLanes, scopeMap, tiles } from './svg'
import type { Drawing, Row } from './svg'

const PANE = 'superdev-view'
const snapshot = atom({ plugin: 'superdev-view', key: 'snapshot' } as const, null)
const selected = atom({ plugin: 'superdev-view', key: 'selected' } as const, null)
// The pane reads `liveIndex`, written only when an agent starts or ends, or when a scan drops an ended agent
// whose scope is no longer active (`prune`). Only a card's message hook reads
// `liveDetail` (a running agent's calls and ctx, written on every tool call and model step, keyed by
// agentId), `liveFinal` (an ended agent's last calls and ctx, keyed by dispatch, written at its end and by
// a call or step bookkept after it), and `traceActivity` (written by a scan whose trace lines changed what
// an agent last did), so no tool call or model step redraws the pane, before an agent's end or after it.
const liveIndex = atom({ plugin: 'superdev-view', key: 'liveIndex' } as const, {})
const liveDetail = atom({ plugin: 'superdev-view', key: 'liveDetail' } as const, {})
const liveFinal = atom({ plugin: 'superdev-view', key: 'liveFinal' } as const, {})
// `liveDetail` and `liveFinal` as last written, for the static text of a surface without cards: a plain
// read here subscribes no drawing, so a tool call or a step still redraws nothing and the text holds the
// values as of the pane's last redraw.
// simplicity: module variables a hot reload empties, so an agent's static text shows no calls and `ctx —`
// until its next call or step; a host read that subscribes nothing would lift that.
const shownDetail: Record<string, LiveDetail> = {}
const shownFinal: Record<string, LiveDetail> = {}
const traceActivity = atom({ plugin: 'superdev-view', key: 'traceActivity' } as const, {})
const STAGE_COLOR: Record<string, string> = {
  planned: 'gray', implementing: 'yellow', merged: 'cyan', reviewed: 'cyan',
  'documented-unreviewed': 'cyan', documented: 'blue', submitted: 'magenta', shipped: 'green', closed: 'gray',
}
const STATUS_MARK: Record<string, string> = { todo: '·', 'in-progress': '▶', 'in-review': '◆', merged: '✓' }
const ACTION_HEX: Record<string, string> = { upsert: '#0284c7', patch: '#7c3aed', delete: '#dc2626' }

function age(ms: number): string {
  if (ms < 60e3) return `${Math.round(ms / 1e3)}s`
  if (ms < 3600e3) return `${Math.round(ms / 60e3)}m`
  return `${Math.round(ms / 3600e3)}h`
}

// A directory with no ledger is no scope (null). A ledger that is there but fails to read leaves the scope's
// stage unknown ('unread'); only then does the scan look again, to tell the two apart.
async function scanScope($: EngineInterface, dir: string, name: string, activity: Record<string, Activity>): Promise<Scope | 'unread' | null> {
  const ledger = await $.fs.read(`${dir}/ledger.md`).catch(() => null)
  if (ledger === null) return (await $.fs.exists(`${dir}/ledger.md`).catch(() => true)) ? 'unread' : null
  const stage = header(ledger, 'Stage') || '?'
  const isActive = stage !== 'closed'
  const lock = await $.fs.stat(`${dir}/run.lock`).catch(() => null)
  const dod = await $.fs.read(`${dir}/dod.md`).catch(() => '')
  const trace = isActive ? await $.fs.read(`${dir}/trace.log`).catch(() => '') : ''
  const trees = isActive ? await $.fs.list(`${dir}/slicetrees`).catch(() => []) : []
  const traced = traceAgents(trace)
  Object.assign(activity, traced.activity)
  return {
    name,
    stage,
    branch: header(ledger, 'Branch'),
    anchor: header(ledger, 'Anchor'),
    lockMtime: lock ? lock.mtimeMs : null,
    dod: progress(dod),
    slices: slices(ledger),
    slicetrees: trees.filter(t => t.kind === 'dir').map(t => t.name),
    agents: traced.agents,
  }
}

// Writes the snapshot, then the trace activity when given, each only when it changed: every snapshot write
// redraws the pane and reloads its SVG frames. The host's scan needs each read and update to name its atom
// directly, so the two atoms share this helper rather than a generic one taking the atom.
async function store($: EngineInterface, next: Snapshot, activity?: Record<string, Activity>): Promise<void> {
  const changed = (prev: unknown, value: unknown) => JSON.stringify(prev) !== JSON.stringify(value)
  if (changed(await read($, snapshot), next)) await update($, snapshot, () => next)
  if (activity && changed(await read($, traceActivity), activity)) await update($, traceActivity, () => activity)
}

// --- the live layer: this session's own subagents (INV-0135: each hook hands on what it was handed) ---

const NO_DETAIL: LiveDetail = { calls: [], ctx: null }

// Each hook hands back what beneath answered at once and leaves its bookkeeping running, so the pane never
// holds a tool call, a step, a turn's end, or a spawn; a failure there fails no hook.
const watch = (work: () => Promise<void>) => void work().catch(() => { /* the pane only watches */ })

// One ledger read per spawn, never per tool call or step: a root counts only when it holds a ledger.
async function noteSpawn($: EngineInterface, e: { tool_use_id: string; prompt: string; description: string; subagentType: string }, agentId: string | undefined): Promise<void> {
  const withLedger = new Set<string>()
  for (const root of runRoots(e.prompt)) if (await $.fs.exists(`${root}/ledger.md`).catch(() => false)) withLedger.add(root)
  const at = attribute(e.prompt, root => withLedger.has(root))
  if (!at) return
  const agent: LiveAgent = { key: e.tool_use_id, agentId: agentId ?? null, ...at, type: e.subagentType, desc: e.description, start: Date.now(), end: null }
  await update($, liveIndex, m => ({ ...m, [agent.key]: agent }))
}

const keyOf = async ($: EngineInterface, agentId: string): Promise<string | undefined> =>
  Object.values(await read($, liveIndex)).find(l => l.agentId === agentId && l.end === null)?.key

// One agent's spawn, its detail writes, and its ends run one after another, in the order their hooks fired,
// so an end finds the spawn's index write and every call and step bookkept before it, and a write that
// follows the end finds the agent ended.
// Different agents never wait on each other. The queue entry goes once its last work has run.
const queues: Record<string, Promise<void>> = {}
function inOrder(id: string, work: () => Promise<void>): Promise<void> {
  const run = (queues[id] ?? Promise.resolve()).then(work)
  const tail = run.catch(() => { /* the next work runs anyway */ })
  queues[id] = tail
  void tail.then(() => { if (queues[id] === tail) delete queues[id] })
  return run
}

// Keyed by agentId, not by dispatch: a subagent's first calls can land before its spawn hook has written
// the index, and the agentId joins them to the dispatch once it has. Every running agent the index names
// keeps its detail; of the ids it does not name (one not yet indexed, or one no scope attributes, which may
// never send a turn's end), only the latest UNINDEXED written stay, newest last in key order. A write for an
// agent that has already ended goes into that agent's entry in `liveFinal` instead, so its done card keeps
// it, the pane does not redraw, and no detail is left behind for it.
// simplicity: a fixed buffer of 8, so a ninth unindexed id evicts the oldest; a burst of more than 8
// spawns whose first calls all beat their index write would lose the oldest's early calls.
const UNINDEXED = 8
const noteDetail = ($: EngineInterface, agentId: string, fn: (d: LiveDetail) => LiveDetail): Promise<void> => inOrder(agentId, async () => {
  const index = Object.values(await read($, liveIndex))
  const running = new Set(index.filter(l => l.end === null).map(l => l.agentId))
  const ended = !running.has(agentId) && index.find(l => l.agentId === agentId)?.key
  if (ended) {
    await setFinal($, ended, fn)
    return
  }
  await update($, liveDetail, m => {
    const { [agentId]: d = NO_DETAIL, ...rest } = m
    const next: Record<string, LiveDetail> = { ...rest, [agentId]: fn(d) }
    for (const k of Object.keys(next).filter(k => !running.has(k)).slice(0, -UNINDEXED)) delete next[k]
    for (const k of Object.keys(shownDetail)) if (!(k in next)) delete shownDetail[k]
    Object.assign(shownDetail, next)
    return next
  })
})

async function setFinal($: EngineInterface, key: string, fn: (d: LiveDetail) => LiveDetail): Promise<void> {
  await update($, liveFinal, m => {
    shownFinal[key] = fn(m[key] ?? NO_DETAIL)
    return { ...m, [key]: shownFinal[key] }
  })
}

async function forget($: EngineInterface, agentId: string): Promise<void> {
  delete shownDetail[agentId]
  await update($, liveDetail, m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== agentId)))
}

// An ended agent moves its last calls and ctx from the detail atom to `liveFinal`, written before the index
// marks it ended so its card never shows it done without them. Its two ends (its turn's end and its Agent
// tool result) queue behind each other and behind its own spawn and detail writes: only the first end to
// land finds it running, and the other leaves it as it is. Run only from inside the agent's queue.
async function endNow($: EngineInterface, key: string): Promise<void> {
  const agent = (await read($, liveIndex))[key]
  if (!agent || agent.end !== null) return
  const final = (agent.agentId && (await read($, liveDetail))[agent.agentId]) || NO_DETAIL
  await setFinal($, key, () => final)
  await update($, liveIndex, m => (m[key] && m[key].end === null ? { ...m, [key]: { ...m[key], end: Date.now() } } : m))
  if (agent.agentId) await forget($, agent.agentId)
}

// Each dispatch's agentId, as its spawn hands back, so an Agent tool result joins that agent's queue the
// moment its hook fires, ahead of any call whose hook fires later; no read comes before the queue.
// simplicity: a module variable a hot reload empties, so an end after a reload queues by its dispatch key
// and a call that fires after it may go ahead of it into the detail the end then carries over.
const agentOf: Record<string, string> = {}
const noteEnd = ($: EngineInterface, key: string): Promise<void> => inOrder(agentOf[key] ?? key, () => endNow($, key))

// An ended agent whose run root is no active scope of this pane (its scope closed, gone, or left with no
// ledger, or another repository's) leaves the session state: its index entry, then its final detail and its
// dispatch's agentId.
// The index goes first, so a card never reads it without its final detail. Only a scan runs this.
async function prune($: EngineInterface, active: Set<string>): Promise<void> {
  const gone = new Set(Object.values(await read($, liveIndex)).filter(l => l.end !== null && !active.has(l.root)).map(l => l.key))
  if (gone.size === 0) return
  const keep = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => !gone.has(k)))
  await update($, liveIndex, keep)
  await update($, liveFinal, keep)
  for (const k of gone) {
    delete agentOf[k]
    delete shownFinal[k]
  }
}

// What a card draws: a live agent from the index and its detail, or its final detail once it ended, a trace-only one from the snapshot and
// the trace activity. Read by the message hook, outside any drawing, so it subscribes nothing.
async function cardData($: EngineInterface, key: string): Promise<CardData | null> {
  const now = Date.now()
  const live = (await read($, liveIndex))[key]
  if (live) {
    const d = live.end !== null ? (await read($, liveFinal))[key] ?? NO_DETAIL : (live.agentId && (await read($, liveDetail))[live.agentId]) || NO_DETAIL
    return { key, type: live.type, desc: live.desc, isDone: live.end !== null, isLive: true, start: live.start, end: live.end, calls: d.calls, ctx: d.ctx, last: null, events: null, now }
  }
  const traced = (await read($, snapshot))?.scopes?.flatMap(s => s.agents).find(a => a.key === key)
  if (!traced) return null
  const act = (await read($, traceActivity))[key]
  const last = act ? `${act.lastKind}${act.last ? ` · ${act.last.slice(11, 19)}` : ''}` : null
  return { ...placeholder(traced, now), last, events: act?.events ?? null }
}

// A card's first props, from what the pane already reads; its first post fills in the rest.
const placeholder = (a: Agent, now: number, live?: LiveAgent): CardData => ({
  key: a.key, type: a.type, desc: a.desc, isDone: a.isDone, isLive: !!live, start: live?.start ?? null, end: live?.end ?? null,
  calls: (live && shownFinal[live.key]?.calls) ?? [], ctx: (live && shownFinal[live.key]?.ctx) ?? null, last: null, events: null, now,
})

const asAgent = (l: LiveAgent): Agent => ({ key: l.key, type: l.type, desc: l.desc, slice: l.slice, isDone: l.end !== null })

// A scope's agents: the trace's, less any this session saw start, plus this session's live ones whose run
// root is this pane's own `<root>/scopes/<name>`, so another repository's scope of the same name stays out.
const agentsOf = (root: string, s: Scope, index: Record<string, LiveAgent>): { agents: Agent[]; live: Record<string, LiveAgent> } => {
  const live = Object.fromEntries(Object.values(index).filter(l => l.root === `${root}/scopes/${s.name}`).map(l => [l.key, l]))
  return { agents: [...s.agents.filter(a => !(a.key in live)), ...Object.values(live).map(asAgent)], live }
}

const hhmmss = (ms: number) => new Date(ms).toTimeString().slice(0, 8)

// The main working tree holds `.superdev/` (a scopetree or linked worktree has none of its own).
// Only the items superdev's docs define are read: info.json, brainstorm/, scopes/, kb-pending/,
// design/, dod-draft-<slug>.md. Anything else in the folder is ignored.
async function scan($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const git = await $.process
    .run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })
    .catch(() => undefined)
  const main = git?.exitCode === 0 ? git.stdout.trim().replace(/\/\.git\/?$/, '') : cwd
  const root = `${main}/.superdev`
  const empty = { root, assignees: null, intents: null, scopes: null, kbPending: null, designs: null, drafts: [] }
  if (!(await $.fs.exists(root))) {
    await store($, { ...empty, error: 'no .superdev folder' })
    return
  }
  const top = new Map((await $.fs.list(root)).map(t => [t.name, t.kind]))
  const files = async (sub: string, ext: string) =>
    (await $.fs.list(`${root}/${sub}`).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith(ext))

  let assignees: Snapshot['assignees'] = null
  if (top.get('info.json') === 'file') {
    const info = await $.fs.read(`${root}/info.json`).then(t => JSON.parse(t) as Record<string, { assignee?: string }>).catch(() => ({}))
    assignees = Object.entries(info).map(([role, v]) => ({ role, who: v?.assignee ?? '' }))
  }
  const intents: Intent[] | null = top.get('brainstorm') === 'dir'
    ? await Promise.all((await files('brainstorm', '.md')).map(async f => intent(f.name.replace(/\.md$/, ''), await $.fs.read(`${root}/brainstorm/${f.name}`).catch(() => ''))))
    : null
  const activity: Record<string, Activity> = {}
  // The scope directories this scan saw, or null when the `scopes/` read failed. A failed read keeps the
  // scopes and the trace activity the last scan stored, so the pane does not blank until the next good scan.
  const listed = top.get('scopes') === 'dir' ? await $.fs.list(`${root}/scopes`).then(l => l.filter(d => d.kind === 'dir')).catch(() => null) : []
  let scanned: (Scope | 'unread' | null)[] = []
  let scopes: Scope[] | null = null
  if (listed === null) scopes = (await read($, snapshot))?.scopes ?? []
  else if (top.get('scopes') === 'dir') {
    scanned = await Promise.all(listed.map(d => scanScope($, `${root}/scopes/${d.name}`, d.name, activity)))
    scopes = scanned.filter((s): s is Scope => s !== null && s !== 'unread')
  }
  let kbPending: KbPage[] | null = null
  if (top.get('kb-pending') === 'dir') {
    const dirs = (await $.fs.list(`${root}/kb-pending`).catch(() => [])).filter(d => d.kind === 'dir')
    kbPending = (await Promise.all(dirs.map(async d =>
      Promise.all((await files(`kb-pending/${d.name}`, '.md')).map(async f => {
        const fm = frontmatter(await $.fs.read(`${root}/kb-pending/${d.name}/${f.name}`).catch(() => ''))
        return { scope: d.name, title: fm.title || f.name, action: fm.action }
      })),
    ))).flat()
  }
  const designs = top.get('design') === 'dir' ? (await files('design', '.html')).map(f => f.name.replace(/\.html$/, '')) : null
  const drafts: Draft[] = await Promise.all(
    [...top].filter(([n, k]) => k === 'file' && /^dod-draft-.+\.md$/.test(n)).map(async ([n]) => ({
      slug: n.replace(/^dod-draft-|\.md$/g, ''),
      dod: progress(await $.fs.read(`${root}/${n}`).catch(() => '')),
    })),
  )
  await store($, { root, assignees, intents, scopes, kbPending, designs, drafts }, listed === null ? undefined : activity)
  // A scope counts as ended only when the scan knows it: its ledger reads closed, its ledger is not there, or
  // its directory is gone. A failed read is no such evidence: a scope whose ledger is there but fails to read
  // stays active, and a failed `scopes/` read prunes nothing.
  if (listed) {
    const isActive = (s: Scope | 'unread' | null | undefined) => s === 'unread' || (!!s && s.stage !== 'closed')
    await prune($, new Set(listed.filter((_, i) => isActive(scanned[i])).map(d => `${root}/scopes/${d.name}`)))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'superdev-view', description: 'Show the .superdev folder in a pane' })
    void scan($)
    // ponytail: 3 s full rescan of .superdev, a file watch if the folder grows large
    $.clock.every(3000, () => void scan($))
    void $.ui.open({ id: PANE, title: 'superdev' })
    return next(e)
  })

  on('command.run', { command: 'superdev-view' }, async $ => {
    await scan($)
    await $.ui.open({ id: PANE, title: 'superdev' })
    return { text: 'superdev pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && r.agentId) agentOf[e.tool_use_id] = r.agentId
    // joins the agent's queue as the hook fires, so its index write goes ahead of that agent's end
    if (!r.deny) watch(() => inOrder(r.agentId ?? e.tool_use_id, () => noteSpawn($, e, r.agentId)))
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    // both join their queues as the hook fires, neither waiting on the other
    watch(async () => {
      const status = (r.result as { status?: unknown } | undefined)?.status
      await Promise.all([
        e.agentId && noteDetail($, e.agentId, d => ({ ...d, calls: [target(e.tool, e), ...d.calls].slice(0, 3) })),
        e.tool === 'Agent' && e.tool_use_id && status !== 'async_launched' && noteEnd($, e.tool_use_id),
      ])
    })
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    watch(async () => {
      if (e.agentId && r?.usage) await noteDetail($, e.agentId, d => ({ ...d, ctx: ctxOf(r.usage) }))
    })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const agentId = e.agentId
    // joins the agent's queue as the hook fires; the lookup of its dispatch runs inside it
    if (agentId) watch(() => inOrder(agentId, async () => {
      const key = await keyOf($, agentId)
      if (key) await endNow($, key)
      else await forget($, agentId)
    }))
    return r
  })

  on('ui.message', async ($, e) => {
    const key = (e.data as { key?: unknown } | null)?.key
    const card = typeof key === 'string' ? await cardData($, key) : null
    return card ? { props: card } : {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    const Client = (e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in table ? table.Client : undefined
    const art = (d: Drawing) => (Svg ? <Svg source={d.source} alt={d.alt} isInteractive /> : null)

    const snap: Snapshot | null = await read($, snapshot)
    if (!snap) return <Text dimColor>Scanning .superdev…</Text>
    if (snap.error) return <Text dimColor>{snap.error} ({snap.root})</Text>
    const all = snap.scopes ?? []
    const active = all.filter(s => s.stage !== 'closed')
    const closed = all.filter(s => s.stage === 'closed')
    const now = Date.now()
    const pick = await read($, selected)
    const index = await read($, liveIndex)
    const withLive = (s: Scope) => ({ ...s, ...agentsOf(snap.root, s, index) })
    const picked = active.find(s => s.name === pick)
    const open = picked && withLive(picked)
    const back = () => void update($, selected, () => null)
    const choose = (name: string) => () => void update($, selected, () => name)

    if (open) {
      const live = open.agents.filter(a => !a.isDone).length
      // Without cards, a live agent's text carries a card's fields as of this redraw: an ended one's final
      // calls and ctx from `shownFinal`, a running one's current ones from `shownDetail`.
      const staticDetail = (l: LiveAgent | undefined) => l && ((l.end !== null ? shownFinal[l.key] : l.agentId ? shownDetail[l.agentId] : undefined) ?? NO_DETAIL)
      const card = (a: Agent) => {
        const l = open.live[a.key]
        const d = staticDetail(l)
        return Client ? (
          <Client key={`card-${a.key}`} module="./card.tsx" props={placeholder(a, now, l)} />
        ) : (
          <Text key={`card-${a.key}`} wrap="wrap">
            {[
              a.type.replace(/^superdev:/, ''), a.desc, a.isDone ? 'done' : 'running',
              l && `started ${hhmmss(l.start)}`,
              ...(d?.calls ?? []),
              d && `ctx ${d.ctx === null ? '—' : d.ctx.toLocaleString('en-US')}`,
              `as of ${hhmmss(now)}`,
            ].filter(Boolean).join(' · ')}
          </Text>
        )
      }
      const lanes = scopeLanes(open, 'reviews, docs, fixes')

      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Button key="back" label="← back" hotkey="b" onPress={back} />
            <Text bold>{open.name}</Text>
            <Text color={STAGE_COLOR[open.stage] ?? 'white'}>{open.stage}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {open.branch} · {open.anchor} · DoD {open.dod.done}/{open.dod.total}
          </Text>
          <Text dimColor>
            {live} live · {open.agents.length - live} done{open.lockMtime !== null ? ` · lock ${age(now - open.lockMtime)}` : ''}
          </Text>
          {Svg ? (
            <Box flexDirection="column" gap={1}>
              {art(scopeMap(open))}
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                {open.agents.map(card)}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {lanes.map(l => (
                <Box key={`lane-${l.id}`} flexDirection="column" width={34} borderStyle="single" borderDimColor paddingX={1}>
                  <Text bold wrap="truncate-end">{l.id === 'scope' ? 'scope-level' : `${STATUS_MARK[l.status] ?? '?'} ${l.id} ${l.status}`}{l.tree ? ' [slicetree]' : ''}</Text>
                  <Text dimColor wrap="truncate-end">{l.title}</Text>
                  {l.agents.length === 0 && <Text dimColor>no agents</Text>}
                  {l.agents.map(card)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const intentRows: Row[] = (snap.intents ?? []).map(i => ({ emoji: '💡', title: i.title, sub: i.status || i.name, badge: i.isDraft ? 'draft' : 'ready', badgeColor: i.isDraft ? '#a16207' : '#d97706' }))
    const drafted = (snap.intents ?? []).filter(i => i.isDraft).length
    const stageLine = [
      `brainstorm (${snap.intents?.length ? `${drafted} draft, ${snap.intents.length - drafted} ready` : 0})`,
      ...STAGES.map(st => [st, all.filter(s => s.stage === st).length] as const).filter(([, n]) => n > 0).map(([st, n]) => `${st} (${n})`),
    ].join(' · ')
    const kbRows: Row[] = (snap.kbPending ?? []).map(p => ({ emoji: '✉️', title: p.title, sub: `scope ${p.scope}`, badge: p.action, badgeColor: ACTION_HEX[p.action] }))
    const designRows: Row[] = (snap.designs ?? []).map(d => ({ emoji: '🎨', title: d, sub: `design/${d}.html` }))
    const draftRows: Row[] = snap.drafts.map(d => ({ emoji: '📝', title: d.slug, sub: `DoD draft · ${d.dod.total} criteria`, badge: 'planning', badgeColor: '#7c3aed' }))
    const section = (title: string, rows: Row[], bg: string, ink: string, anim: string) =>
      rows.length === 0 ? null : (
        <Box flexDirection="column">
          <Text bold>{title}</Text>
          {Svg ? art(cards(rows, bg, ink, anim)) : rows.map(r => <Text wrap="truncate-end">  {r.badge ? `${r.badge} ` : ''}{r.title} — {r.sub}</Text>)}
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor wrap="truncate-start">{snap.root}</Text>
        {Svg ? (
          art(tiles(snap))
        ) : (
          <Text>
            {[
              snap.assignees && `info.json (${snap.assignees.map(a => `${a.role}: ${a.who}`).join(', ')})`,
              snap.scopes && `scopes/ (${active.length} active, ${closed.length} closed)`,
              snap.intents && `brainstorm/ (${snap.intents.length})`,
              snap.kbPending && `kb-pending/ (${snap.kbPending.length})`,
              snap.designs && `design/ (${snap.designs.length})`,
              snap.drafts.length > 0 && `dod drafts (${snap.drafts.length})`,
            ].filter(Boolean).join('  ')}
          </Text>
        )}
        {/* The pipeline opens with the brainstorm column, so intents draw it even before any scope exists. */}
        {(snap.scopes || (snap.intents?.length ?? 0) > 0) && (
          <Box flexDirection="column">
            <Text bold>Scopes</Text>
            {Svg ? art(pipeline(all, snap.intents)) : <Text>stages: {stageLine}</Text>}
            {active.length === 0 && <Text dimColor>no active scope</Text>}
            {active.map(s => (
              <Box flexDirection="row" gap={1}>
                <Button key={`scope-${s.name}`} label={s.name} onPress={choose(s.name)} />
                <Text color={STAGE_COLOR[s.stage] ?? 'white'}>{s.stage}</Text>
                <Text dimColor>
                  {s.slices.filter(x => x.status === 'merged').length}/{s.slices.length} slices · {withLive(s).agents.filter(a => !a.isDone).length} live agents
                  {s.lockMtime !== null ? ` · lock ${age(now - s.lockMtime)}` : ''}
                </Text>
              </Box>
            ))}
            {!Svg && closed.length > 0 && <Text dimColor wrap="wrap">closed: {closed.map(s => s.name).join(', ')}</Text>}
          </Box>
        )}
        {section('Brainstorm', intentRows, '#fef3c7', '#78350f', 'glow')}
        {section('Pending knowledge-base pages', kbRows, '#e0f2fe', '#0c4a6e', 'float')}
        {section('Design sketches', designRows, '#fce7f3', '#831843', 'wiggle')}
        {section('DoD drafts', draftRows, '#ede9fe', '#4c1d95', 'float')}
      </Box>
    )
  })
}
