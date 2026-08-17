---
description: Plan a feature for superdev — a relentless interview that pins intent and the Definition of Done, then decomposes the work into independently-green vertical slices in the configured slice store. Run before /superdev:implement.
argument-hint: "[an intent, or nothing]"
---

# superdev plan

Turn an intent into a set of **independently-green vertical slices** with explicit dependencies, written
to the slice store, ready for `/superdev:implement`. Interactive — this needs the user's judgment.

## 0. Config

Read `docs/agents/issue-tracker.md` (the slice store). Missing → run **`/superdev:setup`** first, then
continue.

**Toolchain freshness (advisory).** Same rule as `/superdev:implement`'s **Config + input** step: an
absent `docs/agents/toolchain.md` alongside build/package manifests gets a non-blocking
**`/superdev:setup`** suggestion, then planning continues.

**Ask new vs. extend, before the interview begins.** Is this a new feature, or one that already has
slices? Answering **new** makes no store call at all — continue at §1 exactly as below. Answering
**extend** lists the store's feature labels (`docs/agents/issue-tracker.md` → *Scope anchor*, *List the
candidates*) for the user to pick one, then loads that feature's epic, its slices, and its Definition of
Done — **before §1's first question**, because that context is what the append interview needs from the
start, not once §1 settles a label (`references/plan-contract.md` → *Append mode*, ADR 0004).

**Refuse to extend, and write nothing, on either signal below** — there is no override argument; the only
escape is fixing the state. Name which signal fired and what clears it:

- The store holds a slice `in-progress`, `in-review`, or `blocked` — a run active elsewhere.
- The scope's run root (`.superdev/scopes/<slug>/`) exists with a ledger stage other than `shipped`, or
  with a `shipped` stage whose scope branch (`<type>/<scope>`) is neither merged into the base nor gone —
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>` for the stage and `get
  branch --root <run-root>` for the branch, then the same branch test `hooks/scope-prune.js` runs to
  decide a scope is finished with (ADR 0007): merged into the base, or gone entirely. A stage other than
  `shipped` means every slice is merged but the chain has not shipped, so appending here would add DoD
  criteria the open pull request never carries. A `shipped` stage
  whose branch is still alive means the pull request is still open, so appending would grow a request that
  has already been reviewed.

**A picked feature with no epic (a single-slice feature) is promoted to one.** §6 creates the epic and
copies the lone slice's `acceptance` into it as the global DoD, then amends that DoD in place with the
criteria the interview settled. The promotion is a write, so it happens where the command's other writes
happen, and an abandoned interview strands no epic. Throughout, leave the lone slice byte-identical
(`references/plan-contract.md` → *Append mode*, `docs/agents/issue-tracker.md` → *Append mode*).

**Surface the epic's parked questions once it loads, before the interview diverges into new
ground.** Each is a load-bearing decision an earlier interview could not resolve
(`references/plan-contract.md` → *Parked questions*) — present every entry in the epic's
`## Parked questions` section to the user. An absent or empty section surfaces nothing. That is not
an error, since most epics carry none. A question this interview resolves has its line deleted from that
section — the new slice's `spec` and `acceptance` become the durable record instead
(`references/domain-modeling.md` → *Revise in place*). One left unresolved carries forward untouched.

## 1. Interview (relentless, one question at a time)

**`$ARGUMENTS` is the intent, when one is given.** Take it as the interview's starting point — the same
standing a picked brainstorm intent has below, and no more: it states what the user wants, never the
design, so the interview still walks the whole tree. An argument present makes the brainstorm glob below
a cross-check rather than a prompt: an intent whose slug matches what the argument describes is offered,
and nothing else is. Empty → interview from the glob below.

**Seed from an existing brainstorm intent if there is one.** Glob `.superdev/brainstorm/*.md` — the
git-ignored scratch intents `/superdev:brainstorm` may have left. If exactly one exists, offer it
("Found intent `<slug>` — start from it?"); if several, list them and let the user pick one or start
fresh; if none, interview from scratch. Never auto-select — the user names which idea they're planning.
A picked intent is a *starting point* for the interview, not a substitute for it.

