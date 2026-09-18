# references/

## Purpose

Backend seed templates and runtime references live here. **Backend seed templates** are what `/superdev:setup` turns into a
consumer repo's `docs/agents/*.md`. **Runtime references** are the shared contracts the skills and
subagents read while a scope runs. This doc routes both. It states no contract of its own: each
reference's own opening states its full contract.

## Ownership

This doc owns the routing table below — which reference owns which contract, and which runtime surface
reads it. It owns nothing else. The root [`AGENTS.md`](../../AGENTS.md) owns the working rules that
govern the prose in this folder, chiefly **Backends are pluggable** and the **prompt-architecture
rules**.

## Local Contracts

A reference is canonical for what it owns. A skill or agent that needs the contract reads the file
rather than restating it; a restatement is the one-sided-pin shape the root doc's prompt-architecture
rules name.

| Reference | Owns | Read at runtime by |
|---|---|---|
| `plan-contract.md` | slice schema and lifecycle, the `### The reachability criterion` rule every Definition of Done carries (ADR 0062), plus the `## Scope anchor`, `## Feature label`, `## Release`, `## Run state`, `## Append mode`, `## Triage record`, and `### Assignee` generic contracts every store document specialises, including the anchor dependency `/afk` defers on (ADR 0004, 0010, 0017, 0019, 0021, 0034, 0040, 0042, 0046, 0048, 0073) | `/plan`, `/implement`, `/afk`, and the store seeds cite it |
| `documentation.md` | the in-repo documentation convention, which `/superdev:setup` fills at `## Writing standard` always and at `## Audit set` when needed | `/setup`, `/document` |
| `controlled-prose.md` | the writing standard (ADR 0012) | `doc-pass.md`'s callers apply it, `doc-reader` verifies it, `prose-check` applies it unconditionally on demand (ADR 0057) |
| `content-types.md` | the content-type lens, never configurable and never `none` (ADR 0014) | `doc-pass.md`'s callers, `doc-reader` |
| `doc-pass.md` | the documentation pass, stated once for its callers (ADR 0031) | `doc-writer`, the `lite` playbook |
| `run-init.md`, `run-handoff.md` | run init and run handoff, tier-agnostic | both execution playbooks |
| `implement-full.md`, `implement-lite.md` | the tier-specific execution playbooks | `/implement`, once it computes the tier |
| `test-selection.md` | the focused-or-full test command rule (ADR 0025, ADR 0074), which `hooks/green-gate.js` implements in code, plus the optional `## Timing command` section and why it stays unfenced (ADR 0066) | focused: `implementer`, `slice-reviewer`, `implement-lite`, `/superdev:document` (over its own doc commits). Full suite: `/review`'s scope review, `run-handoff`. Timing command: `/superdev:review-tests`, `/superdev:setup` |
| `scope-mode.md` | the shared scope rules: live-run detection, the scope checkout, the run lock, `## Unattended`, `## The scope slug`, `## The change type`, `## Degraded passes`, `## Unresolved defects`, `## Deferred findings`, `## The ledger` (deferring the schema to `scope.js`), `## Containment` (the one statement of the test that decides base already holds a branch's work, second pass included: a not-contained verdict refetches the base and retests against `FETCH_HEAD`. `hooks/scope-prune.js` mirrors the local half in JavaScript and is the one caller that never fetches), `## Cutting the scope branch`, `## Publishing run state` (ADR 0007, 0013, 0016, 0018, 0021, 0022, 0026, 0028, 0035, 0039, 0041, 0042, 0046, 0048, 0053, 0065) | `/review`, `/document`, `/ship`, `/implement`, `/afk`, both playbooks, `/sweep` (`## Degraded passes` alone, borrowing only its report-and-no-ledger-entry half: `/sweep` holds no run root of its own) |
| `cross-exam.md`, `domain-modeling.md`, `doc-verification.md` | the authoring disciplines, superdev's rendering of Matt Pocock's grilling and domain-modeling skills. `domain-modeling.md` also owns revise-in-place: a glossary entry is rewritten, an overturned ADR is superseded, and a qualified one is amended, never edited | `/plan`, `/brainstorm`. `implementer` reads `doc-verification.md` before acting on a third-party assumption |
| `design-sketch.md` | the throwaway HTML page showing the components a plan intends to add, change, or delete: the card contract, the self-contained no-JavaScript artifact, the skeleton, and the wait for the operator's approval (ADR 0036) | `/plan` §3, and only when the operator accepts the offer |
| `diagnosis.md` | the defect-diagnosis loop: the red-capable repro gate, the minimised repro, ranked hypotheses, tagged instrumentation (a rendering of Matt Pocock's diagnosing-bugs skill) | `/plan` on a `fix` feature, `implementer` on a defect-repair dispatch, `/review`'s fix loop |
| `prototype.md` | the prototype discipline: one stated question, liftable logic, throwaway-branch capture, the `spec` snippet exception (a rendering of Matt Pocock's prototype skill) | `/brainstorm` §4, and `plan-contract.md` cites the `spec` exception |
| `merge-conflicts.md` | conflict resolution by intent: the union on additive conflicts, composing compatible intents, abort-and-escalate on a winner-picking overlap | the full playbook's merge step |
| `review-checklist.md` | anti-patterns, design smells, vulnerability classes, a reuse-audit lens, a consistency lens, a `## Test cost` lens for dead and expensive tests | `final-reviewer` (all but `## Test cost`), `slice-reviewer` (anti-patterns and vulnerabilities), `test-auditor` (the test lenses plus `## Test cost`, which reaches it alone) |

Every other file here is a backend seed: a slice store, a code host, or a knowledge base. Adding one is
the **Backends are pluggable** rule in the root doc.

## Work Guidance

Adding a reference means adding its row above. Changing what a reference owns means changing that row
in the same commit. A row whose `Read at runtime by` column no longer matches the live prose is the
drift `scripts/drift-check.js` exists to catch — several of its contract tables pin exactly these
reader relationships.

## Verification

`bun run test` from the repo root. `scripts/drift-check.js` asserts that every canonical reference
still carries the sections its readers are sent to, and that every document a contract table pins
still exists.

## Child DOX Index

No child. This folder is flat.
