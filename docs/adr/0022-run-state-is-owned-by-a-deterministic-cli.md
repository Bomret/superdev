# 0022 — Run state is owned by a deterministic CLI

**Status:** accepted

## Context

The ledger and the status report are deterministic state work, but the agent executed them by following
prose: every command hand-edited `ledger.md` and hand-parsed it back, drift-check carried a growing set
of contracts that only guard prose restatements of the ledger schema, and the stage state machine lived
as a rule every command had to remember. All four predicted failure modes occurred in real runs: prose
drift, orchestration token cost, drift-check burden, and a broken run.

## Decision

`scripts/scope.js` (CommonJS, `--selftest`, invoked as `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js`)
owns every ledger write and read and the `/superdev:status` report. It enforces the ledger schema, the
feature-label charset, and the stage transition rules in code. A `ledger-guard` hook makes it the only
write path: it denies Edit/Write tool calls and Bash shell writes targeting
`.superdev/scopes/*/ledger.md`, allowing `scope.js` itself. Judgment work — planning, slice
implementation, reviews, doc passes, slice-store I/O — stays in-agent; slice stores stay pluggable via
prose seeds.

## Considered options

- **Bundled MCP server exposing the verbs** — schema-validated inputs, but a heavier runtime surface
  than a Bash-invoked CLI for the same win.
- **External orchestrator via the Agent SDK** — maximal control-flow determinism, but abandons the
  plugin form and forces JS store drivers per backend; a different product, not a refactor.
- **Enforcement-only (more hooks, no execution move)** — vetoes bad writes but still spends agent turns
  producing them; token cost was one of the observed pains, so execution had to move too.

## Consequences

Ledger-schema, stage, ledger-branch, and scope-slug drift-check contracts collapse into `scope.js
--selftest`; the drift surface that remains is pointer-shaped (commands still call the verbs).
`references/scope-mode.md`'s `## The ledger` section defers to `scope.js` as schema owner. A future
backend for run state (anything beyond local markdown) has one integration point instead of six prose
consumers.
