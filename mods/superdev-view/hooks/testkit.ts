// A fake repository under /r for the mod's tests: the engine's file, process, and pane calls answered
// from memory, beneath the plugin. Not a suite: the suites import it.
import type { On } from 'claude-code'
import { mock, test as kitTest } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The kit's `test` with a loose per-case bound. The kit's default bound, 5 s of wall clock, counts the time a case
// spends descheduled: beside the repository's suites, a case that takes 0.6 s alone has read over 5 s. The bound
// only catches a case that hangs, which no bound shortens, so 60 s falsifies the same failure the default did.
export const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 60_000 }, body)

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
// `failing` names the engine calls (`session.cwd`, `fs.exists`, `process.run`, `fs.list`) that fail while they are in it.
// `git` shapes the repository git answers for: `commonDir`, the shared git directory (`/r/.git` when not given);
// `worktree`, the `core.worktree` its config sets, if any; `toplevel`, the session checkout `--show-toplevel` answers
// (none when not given, so that call fails); `realPaths`, where `fs.stat` with `resolve` lands a path.
// Hands back a held clock: the pane's hooks leave their bookkeeping running, and `settle()` lets it finish
// before a test looks.
export const fakeRepo = (on: On, files: Record<string, string>, lists: Record<string, Entry[]>, cwd = '/r', hold?: (path: string) => Promise<void>, mtimes: Record<string, number> = {}, hasRoot = true, failing: Set<string> = new Set(), git: { commonDir?: string; worktree?: string; toplevel?: string; realPaths?: Record<string, string> } = {}) => {
  on('session.cwd', async () => (failing.has('session.cwd') ? { deny: 'EIO' } : { value: cwd }))
  on('env.get', async () => ({ value: '/r' }))
  const commonDir = git.commonDir ?? '/r/.git'
  on('process.run', async (_$, e) => {
    if (failing.has('process.run')) return { deny: 'EIO' }
    const answer = (out: string | undefined) => ({ value: { exitCode: out === undefined ? 1 : 0, stdout: `${out ?? ''}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const a = e.argv
    if (a.includes('--git-common-dir')) return answer(e.init?.cwd === cwd ? commonDir : undefined)
    if (a.includes('--show-toplevel')) return answer(e.init?.cwd === cwd ? git.toplevel : undefined)
    if (a.includes('core.worktree') && a.includes(`${commonDir}/config`)) return answer(git.worktree)
    return answer(undefined)
  })
  on('fs.exists', async (_$, e) => {
    await hold?.(e.path)
    if (failing.has('fs.exists')) return { deny: 'EIO' }
    return { value: (hasRoot && e.path === R) || e.path in files }
  })
  on('fs.list', async (_$, e) => {
    const l = failing.has('fs.list') ? undefined : lists[e.path]
    return l ? { value: l } : { deny: 'ENOENT' }
  })
  on('fs.read', async (_$, e) => {
    const f = files[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('fs.stat', async (_$, e) => {
    if (e.resolve && git.realPaths && e.path in git.realPaths) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, realPath: git.realPaths[e.path] } as never }
    return e.path in mtimes ? { value: { mtimeMs: mtimes[e.path] } as never } : { deny: 'ENOENT' }
  })
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  return mock.clock(on)
}

export const runCommand = { command: 'superdev-view', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

// A press on a scope row's name: the row draws the name as a Markdown link, answered by the pane, never opened.
export const scopeLink = (name: string) => ({ key: `scope-${name}`, link: { href: `https://superdev.invalid/scope/${name}` } })
