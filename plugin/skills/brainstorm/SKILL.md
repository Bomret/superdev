---
name: brainstorm
description: Turn a rough idea into a plan-ready intent through a divergent discovery conversation. Run before /superdev:plan when the idea isn't sharp enough to interview yet.
argument-hint: "[a rough idea, or nothing]"
---

# superdev brainstorm

## Role and terms

Applies to every start. You turn a vague idea into an intent sharp enough for `/superdev:plan` to interview. Plan converges on a Definition of Done, and you diverge first: generate options, take "I don't know yet" as signal, and narrow once the problem's shape is clear.

- **The intent file**: `.superdev/brainstorm/<intent-slug>.md`. It opens with YAML frontmatter carrying `status: draft` or `status: ready`, then carries §5's headings.
- **A draft**: an intent file whose frontmatter `status` is `draft` (ADR 0112, INV-0110). A file with no frontmatter or any other status is not a draft.
- **cross-exam.md**: `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md`.
- **domain-modeling.md**: `${CLAUDE_PLUGIN_ROOT}/references/domain-modeling.md`.

## What you write

Applies to every start. Write only these: the intent file as the interview runs, `.superdev/` in `.gitignore` when absent, §6's intent record with the deletion of the file it replaces, and §4's prototype on a throwaway branch. Write no slice, no Definition of Done, no glossary entry, and no ADR. Durable capture is `/superdev:plan`'s job.

## The closing message

Applies to every message this command ends on. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section (ADR 0157).

## The mode

Applies to the whole conversation. Offer options rather than closed questions, and explore tradeoffs out loud. Ground every option and claim in the actual repo.

- Read the documentation files, such as `README.md`, `CLAUDE.md`, or `AGENTS.md`, and the relevant code before you propose a direction.
- Say so the moment the code already does something the idea assumes, or cannot support it.

## The moves

Applies to the whole conversation. Run it with these core moves of cross-exam.md: **One question at a time**, **Explore the code instead of asking**, **A recommended answer every time**, **Offer only live options** (vetted, at most two), **Surface, never smuggle**, and **Hunt contradictions**. Let the exploration branch wide before it narrows. Stop at §6's readiness test, not at cross-exam.md's `## Termination`.

- Apply the **active moves** of domain-modeling.md: challenge vague terms and sharpen fuzzy language.
- Apply `${CLAUDE_PLUGIN_ROOT}/references/doc-verification.md`: verify a claim about how a third-party library, product, or service behaves against its official docs before the intent carries it as fact.

## 0. Offer the drafts

**The scan.** Applies to every start. Glob `.superdev/brainstorm/*.md` and read each file's YAML frontmatter. No draft, or no directory → start at §1.

**The ask.** Applies when any draft exists. Ask one `AskUserQuestion` (ADR 0184): a **resume** option per draft, its description carrying the draft's problem-statement line, then **start fresh**. Select none yourself, `$ARGUMENTS` matching a draft included.

- `AskUserQuestion` holds 2–4 options. Drafts beyond the options → name them in the question text, and the operator reaches them through the tool's free-text "Other".
- **Resume** → re-read the file, summarize where it stands, skip §1, and continue at the first still-open decision. Ask no point the file records as settled.
- **Start fresh** → continue at §1, and leave every existing draft in place.

**Keep the file current.** Applies once the intent file exists. Edit each point into its section in the turn it settles: the problem, a direction, a success criterion, a scope line, a commitment, or a rejected direction. You own the file during the interview, and the operator steers through the conversation.

- A direction still under discussion sits under the still-open decisions.
- The file gets no section beyond §5's.
- A first commitment, or a first rejected direction worth keeping → add its heading then.

## 1. Start from the problem, not the solution

**The problem.** Applies when `$ARGUMENTS` names a solution ("add a cache", "build a dashboard"). Pull the conversation back one level before going further. Ask who feels this pain, what frustrates them today, why it matters now, and what happens if nothing changes.

