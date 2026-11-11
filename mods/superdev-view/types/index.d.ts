export type Slice = { id: string; title: string; status: string }
// One line of a scope's event log (ADR 0141), oldest first. `command` is a chain command the trace records as
// started: its duration runs to its end, or to now while it runs. `wait` is the time between one command's end and
// the next command's start, a minute or more. `stage` is a stage write after implement, in a trace with no step
// lines and a stage write past merged. `tamper` is a `tamper` trace line (ADR 0225): scope.js found `file` (`ledger.md` or
// `trace.log`) changed outside scope.js. `run` is one run of a dispatch, placed at its start (a resumed run at its resume): `ms` is its
// duration once it ended (`isEnded`), else the time from its start to now; `outcome` is its dispatch outcome ('' when none is
// recorded). `date` opens a new day: the
// flat log reads a group on the day where it sits, and a group's own lines start from the day of its header's `at`.
export type LogEntry =
  | { kind: 'date'; at: number }
  | { kind: 'command'; at: number; name: string; ms: number; isDone: boolean; isBlocked: boolean }
  | { kind: 'commandEnd'; at: number; name: string; ms: number; isBlocked: boolean }
  | { kind: 'wait'; at: number; ms: number }
  | { kind: 'stage'; at: number; stage: string }
  | { kind: 'tamper'; at: number; file: string }
  | { kind: 'run'; at: number; type: string; slice: string; isResumed: boolean; isEnded: boolean; ms: number; outcome: string }
  | { kind: 'slice'; at: number; id: string; title: string; status: string; ms?: number; isRunning: boolean; review: number; isOpenByDefault: boolean; entries: LogEntry[] }
  | { kind: 'sliceEnd'; at: number; status: string; ms?: number }
  | ({ kind: 'sliceSummary'; at: number; id: string } & SliceSummary)
// `slice` is one slice's group, placed where the first trace line naming the slice falls, and holding every later line
// that names it. `at` is its first `in-progress` line, else its first line. `status` is its latest ledger status ('' with
// none). `ms` runs from the first start to the last end of a merged or blocked slice, or to now while it is in progress
// (`isRunning`), and is absent otherwise. `review` counts its completed slice-reviewer dispatches. `isOpenByDefault` is
// false for a merged slice with no run still open. Inside a group, `sliceEnd` is an end line the header does not stand
// for: the end of an earlier stretch of a slice that ran more than once, or an end whose status a later merged or blocked
// line changed with no start between (`ms` from that stretch's start, absent with none), and `sliceSummary` counts the trace lines naming the
// slice in one stretch: `path` and `suite` runs failed and passed, completed slice-review rounds, and the latest
// fail-to-pass outcome ('' when none).
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
  // When the trace records the closed stage write; null for an open scope or a trace with none.
  closedAt: number | null
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
      groups: Record<string, boolean> // `<scope>/<slice id>` -> slice group open, set by a press
    }
  }
}
