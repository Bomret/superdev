export type Slice = { id: string; title: string; status: string }
// One line of a scope's event log (ADR 0141), oldest first. `command` is a chain command the trace records as
// started: its duration runs to its end, or to now while it runs. `wait` is the time between one command's end and
// the next command's start, a minute or more. `stage` is a stage write after implement, in a trace with no step
// lines and a stage write past merged. `start` and `end` are one run of a dispatch; `end` carries that run's dispatch outcome ('' when the
// line records none), and the first `verdict` or `final-verdict` line of its dispatch. `date` opens a new day.
export type LogEntry =
  | { kind: 'date'; at: number }
  | { kind: 'command'; at: number; name: string; ms: number; isDone: boolean; isBlocked: boolean }
  | { kind: 'commandEnd'; at: number; name: string; ms: number; isBlocked: boolean }
  | { kind: 'wait'; at: number; ms: number }
  | { kind: 'stage'; at: number; stage: string }
  | { kind: 'start'; at: number; type: string; slice: string; isResumed: boolean }
  | { kind: 'end'; at: number; type: string; slice: string; ms: number; outcome: string; review?: { spec: string; quality: string }; ready?: string }
  | { kind: 'sliceStart'; at: number; id: string; title: string }
  | { kind: 'sliceEnd'; at: number; id: string; title: string; status: string; ms?: number; review?: { spec: string; quality: string } }
  | ({ kind: 'sliceSummary'; at: number; id: string } & SliceSummary)
// `sliceStart` is a slice going in progress, `sliceEnd` its merge or block (`ms` runs from that slice's latest start,
// absent with none; `review` is the slice's last recorded slice-reviewer verdict), and `sliceSummary` counts the
// trace lines naming the slice since that start: `path` and `suite` runs failed and passed, completed slice-review
// rounds, and the latest fail-to-pass outcome ('' when none).
export type SliceSummary = { path: { fail: number; pass: number }; suite: { fail: number; pass: number }; review: number; f2p: string }
// `running`: the dispatches whose last run has no recorded end, plus the slices started and not yet merged or blocked. `ahead`: the commands still ahead in chain order,
// 'closed' once the scope closed, or null when the log names none.
export type EventLog = { entries: LogEntry[]; running: number; ahead: string[] | 'closed' | null }
export type Progress = { done: number; total: number }
export type Scope = {
  name: string
  stage: string
  branch: string
  anchor: string
  lockMtime: number | null
  dod: Progress
  slices: Slice[]
  log: EventLog
}
// `isDraft` from the frontmatter's `status: draft` alone (ADR 0112); `status` is the body's `**Status:**` line, if any.
export type Intent = { name: string; title: string; status: string; isDraft: boolean }
// `file`: the staged page's file name under `kb-pending/<scope>/`, unique within its scope; `title` may repeat.
export type KbPage = { scope: string; file: string; title: string; action: string }
export type Draft = { slug: string; dod: Progress }
// Only the items superdev's own docs define under `.superdev/`; anything else is ignored.
export type Snapshot = {
  root: string
  assignees: { role: string; who: string }[] | null
  intents: Intent[] | null
  scopes: Scope[] | null
  kbPending: KbPage[] | null
  designs: string[] | null
  drafts: Draft[]
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'superdev-view': {
      snapshot: Snapshot | null
      selected: string | null
      sections: Record<string, boolean> // overview section id -> open, set by a press
    }
  }
}
