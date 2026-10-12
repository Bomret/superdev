# 0141: superdev-view draws a scope run as an event log

**Status:** Accepted

**Context.** The superdev-view scope page grouped a run's slices under `Wave n` dependency levels, put
every agent with no slice row under `Scope-level`, and drew each agent as a card. The operator lost track
of what was still to do and what ran now. Wave levels imply a schedule the full tier does not follow.
Two prototype rounds tested other layouts on real runs (branch `prototype/scope-page-status-groups`,
2026-10-10 to 2026-10-12). A page of stage rows read as states the scope sat in. `merged`, `reviewed`
and the other stage names are past tense, so the slice work looked parked in `implementing`. An HTML
prototype of five vertical layouts, replayed over three runs, showed that the operator follows a run
moving through time best as one log of what happened.

**Decision.**

- **The scope page is one event log.** It lists what happened in the run oldest first, from `planned`
  to `closed`: each agent's start and end, each review's verdict, and each slice's merge or block. Scope
  agents and slice agents share the log. Nothing folds and no entry leaves it.
- **Chain commands split the log.** A header line names each command the trace records as started:
  `plan` from the ledger's `planned` init, `implement` from the `implementing` stage, and every later
  command from its `ledger step set` line (ADR 0140). A trace written before the step lines existed draws
  its later stage writes as plain log lines under no command name.
- **The page reads the run files alone.** It reads the ledger and `trace.log` and nothing else. The
  mod's live layer is deleted: the hooks on Claude Code's subagent, tool-call, model-step, and turn
  events, and the per-agent cards they fed. A running agent's tool calls and context size no longer show
  on the scope page.
- **A closed scope stays reviewable** until `hooks/scope-prune.js` reaps its run root.

**Consequences.** The page draws only facts the run files record (INV-0144), so it shows a run from
another session as fully as one from the current session. The page loses the live per-agent detail the
cards carried. Keeping a closed run's log after the reap would need a plugin change and is out of scope.
The mod registers no hook on the session's agent events, so the agent-attribution rule it shared with
the run trace has one implementation left.

**Considered options.**

- Stage rows with the chain steps named after them. Stage names are past tense, so the rows read as
  states and the slice work as parked in `implementing`.
- One row per interval between ledger lines, named by the open step or else the stage. Every wait
  becomes an empty row, and two review invocations become two `review` rows.
- Dependency depth levels (waves) as the slices' axis. They imply a schedule the full tier does not
  follow, and need a new term.
- Status groups as the slices' first level. A slice moves to another group each time its status changes.
- Slices and stages as two stacked parts. The slice work shows twice, and the fix loop is a flat list.
- A spine of commands with review cycles, agents, or slice tracks folded below each command. The folded
  containers keep the run's structure but read as parked.
- Horizontal swimlanes over time. The pane is a narrow docked side tab.
- The log with a pinned slice strip, folded commands, and cards on click. The operator chose the plain
  log.
- Naming an older trace's later commands from its stage lines. The run files do not record them, and
  the mod derives no fact (INV-0144).