An intent carrying **Rejected directions** hands you ground already covered: treat those as settled
rather than re-opening them, unless something in the interview genuinely overturns one. They are also the
only record of *why* — §2 routes each one to a durable home before this plan ends.

**Read `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md` and run the interview by it.** This is the **main
event** of `/superdev:plan`, not a quick step before the real work of slicing — walk the whole design tree, one
recommended-answer question at a time, exploring the code instead of asking wherever you can, until the
tree is exhausted and the picture is shared. Do not short-circuit to slicing with a half-pinned design.

Over the session, pin: the problem (from the user's perspective), the solution shape, constraints, and
the **global Definition of Done** — the checkable acceptance criteria for the whole feature. State the DoD
and every per-slice `acceptance` as **observable, user-facing behaviour**, not gameable proxy counts
(coverage %, line count, lint score) — a proxy count is a reviewer signal, never an agent-facing gate
(ADR 0002).

**Enumerate the failure and boundary cases, don't leave them to the implementer.** A `behavior` slice's
`acceptance` names its **domain-level** edge cases alongside the happy path — the ones derivable from the
interview without reading the implementation: empty or absent input, missing configuration, a duplicate,
an authorization failure, two arriving at once, the documented failure mode of anything it depends on.
Derive them yourself as you decompose and show them; this is not a new interview thread to walk case by
case. Each one is stated as observable behaviour ("rejects an empty payload with a 400 and no write"),
never as a count ("covers the edge cases"). **Implementation-level** edges — off-by-one, parser
boundaries, encoding — are *not* yours: they belong to the implementer's TDD loop and the reviewers, who
read code you never see. Naming them here would turn `acceptance` into a test script, against the
plan-contract's **Negotiable** rule.

Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev:brainstorm`
first to explore the space before pinning it down here.

**Read `${CLAUDE_PLUGIN_ROOT}/references/doc-verification.md` and apply it whenever the interview leans on
a claim about how a third-party library, product, or service behaves.** Verify it against official docs
before it's baked into the DoD, a slice's `spec`, or an ADR.

**Pick the feature label once the interview settles the solution shape**, before §2 stages a knowledge-base
page — that step paths on the label's slug, so a plan that picks the label later stages its pages under a
slug it has not chosen yet. The label is the feature's **change type** plus its slug, in the notation
`docs/agents/issue-tracker.md` states (`${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` → *Feature
label*). The type is what the feature does to the codebase, not what it feels like: a defect this plan
repairs is `fix`, a restructuring that keeps behaviour is `refactor`, a prose-only pass is `docs`, and
`feat` is for new behaviour. It becomes the scope branch, so a mislabelled plan ships a branch and a pull
request that misreport the work. A later answer that changes what the feature does revises the label in
place, the same way §2 revises any other decision it has already recorded.

## 2. Domain-model as you go

**Read `${CLAUDE_PLUGIN_ROOT}/references/domain-modeling.md` and apply it as you interview.** Read any
existing `CONTEXT.md` first — it's this project's canonical language. Then run the active moves: challenge
terms against the glossary, sharpen fuzzy language, probe boundaries with concrete scenarios, cross-check
claims against the code and surface contradictions, and **capture the glossary + ADRs the moment they
crystallise — never batch**. That reference owns the `CONTEXT.md` and ADR formats, the three-part test for
when an ADR is warranted, the component-diagram rule for structural ADRs, the routing of a seeded intent's
**Rejected directions**, and the revise-in-place rule.

**Route the seeded rejects before this plan ends.** Every rejected direction §1 carried in lands where the
reference says — an ADR's `Considered options` for a dropped approach, the epic's non-goals for dropped
scope — or is filtered out loud as not worth recording. None of them silently disappears.

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

  **A remote backend gets a staged page, never a call** (ADR 0023). At plan time none of the feature is
  built, so a page sent now claims a feature that does not exist — the earliest possible version of the
  failure `/superdev:publish-kb` exists to prevent. Write each page under
  `.superdev/kb-pending/<slug>/` instead (ensure `.superdev/` is in the repo's `.gitignore`; add it if
  absent), where `<slug>` is the feature label's slug, which is the scope these pages belong to. Use an
  **absolute** path, resolved from the invoking checkout. One `.md` file per page, named `<title-slug>.md`
  (the page `title`'s slug) so a re-run that revises the plan overwrites the same file instead of creating
  a rival: YAML frontmatter carrying the page `title` and an `action` of `upsert`, the page body below. A
  non-`.md` file is invisible to `/superdev:status` and `/superdev:publish-kb` alike.
  `/superdev:publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
  seeds as before — its pages are repository files that ride the branch.

  **An outline entry marked `(aggregate)` takes `action: patch` instead** (ADR 0027): name the file
  `<title-slug>--<section-slug>.md` (`<section-slug>` is the section heading's text, kebab-cased the same
  way `<title-slug>` is), never the plain `<title-slug>.md` above — that filename is one file per *page*,
  and a second section staged under it, now or in a later run, would silently overwrite the first. Stage
  **one section per file** — an ATX heading, at the level the outline entry names and never the page's
  own title, as the body's first line, nothing above it, no setext heading, no unterminated fenced code
  block; `scripts/kb-patch.js`
  refuses a file that breaks any of these. `/superdev:publish-kb` merges the section into the live page by
  that heading. An `upsert` here would replace every section other scopes already wrote with the one you
  can see. Two sections staged in this pass whose headings kebab-case identically collide on that
  filename before `/superdev:publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
  `<section-slug>` so each keeps its own file.

Create all these durable files **lazily** — only when the first term, decision, or rule actually
crystallises, never as empty scaffolding. Follow the documentation convention in
`docs/agents/documentation.md` for where they live (update the relevant `AGENTS.md`; keep concise and
current). You only seed the design docs here; the authoritative reconcile and stale removal happen in
`/superdev:document`, the third command of the implement chain (ADR 0013).

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

**Note the files as you go.** Spotting that warning already means knowing which slice touches what —
§3's "map the file structure first" step produced it. Keep that list; §6 writes the epic's `## Touch map`
from it, and the collisions you found here are exactly what the map marks. It never reaches a slice
`spec` (a `spec` names an interface, never file paths).

## 5. Quiz the user

Present the breakdown as a numbered list: per slice show title, `depends-on`, and which DoD criteria it
covers. Ask: is the granularity right? are the dependencies correct? should any slice split or merge?
Iterate until they approve.

**Extending a feature:** present only the **new** slices — a merged slice already landed and isn't
re-litigated here.

When the plan earns a `## Slice graph` (plan-contract.md's *Epic visuals* → *When to write them*), show
it here too — reviewing the drawn graph is how a wrong dependency gets caught before it's written.

## 6. Write to the store

Per `docs/agents/issue-tracker.md`, write the approved slice(s) — the
`id`/`depends-on`/`test-applicability`/`spec`/`acceptance` fields from the plan-contract — to the local
plan files or as issues.

- **Exactly one slice** — the epic is optional (see plan-contract.md): fold the global DoD into that
  slice's `acceptance` and write only the slice. No `00-epic-…` file / no epic issue.
- **Two or more slices** — write the global DoD (epic) plus each slice, as today.
- **Extending a feature** — create only the **new** slice records; never edit, close, renumber, or delete
  a merged one. Amend the epic's Definition of Done **in place** (never replace it) with the new criteria
  the interview settled. `docs/agents/issue-tracker.md` → *Append mode* owns the per-backend mechanics.

**Add the epic visuals the plan earned.** Apply plan-contract.md's *Epic visuals* → *When to write them*
and write `## Slice graph` and/or `## Touch map` into the epic body (the touch map from the file list you
kept in §4). Then **say which you wrote and why, in one line**, in the verdict format plan-contract.md's
*Epic visuals* section shows. Stating the verdict is what keeps the judgment honest and lets the user
override it in a word. Don't let the drawing shape the decomposition: the slices were settled in §5, and a
plan is never re-cut to make a nicer diagram — but a genuine dependency error the drawing exposes (§5) is
worth fixing before writing it; that's correction, not re-cutting for looks.

**State the feature label** (§1 picked it) to the user with the slice list, so a wrong type or slug is
caught before anything is written.

**Write with max parallelism (issue-backend stores).** Writes have a strict ordering only where one
record references another — otherwise issue them concurrently, don't serialize. Order: **(1)** create the
epic first (slices reference its key), carrying the store's configured assignee like every slice does;
**(2)** create **all slice issues in parallel** — a single batch of create calls — applying each slice's
labels (`test-applicability` + feature + ready) and that same configured assignee **at creation**, not in
a follow-up pass; **(3)** once every slice key is known, apply
the cross-references (`depends-on`) **in parallel**. Steps 2 and 3 each fan out at once rather than one
issue at a time. `depends-on` keys are correct because every slice exists before any reference is written.
(A local-file store just writes the files; there's no API latency to batch.)

**Delete the seeded brainstorm intent.** If this plan started from a `.superdev/brainstorm/<slug>.md` file
(§1), delete it now that its intent is durably captured in the slice store — it has served its purpose,
and a leftover scratch intent only re-surfaces as a stale option in the next `/superdev:plan` glob. Delete it only
once every `Rejected direction` it carried has a durable home (§2) or was filtered out loud — never
before; this delete is irreversible and is exactly the silent-drop it exists to prevent. Delete only the
file the user actually picked; leave any other brainstorm intents untouched. (Nothing downstream reads it
— `/superdev:implement` works from the slice store.)

**Tell the user the expected execution tier** — purely informational, so `/superdev:plan` doesn't stamp or
persist it anywhere. `/superdev:implement` derives it fresh from the final
slice count — **≤3 slices → `lite`** (the controller implements each slice inline in a single scope
worktree, no per-slice review), **>3 slices → `full`** (parallel per-slice worktrees + implementer/reviewer
subagents). Either tier hands off to `/superdev:review` for the whole-scope review once every slice is
on the scope branch.

**Commit the durable design docs** you wrote — the glossary (`CONTEXT.md`), any ADRs (`docs/adr/`), and
any `.claude/rules/` — to the base branch. **Check `git rev-parse --abbrev-ref HEAD` first, and only commit
when the invoking checkout is on the base branch.** It is on any other branch → name the branch you found
and the base you wanted, write nothing, and stop; the plan is already written to the store, so the
maintainer switches to base and commits the design docs there — no interview, nothing re-planned —
and the resolved `/superdev:implement <feature-label>` handoff below still prints, because the plan is
written and only the commit is outstanding.
`/superdev:implement` runs from a fresh worktree checkout of
that branch (per-slice on the full tier, a single scope worktree on the lite tier); anything left
uncommitted never reaches those checkouts, and a path-scoped rule that isn't on the branch can't
auto-load. **Push the base branch** to its remote right after committing (if one is configured, per
`docs/agents/code-management.md`) — `/superdev:ship`'s PR is opened against the remote base; an unpushed
local commit there diverges from it the moment the PR is squash-merged (a duplicate copy of the same
content lands in the merge commit while the local-only commit is left stranded). Then **print the next
command with the feature label resolved** — `/superdev:implement <feature-label>`, carrying the real label
this plan wrote, in the shape `docs/agents/issue-tracker.md` states (ADR 0019) — so the line is
copy-pasteable and names which feature to build. Every command in the chain hands off this way (ADR 0013),
and the label is also what fixes the run's scope, its branch, and its run root.
