---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-plan
description: "Plan a feature for superdev — a relentless interview that pins intent and the Definition of Done, then decomposes the work into independently-green vertical slices in the configured slice store. Run before $superdev-implement."
---

# superdev plan

Turn an intent into a set of **independently-green vertical slices** with explicit dependencies, written
to the slice store, ready for `$superdev-implement`. Interactive — this needs the user's judgment.

## 0. Config

Read `docs/agents/issue-tracker.md` (the slice store). Missing → run **`$superdev-setup`** first, then
continue.

**Focused-command configuration.** As in `$superdev-implement`'s **Config + input**:
`docs/agents/verification.md` carrying one fenced block is missing configuration too — its focused
command was never recorded (ADR 0085, INV-0007) → run **`$superdev-setup`** first, then continue; a
repository with no `docs/agents/verification.md` at all needs no such command, and neither does one
carrying zero fenced blocks — `hooks/green-gate.js` reads that exactly as it reads an absent file.

**Toolchain freshness (advisory).** As in `$superdev-implement`'s **Config + input**: an absent
`docs/agents/toolchain.md` alongside build/package manifests gets a non-blocking **`$superdev-setup`**
suggestion, then planning continues.

**Ask new vs. extend, before the interview begins.** **New** makes no store call at all — continue at §1.
**Extend** lists the store's feature labels (`docs/agents/issue-tracker.md` → *Scope anchor*, *List the
candidates*) for the user to pick one, then loads that feature's epic, its slices, and its Definition of
Done — **before §1's first question**, because the append interview needs that context from the start
(`references/plan-contract.md` → *Append mode*, ADR 0004).

**Refuse to extend, and write nothing, on any signal below.** There is no override argument; the only
escape is fixing the state. Name which signal fired and what clears it:

- The store holds a slice `in-progress`, `in-review`, or `blocked` — a run active elsewhere. Clears once
  that slice leaves the state.
- The scope's run root — `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path
  (ADR 0080) — exists with a ledger stage other than `planned`. Read the stage with
  `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`. A stage from
  `implementing` through `documented` means the chain has not shipped, so appending adds DoD criteria the
  open pull request never carries; waiting clears nothing, because that chain ends at `shipped`, which
  the shipped rule below refuses in turn, so the remedy is the same new feature that rule names, opened
  now rather than waited for. A `shipped` stage is that rule's first signal. A `planned` stage means an
  earlier plan run cut the branch and the scopetree but no slice has run yet (ADR 0079): appending
  revises that plan before anything started, so it proceeds — §2 and §6 below carry it through as the
  `planned`-ledger case of their own steps. A run root that **exists** with no `ledger.md` to read, or
  whose `get stage` call errors, refuses too — the gate fails closed on a state it cannot read rather
  than proceeding on a guess. A run root that does not exist at all carries no first signal, and falls
  through to the second.
- The scope anchor sits at the store's **done** status, per the status map in
  `docs/agents/issue-tracker.md`. This is the shipped rule's second signal, and the one still standing
  once `hooks/scope-prune.js` has reaped the run root.

**A feature whose anchor has shipped takes no append** (ADR 0083, INV-0004): amending its Definition of
Done in place would pool criteria verified against a merged pull request with criteria nobody has
verified, and the reap takes the local half of that mixture while the anchor keeps its own. The two
shipped signals above are read together and **either one alone refuses** — a run root whose ledger stage
reads `shipped`, and a scope anchor at the store's done status. Neither covers the other's gap on its
own: a reaped run root leaves no ledger to read, and `ship`'s anchor close is best-effort, so a
failed close leaves the anchor open beside a `shipped` ledger. Nothing clears either one, so the refusal
names the remedy instead — plan the follow-up as a **new feature** carrying `**Blocked by feature:**
#<anchor>`, which ties it back to this one (`references/plan-contract.md` → *Scope anchor*, ADR 0040).

