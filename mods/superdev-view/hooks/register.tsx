import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Draft, Intent, KbPage, LogEntry, Scope, Snapshot } from '../types'
import { closedAt, eventLog, frontmatter, header, intent, progress, slices } from './parse'

const PANE = 'superdev-view'
const snapshot = atom({ plugin: 'superdev-view', key: 'snapshot' } as const, null)
const selected = atom({ plugin: 'superdev-view', key: 'selected' } as const, null)
// Which overview sections a press opened or closed, by section id; a section absent here takes its default.
const sections = atom({ plugin: 'superdev-view', key: 'sections' } as const, {})
// Which slice groups a press opened or closed, by `<scope>/<slice id>`; a group absent here takes its default.
const groups = atom({ plugin: 'superdev-view', key: 'groups' } as const, {})
const STAGE_COLOR: Record<string, string> = {
  planned: 'gray', implementing: 'yellow', merged: 'cyan', reviewed: 'cyan',
  'documented-unreviewed': 'cyan', documented: 'blue', submitted: 'magenta', shipped: 'green', closed: 'gray',
}
const SLICE_COLOR: Record<string, string> = { todo: 'gray', 'in-progress': 'yellow', 'in-review': 'blue', merged: 'green', blocked: 'red' }
// The legend's and the stacked bar's order: the ledger's own status values, then any other recorded value as first seen.
const STATUS_ORDER = ['merged', 'in-progress', 'in-review', 'blocked', 'todo']
// Each status with at least one slice and its count, in that order.
const tally = (all: { status: string }[]) => {
  const counts = new Map<string, number>(STATUS_ORDER.map(s => [s, 0]))
  for (const x of all) counts.set(x.status, (counts.get(x.status) ?? 0) + 1)
  return [...counts].filter(([, n]) => n > 0)
}
// The address a scope row's link carries: never opened, only matched by the pane's own press handler. The slug charset
// needs no escaping in a Markdown link.
const scopeHref = (name: string) => `https://superdev.invalid/scope/${name}`
// How many closed scopes the Scopes card shows before its fold.
const CLOSED_SHOWN = 5
const share = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100))
// A status's fill where the surface draws an Svg; the terminal draws its named color from SLICE_COLOR instead.
const SLICE_HEX: Record<string, string> = { todo: '#6b6b6b', 'in-progress': '#d4a72c', 'in-review': '#4a7fd6', merged: '#4c9a6a', blocked: '#d0573f' }
const hex = (status: string) => SLICE_HEX[status] ?? '#6b6b6b'
// Splits `width` among the counts in proportion. Every count keeps at least `min`. The room the minimums take comes
// from the parts larger than `min`, widest first, and the room rounding leaves goes to the widest part, so the parts
// sum to `width`. When `width` is less than `min` per count, every part keeps `min` and the bar is wider than `width`.
// `whole` rounds every part down to whole cells first.
function split(counts: number[], width: number, min: number, whole: boolean): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  const parts = counts.map(n => Math.max(min, whole ? Math.floor((n / total) * width) : (n / total) * width))
  let over = parts.reduce((a, b) => a + b, 0) - width
  if (over < 0) {
    const widest = parts.indexOf(Math.max(...parts))
    parts[widest] = parts[widest]! - over
    return parts
  }
  for (const i of [...parts.keys()].sort((a, b) => parts[b]! - parts[a]!)) {
    const take = Math.min(over, parts[i]! - min)
    parts[i] = parts[i]! - take
    over -= take
  }
  return parts
}
// A bar as an Svg document holding no text: one rect per segment, left to right, over a dark track with round ends.
// Its own width is wider than any pane, so the surface draws it at the pane's width and the height it is given.
// Its clip id comes from `name` and the height, so bars a host inlines into one document each clip to their own track.
const barSvg = (segments: [string, number][], height: number, name: string) => {
  const id = `clip-${name}-${height}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  let x = 0
  const rects = segments.map(([fill, w]) => {
    const r = `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${fill}"/>`
    x += w
    return r
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${height}" preserveAspectRatio="none" width="2000" height="${height}"><clipPath id="${id}"><rect width="100" height="${height}" rx="${height / 2}"/></clipPath><g clip-path="url(#${id})"><rect x="0" y="0" width="100" height="${height}" fill="#3a3a3a"/>${rects.join('')}</g></svg>`
}
const OUTCOME_COLOR: Record<string, string> = { failed: 'red', denied: 'red', stopped: 'yellow', unknown: 'yellow', 'session-end': 'yellow' }
// A duration as mm:ss under an hour, else h:mm:ss; a time of day as local HH:MM.
const clock = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
const hm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)

