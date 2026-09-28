superdev-render-overlay
source: skills/brainstorm/SKILL.md
body-lines: 53
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-brainstorm
description: "Turn a rough idea into a plan-ready intent through a divergent discovery conversation. Run before /superdev-plan when the idea isn't sharp enough to interview yet."
---
@5
Where `/superdev-plan` **converges** — one question at a time, pinning down a Definition of Done — this command **diverges** first: it generates options, tolerates "I don't know," and only narrows once the shape of the problem is clear.
@6
Near read-only — it does not write slices, a Definition of Done, or anything to the slice store; that's `/superdev-plan`'s job.
@10
**Run it with the interview discipline in `<plugin-root>/references/cross-exam.md`** — relentless, one thread at a time, exploring the code instead of asking wherever you can, surfacing contradictions the moment they appear — but in **divergent** mode: offer options rather than a single recommended answer, and let the tree branch wider before it narrows. Every option offered still states what choosing it saves, cross-exam.md's live-options test applied with no recommended answer to test alternatives against. Apply the **active moves** in
@11
`<plugin-root>/references/domain-modeling.md` too — challenge vague terms, sharpen fuzzy language, cross-check claims against the code — to think precisely. Apply
@12
`<plugin-root>/references/doc-verification.md` as well — verify a claim about how a third-party library, product, or service behaves against its official docs before it's carried into the intent as fact. But **write nothing durable** here: no glossary entries, no ADRs, no slices. Durable capture is `/superdev-plan`'s job.
@16
If the message that invoked this skill names a solution ("add a cache", "build a dashboard"), pull the conversation back one level before going further.
@31
Cross-check claims against the code — if the codebase already does or doesn't support something the idea assumes, say so now rather than let `/superdev-plan` discover it later.
@33
**An unknown conversation cannot settle earns a prototype.** "Does this state model feel right", "which of these two shapes survives real data" — offer the detour and run it by `<plugin-root>/references/prototype.md`: state the question in the artifact, keep the logic liftable, fold the validated decision into the intent, and park the prototype itself on a throwaway branch. The intent carries the decision; the codebase carries nothing.
@44
- **Load-bearing commitments** — a commitment the discovery settled that will constrain later decisions, written as a pair: the principle, then the rule it implies. The pairing is the test — a principle alone is cheap to invent, a principle carrying its implied rule is not — so naming the rule is what separates a commitment from a mood. `/superdev-plan` converts each one into an invariant register entry, or names out loud the reason it implies none (`domain-modeling.md`, ADR 0081). A discovery that settled none writes no section and says so.
@45
- **Rejected directions** — a direction explored and dropped, and why it lost. Include only what a future reader would plausibly re-propose; a divergent conversation generates dead ends nobody needs recorded. Nothing worth keeping → omit the bullet entirely rather than write an empty one. `/superdev-plan` makes these durable (`domain-modeling.md`).
@48
This sits alongside `.superdev/scopes/`, never inside it, so it's never mistaken for a scope run root (`/superdev-status` reads scope runs from `.superdev/scopes/*/`, and staged pages from `.superdev/kb-pending/`, so a `brainstorm/` file belongs to neither). Never loose in the tracked working tree of whatever branch happens to be checked out — durable capture happens only in `/superdev-plan`.
@52
Once the intent has a clear problem, checkable success criteria, and a bounded scope — even if some decisions remain open — tell the user it's ready and to run **`/superdev-plan`**, which will interview those remaining decisions one at a time and decompose the work into slices.