**A picked feature with no epic (a single-slice feature) is promoted to one.** §6 creates the epic,
copies the lone slice's `acceptance` into it as the global DoD, then amends that DoD in place with the
criteria the interview settled — a write, so it happens where the other writes do, and an abandoned
interview strands no epic. Throughout, leave the lone slice byte-identical, except for one moving part: an
anchor-dependency line, if the slice carries one, migrates to the new epic
(`references/plan-contract.md` → *Append mode*, `docs/agents/issue-tracker.md` → *Append mode*).

**Surface the epic's parked questions once it loads, before the interview diverges into new ground.**
Each is a load-bearing decision an earlier interview could not resolve (`references/plan-contract.md` →
*Parked questions*): present every entry in the epic's `## Parked questions` section. An absent or empty
section surfaces nothing, and is not an error. A question this interview resolves has its line deleted
from that section — the new slice's `spec` and `acceptance` become the durable record instead
(`references/domain-modeling.md` → *Revise in place*). One left unresolved carries forward untouched.

## 1. Interview (relentless, one question at a time)

**the message that invoked this skill is the intent, when one is given.** It states what the user wants, never the design, so
the interview still walks the whole tree — the same standing a picked brainstorm intent has. An argument
present makes the brainstorm glob below a cross-check: only an intent whose slug matches it is offered.
Empty → interview from the glob.

**Seed from an existing brainstorm intent if there is one.** Glob `.superdev/brainstorm/*.md`, the
git-ignored scratch intents `$superdev-brainstorm` or `$superdev-review-tests` may have left. Exactly
one → offer it ("Found intent `<slug>` — start from it?"); several → list them, let the user pick one
or start fresh; none → interview from scratch. Never auto-select. A picked intent is a *starting
point*, not a substitute for the
interview.

An intent carrying **Rejected directions** hands you ground already covered: treat those as settled
unless the interview genuinely overturns one. They are also the only record of *why* — §2 routes each one
to a durable home before this plan ends.

**Audit for prior art before the interview commits to building.** Two checks, both cheap:

- **Redundancy** — search the repo for an existing implementation of the requested behaviour **by domain
  concept, not the request's wording** (the glossary's terms, the code's own names), and report where
  you looked. Found → say so before interviewing further: extending the existing implementation is the
  plan, not building a rival.
- **Prior rejection** — read `.out-of-scope/*.md`, when the directory exists, and surface any entry that
  resembles this request **by concept, not keyword** ("night theme" matches `dark-mode.md`). A match is
  a decision already made: present it, and proceed only when the user explicitly overturns it.
  (`docs/agents/documentation.md` → *Rejected requests* owns the convention.)

**Read `<plugin-root>/references/cross-exam.md` and run the interview by it.** This is the **main
event**, not a quick step before slicing: walk the whole design tree, one recommended-answer question at
a time, exploring the code instead of asking wherever you can, until the tree is exhausted and the
picture is shared. Never short-circuit to slicing with a half-pinned design.