**Write the intent file.** Applies once the operator confirms the problem, before any direction is explored. The write is mandatory, with the slug taken from the confirmed problem and not from `$ARGUMENTS`. Write `status: draft` frontmatter, then §5's headings as a skeleton with the problem statement filled in. The skeleton leaves out **Load-bearing commitments** and **Rejected directions**.

- A slug naming an existing file in `.superdev/brainstorm/` → a distinct name with a `-2` or `-3` suffix. Never overwrite a file this session did not create.
- `.superdev/` absent from the repo's `.gitignore` → add it.
- The file sits beside `.superdev/scopes/`, never inside it, and never loose in the tracked working tree of the checked-out branch.

**Audit for prior art.** Applies once the problem is confirmed, before §2 explores any direction. Run the redundancy and prior-rejection checks in `${CLAUDE_PLUGIN_ROOT}/references/prior-art.md`, and carry their findings into §2. A redundancy hit makes extending the existing implementation §2's recommended direction.

## 2. Explore the space

Applies once the problem is confirmed and audited for prior art, in this session or in the session that wrote a resumed draft. Explore **2–4 candidate directions or shapes**, different enough to show real tradeoffs, and vet each against the repo before you show any. Offer the two strongest survivors per **Offer only live options**, each with its rough shape and cost/benefit.

- Name each dropped direction in one line.
- Two equally strong survivors → say they are a toss-up.
- Keep diverging until the exploration has run. Then converge.

## 3. Find the Minimal Lovable Product (MLP)

Applies to the direction the user leans toward. Find the **smallest end-to-end version that delivers real value**: a complete, narrow slice a user could actually use. Push back on gold-plating, and push back on scope too thin to deliver anything real.

## 4. Surface unknowns

**The unknowns.** Applies to the chosen direction. Name the assumptions, the risks, and the constraints (technical, organizational, timeline).

**The prototype.** Applies to an unknown the conversation cannot settle, such as "does this state model feel right" or "which of these two shapes survives real data". Offer the detour, and run it by `${CLAUDE_PLUGIN_ROOT}/references/prototype.md`. The intent carries the decision.

- The codebase carries nothing.
- State the question in the artifact.
- Keep the logic liftable.
- Fold the validated decision into the intent.
- Park the prototype on a throwaway branch.

## 5. Converge to a "ready to plan" intent

Applies once the space has been explored. Bring the intent file to its final form under these headings.

| Heading | Content |
|---|---|
| **Problem statement** | The pain, from the user's perspective. |
| **Target user** | Who this is for. |
| **Success criteria** | Checkable criteria. |
| **Rough scope + non-goals** | The MLP, and what is deliberately excluded. |
| **Still-open decisions** | What remains genuinely undecided. |
| **Load-bearing commitments** | Each commitment the discovery settled that constrains later decisions, written as a pair: the principle, then the rule it implies. A principle with no rule is no commitment. `/superdev:plan` turns each into an invariant register entry, or names why it implies none (domain-modeling.md, ADR 0081). None settled → write no section, and say so. |
| **Rejected directions** | Each direction explored and dropped, and why it lost, kept only where a future reader would plausibly re-propose it. Nothing worth keeping → omit the heading. `/superdev:plan` makes these durable (domain-modeling.md). |

## 6. Hand off

**A ready intent.** Applies once the intent has a clear problem, checkable success criteria, and a bounded scope, even with decisions still open. Set `status: ready` in the frontmatter, then hand the intent off as an intent record by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`. The record replaces the file.

- The record confirmed → delete the file.
- A record that cannot be written whole → the file stays `ready`, and the report says why.
- Tell the user the intent is ready, and name **`/superdev:plan`** as the next command. Plan interviews the open decisions one at a time and slices the work.

**A stop before ready.** Applies when the operator stops while the file reads `status: draft` (triage #829). Write nothing to the slice store, and name `/superdev:brainstorm` as the next command.

- It resumes the draft at §0.
- `/superdev:plan` skips a draft, so it is never this exit's next command.

**The report.** Applies to every exit. Close with the brainstorm report per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The brainstorm report` section (INV-0112).
