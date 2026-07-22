---
description: Plan a feature for superdev — a relentless interview that pins intent and the Definition of Done, then decomposes the work into independently-green vertical slices in the configured slice store. Run before /superdev:implement.
---

# superdev plan

Turn an intent into a set of **independently-green vertical slices** with explicit dependencies, written
to the slice store, ready for `/superdev:implement`. Interactive — this needs the user's judgment.

## 0. Config

Read `docs/agents/issue-tracker.md` (the slice store). Missing → run **`/superdev:setup`** first, then
continue.

**Toolchain freshness (advisory).** If `docs/agents/toolchain.md` is **absent while the repo has
build/package manifests** (`package.json`, `*.csproj`/`*.sln`, `pom.xml`/`build.gradle*`, `pyproject.toml`,
`Cargo.toml`, `go.mod`, …), tell the user it looks like the toolchain isn't recorded and suggest running
**`/superdev:setup`** to capture it — then continue. Non-blocking; never halt planning for it.

## 1. Interview (relentless, one question at a time)

**Seed from an existing brainstorm intent if there is one.** Glob `.superdev/brainstorm/*.md` — the
git-ignored scratch intents `/superdev:brainstorm` may have left. If exactly one exists, offer it
("Found intent `<slug>` — start from it?"); if several, list them and let the user pick one or start
fresh; if none, interview from scratch. Never auto-select — the user names which idea they're planning.
A picked intent is a *starting point* for the interview, not a substitute for it.

**Read `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md` and run the interview by it.** This is the **main
event** of `/plan`, not a quick step before the real work of slicing — walk the whole design tree, one
recommended-answer question at a time, exploring the code instead of asking wherever you can, until the
tree is exhausted and the picture is shared. Do not short-circuit to slicing with a half-pinned design.

Over the session, pin: the problem (from the user's perspective), the solution shape, constraints, and
the **global Definition of Done** — the checkable acceptance criteria for the whole feature. State the DoD
and every per-slice `acceptance` as **observable, user-facing behaviour**, not gameable proxy counts
(coverage %, line count, lint score) — a proxy count is a reviewer signal, never an agent-facing gate
(ADR 0002).

Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev:brainstorm`
first to explore the space before pinning it down here.

**Read `${CLAUDE_PLUGIN_ROOT}/references/doc-verification.md` and apply it whenever the interview leans on
a claim about how a third-party library, product, or service behaves.** Verify it against official docs
before it's baked into the DoD, a slice's `spec`, or an ADR.

## 2. Domain-model as you go

**Read `${CLAUDE_PLUGIN_ROOT}/references/domain-modeling.md` and apply it as you interview.** Read any
existing `CONTEXT.md` first — it's this project's canonical language. Then run the active moves: challenge
terms against the glossary, sharpen fuzzy language, probe boundaries with concrete scenarios, cross-check
claims against the code and surface contradictions, and **capture the glossary + ADRs the moment they
crystallise — never batch**. That reference owns the `CONTEXT.md` and ADR formats, the three-part test for
when an ADR is warranted, and the revise-in-place rule.

Two captures are **superdev-specific** — the reference doesn't cover them:

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

- **Knowledge base** — if `docs/agents/knowledge-base.md` defines one, also seed the feature specification
  / ADR summaries into its agreed **outline**, in its **language**, for its **audience(s)** (human-first).

Create all these durable files **lazily** — only when the first term, decision, or rule actually
crystallises, never as empty scaffolding. Follow the documentation convention in
`docs/agents/documentation.md` for where they live (update the relevant `AGENTS.md`; keep concise and
current). You only seed the design docs here; the authoritative reconcile and stale removal happen at the
end of `/superdev:implement` via `/superdev:document`.

## 3. Slice into tracer bullets

**Ground the decomposition first.** For a large or unfamiliar feature, before slicing, fan out
2-3 read-only `Explore` agents in parallel — each mapping a different aspect (similar existing
features, integration points, the architecture of the area you'll touch) and returning a ranked
list of key files. Read those files, then decompose. Skip for a small change in familiar code —
don't tax a two-slice plan with a recon phase.

Decompose into **vertical slices** (see `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` for the
rules and schema):

- Each slice is a narrow but **complete** path through every layer (schema → API → UI → tests),
  demoable/verifiable on its own, and **green on its own**.
- Right-size: a slice is the smallest unit that carries its own test cycle and is worth a fresh
  reviewer's gate. Map the file structure first; fold scaffolding/setup/docs into the slice that needs
  them. Do any **prefactoring** first ("make the change easy, then make the easy change").
- Classify each slice's `test-applicability`: `behavior` | `mechanical` | `docs`.
- Name the specific interface each slice's tests will exercise (a function signature, an API endpoint,
  a CLI command) in its `spec` — so the implementer tests through an agreed boundary instead of picking
  one.
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

Per `docs/agents/issue-tracker.md`, write the approved slice(s) — the
`id`/`depends-on`/`test-applicability`/`spec`/`acceptance` fields from the plan-contract — to the local
plan files or as issues.

- **Exactly one slice** — the epic is optional (see plan-contract.md): fold the global DoD into that
  slice's `acceptance` and write only the slice. No `00-epic-…` file / no epic issue.
- **Two or more slices** — write the global DoD (epic) plus each slice, as today.

**Write with max parallelism (issue-backend stores).** Writes have a strict ordering only where one
record references another — otherwise issue them concurrently, don't serialize. Order: **(1)** create the
epic first (slices reference its key); **(2)** create **all slice issues in parallel** — a single batch of
create calls — applying each slice's labels (`test-applicability` + feature + ready) **at creation**, not
in a follow-up pass; **(3)** once every slice key is known, apply the cross-references (`depends-on`) **in
parallel**. Steps 2 and 3 each fan out at once rather than one issue at a time. `depends-on` keys are
correct because every slice exists before any reference is written. (A local-file store just writes the
files; there's no API latency to batch.)

**Delete the seeded brainstorm intent.** If this plan started from a `.superdev/brainstorm/<slug>.md`
file (§1), delete it now that its intent is durably captured in the slice store — it has served its
purpose, and a leftover scratch intent only re-surfaces as a stale option in the next `/plan` glob.
Delete only the file the user actually picked; leave any other brainstorm intents untouched. (Nothing
downstream reads it — `/superdev:implement` works from the slice store.)

**Tell the user the expected execution tier.** `/superdev:implement` derives it fresh from the final
slice count — **≤3 slices → `lite`** (the controller implements each slice inline in a single scope
worktree, one final review), **>3 slices → `full`** (parallel per-slice worktrees + implementer/reviewer
subagents).
This is purely informational so the user knows what to expect: `/plan` doesn't stamp or persist the
tier anywhere.

**Commit the durable design docs** you wrote — the glossary (`CONTEXT.md`), any ADRs (`docs/adr/`), and
any `.claude/rules/` — to the base branch. `/superdev:implement` runs from a fresh worktree checkout of
that branch (per-slice on the full tier, a single scope worktree on the lite tier); anything left
uncommitted never reaches those checkouts, and a path-scoped rule that isn't on the branch can't
auto-load. **Push the base branch** to its remote right after committing (if one is configured, per
`docs/agents/code-management.md`) — `/implement`'s PR is opened against the remote base; an unpushed
local commit there diverges from it the moment the PR is squash-merged (a duplicate copy of the same
content lands in the merge commit while the local-only commit is left stranded). Then tell the user it's
ready for `/superdev:implement`.
