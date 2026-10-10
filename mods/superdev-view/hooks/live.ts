// The live layer's pure half: which scope and slice a dispatch belongs to, and what a card shows of a
// tool call. The hooks in register.tsx feed these from the session's own events.

export type Attribution = { root: string; scope: string; slice: string }

// plugin/hooks/run-trace.js's `recordDispatch`, rule for rule (INV-0136): every `.superdev/scopes/<slug>`
// path whose root holds a ledger, an optional `slicetrees/<id>` or `reports/<id>/` suffix naming the slice.
// Exactly one root attributes; exactly one slice id names the slice, zero or several give `scope`.
// The slug is scope.js's SLUG_RE.
const RUN_PATH = /((?:\/[^\s"'`<>()]*?)?\/\.superdev\/scopes\/[a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\/(?:slicetrees\/([\w-]+)|reports\/([\w-]+)\/))?/g

export const attribute = (prompt: string, hasLedger: (root: string) => boolean): Attribution | null => {
  const roots = new Set<string>()
  const ids = new Set<string>()
  for (const m of prompt.replace(/\\/g, '/').matchAll(RUN_PATH)) {
    const root = m[1] ?? ''
    if (!hasLedger(root)) continue
    roots.add(root)
    const id = m[2] ?? m[3]
    if (id) ids.add(id)
  }
  if (roots.size !== 1) return null
  const root = [...roots][0] ?? ''
  return { root, scope: root.slice(root.lastIndexOf('/') + 1), slice: ids.size === 1 ? ([...ids][0] ?? 'scope') : 'scope' }
}

// Every `.superdev/scopes/<slug>` root a prompt names, for the one ledger read a spawn makes.
export const runRoots = (prompt: string): string[] => [...new Set([...prompt.replace(/\\/g, '/').matchAll(RUN_PATH)].map(m => m[1] ?? ''))]

const SECRET_NAME = /\b([A-Za-z0-9_]*(?:token|key|secret|password)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi
const AUTH = /\b(authorization:\s*(?:(?:bearer|token|basic)\s+)?|bearer\s+)([^\s"']+)/gi

export const mask = (command: string): string =>
  command.replace(SECRET_NAME, '$1=***').replace(AUTH, (_, head: string) => `${head}***`)

const field = (input: unknown, name: string): string | undefined => {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>)[name] : undefined
  return typeof v === 'string' ? v : undefined
}

// The tool name plus a short target: a file tool's path, a search's pattern, a command's first 60
// characters (masked). Written or edited contents never reach it.
export const target = (tool: string, input: unknown): string => {
  const what =
    ['Read', 'Edit', 'Write', 'NotebookEdit'].includes(tool) ? (field(input, 'file_path') ?? field(input, 'notebook_path'))
    : tool === 'Grep' || tool === 'Glob' ? field(input, 'pattern')
    : tool === 'Bash' ? mask(field(input, 'command') ?? '').split('\n')[0]?.slice(0, 60)
    : undefined
  return what ? `${tool} ${what}` : tool
}

type Usage = { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const ctxOf = (usage: Usage | null | undefined): number | null =>
  usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : null
