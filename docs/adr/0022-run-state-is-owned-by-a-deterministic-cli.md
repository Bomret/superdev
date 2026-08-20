# 0022: Run state is owned by a deterministic CLI

**Status:** Accepted

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
write path: it denies Edit and Write tool calls and Bash shell writes targeting
`.superdev/scopes/*/ledger.md`, allowing `scope.js` itself. Judgment work stays in-agent: planning, slice
implementation, reviews, doc passes, and slice-store I/O. Slice stores stay pluggable via
prose seeds.

**The hooks read the ledger through `scope.js` too.** `scope.js` exports its header reader, and
`hooks/scope-prune.js` requires it rather than carrying a regex of its own. Ownership of the schema means
one implementation, not one implementation per consumer: a second reader drifts, and it drifted. The
hook's copy diverged on anchoring, capture width, newline handling, and markup normalisation while it was
hardened against defects on its own delete path, and none of those fixes travelled back. A hook that
cannot load the reader prunes nothing, which is the same fail-closed direction it already takes on a git
error.

**Normalisation is per header, because the values differ in kind.** `Stage` and `Branch` are single
tokens, so a reader strips the markup a hand-written ledger may wrap them in, along with trailing
punctuation. `Anchor` is a prose title that reaches a pull request, so a reader takes the rest of the
line and trims it, leaving punctuation alone. One rule for both would cost the last character of any
anchor title ending in `.` or `:`.

## Considered options

- **Bundled MCP server exposing the verbs.** Schema-validated inputs, but a heavier runtime surface
  than a Bash-invoked CLI for the same win.
- **External orchestrator via the Agent SDK.** Maximal control-flow determinism, but abandons the
  plugin form and forces JS store drivers per backend. A different product, not a refactor.
- **Enforcement-only (more hooks, no execution move).** Vetoes bad writes but still spends agent turns
  producing them. Token cost was one of the observed pains, so execution had to move too.

Considered for the hooks' reading, and rejected:

- **Two readers, pinned equal by a shared table of ledger lines.** The pattern this repo already uses for
  the scope-slug charset. It keeps the hooks standalone, and it only catches the rows somebody thought to
  enumerate, where a single implementation cannot diverge at all.
- **The hook shells out to `scope.js get`.** No new coupling and no exports, at one process spawn per
  scope per `Stop` event, on a hook whose whole contract is to be cheap and silent.
- **A uniform normalisation for every header.** Simpler to state and to test, and it truncates any anchor
  title ending in punctuation, which surfaces in the pull-request title `/superdev:review` derives.

## Consequences

Ledger-schema, stage, ledger-branch, and scope-slug drift-check contracts collapse into `scope.js
--selftest`. The drift surface that remains is pointer-shaped (commands still call the verbs).
`references/scope-mode.md`'s `## The ledger` section defers to `scope.js` as schema owner. A future
backend for run state (anything beyond local markdown) has one integration point instead of six prose
consumers.

`scripts/scope.js` gains a module surface and guards its command-line entry, so requiring it runs no CLI
code. `hooks/scope-prune.js` is the first hook to depend on a script rather than standing alone, which
makes `scripts/` a runtime dependency of `hooks/` and not only a sibling that `package.json` runs. The
hooks stay CommonJS under plain `node`, so nothing about how Claude Code invokes them changes. A drift
assertion fails if a hook grows a ledger-header regex of its own again, because a second reader is the
failure this reverses and prose alone will not hold it.
