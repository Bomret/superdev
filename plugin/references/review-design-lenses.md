<!--
  Attribution: the reuse-audit lens below is distilled from awesome-skills/code-review-skill (MIT).
  Credit to its authors.
-->

# Review design lenses — whole-change design, reuse, and consistency

`final-reviewer` reads this file on a review dispatch, where the whole change is in view. `review-checklist.md`'s `## Binding rules` bind every lens below.

## Design smells

The classical catalogue (Fowler), each one nameable and huntable:

- **Mysterious name** — a name that requires reading the body to learn what it does.
- **Feature envy** — a function more interested in another module's data than its own; it wants to move
  to the data.
- **Data clumps** — the same few fields or params travelling together everywhere: a type wanting to be
  born.
- **Primitive obsession** — a domain concept passed around as a bare string/number where the glossary
  has a name for it.
- **Repeated switches** — the same `switch`/if-chain over one discriminator in several places; one
  polymorphic seam replaces them.
- **Shotgun surgery** — one logical change forcing edits in many places; the scattered pieces want one
  home.
- **Divergent change** — one module edited for many unrelated reasons; it wants splitting.
- **Message chains** — `a.b().c().d()` coupling the caller to the whole path.
- **Middle man** — a module that only delegates; call the target.
- **Speculative generality** — flexibility nobody asked for. The `simplicity-reviewer` owns this on a
  slice diff; flag it here only on a whole-scope range that reviewer never saw.
- **Single-adapter seam** — a port/interface with exactly one adapter behind it and no second in sight:
  a hypothetical seam, which is indirection, not architecture. Two adapters make a seam real — one of
  them may be the in-memory test adapter of a true external dependency.
- **Orphan production symbol** — a new production symbol the running application cannot reach: nothing
  registers it with the container or a manifest/configuration file (`hooks.json`, a skill the harness
  dispatches by name), no route or handler maps to it, and no non-test code references it.
  The feature was built and tested in isolation and never wired in, so the suite is green while the
  capability does not exist. Name the symbol and the entrance it never reached. `final-reviewer` owns
  this on the integrated scope, where the whole feature is in view: one slice diff **cannot tell an
  orphan from a caller** that arrives in a later slice.

## Reuse audit

Before accepting new code, search the project's own utils/helpers/adjacent and shared modules for an
existing equivalent — a duplicate implementation is a quality issue even when each copy is individually
correct. Prefer extending or calling the existing one over adding a parallel implementation.

## Consistency

- **Convention drift** — new code that ignores the conventions already established in the codebase:
  naming, file/module layout, error-handling style, the idiom used for the same job elsewhere. Match
  what's there rather than introduce a second way to do one thing.
- **Cross-slice divergence** — the same concept given a different name, API shape, or vocabulary across
  slices; two seams that should agree but don't. On standing code, with no slices to compare, this reads
  as a divergent second way to do one job living inside the code itself.
- **Duplicated fact** — the same fact (a name-list, a described behavior) stated in two places
  where one owns it and the other should link; flag the copy that drifted. Where
  `prompt-concept-overlap.md`'s `## Prompt-concept overlap` applies to a governed body, judge a pair the overlap test forms by that section
  instead, so one pair draws one finding.
- **Glossary drift** — vocabulary that departs from the repository's glossary (`CONTEXT.md`). Flag a
  synonym listed in an entry's `_Avoid` line, used where that entry's term is meant, as Minor. Flag a
  glossary term used against its entry's definition as Important. Read identifiers, test names, and
  prose in what the change adds, and the whole target on standing code. Grep those terms against the
  glossary's entry headwords and `_Avoid` lines and open only the entries that match. Each finding names
  the term and its glossary entry. Where `CONTEXT-MAP.md` maps contexts to paths, check a path against
  the glossary of the context that holds it, and a path no context holds against the root `CONTEXT.md`.
  No glossary, no finding. Exempt: the glossary itself, ADR text, quoted external or API names, and an
  ordinary English word outside its domain sense. A term the glossary lacks is no finding: adding one
  needs a human's confirmation.
