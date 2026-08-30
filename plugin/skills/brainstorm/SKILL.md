---
name: brainstorm
description: Turn a rough idea into a plan-ready intent through a divergent discovery conversation. Run before /superdev:plan when the idea isn't sharp enough to interview yet.
argument-hint: "[a rough idea, or nothing]"
---

# superdev brainstorm

Turn a vague idea into an intent that's sharp enough to interview.
Where `/superdev:plan` **converges** — one question at a time, pinning down a Definition of Done — this command **diverges** first: it generates options, tolerates "I don't know," and only narrows once the shape of the problem is clear.
Near read-only — it does not write slices, a Definition of Done, or anything to the slice store; that's `/superdev:plan`'s job.

Set a generative, curious mode: offer options rather than asking closed questions, explore tradeoffs out loud, and treat "I don't know yet" as useful signal, not a blocker. Ground every option in the actual repo — read documentation files, like `README.md`, `CLAUDE.md` or `AGENTS.md` and the relevant code before proposing directions, so suggestions are grounded in what exists, not invented from nothing.

**Run it with the interview discipline in `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md`** — relentless, one thread at a time, exploring the code instead of asking wherever you can, surfacing contradictions the moment they appear — but in **divergent** mode: offer options rather than a single recommended answer, and let the tree branch wider before it narrows. Apply the **active moves** in
`${CLAUDE_PLUGIN_ROOT}/references/domain-modeling.md` too — challenge vague terms, sharpen fuzzy language, cross-check claims against the code — to think precisely. Apply
`${CLAUDE_PLUGIN_ROOT}/references/doc-verification.md` as well — verify a claim about how a third-party library, product, or service behaves against its official docs before it's carried into the intent as fact. But **write nothing durable** here: no glossary entries, no ADRs, no slices. Durable capture is `/superdev:plan`'s job.

## 1. Start from the problem, not the solution

If `$ARGUMENTS` names a solution ("add a cache", "build a dashboard"), pull the conversation back one level before going further.
Ask: who feels this pain, what's frustrating about today, why does it matter now, and what happens if nothing changes. A brainstorm that starts from the solution locks in the first idea instead of finding the best one.

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

Once the space has been explored, pull it together into a short intent:

- **Problem statement** — the pain, from the user's perspective.
- **Target user** — who this is for.
- **Success criteria** — checkable, not vibes.
- **Rough scope + non-goals** — the MLP, and what's deliberately excluded.
- **Still-open decisions** — what remains genuinely undecided.
- **Rejected directions** — a direction explored and dropped, and why it lost. Include only what a future reader would plausibly re-propose; a divergent conversation generates dead ends nobody needs recorded. Nothing worth keeping → omit the bullet entirely rather than write an empty one. `/superdev:plan` makes these durable (`domain-modeling.md`).

You may jot this intent to a scratch file for the user's reference — write it under the git-ignored `.superdev/brainstorm/<intent-slug>.md` (ensure `.superdev/` is in the repo's `.gitignore`; add it if absent).
This sits alongside `.superdev/scopes/`, never inside it, so it's never mistaken for a scope run root (`/superdev:status` reads scope runs from `.superdev/scopes/*/`, and staged pages from `.superdev/kb-pending/`, so a `brainstorm/` file belongs to neither). Never loose in the tracked working tree of whatever branch happens to be checked out — durable capture happens only in `/superdev:plan`.

## 6. Hand off

Once the intent has a clear problem, checkable success criteria, and a bounded scope — even if some decisions remain open — tell the user it's ready and to run **`/superdev:plan`**, which will interview those remaining decisions one at a time and decompose the work into slices.
