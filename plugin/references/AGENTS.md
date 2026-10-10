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
| `plan-contract.md` | slice schema and lifecycle, the `### The reachability criterion` and `### The release-risk criterion` rules every Definition of Done carries (ADR 0062, ADR 0133), plus the `## Scope anchor`, `## Feature label`, `## Release`, `## Run state`, `## Append mode`, `## Triage record`, and `### Assignee` generic contracts every store document specialises, including the anchor dependency `/backlog` groups on (ADR 0004, 0010, 0017, 0019, 0021, 0034, 0040, 0042, 0046, 0048, 0073, 0083) | `/plan`, `/implement`, `/backlog`, and the store seeds cite it |
| `documentation.md` | the in-repo documentation convention, which `/superdev:setup` fills at `## Writing standard` always and at `## Audit set` when needed | `/setup`, `/document` |
| `controlled-prose.md` | the writing standard (ADR 0012) | `doc-pass.md`'s callers apply it, `doc-reader` verifies it, `prose-check` applies it unconditionally on demand (ADR 0057) |
| `content-types.md` | the content-type lens, never configurable and never `none` (ADR 0014) | `doc-pass.md`'s callers, `doc-reader` |
| `doc-pass.md` | the documentation pass, stated once for its callers (ADR 0031) | `doc-writer`, the `lite` playbook |
| `run-init.md`, `run-handoff.md` | run init and run handoff, tier-agnostic | both execution playbooks |
| `implement-full.md`, `implement-lite.md` | the tier-specific execution playbooks | `/implement`, once it computes the tier |
| `test-selection.md` | the focused-or-full test command rule (ADR 0025, ADR 0074, ADR 0085), the rule that the full, focused, and whole-repo commands run through `scope.js test`, in the background when a suite outlasts the Bash tool's time limit, so the run trace records the command's own outcome (ADR 0117, ADR 0127), which `hooks/green-gate.js` implements in code, the same background rule for `scope.js fail-to-pass`, and the changed-path set that verb builds (ADR 0134), the `## Stop on a missing focused command` section a repository stuck on one fenced block reaches, the optional `## Timing command` section and why it stays unfenced (ADR 0066), and the optional **affected form** the full command may take, plus its `## Whole-repo command` section and why it stays unfenced too (ADR 0105) | focused: `implementer`, `slice-reviewer`, `implement-lite`, `/superdev:document` (over its own doc commits). Full suite: `/review`'s scope review, `run-handoff`. The `fail-to-pass` verb's call sites: both playbooks, `run-handoff`, `/review`. Timing command: `/superdev:review-tests`, `/superdev:setup`. Whole-repo command: `/superdev:submit-pr`, `/superdev:ship`, `/superdev:review`, `/superdev:setup` |
| `scope-mode.md` | the shared scope rules: live-run detection, the scope checkout, the run lock, `## Unattended`, `## The scope slug`, `## The change type`, `## Resolving an empty argument` (the shared cascade every run-subject command's own empty-argument entrance cites, plus its run-root enumeration filtered by the calling command's own candidate stages), `## Degraded passes`, `## Unresolved defects`, `## Deferred findings` (the deferred-finding record and resolve procedure, ADR 0121), `## Observations` (an observation's capture: the moment-it-is-met rule, the read-before-write dedupe, the reported-and-dropped fallback on a store defining no `## Triage record` section, and the scope run's first `fail-to-pass` `unknown` outcome as an observation naming the environment gap), `## The ledger` (deferring the schema to `scope.js`), `## Containment` (the one statement of the test that decides base already holds a branch's work, second pass included: a not-contained verdict refetches the base and retests against `FETCH_HEAD`. `hooks/scope-prune.js` mirrors the local half in JavaScript and is the one caller that never fetches), `## Cutting the scope branch`, `## Bringing the scope branch to base` (the step both playbooks run after their run lock and before the first slice: fetch the remote base, fast-forward the local base ref only, move every numbering collision `scope.js collisions` finds, merge the fetched tip into the scope branch and record it, gate on the full suite; ADR 0120, INV-0124, ADR 0126), `## The scope's range base` (the one statement of where a scope's own range starts: the newer of `merge-base(<base>, <branch>)` and the recorded merged tip, computed by `scope.js base resolve`; every range consumer cites it; ADR 0120), `## Publishing run state`, `## Reading the posture at the merge commit` (the one statement of how a merged feature's posture, listed targets, and deploy record are read, which ship, verify-ship, wrap-up, and backlog cite), `## Routing a shipped run` (the one statement of whether a `shipped` run with an open anchor goes to verify-ship or to wrap-up, which ship, backlog, and document cite; ADR 0116, INV-0116), `## Staged pages at close` (the one statement of how ship's hand-off, verify-ship's end, and wrap-up's finish name a scope's staged pages from `scope.js staging`'s count; ADR 0119, INV-0123), `## Adopting a shipped original` (the one statement of how a command that needs a `shipped` original's run root adopts the shipped snapshot through `scope.js adopt --shipped`, which `/superdev:plan`, `/superdev:verify-ship`, and `/superdev:wrap-up` cite to adopt, and `/superdev:backlog` cites for routing only, since it writes nothing and adopts nothing; ADR 0124) (ADR 0007, 0013, 0016, 0018, 0021, 0022, 0026, 0028, 0035, 0039, 0041, 0042, 0046, 0048, 0053, 0065, 0078, 0083, 0088, 0124, 0134) | `/review`, `/document`, `/submit-pr`, `/implement`, both playbooks, `/ship`, `/verify-ship`, `/wrap-up`, `/plan` (`## Adopting a shipped original` alone), and `/backlog` (`## Reading the posture at the merge commit` and `## Routing a shipped run` alone), `/sweep` (`## Degraded passes` alone, borrowing only its report-and-no-ledger-entry half: `/sweep` holds no run root of its own) |
| `cross-exam.md`, `domain-modeling.md`, `doc-verification.md` | the authoring disciplines, superdev's rendering of Matt Pocock's grilling and domain-modeling skills. `cross-exam.md` also owns the vetting of every option a composed question offers, the evidence shown before the question, and the two-option cap (ADR 0122). `domain-modeling.md` also owns the invariant register's entry format and id form (`docs/invariants.md`, ADR 0077), the conversion from a principle to the rule it implies — the one sort both `/brainstorm`'s named commitments and `/plan`'s own originated ones reach, sending a system rule to the register with a `Check:` or `Check: none`, naming an authoring rule as one the register never receives, and calling a commitment that constrains nothing a mood (ADR 0081) — and revise-in-place: a glossary entry or an invariant entry is rewritten, an overturned ADR is superseded, and a qualified one is amended, never edited | `/plan`, `/brainstorm`. `implementer` reads `doc-verification.md` before acting on a third-party assumption |
| `design-sketch.md` | the throwaway HTML page showing the components a plan intends to add, change, or delete: the card contract, the self-contained no-JavaScript artifact, the skeleton, and the wait for the operator's approval (ADR 0036) | `/plan` §3, and only when the operator accepts the offer |
| `diagnosis.md` | the defect-diagnosis loop: the red-capable repro gate, the minimised repro, ranked hypotheses, tagged instrumentation (a rendering of Matt Pocock's diagnosing-bugs skill) | `/plan` on a `fix` feature, `implementer` on a defect-repair dispatch, `/review`'s fix loop |
| `prototype.md` | the prototype discipline: one stated question, liftable logic, throwaway-branch capture, the `spec` snippet exception (a rendering of Matt Pocock's prototype skill) | `/brainstorm` §4, and `plan-contract.md` cites the `spec` exception |
| `merge-conflicts.md` | conflict resolution by intent: the union on additive conflicts, composing compatible intents, moving a colliding ADR or invariant number this scope added, found by number through `scope.js collisions` whether or not git conflicts (ADR 0126), abort-and-escalate on a winner-picking overlap | the full playbook's merge step, and `scope-mode.md`'s `## Bringing the scope branch to base` (both tiers; ADR 0120) |
| `dod-ticks.md` | how a controller ticks a Definition-of-Done criterion from an implementer's report (ADR 0091, ADR 0092): the mapping gate a dispatch's own listed lines decide — implement's slice dispatch listing the criteria a slice's tag names — the note rule (INV-0014), and that only a controller ticks, one at a time, on `dod.md` and the anchor's `## Definition of Done ticks` section (INV-0015), plus `## Pairing dod.md with the anchor`, the one statement of how a `dod.md` line pairs with an anchor line | `agents/implementer.md`, both execution playbooks, `/superdev:verify-ship`, `/superdev:wrap-up`, and `scope-mode.md`'s `## Routing a shipped run`, which `/superdev:backlog` cites |
| `review-checklist.md` | anti-patterns, design smells, vulnerability classes, a reuse-audit lens, a consistency lens (including glossary drift), a `## Test cost` lens for dead and expensive tests, a `## Dependency verification` lens for an unverified new dependency, a `## Fail-to-pass run` lens for the **Pass-to-pass** and **Missing fail-to-pass run** findings (ADR 0134) | `final-reviewer` (all but `## Test cost` and `## Dependency verification`), `slice-reviewer` (anti-patterns, vulnerabilities, `## Fail-to-pass run`, and `## Dependency verification`, which reaches it alone), `test-auditor` (the test lenses plus `## Test cost`, which reaches it alone) |
| `deployment.md` | the deploy posture and targets seed `/superdev:setup` turns into a repository's `docs/agents/deployment.md` (ADR 0101) | `/superdev:plan`, `/superdev:ship`, `/superdev:setup` |
| `response-shapes.md` | the **Response shapes** (ADR 0113): the `## The Next block` every covered command's last message closes with, its blocked, operator-action, and no-successor variants, and the unattended, chained-posture, `AskUserQuestion`, and ship-offer chain rules (INV-0111), and `## The brainstorm report` (INV-0112) | `/superdev:brainstorm` (`## The Next block` and `## The brainstorm report`), and `/superdev:plan`, `/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`, `/superdev:wrap-up` (`## The Next block`) |

Every other file here is a backend seed: a slice store, a code host, or a knowledge base — `deployment.md`
above is a seed of its own kind, one shape for every repository rather than a per-backend choice.
`/superdev:setup` reads each seed twice: to write a document on a first run or a backend switch, and to
compare a configured document with it, listing and offering its seed gaps (ADR 0107).
A slice-store seed's `## Triage record` **Close it** call and a code-host seed's `## Edit the pull request body`
section become the configured document's calls that `scope-mode.md`'s `## Deferred findings` resolve
procedure runs (ADR 0121).
Adding a slice-store, code-host, or knowledge-base seed is the **Backends are pluggable** rule in the root
doc.

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