function age(ms: number): string {
  if (ms < 60e3) return `${Math.round(ms / 1e3)}s`
  if (ms < 3600e3) return `${Math.round(ms / 60e3)}m`
  return `${Math.round(ms / 3600e3)}h`
}

// A closed scope's close time, by name: a closed trace no longer changes, so the overview reads it once. An entry
// goes when its scope is seen open again (a label reused after retirement).
const closedTimes = new Map<string, number | null>()

// A directory whose ledger does not read is no scope (null).
// A closed scope's trace is read only while its page is open (`isOpen`); its overview row needs the ledger alone.
async function scanScope($: EngineInterface, dir: string, name: string, isOpen: boolean): Promise<Scope | null> {
  const ledger = await $.fs.read(`${dir}/ledger.md`).catch(() => null)
  if (ledger === null) return null
  const stage = header(ledger, 'Stage') || '?'
  const isTraceRead = stage !== 'closed' || isOpen
  const lock = await $.fs.stat(`${dir}/run.lock`).catch(() => null)
  const dod = await $.fs.read(`${dir}/dod.md`).catch(() => '')
  const trace = isTraceRead ? await $.fs.read(`${dir}/trace.log`).catch(() => '') : ''
  if (stage !== 'closed') closedTimes.delete(name)
  else if (!closedTimes.has(name)) closedTimes.set(name, closedAt(isTraceRead ? trace : await $.fs.read(`${dir}/trace.log`).catch(() => '')))
  return {
    name,
    stage,
    branch: header(ledger, 'Branch'),
    anchor: header(ledger, 'Anchor'),
    lockMtime: lock ? lock.mtimeMs : null,
    dod: progress(dod),
    slices: slices(ledger),
    log: eventLog(ledger, trace, Date.now()),
    closedAt: closedTimes.get(name) ?? null,
  }
}

