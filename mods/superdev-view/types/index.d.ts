// `dependsOn`: the ids of the ledger's depends-on cell, none for `—` or an empty cell.
export type Slice = { id: string; title: string; status: string; dependsOn: string[] }
// An agent as the pane's structure knows it: what changes only when it starts or ends. `start` is its dispatch
// time: the trace's `dispatch` line, or this session's spawn; null when the line's time does not parse. `end` is
// its end time the same way: the trace's `dispatch-end` line, or this session's end; null while it runs.
export type Agent = { key: string; type: string; desc: string; slice: string; isDone: boolean; start: number | null; end: number | null }
// What the run trace says an agent last did: read by its card, never by the pane.
export type Activity = { last: string; lastKind: string; events: number }
// A subagent this session saw start, attributed to one scope and slice (INV-0136). Written on its start and on
// its end only, never by a tool call or a model step.
export type LiveAgent = {
  key: string
  agentId: string | null
  root: string
  scope: string
  slice: string
  type: string
  desc: string
  start: number
  end: number | null
}
// An agent's calls and ctx. A running agent's, keyed by its agentId, are written on every tool call and
// model step, and kept for every running agent the index names and for only the latest few ids it does not
// name. An ended agent's final ones, keyed by its dispatch, are written at its end and by a call or step
// bookkept after it. Both are read by its card, and by the static text of a surface without cards as of the
// pane's last redraw.
export type LiveDetail = { calls: string[]; ctx: number | null }
// What a card draws, handed to it as props and refreshed by its once-a-second post.
export type CardData = {
  key: string
  type: string
  scope: string
  slice: string
  desc: string
  isDone: boolean
  isLive: boolean
  start: number | null
  end: number | null
  calls: string[]
  ctx: number | null
  last: string | null
  events: number | null
  now: number
  // A scope page's entry: type and elapsed time only. The card posts it, and the answer hands it back.
  isCompact?: boolean
}
export type Progress = { done: number; total: number }
export type Scope = {
  name: string
  stage: string
  branch: string
  anchor: string
  lockMtime: number | null
  dod: Progress
  slices: Slice[]
  slicetrees: string[]
  agents: Agent[]
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
      liveIndex: Record<string, LiveAgent>
      liveDetail: Record<string, LiveDetail> // by agentId, unindexed ids bounded
      liveFinal: Record<string, LiveDetail> // by dispatch key, one per ended agent of an active scope
      traceActivity: Record<string, Activity>
    }
  }
}
