// A fake repository under /r for the mod's tests: the engine's file, process, and pane calls answered
// from memory, beneath the plugin. Not a suite: the suites import it.
import type { On } from 'claude-code'
import { mock, test as kitTest } from 'claude-code/testing'

// The kit's `test` with a loose per-case bound. The kit's default bound, 5 s of wall clock, counts the time a case
// spends descheduled: beside the repository's suites, a case that takes 0.6 s alone has read over 5 s. The bound
// only catches a case that hangs, which no bound shortens, so 60 s falsifies the same failure the default did.
type Body = Parameters<typeof kitTest>[1]
export const test = (name: string, body: Body) => kitTest(name, { timeoutMs: 60_000 }, body)

export type Entry = { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }
export const dir = (name: string): Entry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
export const file = (name: string): Entry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

export const R = '/r/.superdev'
export const PANE = {
  component: 'Pane', requestId: 'superdev-view',
  props: { title: 'superdev', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

// Each row is [id, status] or [id, status, depends-on cell].
export const ledger = (stage: string, rows: ([string, string] | [string, string, string])[]) =>
  `**Stage:** ${stage}\n**Branch:** feat/x\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n` +
  rows.map(([id, status, deps = '—']) => `| ${id} | #${id} | Slice ${id} | behavior | ${deps} | ${status} | — |`).join('\n') + '\n'

// `files` and `lists` stay live: a test that edits them sees the next scan read the change.
// `cwd` is the session's: git answers the main working tree's `.git` only when asked from there.
// HOME is `/r`, so the pane shows the root as `~/.superdev`.
// `mtimes` answers `fs.stat` for the paths it names (a held `run.lock`); `hasRoot` false is a repository with no `.superdev`.
// `hold` runs before an existence check answers, so a test can keep one waiting.
// Hands back a held clock: the pane's hooks leave their bookkeeping running, and `settle()` lets it finish
// before a test looks.
export const fakeRepo = (on: On, files: Record<string, string>, lists: Record<string, Entry[]>, cwd = '/r', hold?: (path: string) => Promise<void>, mtimes: Record<string, number> = {}, hasRoot = true) => {
  on('session.cwd', async () => ({ value: cwd }))
  on('env.get', async () => ({ value: '/r' }))
  on('process.run', async (_$, e) => ({
    value: { exitCode: e.argv.includes('--git-common-dir') && e.init?.cwd === cwd ? 0 : 1, stdout: '/r/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.exists', async (_$, e) => {
    await hold?.(e.path)
    return { value: (hasRoot && e.path === R) || e.path in files }
  })
  on('fs.list', async (_$, e) => {
    const l = lists[e.path]
    return l ? { value: l } : { deny: 'ENOENT' }
  })
  on('fs.read', async (_$, e) => {
    const f = files[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('fs.stat', async (_$, e) => (e.path in mtimes ? { value: { mtimeMs: mtimes[e.path] } as never } : { deny: 'ENOENT' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  return mock.clock(on)
}

export const runCommand = { command: 'superdev-view', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

// A press on a scope row's name: the row draws the name as a Markdown link, answered by the pane, never opened.
export const scopeLink = (name: string) => ({ key: `scope-${name}`, link: { href: `https://superdev.invalid/scope/${name}` } })
