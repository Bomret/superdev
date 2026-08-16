# 0019 — The feature label is store-defined

**Status:** Accepted

## Context

`/superdev:implement` resolves which planned feature to build from a feature label, and derives the run's
scope by stripping the label's prefix. The label's shape is the slice store's own: an issue-backed store
carries `feat/<slug>` as a real label, and the local-file store carries the slug alone, as the
`docs/plans/<slug>/` directory name. `commands/implement.md` states that generalisation. Five other places
pinned `feat/` literally — `commands/afk.md`'s stage table, `commands/plan.md`'s handoff, `implement.md`'s
own `argument-hint`, `CONTEXT.md`'s **Feature label** entry, and `scripts/drift-check.js`'s
`FEATURE_ARG_CONTRACTS`. On a local-file store `/superdev:afk` therefore hands `/superdev:implement` a
label that store cannot resolve, which stops with an error, which the sweep records as a block. Two of
those end the night.

## Decision

The feature label's shape belongs to the active `docs/agents/issue-tracker.md`, and no command, glossary
entry, or check states it. `drift-check.js` asserts the label *contract* — that `implement.md` declares a
label argument and that `plan.md` names a resolved successor — and not the label's prefix.

## Considered options

- **Declare `/superdev:afk` issue-backed-only.** One paragraph in its config step, and the smallest
  possible diff. It loses, because it breaks the **Backends are pluggable** working rule to protect a
  check, and it withholds unattended sweeps from a store `/superdev:implement` already supports.

## Consequences

The `feat/` prefix stops being a fact anything but the store document states, so a store that names its
features differently needs no change anywhere else. The cost is real: `FEATURE_ARG_CONTRACTS` no longer
pins the label's shape, so a typo in the prefix a given store does use goes unnoticed by the suite. The
contract it keeps is the one whose loss actually costs a run — a caller with no way to name its target —
and the shape it gives up was never true across backends in the first place.
