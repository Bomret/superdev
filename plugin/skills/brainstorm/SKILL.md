---
name: brainstorm
description: Turn a rough idea into a plan-ready intent through a divergent discovery conversation. Run before /superdev:plan when the idea isn't sharp enough to interview yet.
argument-hint: "[a rough idea, or nothing]"
---

# superdev brainstorm

Turn a vague idea into an intent that's sharp enough to interview.
Where `/superdev:plan` **converges** — one question at a time, pinning down a Definition of Done — this command **diverges** first: it generates options, tolerates "I don't know," and only narrows once the shape of the problem is clear.
Near read-only — it writes its own intent file under `.superdev/brainstorm/` as the interview runs, and adds `.superdev/` to `.gitignore` when absent. The one other write is §4's prototype detour, which parks the prototype on a throwaway branch. It writes no slices, no Definition of Done, nothing to the slice store; that's `/superdev:plan`'s job.
Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111).

Set a generative, curious mode: offer options rather than asking closed questions, explore tradeoffs out loud, and treat "I don't know yet" as useful signal, not a blocker. Ground every option in the actual repo — read documentation files, like `README.md`, `CLAUDE.md` or `AGENTS.md` and the relevant code before proposing directions, so suggestions are grounded in what exists, not invented from nothing.

**Run it with the interview discipline in `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md`** — relentless, one thread at a time, exploring the code instead of asking wherever you can, surfacing contradictions the moment they appear — but in **divergent** mode: offer options rather than a single recommended answer, and let the tree branch wider before it narrows. Every option offered still states what choosing it saves, cross-exam.md's live-options test applied with no recommended answer to test alternatives against. Apply the **active moves** in
`${CLAUDE_PLUGIN_ROOT}/references/domain-modeling.md` too — challenge vague terms, sharpen fuzzy language, cross-check claims against the code — to think precisely. Apply
`${CLAUDE_PLUGIN_ROOT}/references/doc-verification.md` as well — verify a claim about how a third-party library, product, or service behaves against its official docs before it's carried into the intent as fact. But **write nothing durable** here: no glossary entries, no ADRs, no slices. Durable capture is `/superdev:plan`'s job.

## 0. Offer the drafts

Glob `.superdev/brainstorm/*.md` and read each file's YAML frontmatter. A file whose `status` is `draft` is an unfinished brainstorm (ADR 0112, INV-0110); only that frontmatter marks one, so a file with no frontmatter or any other status is not a draft. No draft, a directory holding only ready intents, or no directory → start at §1.

Any draft exists → ask with `AskUserQuestion` for the action: **resume** a named draft, **delete** a named draft, or **start fresh**. Resume or delete → ask which draft, listing every draft. Each draft's option description carries its problem-statement line, so the operator can pick the right one to resume or delete. `AskUserQuestion` holds 2–4 options. With exactly one draft, name it in the action options and skip the which-draft question. Where drafts exceed the options, name the remaining ones in the question text so none goes unseen; the operator reaches them through the tool's free-text "Other". Never select one yourself, `$ARGUMENTS` matching a draft included.

- **Resume** re-reads the file, summarizes where it stands, skips §1, and continues at the first still-open decision. A point the file records as settled is not asked again.
- **Delete** removes only the file the operator picked and touches no other file in the directory. Then offer again with what remains: the remaining drafts, or §1 once none is left.
- **Start fresh** continues at §1 and leaves every existing draft in place.

**Keep the file current.** Each point that settles — the problem, a direction, a success criterion, a scope line, a commitment, a rejected direction — is edited into its section in the same turn it settles. A direction still under discussion sits under the still-open decisions, and the file gets no section beyond §5's. Brainstorm owns the file during the interview; the operator steers through the conversation, not by editing it.

## 1. Start from the problem, not the solution

If `$ARGUMENTS` names a solution ("add a cache", "build a dashboard"), pull the conversation back one level before going further.
Ask: who feels this pain, what's frustrating about today, why does it matter now, and what happens if nothing changes. A brainstorm that starts from the solution locks in the first idea instead of finding the best one.

