import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Draft, Intent, KbPage, LogEntry, Scope, Snapshot } from '../types'
import { eventLog, frontmatter, header, intent, progress, slices } from './parse'

const PANE = 'superdev-view'
const snapshot = atom({ plugin: 'superdev-view', key: 'snapshot' } as const, null)
const selected = atom({ plugin: 'superdev-view', key: 'selected' } as const, null)
// Which overview sections a press opened or closed, by section id; a section absent here takes its default.
const sections = atom({ plugin: 'superdev-view', key: 'sections' } as const, {})
const STAGE_COLOR: Record<string, string> = {
  planned: 'gray', implementing: 'yellow', merged: 'cyan', reviewed: 'cyan',
  'documented-unreviewed': 'cyan', documented: 'blue', submitted: 'magenta', shipped: 'green', closed: 'gray',
}
const SLICE_COLOR: Record<string, string> = { todo: 'gray', 'in-progress': 'yellow', 'in-review': 'blue', merged: 'green', blocked: 'red' }
const OUTCOME_COLOR: Record<string, string> = { failed: 'red', denied: 'red', stopped: 'yellow', unknown: 'yellow', 'session-end': 'yellow' }
const READY_COLOR: Record<string, string> = { yes: 'green', no: 'red', 'with-fixes': 'yellow' }
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
  return {
    name,
    stage,
    branch: header(ledger, 'Branch'),
    anchor: header(ledger, 'Anchor'),
    lockMtime: lock ? lock.mtimeMs : null,
    dod: progress(dod),
    slices: slices(ledger),
    log: eventLog(ledger, trace, Date.now()),
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
    const info = await $.fs.read(`${root}/info.json`).then(t => JSON.parse(t) as Record<string, { assignee?: string }>).catch(() => ({}))
    assignees = Object.entries(info).map(([role, v]) => ({ role, who: v?.assignee ?? '' }))
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
    const { Box, Text, Button } = table

    const snap: Snapshot | null = await read($, snapshot)
    if (!snap) return <Text dimColor>Scanning .superdev…</Text>
    // A path under the home folder shows with `~` in place of it.
    const home = await $.env.get('HOME')
    const tilde = (p: string) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p)
    if (snap.error) return <Text dimColor>{snap.error} ({tilde(snap.root)})</Text>
    const all = snap.scopes ?? []
    const active = all.filter(s => s.stage !== 'closed')
    const closed = all.filter(s => s.stage === 'closed')
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
    const row = (key: string, parts: (Part | false | '')[]) => (
      <Box key={key} flexDirection="row">
        {parts.filter((p): p is Part => !!p).map((p, n) => p === 'grow' ? <Box key={`${key}-${n}`} flexGrow={1} /> : (
          <Box key={`${key}-${n}`} flexShrink={p.shrink ? 1 : 0} minWidth={p.shrink ? 0 : undefined}>
            <Text color={p.color} dimColor={p.dim} bold={p.bold} wrap="truncate-end">{p.text}</Text>
          </Box>
        ))}
      </Box>
    )
    const logLine = (e: LogEntry, n: number) => {
      const key = `log-${n}`
      const type = (t: string) => t.replace(/^superdev:/, '')
      switch (e.kind) {
        case 'date':
          return row(key, [{ text: new Date(e.at).toDateString(), bold: true, dim: true, shrink: true }])
        case 'command':
          return row(key, [
            e.isDone ? { text: '✓', bold: true } : { text: '●', color: 'green', bold: true },
            { text: ` ${e.name}`, bold: true, shrink: true },
            'grow',
            { text: ` ${clock(e.ms)}`, dim: true },
          ])
        case 'wait':
          return row(key, [{ text: `⋯ ${clock(e.ms)}`, dim: true, shrink: true }])
        case 'stage':
          return row(key, [{ text: `${hm(e.at)} ` }, { text: `stage ${e.stage}`, shrink: true }])
        case 'slice':
          return row(key, [
            { text: `${hm(e.at)} ` },
            { text: e.status === 'merged' ? '✓' : '⨯', color: e.status === 'merged' ? 'green' : 'red' },
            { text: ` slice ${e.id} ${e.status}`, shrink: true },
          ])
        case 'start':
          return row(key, [
            { text: `${hm(e.at)} ` },
            { text: '▶', color: 'green' },
            { text: ` ${type(e.type)} ${e.slice}`, shrink: true },
            e.isResumed && { text: ' · resumed' },
          ])
        case 'end': {
          const reviewColor = e.review?.spec === 'pass' && e.review.quality === 'approved' ? 'green' : e.review?.spec === 'fail' || e.review?.quality === 'changes-needed' ? 'red' : 'yellow'
          const outcome = e.outcome !== '' && e.outcome !== 'completed' ? e.outcome : ''
          return row(key, [
            { text: `${hm(e.at)} ■` },
            { text: ` ${type(e.type)} ${e.slice}`, shrink: true },
            !!e.review && { text: ` · ${e.review.spec} ${e.review.quality}`, color: reviewColor },
            !!e.ready && { text: ` · ${e.ready}`, color: READY_COLOR[e.ready] ?? 'yellow' },
            !!outcome && { text: ` · ${outcome}`, color: OUTCOME_COLOR[outcome] ?? 'yellow' },
            { text: ` · ${clock(e.ms)}` },
          ])
        }
      }
    }

    if (open) {
      const log = open.log
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
            {log.entries.map((e, n) => logLine(e, n))}
            {log.ahead !== null && row('ahead', [{ text: log.ahead === 'closed' ? '■ closed' : `○ ${log.ahead.join(' · ')}`, dim: true, shrink: true }])}
          </Box>
        </Box>
      )
    }

    const opened = await read($, sections)
    const toggle = (id: string, isOpen: boolean) => () => void update($, sections, m => ({ ...m, [id]: !isOpen }))
    // A section: a header Button with its open mark, name, and count, then its body while open.
    const section = (id: string, name: string, count: string, isOpenByDefault: boolean, body: () => unknown) => {
      const isOpen = opened[id] ?? isOpenByDefault
      return (
        <Box flexDirection="column">
          <Button key={`section-${id}`} label={`${isOpen ? '▾' : '▸'} ${name} ${count}`} onPress={toggle(id, isOpen)} />
          {isOpen && <Box flexDirection="column" paddingLeft={2} marginTop={1} gap={1}>{body()}</Box>}
        </Box>
      )
    }
    const intents = snap.intents ?? []
    const kb = snap.kbPending ?? []
    const designs = snap.designs ?? []

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {snap.assignees && <Text dimColor>🪪 {snap.assignees.map(a => a.who).join(', ')}</Text>}
          <Text dimColor wrap="truncate-start">{tilde(snap.root)}</Text>
        </Box>
        {intents.length > 0 && section('brainstorm', 'Brainstorm', `(${intents.length})`, false, () => intents.map(i => (
          <Box key={`intent-${i.name}`} flexDirection="column">
            <Text>{i.isDraft ? 'draft' : 'ready'} · {i.title}</Text>
            {i.status !== '' && <Text dimColor>{i.status}</Text>}
          </Box>
        )))}
        {section('scopes', 'Scopes', `· ${active.length} active · ${closed.length} closed`, true, () => (
          [...(active.length === 0 ? [<Text key="no-active" dimColor>no active scope</Text>] : []), ...[...active, ...closed].map(s => {
            const merged = s.slices.filter(x => x.status === 'merged').length
            return (
              <Box key={`row-${s.name}`} flexDirection="column">
                {/* the stage sits outside the Button: desktop draws a Button's label in one color */}
                <Box flexDirection="row" alignItems="center" columnGap={1}>
                  <Button key={`scope-${s.name}`} label={s.name} onPress={choose(s.name)} />
                  <Text color={STAGE_COLOR[s.stage] ?? 'white'}>{s.stage}</Text>
                </Box>
                <Box key={`facts-${s.name}`} flexDirection="column" paddingLeft={2}>
                  {s.slices.length > 0 && (
                    <Box key={`bar-${s.name}`} flexDirection="row" flexWrap="wrap" columnGap={1}>
                      {s.slices.map(x => <Text key={`seg-${s.name}-${x.id}`} color={SLICE_COLOR[x.status] ?? 'gray'}>▬▬▬</Text>)}
                    </Box>
                  )}
                  <Text dimColor>
                    {merged}/{s.slices.length} slices · DoD {s.dod.done}/{s.dod.total} · {s.log.running} running{s.lockMtime !== null ? ` · lock ${age(now - s.lockMtime)}` : ''}
                  </Text>
                </Box>
              </Box>
            )
          })]
        ))}
        {kb.length > 0 && section('kb', 'Pending knowledge-base pages', `(${kb.length})`, false, () => kb.map(p => <Text key={`kb-${p.scope}-${p.file}`}>{p.title} · {p.action} · scope {p.scope}</Text>))}
        {designs.length > 0 && section('design', 'Design sketches', `(${designs.length})`, false, () => designs.map(d => <Text key={`design-${d}`}>{d}</Text>))}
        {snap.drafts.length > 0 && section('drafts', 'DoD drafts', `(${snap.drafts.length})`, false, () => snap.drafts.map(d => <Text key={`draft-${d.slug}`}>{d.slug} · {d.dod.total} criteria</Text>))}
      </Box>
    )
  })
}
