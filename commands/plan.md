---
disable-model-invocation: false
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

When terms or decisions crystallise, capture them immediately — don't batch:

- **Glossary** — when the user uses a vague or overloaded term, propose a precise canonical term and
  record it. Challenge terms that conflict with existing language. Write to `CONTEXT.md` (or the repo's
  glossary), kept free of implementation detail.
- **ADRs** — write `docs/adr/NNNN-<title>.md` only when a decision is **hard to reverse**, **surprising
  without context**, and **the result of a real trade-off**. If any of the three is missing, skip it.

Stress-test domain relationships with concrete edge-case scenarios; cross-check claims against the code
and surface contradictions.

Follow the project's documentation convention in `docs/agents/documentation.md` for where these durable
docs live and how to record them (DOX: update the relevant `AGENTS.md`; keep concise/current). If
`docs/agents/knowledge-base.md` defines a knowledge base (software like Confluence, or local `docs/kb/`
files), optionally publish the PRD / ADR summaries there after writing them in-repo.

## 3. Slice into tracer bullets

Decompose into **vertical slices** (see `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` for the
rules and schema):

- Each slice is a narrow but **complete** path through every layer (schema → API → UI → tests),
  demoable/verifiable on its own, and **green on its own**.
- Right-size: a slice is the smallest unit that carries its own test cycle and is worth a fresh
  reviewer's gate. Map the file structure first; fold scaffolding/setup/docs into the slice that needs
  them. Do any **prefactoring** first ("make the change easy, then make the easy change").
- Classify each slice's `test-applicability`: `behavior` | `mechanical` | `docs`.

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
plan file or as issues. Tell the user it's ready for `/superdev:implement`.