**Write the intent file once the operator confirms the problem, before any direction is explored.** The write is mandatory. Name it `.superdev/brainstorm/<intent-slug>.md`, the slug taken from the confirmed problem, not from `$ARGUMENTS`: §1 often turns a solution-shaped argument into a problem, and a slug taken too early names the first idea. A slug that names an existing file in `.superdev/brainstorm/` gets a distinct name, a `-2` or `-3` suffix, and the write never overwrites a file brainstorm did not create in this session. The file opens with YAML frontmatter, `status: draft`, then carries §5's headings as its skeleton with the problem statement filled in. Ensure `.superdev/` is in the repo's `.gitignore`; add it if absent. The file sits alongside `.superdev/scopes/`, never inside it, so it's never mistaken for a scope run root (`/superdev:status` reads scope runs from `.superdev/scopes/*/`, and staged pages from `.superdev/kb-pending/`, so a `brainstorm/` file belongs to neither). Never write it loose in the tracked working tree of whatever branch happens to be checked out — durable capture happens only in `/superdev:plan`.

## 2. Explore the space

Propose **2–4 candidate directions or shapes** for solving the problem — different enough to reveal real tradeoffs, not variations on one idea. For each, name the rough shape and its cost/benefit. Get the user's reaction to each before narrowing. Diverge before you converge — resist collapsing to a single direction too early.

## 3. Find the Minimal Lovable Product (MLP)

For the direction the user leans toward, find the **smallest end-to-end version that delivers real value** — not a fragment of the final thing, but a complete (if narrow) slice through it a user could actually use.
Push back on gold-plating; push back on scope so thin it delivers nothing real either.

## 4. Surface unknowns

Name the assumptions being made, the risks, and any constraints (technical, organizational, timeline).
Cross-check claims against the code — if the codebase already does or doesn't support something the idea assumes, say so now rather than let `/superdev:plan` discover it later.

**An unknown conversation cannot settle earns a prototype.** "Does this state model feel right", "which of these two shapes survives real data" — offer the detour and run it by `${CLAUDE_PLUGIN_ROOT}/references/prototype.md`: state the question in the artifact, keep the logic liftable, fold the validated decision into the intent, and park the prototype itself on a throwaway branch. The intent carries the decision; the codebase carries nothing.

## 5. Converge to a "ready to plan" intent

Once the space has been explored, bring the intent file to its final form — a short intent with these headings, which the file has carried since §1:

- **Problem statement** — the pain, from the user's perspective.
- **Target user** — who this is for.
- **Success criteria** — checkable, not vibes.
- **Rough scope + non-goals** — the MLP, and what's deliberately excluded.
- **Still-open decisions** — what remains genuinely undecided.
- **Load-bearing commitments** — a commitment the discovery settled that will constrain later decisions, written as a pair: the principle, then the rule it implies. The pairing is the test — a principle alone is cheap to invent, a principle carrying its implied rule is not — so naming the rule is what separates a commitment from a mood. `/superdev:plan` converts each one into an invariant register entry, or names out loud the reason it implies none (`domain-modeling.md`, ADR 0081). A discovery that settled none writes no section and says so.
- **Rejected directions** — a direction explored and dropped, and why it lost. Include only what a future reader would plausibly re-propose; a divergent conversation generates dead ends nobody needs recorded. Nothing worth keeping → omit the bullet entirely rather than write an empty one. `/superdev:plan` makes these durable (`domain-modeling.md`).

## 6. Hand off

Once the intent has a clear problem, checkable success criteria, and a bounded scope — even if some decisions remain open — set `status: ready` in the intent file's frontmatter, then tell the user it's ready and to run **`/superdev:plan`**, which will interview those remaining decisions one at a time and decompose the work into slices.

Close with the brainstorm report, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The brainstorm report` section (INV-0112).
