export type Slice = { id: string; title: string; status: string }
// An agent as the pane's structure knows it: what changes only when it starts or ends.
export type Agent = { key: string; type: string; desc: string; slice: string; isDone: boolean }
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
export type KbPage = { scope: string; title: string; action: string }
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
      liveIndex: Record<string, LiveAgent>
      liveDetail: Record<string, LiveDetail> // by agentId, unindexed ids bounded
      liveFinal: Record<string, LiveDetail> // by dispatch key, one per ended agent of an active scope
      traceActivity: Record<string, Activity>
    }
  }
}
