---
description: Plan a feature for superdev — a relentless interview that pins intent and the Definition of Done, captures ADRs + a glossary as decisions surface, then decomposes the work into independently-green vertical tracer-bullet slices with explicit dependencies, written to the configured slice store. Run before /superdev:implement.
---

# superdev plan

Turn an intent into a set of **independently-green vertical slices** with explicit dependencies, written
to the slice store, ready for `/superdev:implement`. Interactive — this needs the user's judgment.

## 0. Config

Read `docs/agents/issue-tracker.md` (the slice store). Missing → run **`/superdev:setup`** first, then
continue.

## 1. Interview (relentless, one question at a time)

Walk down the design tree, resolving dependencies between decisions one by one. **Ask one question at
a time** — multiple at once is bewildering — and for each give your **recommended answer**. If a
question can be answered by reading the codebase, read it instead of asking.

Pin: the problem (from the user's perspective), the solution shape, constraints, and the **global
Definition of Done** — the checkable acceptance criteria for the whole feature.

## 2. Domain-model as you go

When terms, decisions, or conventions crystallise, capture them immediately — don't batch:

- **Glossary** — when the user uses a vague or overloaded term, propose a precise canonical term and
  record it. Challenge terms that conflict with existing language. Write to `CONTEXT.md` (or the repo's
  glossary) — a glossary and nothing else: no spec, no scratchpad, no implementation decisions. Each
  entry is a tight one-to-two-sentence definition of what the term **is**, with an `_Avoid_:` list of
  rejected synonyms. In a multi-context repo (root `CONTEXT-MAP.md`), record the term under the context
  it belongs to; if unclear, ask.
- **ADRs** — write `docs/adr/NNNN-<title>.md` only when a decision is **hard to reverse**, **surprising
  without context**, and **the result of a real trade-off**. If any of the three is missing, skip it. An
  ADR is a short title plus 1–3 sentences (context, decision, why); add Status/Options/Consequences only
  when they earn their place. Number by scanning `docs/adr/` for the highest existing number + 1.
- **Rules** — when the interview surfaces an **enforceable, file-scoped** convention ("API handlers
  validate input with Zod", "migrations are append-only"), write `.claude/rules/<name>.md` with a
  `paths:` frontmatter listing the globs it governs:

  ```markdown
  ---
  paths:
    - "src/api/**"
    - "**/*.handler.ts"
  ---
  All API handlers must validate input with Zod before processing.
  ```

  Unlike an ADR (a one-off decision) or the glossary (a term), a rule is a **standing constraint** the
  harness auto-loads whenever a matching file is edited — so implementer subagents pick it up exactly
  when it applies, at zero always-on cost. Reserve it for constraints that are genuinely path-scoped and
  repeatable; a whole-project norm belongs in the docs convention, and a slice-specific requirement
  belongs in that slice's `spec` — not a rule.

Create these files lazily — only when the first term, decision, or rule actually crystallises, never as
empty scaffolding.

Stress-test domain relationships with concrete edge-case scenarios; cross-check claims against the code
and surface contradictions.

Follow the project's documentation convention in `docs/agents/documentation.md` for where these durable
docs live and how to record them (update the relevant `AGENTS.md`; keep concise/current). If
`docs/agents/knowledge-base.md` defines a knowledge base, also seed the PRD / ADR summaries into its
agreed **outline**, in its **language**, for its **audience(s)** (human-first). You only seed the design
docs here; the authoritative reconcile (and stale removal) happens at the end of `/superdev:implement`
via `/superdev:document`.

## 3. Slice into tracer bullets

Decompose into **vertical slices** (see `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` for the
rules and schema):

- Each slice is a narrow but **complete** path through every layer (schema → API → UI → tests),
  demoable/verifiable on its own, and **green on its own**.
- Right-size: a slice is the smallest unit that carries its own test cycle and is worth a fresh
  reviewer's gate. Map the file structure first; fold scaffolding/setup/docs into the slice that needs
  them. Do any **prefactoring** first ("make the change easy, then make the easy change").
- Classify each slice's `test-applicability`: `behavior` | `mechanical` | `docs`.
- **Don't create a documentation-only slice** just to describe the code other slices produce — the
  end-of-run documentation pass (`/superdev:document`) reconciles README, `AGENTS.md`, and the KB after
  the scope lands. Only slice out `docs` when documentation *is* the deliverable (e.g. a standalone
  guide), not as a trailing "write the docs" step.

## 4. Tag dependencies

Give each slice a stable `id` and `depends-on: [ids]`. A slice depends on another **only if it cannot
be green without it** — a too-eager graph serializes work that could run in parallel.

**Same-file warning:** two slices with no dependency between them run in parallel and get merged
serially — if they **edit the same file** (e.g. both add an export to one barrel/index file) they
*will* conflict at merge time. When you spot this, either (a) give one a `depends-on` the other so they
run sequentially, or (b) keep them parallel but call it out in the plan so the controller expects the
conflict. Prefer restructuring so parallel slices touch disjoint files.

## 5. Quiz the user

Present the breakdown as a numbered list: per slice show title, `depends-on`, and which DoD criteria it
covers. Ask: is the granularity right? are the dependencies correct? should any slice split or merge?
Iterate until they approve.

## 6. Write to the store

Per `docs/agents/issue-tracker.md`, write the global DoD + each approved slice (the
`id`/`depends-on`/`test-applicability`/`spec`/`acceptance` fields from the plan-contract) — to the local
plan files or as issues.

**Commit the durable design docs** you wrote — the glossary (`CONTEXT.md`), any ADRs (`docs/adr/`), and
any `.claude/rules/` — to the base branch. `/superdev:implement` runs each slice in a fresh worktree
checkout of that branch; anything left uncommitted never reaches the implementers, and a path-scoped
rule that isn't on the branch can't auto-load. Then tell the user it's ready for `/superdev:implement`.
