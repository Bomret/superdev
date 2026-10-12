import type { EventLog, LogEntry, Slice } from '../types'

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
    .map(c => ({ id: c[0] ?? '', title: c[2] ?? '', status: c[5] ?? '' }))

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

// --- the event log (ADR 0141): what happened in a scope run, read from its ledger and run trace alone ---

const CHAIN = ['plan', 'implement', 'review', 'document', 'submit', 'ship', 'verify-ship', 'wrap-up']
const WAIT_MS = 60e3

type Run = { end?: Extract<LogEntry, { kind: 'end' }>; review?: { spec: string; quality: string }; ready?: string }
type Stretch = {
  start?: number; isEnded: boolean
  path: { fail: number; pass: number }; suite: { fail: number; pass: number }
  reviews: Set<string>; f2p: string
  verdict?: { spec: string; quality: string }
}
type Dispatch = { type: string; slice: string; start: number; runs: Run[]; hasVerdict: boolean }

// Commands: every command starts at its `ledger step set` line, each line a start of its own. Until a `step set
// plan` line has passed, the first `ledger init … planned` starts `plan`, and until a `step set implement` line
// has passed, the first `implementing` stage write starts `implement`. A `step set` of that command with no log
// line since that start moves the start to the step line; otherwise the step line ends it and starts another. A
// command ends at its `step clear`, its `step block` (a
// stopped command), a stage write, or the next `step set`; each end draws a `commandEnd` entry, and a clear or
// block with no open command draws nothing. A trace with no step line but a stage write past `merged` was
// written before the step lines existed: it draws every stage write after implement as a plain line. A
// dispatch's first end per run wins, and its first `verdict` or `final-verdict` line goes on the end of the
// run it falls in.
export const eventLog = (ledger: string, trace: string, now: number): EventLog => {
  const entries: LogEntry[] = []
  const isStepless = !/ ledger step set /.test(trace) && / ledger stage set (?!(?:planned|implementing|merged)$)\S+$/m.test(trace)
  const dispatches = new Map<string, Dispatch>()
  const commands: Extract<LogEntry, { kind: 'command' }>[] = []
  let open: { entry: Extract<LogEntry, { kind: 'command' }> } | null = null
  let lastEnd: number | null = null
  let hasImplementEnded = false
  // The steps whose `step set` line the walk has passed, and the header a fallback start opened that the run's own
  // `step set` may still take over: run init writes the stage, then its step, with no log line between.
  const seenSteps = new Set<string>()
  let fallback = null as Extract<LogEntry, { kind: 'command' }> | null
  const startFallback = (at: number, name: string) => {
    if (!seenSteps.has(name) && !commands.some(c => c.name === name)) {
      begin(at, name)
      fallback = commands.at(-1) ?? null
    } else fallback = null
  }
  const close = (at: number, isBlocked = false) => {
    if (!open) return
    open.entry.ms = at - open.entry.at
    open.entry.isDone = true
    open.entry.isBlocked = isBlocked
    entries.push({ kind: 'commandEnd', at, name: open.entry.name, ms: open.entry.ms, isBlocked })
    if (open.entry.name === 'implement') hasImplementEnded = true
    lastEnd = at
    open = null
  }
  const begin = (at: number, name: string) => {
    close(at)
    if (lastEnd !== null && at - lastEnd >= WAIT_MS) entries.push({ kind: 'wait', at, ms: at - lastEnd })
    const entry = { kind: 'command' as const, at, name, ms: 0, isDone: false, isBlocked: false }
    entries.push(entry)
    commands.push(entry)
    open = { entry }
  }
  // One slice's stretch since its latest start (`start` is undefined for lines seen before any start): its counts
  // and last review verdict. Only a line whose slice field names the slice counts, and only until the stretch ends.
  const stretches = new Map<string, Stretch>()
  const newStretch = (start?: number): Stretch => ({ start, isEnded: false, path: { fail: 0, pass: 0 }, suite: { fail: 0, pass: 0 }, reviews: new Set(), f2p: '' })
  const counting = (id: string) => {
    let s = stretches.get(id)
    if (!s && id !== 'scope') stretches.set(id, (s = newStretch()))
    return s?.isEnded ? undefined : s
  }
  const titles = new Map(slices(ledger).map(s => [s.id, s.title]))
  const titleOf = (id: string) => titles.get(id) ?? ''
  const verdictRun = (key: string) => {
    const d = dispatches.get(key)
    if (!d || d.hasVerdict) return undefined
    d.hasVerdict = true
    return d.runs.at(-1)
  }

  for (const line of trace.split('\n')) {
    const [ts = '', slice = '', , kind, ...f] = line.split(' ')
    const at = Date.parse(ts)
    if (Number.isNaN(at) || !kind) continue
    if (kind === 'ledger') {
      const [verb, a, b] = f
      if (verb === 'init' && b === 'planned') startFallback(at, 'plan')
      else if ((verb === 'init' && b === 'implementing') || (verb === 'stage' && a === 'set' && b === 'implementing')) {
        if (seenSteps.has('implement')) close(at)
        startFallback(at, 'implement')
      } else if (verb === 'stage' && a === 'set' && b && b !== 'planned') {
        close(at)
        if (isStepless && hasImplementEnded) entries.push({ kind: 'stage', at, stage: b })
      } else if (verb === 'step' && a === 'set' && b) {
        if (fallback && fallback.name === b && !fallback.isDone && entries.at(-1) === fallback) fallback.at = at
        else begin(at, b)
        seenSteps.add(b)
        fallback = null
      }
      else if (verb === 'step' && a === 'clear') close(at)
      else if (verb === 'step' && a === 'block') close(at, true)
      else if (verb === 'slice' && a) {
        if (b === 'in-progress') {
          stretches.set(a, newStretch(at))
          entries.push({ kind: 'sliceStart', at, id: a, title: titleOf(a) })
        } else if (b === 'merged' || b === 'blocked') {
          const s = stretches.get(a)
          if (s?.isEnded) continue
          const sum = s ?? newStretch()
          sum.isEnded = true
          stretches.set(a, sum)
          const end: Extract<LogEntry, { kind: 'sliceEnd' }> = { kind: 'sliceEnd', at, id: a, title: titleOf(a), status: b }
          if (sum.start !== undefined) end.ms = at - sum.start
          if (sum.verdict) end.review = sum.verdict
          entries.push(end)
          const { path, suite, f2p } = sum
          const review = sum.reviews.size
          if (path.fail + path.pass + suite.fail + suite.pass + review > 0 || f2p) entries.push({ kind: 'sliceSummary', at, id: a, path, suite, review, f2p })
        }
      }
    } else if (kind === 'run') {
      const s = counting(slice)
      const group = f[0] === 'path' ? s?.path : f[0] === 'focused' || f[0] === 'full' || f[0] === 'whole' ? s?.suite : undefined
      if (group && (f[1] === 'pass' || f[1] === 'fail')) group[f[1]]++
    } else if (kind === 'fail-to-pass') {
      const s = counting(slice)
      if (s && f[1] && f[1] !== 'unknown') s.f2p = f[1]
    } else if (kind === 'dispatch') {
      const key = untrace(f[1])
      if (!key || dispatches.has(key)) continue
      const d = { type: untrace(f[0]), slice: untrace(slice), start: at, runs: [{}], hasVerdict: false }
      dispatches.set(key, d)
      entries.push({ kind: 'start', at, type: d.type, slice: d.slice, isResumed: false })
    } else if (kind === 'dispatch-resume') {
      const d = dispatches.get(untrace(f[0]))
      if (!d || !d.runs.at(-1)?.end) continue
      d.start = at
      d.runs.push({})
      entries.push({ kind: 'start', at, type: d.type, slice: d.slice, isResumed: true })
    } else if (kind === 'dispatch-end') {
      const d = dispatches.get(untrace(f[1]))
      const run = d?.runs.at(-1)
      if (!d || !run || run.end) continue
      run.end = { kind: 'end', at, type: d.type, slice: d.slice, ms: at - d.start, outcome: untrace(f[2]) }
      if (run.review) run.end.review = run.review
      if (run.ready) run.end.ready = run.ready
      entries.push(run.end)
      // A dispatch counts once per stretch, however many runs a resume adds; an end with no outcome is completed.
      if (d.type === 'superdev:slice-reviewer' && (run.end.outcome === 'completed' || run.end.outcome === '')) counting(d.slice)?.reviews.add(untrace(f[1]))
    } else if (kind === 'verdict') {
      const d = dispatches.get(untrace(f[0]))
      const s = d?.type === 'superdev:slice-reviewer' ? counting(d.slice) : undefined
      if (s) s.verdict = { spec: untrace(f[1]), quality: untrace(f[2]) }
      const run = verdictRun(untrace(f[0]))
      if (!run) continue
      run.review = { spec: untrace(f[1]), quality: untrace(f[2]) }
      if (run.end) run.end.review = run.review
    } else if (kind === 'final-verdict') {
      const run = verdictRun(untrace(f[0]))
      if (!run) continue
      run.ready = untrace(f[1])
      if (run.end) run.end.ready = run.ready
    }
  }
  for (const c of commands) if (!c.isDone) c.ms = now - c.at

  const isClosed = header(ledger, 'Stage') === 'closed'
  const reached = Math.max(-1, ...commands.map(c => CHAIN.indexOf(c.name)))
  const rest = CHAIN.slice(reached + 1).filter(c => c !== 'verify-ship')
  const ahead = isClosed ? 'closed' : !commands.length || (isStepless && hasImplementEnded) || !rest.length ? null : rest
  const running = [...dispatches.values()].filter(d => !d.runs.at(-1)?.end).length + [...stretches.values()].filter(s => s.start !== undefined && !s.isEnded).length

  const day = (ms: number) => new Date(ms).toDateString()
  const dated: LogEntry[] = []
  for (const e of entries) {
    const prev = dated.at(-1)
    if (prev && day(prev.at) !== day(e.at)) dated.push({ kind: 'date', at: e.at })
    dated.push(e)
  }
  return { entries: dated, running, ahead }
}
