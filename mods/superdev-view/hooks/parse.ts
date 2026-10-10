import type { Activity, Agent, Slice } from '../types'

// Reverses scope.js's traceField escaping.
export const untrace = (v: string | undefined): string =>
  v === undefined || v === '-'
    ? ''
    : v.replace(/\\(x20|n|r|t|u[0-9a-f]{4}|\\)/g, (_, c: string) =>
        c === '\\' ? '\\' : c === 'x20' ? ' ' : c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : String.fromCharCode(parseInt(c.slice(1), 16)),
      )

export const header = (ledger: string, name: string): string =>
  new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.*)$`, 'm').exec(ledger)?.[1]?.trim() ?? ''

// Slice table rows: | id | issue | title | type | depends-on | status | range |
// scope.js writes an in-cell `|` as `\|`, so a row splits only on an unescaped `|` and each cell
// unescapes, as scope.js's own splitRow does.
export const slices = (ledger: string): Slice[] =>
  ledger
    .split('\n')
    .filter(l => l.startsWith('|') && !/^\|\s*(id|-+)\s*\|/.test(l))
    .map(l => l.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|')))
    .filter(c => c.length >= 6)
    .map(c => ({ id: c[0] ?? '', title: c[2] ?? '', status: c[5] ?? '', dependsOn: (c[4] ?? '').split(',').map(d => d.trim()).filter(d => d !== '' && d !== '—') }))

// Dependency waves, first to last: a slice sits in the first wave after every slice it depends on. A depends-on
// naming a slice the list lacks counts as met; the slices a cycle leaves unplaced make one last wave.
export const waves = (list: Slice[]): Slice[][] => {
  const known = new Set(list.map(s => s.id))
  const wave = new Map<string, number>()
  let isMoving = true
  while (isMoving) {
    isMoving = false
    for (const s of list) {
      const deps = s.dependsOn.filter(d => known.has(d))
      if (wave.has(s.id) || !deps.every(d => wave.has(d))) continue
      wave.set(s.id, Math.max(-1, ...deps.map(d => wave.get(d) ?? 0)) + 1)
      isMoving = true
    }
  }
  const out: Slice[][] = []
  const stuck: Slice[] = []
  for (const s of list) {
    const w = wave.get(s.id)
    if (w === undefined) stuck.push(s)
    else (out[w] ??= []).push(s)
  }
  return stuck.length ? [...out, stuck] : out
}

// A trace line's time in ms, null when it does not parse.
const time = (ts: string): number | null => {
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

// Agents from trace.log's `dispatch` lines alone (type, tool_use_id, description, and start time), closed by
// `dispatch-end`, whose time is the agent's end. A `dispatch-bind` names the agentId whose own lines fold into that dispatch's activity;
// a line from an agentId no dispatch binds (a foreground subagent, or one no scope attributes) adds no
// agent, so no agent shows twice and a scope-less one shows nowhere. The structure (who, which slice,
// done) goes to the pane; what each last did goes to its card alone, so a new trace line that starts or
// ends nothing changes nothing the pane draws.
export const traceAgents = (trace: string): { agents: Agent[]; activity: Record<string, Activity> } => {
  const byKey = new Map<string, Agent>()
  const activity: Record<string, Activity> = {}
  const alias = new Map<string, string>() // agentId -> tool_use_id
  for (const line of trace.split('\n').filter(Boolean)) {
    const [ts = '', slice, agent, kind, ...f] = line.split(' ')
    if (kind === 'dispatch') {
      const key = untrace(f[1])
      byKey.set(key, { key, type: untrace(f[0]), desc: untrace(f[2]), slice: untrace(slice), isDone: false, start: time(ts), end: null })
      activity[key] = { last: ts, lastKind: 'dispatched', events: 0 }
    } else if (kind === 'dispatch-bind') {
      alias.set(untrace(f[2]), untrace(f[1]))
    } else if (kind === 'dispatch-end') {
      const key = untrace(f[1])
      const a = byKey.get(key)
      if (a) Object.assign(a, { isDone: true, end: time(ts) })
      if (activity[key]) activity[key] = { ...activity[key], last: ts, lastKind: 'ended' }
    }
    const bound = agent && agent !== 'main' ? alias.get(agent) : undefined
    if (bound && byKey.has(bound)) {
      activity[bound] = { last: ts, lastKind: [kind, ...f.slice(0, 2).map(untrace)].join(' '), events: (activity[bound]?.events ?? 0) + 1 }
    }
  }
  return { agents: [...byKey.values()], activity }
}

// DoD checkboxes: `- [x]` done, `- [ ]` open.
export const progress = (md: string) => ({
  done: (md.match(/^\s*- \[[xX]\]/gm) ?? []).length,
  total: (md.match(/^\s*- \[[ xX]\]/gm) ?? []).length,
})

// One YAML frontmatter field's value, unquoted; '' when the file has no frontmatter or no such key.
const fmField = (md: string, k: string) => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? ''
  return (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
}

// A brainstorm intent: its `# ` heading (without the `Intent: ` prefix), its `**Status: …**` line, and
// whether it is a draft, which only its frontmatter's `status: draft` makes it (ADR 0112, INV-0110).
export const intent = (name: string, md: string) => ({
  name,
  title: (/^#\s+(.*)$/m.exec(md)?.[1] ?? name).replace(/^Intent:\s*/i, '').trim(),
  status: (/^\*\*Status:\s*([^*]*?)\.?\*\*/m.exec(md)?.[1] ?? '').trim(),
  isDraft: fmField(md, 'status') === 'draft',
})

// A staged KB page's frontmatter `title` and `action`.
export const frontmatter = (md: string) => ({ title: fmField(md, 'title'), action: fmField(md, 'action') || 'upsert' })