Pin: the problem (from the user's perspective), the solution shape, constraints, and the **global
Definition of Done** — checkable acceptance criteria for the whole feature. State the DoD and every
per-slice `acceptance` as **observable, user-facing behaviour**, never gameable proxy counts (coverage %,
line count, lint score): a proxy is a reviewer signal, never an agent-facing gate (ADR 0002).

**Ask "in every configuration?" of every Definition-of-Done criterion.** A criterion that names behaviour
holds in some configurations and not others: a fallback the repo supports, an optional config document
nobody wrote, a unit the host has disabled, a runner that cannot do what the criterion assumes. Walk the
global DoD once with that question and write what you find into the criterion itself, so a run cannot
tick it in one configuration while it is false in another — the same lens the per-slice enumeration below
applies, aimed at the whole-scope DoD instead of one slice's `acceptance`.

**Write a Definition-of-Done criterion as a bare requirement.** State what must be true, leaving the
command that checks it unnamed: a criterion names the requirement, not the procedure superdev runs to
verify it. `<plugin-root>/references/plan-contract.md`'s Definition-of-Done rules own the full
rule (ADR 0084, INV-0008); `Reachable:` is the standing exception, because it names an entrance, never a
verification step.

**Write the criterion in the reader's vocabulary.** The epic states the behaviour the feature delivers —
a file path, an invariant register id, or a verification procedure has no place there once §3 cuts the
slice that owns it: that detail goes into the slice's own `spec` and `acceptance` instead. §3 tags the
criterion with that slice's `id` once it exists.

**Surface a criterion verifiable only on a live system.** A criterion true only after a deploy, a
migration, or another outward-facing change forces exactly that change before merge to tick it — the
verification ceiling forbids it (`references/scope-mode.md`'s `## Verification ceiling`, ADR 0084), so the
criterion would reach `ship` unticked. Name the pre-merge deploy it would force, and offer to
keep it out of the branch-verifiable Definition of Done, noting it for the operator to verify after merge
instead.

**Emit the reachability criterion into the Definition of Done.** It holds on every change type, including
a refactor whose honest answer is `none — entrance unchanged` — there is always a branch that fits. Ask
how a user reaches this feature — which endpoint, command, or screen — and write the answer as a
`Reachable:` criterion, or as `Reachable: none` carrying the reason.
`<plugin-root>/references/plan-contract.md`'s *The reachability criterion* owns the full rule: read
it there rather than reconstructing it here. Where the entrance is not reachable yet, §3 gives it a slice, so
the wiring belongs to somebody instead of to nobody — a feature the running application cannot reach ships
as dead code with every gate reporting success.

**Enumerate the failure and boundary cases, don't leave them to the implementer.** A `behavior` slice's
`acceptance` names its **domain-level** edge cases alongside the happy path — the ones derivable from the
interview without reading the implementation: empty or absent input, missing configuration, a duplicate,
an authorization failure, two arriving at once, the documented failure mode of a dependency. Derive them
yourself as you decompose and show them; this is not a new interview thread. State each as observable
behaviour ("rejects an empty payload with a 400 and no write"), never as a count ("covers the edge
cases"). **Implementation-level** edges — off-by-one, parser boundaries, encoding — belong to the
implementer's TDD loop and the reviewers, who read code you never see; naming them here turns
`acceptance` into a test script, against the plan-contract's **Negotiable** rule.

Intent still vague — no clear problem, no checkable success criteria? Suggest `$superdev-brainstorm`
first.

**Read `<plugin-root>/references/doc-verification.md` and apply it whenever the interview leans
on a claim about how a third-party library, product, or service behaves.** Verify against official docs
before it's baked into the DoD, a slice's `spec`, or an ADR.

**Pick the feature label once the interview settles the solution shape**, before §2 stages a
knowledge-base page — that step paths on the label's slug. The label is the feature's **change type**
plus its slug, in the notation `docs/agents/issue-tracker.md` states
(`<plugin-root>/references/plan-contract.md` → *Feature label*). The type is what the feature
does to the codebase, not what it feels like: a defect repaired is `fix`, a behaviour-preserving
restructuring is `refactor`, a prose-only pass is `docs`, `feat` is new behaviour. It becomes the scope
branch, so a mislabelled plan ships a branch and a pull request that misreport the work. A later answer
that changes what the feature does revises the label in place.

**A `fix`-type feature starts from its reproduction.** Read
`<plugin-root>/references/diagnosis.md` and hold the plan to it: the **red-capable command** —
one invocation that reproduces the defect, already run once — becomes the first acceptance criterion of
the first slice, so the Definition of Done is falsifiable before anything is built. A defect nobody can
reproduce yet is what that first slice delivers, not a detail left for the implementer to discover.

## 2. Domain-model as you go

**Read `<plugin-root>/references/domain-modeling.md` and apply it as you interview.** Read any
existing `CONTEXT.md` first — it's this project's canonical language. Then run the active moves:
challenge terms against the glossary, sharpen fuzzy language, probe boundaries with concrete scenarios,
cross-check claims against the code, and **capture the glossary + ADRs + invariants the moment they
crystallise — never batch**. That reference owns the `CONTEXT.md` and ADR formats, the invariant
register's entry format, the three-part test for an ADR, the component-diagram rule, the routing of a
seeded intent's **Rejected directions**, and revise-in-place.

**Read `<run-root>/run.lock` before this step's first write, whether or not a cut happens below.**
Append onto a `planned` ledger finds `<run-root>/scopetree` already there, from the earlier plan run's own
cut (ADR 0079) — nothing here is cut, but the lock still names whether a second session already holds
this feature, and this step is about to write captures into that shared scopetree. A fresh lock naming
another session stops the run now, per `<plugin-root>/references/scope-mode.md`'s `## The run
lock` (triage #510). No `<run-root>/scopetree` yet → no lock either, nothing to read; proceed to the cut
below.

**Cut the scope branch at the first capture that crystallises.** The moment a glossary term, an ADR, or
an invariant first crystallises — never earlier — cut `<type>/<scope>` into `<run-root>/scopetree`
(`<run-root>` is `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path, ADR 0080),
following the one cut rule `<plugin-root>/references/scope-mode.md`'s `## Cutting the scope
branch` states for `$superdev-plan` (ADR 0079). Write that capture, and every capture from then on —
`CONTEXT.md`, every `docs/adr/` file, `docs/invariants.md` — into the scopetree. Nothing this step writes
ever lands in the invoking checkout. **Write `<run-root>/run.lock` right after the cut**, per
`## The run lock` (never before — the `run-lock` hook guards the `git worktree add` call itself): a fresh
lock naming another session stops the run here, rather than cutting alongside it (triage #510). **On the
append case above, where the scopetree already exists and nothing is cut, refresh the lock right after
the read instead** — the read already passed, so the refresh is this session's own claim on it before any
capture is written.

**Check a shared-identifier capture against other live plan runs, before writing it.** An invariant id, an
ADR number, and a glossary term each take the next free slot in `docs/invariants.md`, `docs/adr/`, or
`CONTEXT.md` (`<plugin-root>/references/domain-modeling.md`'s numbering rule) — a slot this
scopetree's own copy cannot see a concurrent plan run has already filled. Before committing such a
capture, scan the other run roots under `.superdev/scopes/*/`
(`<plugin-root>/references/scope-mode.md`'s `## A live scope run` → *Run-root enumeration*) whose
ledger stage (`scope.js get stage --root <run-root>`) reads `planned` or later, and read the captures
already committed on each one's scope branch — `CONTEXT.md`, `docs/adr/`, `docs/invariants.md` at the
branch tip. A number or term already taken there is skipped for the next free one, never reused.

**Write the ledger right here, at the cut — never wait for §6.** Pipe `{"anchor": "<key> — <title>",
"slices": []}` to `scope.js init <type>/<scope> planned` (§6 below carries the full envelope shape): no
slice exists yet, and a ledger carrying a header and no slice rows is a valid, documented state
(`<plugin-root>/references/scope-mode.md`'s `## The ledger`), not a corrupt one — `$superdev-status`
renders it as a run with no slices yet. This is what closes triage #509: an interview abandoned right
after this point still leaves a `ledger.md` beside the branch and the scopetree, so `$superdev-status` and
`$superdev-backlog` see it. An append onto a `planned` ledger finds one already there from the earlier
session — nothing to write here; §6 revises it in place once the slices are known. This same call is
also what ensures `.superdev/` is git-ignored (`init` runs `ensureSuperdevIgnored` before writing): moving
the ledger write to right after the cut, rather than leaving it to §6, is what closes the gap where the
freshly cut `<run-root>/scopetree` could otherwise sit ignored by nothing for the rest of the interview.

A capture that crystallises before §1 has settled the feature label has nowhere to cut yet: hold it in
the conversation until the label exists, then cut and write it the moment it does. **A label revised
before §6 writes to the store** undoes it under the old label — remove the scopetree
(`git worktree remove <run-root>/scopetree`) and delete the branch (`git branch -D <old-type>/<old-slug>`)
— safe because the branch at that point can carry nothing but this session's own design docs, and an
append never revises a picked label — then re-cuts both under the revised label and re-writes every
capture already held, so the scopetree and the branch always carry the label the plan ends with.

**Route the seeded rejects before this plan ends.** Every rejected direction §1 carried in lands where
the reference says — an ADR's `Considered options` for a dropped approach, the epic's non-goals for
dropped scope — or is filtered out loud. None disappears silently.

**Route the seeded commitments, and every commitment this interview originates.** Each one is converted
by the move `references/domain-modeling.md` states — into an invariant register entry, or into a reason
said out loud that it constrains nothing, or that it is an authoring rule this repository's register never
receives (ADR 0081). A commitment the interview originates is the more common source than one an intent
handed over, and reaches the same conversion.

**Record an invariant the interview settles**, in the register `references/domain-modeling.md` (above)
describes — reserve it for a rule the system may never break; a slice-specific requirement still goes to
that slice's `spec` instead.

One capture is **superdev-specific**:

- **Knowledge base** — if `docs/agents/knowledge-base.md` defines one, seed the feature specification /
  ADR summaries into its agreed **outline**, in its **language**, for its **audience(s)** (human-first).

  **A remote backend gets a staged page, never a call** (ADR 0023): at plan time none of the feature is
  built, so a page sent now claims a feature that does not exist. Write each page under
  `.superdev/kb-pending/<slug>/` (ensure `.superdev/` is in `.gitignore`; add it if absent), `<slug>`
  being the feature label's slug. Use an **absolute** path resolved from the invoking checkout — this is
  git-ignored scratch, not a durable capture, so it stays outside the "nothing lands in the invoking
  checkout" rule above the same way an untracked file always does. One `.md`
  file per page, named `<title-slug>.md` (the page `title`'s slug) so a re-run overwrites the same file
  instead of creating a rival: YAML frontmatter carrying the page `title` and an `action` of `upsert`,
  the body below. `$superdev-publish-kb` sends no non-`.md` file; `$superdev-status` prints it as a stray
with a rename hint, so a misnamed page is visible rather than silently dropped.
  `$superdev-publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
  seeds as before — its pages are repository files that ride the branch.

  **An outline entry marked `(aggregate)` takes `action: patch` instead** (ADR 0027): name the file
  `<title-slug>--<section-slug>.md` (`<section-slug>` is the section heading kebab-cased), never the
  plain `<title-slug>.md` above, which is one file per *page* and would silently overwrite. Stage **one
  section per file** — an ATX heading, at the level the outline entry names and never the page's own
  title, as the body's first line: nothing above it, no setext heading, no unterminated fenced code
  block. `scripts/kb-patch.js` refuses a body with no heading, content before its first heading, more
  than one section, a setext heading, or an unterminated fence, and refuses a heading the live page
  already carries twice. The heading **level** is yours to get right — nothing checks it.
  `$superdev-publish-kb` merges the
  section into the live page by that heading; an `upsert` here would replace every section other scopes
  wrote. Two sections staged in this pass whose headings kebab-case identically collide on that filename
  before `$superdev-publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
  `<section-slug>`.

Create these durable files **lazily** — only when the first term, decision, or rule crystallises, never
as empty scaffolding. Follow `docs/agents/documentation.md` for where they live (update the relevant
`AGENTS.md`; keep concise and current). You only seed the design docs here; the authoritative reconcile
and stale removal happen in `$superdev-document` (ADR 0013).

## 3. Slice into tracer bullets

**Decomposition can still change the label.** Cutting slices sometimes shows the feature does something
the type §1 picked no longer describes — a `fix` that turns out to add behaviour, a `refactor` that turns
out to change it. A later answer that changes what the feature does revises the label in place, whenever
it lands — during the interview or here, while decomposing.

**Ground the decomposition first.** For a large or unfamiliar feature, fan out 2-3 read-only `Explore`
agents in parallel — each mapping a different aspect (similar existing features, integration points, the
architecture of the area you'll touch) and returning a ranked list of key files. Read those files, then
decompose. Skip for a small change in familiar code.

**Judge the decomposition against the invariant register.** Read `docs/invariants.md` whole, when the
file is present, while the grounding above settles what this feature touches. Judge each entry against
the vocabulary this interview settled and the file structure the grounding mapped, and hold every match —
no slice exists yet to write it into. No register, or no entry the feature reaches → nothing further to
hold.

**Offer the design sketch, before you decompose.** The grounding above just mapped what exists and no
slice is cut yet, so this is the one point where the operator can still change the design for free. Ask
whether to write one. **Yes** → run that grounding first even where it would otherwise be skipped, since
a card marked `changed` needs the code read rather than guessed, then read
`<plugin-root>/references/design-sketch.md` and follow it through to the operator's approval of
the design, and decompose the design they approved. **No** → decompose. That reference states the whole
contract, so a declined sketch loads none of it.

Decompose into **vertical slices** (`<plugin-root>/references/plan-contract.md` owns the rules
and schema):

- Each slice is a narrow but **complete** path through every layer (schema → API → UI → tests),
  demoable/verifiable on its own, and **green on its own**.
- Right-size: the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Map
  the file structure first; fold scaffolding/setup/docs into the slice that needs them. Do any
  **prefactoring** first ("make the change easy, then make the easy change").
- Classify each slice's `test-applicability`: `behavior` | `mechanical` | `docs`.
- **A wide refactor is the one exception to tracer bullets** — sequence it as expand–contract
  (`<plugin-root>/references/plan-contract.md` → *Wide refactors*): expand, migrate in batches,
  contract, each slice green. Only when even the batches can't stay green alone does the epic gain an
  `## Integration branch` section (ADR 0033).
- Name the specific interface each slice's tests will exercise (a function signature, an API endpoint, a
  CLI command) in its `spec`, so the implementer tests through an agreed boundary instead of picking one.
- Name the **domain shapes** the slice needs in its `spec` as well — by name, in `CONTEXT.md`'s
  vocabulary, and never as field lists. The implementer declares them before its first failing test, and
  the fields are its own, because a `spec` is a contract of outcomes (ADR 0030). A slice needing no shape,
  or a repository whose language has none, gets none named.
- **Tag every Definition-of-Done criterion with the slice `id`s that deliver it, or `scope` when no single
  slice does** (`plan-contract.md` → *Criterion tags*), now that decomposition has settled which slice
  delivers what.
- **Write each register match held above into the slice it touches, and its epic criterion in the reader's
  vocabulary.** The entry's id goes into that slice's `spec` and `acceptance` — the route by which the
  invariant reaches an implementer who only ever sees its own isolated worktree — never into the epic. The
  epic states the behaviour the invariant protects, tagged with that slice's id like every other
  criterion. No match held → nothing to write here.
- **Don't create a documentation-only slice** to describe code other slices produce —
  `$superdev-document` reconciles README, `AGENTS.md`, and the KB after the scope lands. Slice out `docs`
  only when documentation *is* the deliverable (e.g. a standalone guide).

## 4. Tag dependencies

Give each slice a stable `id` and `depends-on: [ids]`. A slice depends on another **only if it cannot be
green without it** — a too-eager graph serializes work that could run in parallel.

**Same-file warning:** two slices with no dependency between them run in parallel and merge serially, so
if they **edit the same file** (e.g. both add an export to one barrel/index file) they *will* conflict.
Either (a) give one a `depends-on` the other, or (b) keep them parallel and call out the conflict in the
plan so the controller expects it. Prefer restructuring so parallel slices touch disjoint files.

**Note the files as you go.** §3's "map the file structure first" already produced that list; keep it.
§6 writes the epic's `## Touch map` from it, and the collisions you found here are what the map marks. It
never reaches a slice `spec` (a `spec` names an interface, never file paths).

## 5. Quiz the user

Before you present the decomposition, state, for each file you opened while grounding it, what it says
about the proposal itself — not about the question you opened it for.

Present the breakdown as a numbered list: per slice, title, `depends-on`, and which DoD criteria it
covers — the same tags §3 wrote. Ask: is the granularity right? are the dependencies correct? should any
slice split or merge? Iterate until they approve.

**Extending a feature:** present only the **new** slices — a merged slice isn't re-litigated.

When the plan earns a `## Slice graph` (plan-contract.md's *Epic visuals* → *When to write them*), show
it here too: reviewing the drawn graph is how a wrong dependency gets caught before it's written.

## 6. Write to the store

Per `docs/agents/issue-tracker.md`, write the approved slice(s) — the
`id`/`depends-on`/`test-applicability`/`spec`/`acceptance` fields from the plan-contract — to the local
plan files or as issues.

- **Exactly one slice** — the epic is optional (plan-contract.md): fold the global DoD into that slice's
  `acceptance` and write only the slice. No `00-epic-…` file / no epic issue.
- **Two or more slices** — write the global DoD (epic), each criterion tagged in `plan-contract.md`'s line
  format (*Criterion tags*), plus each slice.
- **Extending a feature** — create only the **new** slice records; never edit, close, renumber, or delete
  a merged one. Amend the epic's Definition of Done **in place** (never replace it) with the new criteria,
  tagged the same way. `docs/agents/issue-tracker.md` → *Append mode* owns the per-backend mechanics.

**Add the epic visuals the plan earned.** Apply plan-contract.md's *Epic visuals* → *When to write them*,
write `## Slice graph` and/or `## Touch map` into the epic body (the touch map from §4's file list), then
**say which you wrote and why, in one line**, in the verdict format that section shows — the verdict is
what keeps the judgment honest and lets the user override it in a word. Don't let the drawing shape the
decomposition: the slices were settled in §5. A genuine dependency error the drawing exposes is worth
fixing — that's correction, not re-cutting for looks.

**State the feature label** (§1 picked it) with the slice list, so a wrong type or slug is caught before
anything is written.

**Write with max parallelism (issue-backend stores).** Ordering is strict only where one record
references another. **(1)** Create the epic first (slices reference its key), carrying the store's
configured assignee. **(2)** Create **all slice issues in parallel** — a single batch — applying each
slice's labels (`test-applicability` + feature + ready) and that same configured assignee **at
creation**, not in a follow-up pass. **(3)** Once every slice key is known, apply the cross-references
(`depends-on`) **in parallel**. `depends-on` keys are correct because every slice exists before any
reference is written. (A local-file store just writes the files.)

**Record an anchor dependency when the interview named a prerequisite feature.** A feature the interview
established cannot be built until another one has landed gets that relation written on **this feature's
scope anchor**, naming the other feature's anchor, through the mechanism
`docs/agents/issue-tracker.md`'s `## Scope anchor` section states (`references/plan-contract.md` →
*Scope anchor*, ADR 0040). It is what lets `afk` reach the two in the right order. Ask nothing
new for it: a feature that cannot be built yet surfaces as a constraint during §1 or it does not surface
at all, and an interview that named no prerequisite writes no dependency. The honesty rule is the one
slice-level `depends-on` already carries — record one only where the second feature genuinely cannot be
built first, because a needless one serializes an unattended sweep for nothing.

**Delete the seeded brainstorm intent.** If this plan started from a `.superdev/brainstorm/<slug>.md`
file (§1), delete it now that its intent is durably in the slice store — a leftover scratch intent
re-surfaces as a stale option in the next glob. Delete only once every `Rejected direction` **and every
`Load-bearing commitment`** it carried has a durable home (§2) or was resolved out loud: this delete is
irreversible and is exactly the silent-drop it exists to prevent. Delete only the file the user picked; leave other intents untouched.

**Tell the user the expected execution tier** — informational only; `$superdev-plan` persists it nowhere.
`$superdev-implement` derives it fresh from the final slice count — **≤3 slices → `lite`** (the
controller implements each slice inline in a single scopetree, no per-slice review), **>3 slices →
`full`** (parallel slicetrees + implementer/reviewer subagents). Either tier hands off once
every slice is on the scope branch — to `$superdev-review`, or straight to `$superdev-document` when
every slice is `mechanical` or `docs` (ADR 0025).

**Cut the scopetree now, if `<run-root>/scopetree` does not exist yet.** An append onto a `planned` ledger
already carries the branch and the scopetree from the earlier plan run, whatever this session's interview
captured — the absence of the scopetree is the test, not the absence of a crystallised capture. Run the
cut the way §2's own cut rule would have, per
`<plugin-root>/references/scope-mode.md`'s `## Cutting the scope branch` (ADR 0079) — the same
reference §2 already defers to, which decides what to do when the branch or scopetree is already
present — write `<run-root>/run.lock` right after, per `## The run lock`, and write the ledger the same
way §2 does at its own cut — `{"anchor": "<key> — <title>", "slices": []}` piped to `scope.js init
<type>/<scope> planned` — since no capture ever crystallised to trigger §2's own write. Every plan run
ends the same shape — a branch, a scopetree, and the ledger below — whether or not a design doc ever
crystallised.

**Commit what the scopetree holds, on the scope branch.** `git -C <run-root>/scopetree add` and `commit`
whatever `CONTEXT.md`, `docs/adr/`, and `docs/invariants.md` changes §2 wrote there — nothing, on a run
where no capture ever crystallised. This commit lands only inside the scopetree, never in the invoking
checkout, which is never staged, committed, or switched (ADR 0045).

**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope
`<plugin-root>/references/run-init.md`'s `## Run init — definition of done + ledger` section
pipes to it, `{"anchor": "<key> — <title>", "slices": [...]}`, adapted to a plan-time call passing
`planned` as `init`'s entry stage (`scope.js init <type>/<scope> planned`, ADR 0079 — no default, and
`planned` is what hands the scope branch to `$superdev-implement` as ready): carry the anchor this plan
created or amended, and every slice this plan wrote, each row's `status` field `todo` — no slice has run
yet, whether this is a new feature or an append. **This call always overwrites**, never creates: the cut
above already wrote a ledger at `planned` carrying no slice rows (or, on an append, the earlier session's
own held slices), so this is `init`'s own overwrite-a-`planned`-ledger path filling in the real table, on
every run kind, not only an append.
**Refresh `<run-root>/run.lock`** once `init` returns, per `## The run lock`.

**Ask whether to release the plan.** `plan-contract.md`'s *Release* section owns what a release is; the
active `docs/agents/issue-tracker.md`'s `## Release` section owns this backend's signal and the call that
applies it. List every slice this plan wrote — key, title, type, `depends-on` — and ask the user one
question: **release this feature for execution now, or leave the release to a human later?**

- **Release now** → apply the signal to the scope anchor, and say it is applied.
- **Later** → apply nothing, and name what a human does to release it: the signal, and where it goes.
  Say that `$superdev-implement` asks for confirmation until then.

**On an append the answer applies in both directions** (ADR 0083, INV-0005): a release decision covers
the work that existed when it was made, and this feature's anchor may already carry the signal from an
earlier run. **Later** there **removes the signal** from the scope anchor, through the `## Release`
section's own **Remove** call, and says it is removed — leaving it standing would hand
`afk` slices nobody released. **Release now** applies it as it always does. On a first plan
there is nothing to remove, so declining applies nothing, exactly as the branch above reads.

A store whose `## Release` section says its features are released when written has nothing to ask: say
the plan is live and move on. On every other store the answer is the user's, so **wait for it** — an
authorization to run the whole chain unattended answers a different question, whether an unattended run
may proceed once this feature is released, never whether to release it now, so it is not that answer —
and a correction the user names on seeing the list is applied to the store before the question is put
again.

Then **print the next command with
the feature label resolved** — `$superdev-implement <feature-label>`, carrying the real label this plan
wrote, in the shape `docs/agents/issue-tracker.md` states (ADR 0019) — so the line is copy-pasteable.
Every command in the chain hands off this way (ADR 0013), and the label is also what fixes the run's
scope, its branch, and its run root.