// Writes the snapshot only when it changed: every snapshot write redraws the pane.
async function store($: EngineInterface, next: Snapshot): Promise<void> {
  if (JSON.stringify(await read($, snapshot)) !== JSON.stringify(next)) await update($, snapshot, () => next)
}

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
    const info = await $.fs.read(`${root}/info.json`).then(t => JSON.parse(t) as Record<string, { assignee?: string; displayName?: unknown }>).catch(() => ({}))
    assignees = Object.entries(info).map(([role, v]) => ({ role, who: (typeof v?.displayName === 'string' && v.displayName.trim()) || (v?.assignee ?? '') }))
  }
  const intents: Intent[] | null = top.get('brainstorm') === 'dir'
    ? await Promise.all((await files('brainstorm', '.md')).map(async f => intent(f.name.replace(/\.md$/, ''), await $.fs.read(`${root}/brainstorm/${f.name}`).catch(() => ''))))
    : null
  // The scope directories this scan saw, or null when the `scopes/` read failed. A failed read keeps the
  // scopes the last scan stored, so the pane does not blank until the next good scan.
  const listed = top.get('scopes') === 'dir' ? await $.fs.list(`${root}/scopes`).then(l => l.filter(d => d.kind === 'dir')).catch(() => null) : []
  let scopes: Scope[] | null = null
  if (listed === null) scopes = (await read($, snapshot))?.scopes ?? []
  else if (top.get('scopes') === 'dir') {
    const pick = await read($, selected)
    const scanned = await Promise.all(listed.map(d => scanScope($, `${root}/scopes/${d.name}`, d.name, d.name === pick)))
    scopes = scanned.filter((s): s is Scope => s !== null)
  }
  let kbPending: KbPage[] | null = null
  if (top.get('kb-pending') === 'dir') {
    const dirs = (await $.fs.list(`${root}/kb-pending`).catch(() => [])).filter(d => d.kind === 'dir')
    kbPending = (await Promise.all(dirs.map(async d =>
      Promise.all((await files(`kb-pending/${d.name}`, '.md')).map(async f => {
        const fm = frontmatter(await $.fs.read(`${root}/kb-pending/${d.name}/${f.name}`).catch(() => ''))
        return { scope: d.name, file: f.name, title: fm.title || f.name, action: fm.action }
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
  await store($, { root, assignees, intents, scopes, kbPending, designs, drafts })
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = table
    // The terminal draws no Svg; every other surface draws the bars as one, and the legend squares in the bars' fills.
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined

    const snap: Snapshot | null = await read($, snapshot)
    if (!snap) return <Text dimColor>Scanning .superdev…</Text>
    // A path under the home folder shows with `~` in place of it.
    const home = await $.env.get('HOME')
    const tilde = (p: string) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p)
    if (snap.error) return <Text dimColor>{snap.error} ({tilde(snap.root)})</Text>
    const all = snap.scopes ?? []
    const active = all.filter(s => s.stage !== 'closed')
    // The most recently closed first; a scope whose trace records no close goes last.
    const closed = all.filter(s => s.stage === 'closed').sort((x, y) => (y.closedAt ?? -Infinity) - (x.closedAt ?? -Infinity))
    const now = Date.now()
    const pick = await read($, selected)
    const open = all.find(s => s.name === pick)
    const back = () => void update($, selected, () => null)
    // A closed scope's page needs its trace, which the scan reads only once the scope is picked.
    const choose = (name: string) => () => void update($, selected, () => name).then(() => scan($))
    // One log line: a row of sibling Text parts, cut to one row. Desktop wraps a Text holding a nested Text at the
    // nested child, so no part nests another. Only the part marked `shrink` gives up room; a `grow` spacer
    // pushes the parts after it to the right edge.
    type Part = { text: string; color?: string; dim?: boolean; bold?: boolean; shrink?: boolean } | 'grow'
    // `indent` draws a line inside a slice group; `toggle` puts a group's open mark beside the parts, never around them.
    const row = (key: string, parts: (Part | false | '')[], indent = false, toggle?: { key: string; label: string; onPress: () => void }) => (
      <Box key={key} flexDirection="row" paddingLeft={indent ? 2 : undefined}>
        {toggle && <Button key={toggle.key} label={toggle.label} onPress={toggle.onPress} />}
        {parts.filter((p): p is Part => !!p).map((p, n) => p === 'grow' ? <Box key={`${key}-${n}`} flexGrow={1} /> : (
          <Box key={`${key}-${n}`} flexShrink={p.shrink ? 1 : 0} minWidth={p.shrink ? 0 : undefined}>
            <Text color={p.color} dimColor={p.dim} bold={p.bold} wrap="truncate-end">{p.text}</Text>
          </Box>
        ))}
      </Box>
    )
    const logLine = (e: LogEntry, key: string, isInGroup = false) => {
      const type = (t: string) => t.replace(/^superdev:/, '')
      switch (e.kind) {
        case 'command':
          return row(key, [
            { text: `${hm(e.at)} ` },
            e.isBlocked ? { text: '✗', color: 'red', bold: true } : e.isDone ? { text: '✓', bold: true } : { text: '●', color: 'green', bold: true },
            { text: ` ${e.name}`, bold: true, shrink: true },
            !e.isDone && 'grow',
            !e.isDone && { text: ` ${clock(e.ms)}`, dim: true },
          ])
        case 'commandEnd':
          return row(key, [
            { text: `${hm(e.at)} ■` },
            { text: ` ${e.name}`, bold: true, shrink: true },
            { text: ` · ${clock(e.ms)}` },
            e.isBlocked && { text: ' · blocked', color: 'red' },
          ])
        case 'wait':
          return row(key, [{ text: `⋯ ${clock(e.ms)}`, dim: true, shrink: true }])
        case 'stage':
          return row(key, [{ text: `${hm(e.at)} ` }, { text: `stage ${e.stage}`, shrink: true }])
        case 'tamper':
          return row(key, [{ text: `${hm(e.at)} ` }, { text: '⚠', color: 'yellow', bold: true }, { text: ` ${e.file} changed outside scope.js`, shrink: true }], isInGroup)
        case 'slice':
          return null
        case 'sliceEnd':
          return row(key, [
            { text: `${hm(e.at)} ■` },
            { text: ` ${e.status}`, color: e.status === 'blocked' ? 'red' : undefined, shrink: true },
            e.ms !== undefined && { text: ` · ${clock(e.ms)}` },
          ], isInGroup)
        case 'sliceSummary': {
          const group = (name: string, g: { fail: number; pass: number }) => g.fail + g.pass > 0 && `${name} ✗${g.fail} ✓${g.pass}`
          const text = [group('path', e.path), group('suite', e.suite), e.review > 0 && `review ×${e.review}`, e.f2p !== '' && `f2p ${e.f2p}`].filter(Boolean).join(' · ')
          return row(key, [{ text: `      ${text}`, dim: true, shrink: true }], isInGroup)
        }
        case 'run': {
          // One line per dispatch run, at its start: an ended run carries its outcome and duration, a running one its elapsed
          // time. Inside a slice group the slice id goes unsaid.
          const agent = isInGroup ? ` ${type(e.type)}` : ` ${type(e.type)} ${e.slice}`
          if (!e.isEnded) return row(key, [
            { text: `${hm(e.at)} ` },
            { text: '▶', color: 'green' },
            { text: agent, shrink: true },
            e.isResumed && { text: ' · resumed' },
            { text: ` · running ${clock(e.ms)}` },
          ], isInGroup)
          const outcome = e.outcome !== '' && e.outcome !== 'completed' ? e.outcome : ''
          return row(key, [
            { text: `${hm(e.at)} ■` },
            { text: agent, shrink: true },
            e.isResumed && { text: ' · resumed' },
            !!outcome && { text: ` · ${outcome}`, color: OUTCOME_COLOR[outcome] ?? 'yellow' },
            { text: ` · ${clock(e.ms)}` },
          ], isInGroup)
        }
        case 'date':
          return row(key, [{ text: new Date(e.at).toDateString(), bold: true, dim: true, shrink: true }], isInGroup)
      }
    }

    if (open) {
      const log = open.log
      const groupsOpen = await read($, groups)
      const STATUS_MARK: Record<string, Part> = { merged: { text: ' ✓', color: 'green' }, blocked: { text: ' ✗', color: 'red' }, 'in-progress': { text: ' ▶', color: 'green' } }
      // A slice group: its header row, then its lines while open.
      const group = (g: Extract<LogEntry, { kind: 'slice' }>) => {
        const id = `${open.name}/${g.id}`
        const isOpen = groupsOpen[id] ?? g.isOpenByDefault
        const toggle = () => void update($, groups, m => ({ ...m, [id]: !isOpen }))
        return [
          row(`group-${g.id}`, [
            { text: ` ${hm(g.at)}` },
            STATUS_MARK[g.status] ?? false,
            { text: ` ${g.id}` },
            g.title !== '' && { text: ` ${g.title}`, shrink: true },
            g.review > 0 && { text: ` · review ×${g.review}` },
            g.ms !== undefined && { text: g.isRunning ? ` · running ${clock(g.ms)}` : ` · ${clock(g.ms)}` },
          ], false, { key: `toggle-${g.id}`, label: isOpen ? '▾' : '▸', onPress: toggle }),
          ...(isOpen ? g.entries.map((e, n) => logLine(e, `log-${g.id}-${n}`, true)) : []),
        ]
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            <Button key="back" label="← back" onPress={back} />
            <Text bold>{open.name}</Text>
            <Text color={STAGE_COLOR[open.stage] ?? 'white'}>{open.stage}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">{[open.branch, open.anchor].filter(Boolean).join(' · ')}</Text>
          <Text dimColor>
            DoD {open.dod.done}/{open.dod.total}{open.lockMtime !== null ? ` · lock ${age(now - open.lockMtime)}` : ''}
          </Text>
          {log.running > 0 && <Text color="green">● {log.running} running</Text>}
          <Box key="log" flexDirection="column">
            {log.entries.flatMap((e, n) => (e.kind === 'slice' ? group(e) : [logLine(e, `log-${n}`)]))}
            {log.ahead !== null && row('ahead', [{ text: log.ahead === 'closed' ? '■ closed' : `○ ${log.ahead.join(' · ')}`, dim: true, shrink: true }])}
          </Box>
        </Box>
      )
    }

    const opened = await read($, sections)
    const toggle = (id: string, isOpen: boolean) => () => void update($, sections, m => ({ ...m, [id]: !isOpen }))
    const isAllClosed = opened['closed-all'] ?? false
    // A section: a card with a rounded, dim border. Its header row holds the Button with the open mark and name, which gives
    // up width in a narrow pane, and the value on the right, which stays whole; then its body while open.
    const section = (id: string, name: string, value: string, isOpenByDefault: boolean, body: () => unknown) => {
      const isOpen = opened[id] ?? isOpenByDefault
      return (
        <Box key={`card-${id}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" columnGap={1}>
            <Box key={`name-${id}`} flexShrink={1} minWidth={0}>
              <Button key={`section-${id}`} label={`${isOpen ? '▾' : '▸'} ${name}`} onPress={toggle(id, isOpen)} />
            </Box>
            <Box flexGrow={1} />
            <Box key={`value-${id}`} flexShrink={0}><Text dimColor>{value}</Text></Box>
          </Box>
          {isOpen && <Box flexDirection="column" marginTop={1} gap={1}>{body()}</Box>}
        </Box>
      )
    }
    // A card's list row: the label, which gives up width, on the left, and its value, if any, whole on the right.
    const item = (key: string, label: string, value?: string) => (
      <Box key={`${key}-row`} flexDirection="row" columnGap={1}>
        <Box key={key} flexShrink={1} minWidth={0}><Text>{label}</Text></Box>
        <Box flexGrow={1} />
        {value !== undefined && <Box key={`${key}-value`} flexShrink={0}><Text dimColor>{value}</Text></Box>}
      </Box>
    )
    const intents = snap.intents ?? []
    const kb = snap.kbPending ?? []
    const designs = snap.designs ?? []

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {snap.assignees && <Text dimColor wrap="truncate-end">🪪 {snap.assignees.map(a => a.who).join(', ')}</Text>}
          <Text dimColor wrap="truncate-start">{tilde(snap.root.replace(/\/\.superdev$/, ''))}</Text>
        </Box>
        {intents.length > 0 && section('brainstorm', 'Brainstorm', String(intents.length), false, () => intents.map(i => (
          <Box key={`intent-row-${i.name}`} flexDirection="column">
            {item(`intent-${i.name}`, i.title, i.isDraft ? 'draft' : 'ready')}
            {i.status !== '' && <Text dimColor>{i.status}</Text>}
          </Box>
        )))}
        {section('scopes', 'Scopes', `${active.length} active · ${closed.length} closed`, true, () => {
          // A scope's head row: the name as a link, which gives up width, and the stage on the right. A Markdown link
          // presses without a Button's chrome: the pane answers it, and no surface opens the URL. A closed scope's row is
          // dim and stands alone.
          const head = (s: Scope, isClosed: boolean) => (
            <Box key={`head-${s.name}`} flexDirection="row" alignItems="center" columnGap={1}>
              <Box key={`scope-name-${s.name}`} flexShrink={1} minWidth={0}>
                <Markdown key={`scope-${s.name}`} text={`[${s.name}](${scopeHref(s.name)})`} dimColor={isClosed || undefined} onLinkPress={choose(s.name)} />
              </Box>
              <Box flexGrow={1} />
              <Box key={`stage-${s.name}`} flexShrink={0}><Text color={STAGE_COLOR[s.stage] ?? 'white'}>{s.stage}</Text></Box>
            </Box>
          )
          // The summary, the legend, and the stacked bar count the active scopes' slices only.
          const all = active.flatMap(s => s.slices)
          const counts = tally(all)
          const sizes = counts.map(c => c[1])
          const merged = all.filter(x => x.status === 'merged').length
          const summary = active.length > 0 && (
            <Box key="summary" flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                <Box key="merged-share" flexShrink={1} minWidth={0}><Text>{share(merged, all.length)}% merged</Text></Box>
                <Box flexGrow={1} />
                <Box key="slice-count" flexShrink={0}><Text dimColor>{merged} / {all.length} slices</Text></Box>
              </Box>
              {all.length > 0 && (Svg
                ? <Box key="total-bar"><Svg source={barSvg(split(sizes, 100, 1.5, false).map((w, n) => [hex(counts[n]![0]), w]), 6, 'total')} alt={`${merged} of ${all.length} slices merged`} height={6} /></Box>
                : (
                  // The card's border and padding take four of the pane's columns.
                  <Box key="total-bar" flexDirection="row">
                    {split(sizes, Math.max(counts.length, e.props.bodyColumns - 4), 1, true).map((w, n) => (
                      <Text key={`total-${n}`} color={SLICE_COLOR[counts[n]![0]] ?? 'gray'}>{'█'.repeat(w)}</Text>
                    ))}
                  </Box>
                ))}
              {counts.map(([status, n]) => {
                const label = status || '—'
                return (
                  <Box key={`legend-${label}`} flexDirection="row" columnGap={1}>
                    <Text color={Svg ? hex(status) : SLICE_COLOR[status] ?? 'gray'}>■</Text>
                    <Box flexShrink={1} minWidth={0}><Text>{label}</Text></Box>
                    <Box flexGrow={1} />
                    <Text dimColor>{n}</Text>
                    <Box width={4} justifyContent="flex-end"><Text dimColor>{share(n, all.length)}%</Text></Box>
                  </Box>
                )
              })}
            </Box>
          )
          return [
            ...(active.length === 0 ? [<Text key="no-active" dimColor>no active scope</Text>] : [summary]),
            ...active.map(s => {
              const merged = s.slices.filter(x => x.status === 'merged').length
              return (
                <Box key={`row-${s.name}`} flexDirection="column">
                  {head(s, false)}
                  <Box key={`facts-${s.name}`} flexDirection="column" paddingLeft={2}>
                    {s.slices.length > 0 && (Svg
                      ? <Box key={`bar-${s.name}`}><Svg source={barSvg(s.slices.map(x => [hex(x.status), 100 / s.slices.length]), 4, `scope-${s.name}`)} alt={`${merged} of ${s.slices.length} slices merged`} height={4} /></Box>
                      : (
                        <Box key={`bar-${s.name}`} flexDirection="row" flexWrap="wrap" columnGap={1}>
                          {s.slices.map(x => <Text key={`seg-${s.name}-${x.id}`} color={SLICE_COLOR[x.status] ?? 'gray'}>▬</Text>)}
                        </Box>
                      ))}
                    <Text dimColor>
                      {merged}/{s.slices.length} slices · DoD {s.dod.done}/{s.dod.total} · {s.log.running} running{s.lockMtime !== null ? ` · lock ${age(now - s.lockMtime)}` : ''}
                    </Text>
                  </Box>
                </Box>
              )
            }),
            // The five most recently closed scopes; a press on the fold shows the rest, kept in `sections` like a card.
            ...(closed.length > 0 ? [
              <Box key="closed" flexDirection="column">
                {(isAllClosed ? closed : closed.slice(0, CLOSED_SHOWN)).map(s => head(s, true))}
                {closed.length > CLOSED_SHOWN && (
                  <Button key="closed-more" plain dimColor label={isAllClosed ? '▾ show fewer' : `▸ ${closed.length - CLOSED_SHOWN} more closed`} onPress={toggle('closed-all', isAllClosed)} />
                )}
              </Box>,
            ] : []),
          ]
        })}
        {kb.length > 0 && section('kb', 'Pending knowledge-base pages', String(kb.length), false, () => kb.map(p => item(`kb-${p.scope}-${p.file}`, p.title, `${p.action} · scope ${p.scope}`)))}
        {designs.length > 0 && section('design', 'Design sketches', String(designs.length), false, () => designs.map(d => item(`design-${d}`, d)))}
        {snap.drafts.length > 0 && section('drafts', 'DoD drafts', String(snap.drafts.length), false, () => snap.drafts.map(d => item(`draft-${d.slug}`, d.slug, `${d.dod.total} criteria`)))}
      </Box>
    )
  })
}
