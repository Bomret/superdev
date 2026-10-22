# 0078 — One cascade resolves an empty argument

**Status:** Accepted

**Amended by:** [ADR 0165](0165-review-resolves-a-top-level-path-as-no-argument.md), which adds a
review-only step after the cascade finds no candidate.

## Context

Three commands take a run as their subject and accept no argument: `/superdev:implement`,
`/superdev:ship`, `/superdev:review`. Each resolved an empty argument in its own words.
`skills/ship/SKILL.md` §1 spelled out four bullets. `skills/implement/SKILL.md` §1 compressed the same
rule into one sentence. `skills/review/SKILL.md` §1 had no such rule at all: an empty argument resolved
to the working tree, which on a clean checkout of the base branch resolves to an empty range with no
branch defined for the outcome. The operator got no review, no list of what could be reviewed, and no
next command to type.

A second defect shared the cause. No command filtered its candidates by stage, because nothing stated
what belonged in the set. `/superdev:ship` offered every run root a repository held, `shipped` ones
included.

The commands do not enumerate alike. `/superdev:ship` and `/superdev:review` scan `.superdev/scopes/*/`;
`/superdev:implement` reads its candidates from the slice store over that store's own API. One document
cannot own both mechanisms without pulling backend specifics into a reference that knows only git and the
filesystem.

## Decision

`references/scope-mode.md`'s `## Resolving an empty argument` section owns the cascade — exactly one
candidate is used, several are listed with their stage and put to the operator, none is reported with
what exists instead — and owns run-root enumeration, filtered by the stages the calling command names.
Each command names only its own candidate set and restates none of the cascade. `/superdev:implement`
passes the set it computed from the store into the same cascade.

`/superdev:review` puts one local rule ahead of the cascade: a dirty working tree is reviewed as it
always was, and the command says in one line which eligible scope it passed over.

## Considered options

- **Repair `/superdev:review` alone, with a cascade of its own.** One file and one drift row. Rejected:
  it makes `review` the fourth place the same rule is written in its own words, which is the defect.
- **Own the cascade and nothing else, each command enumerating for itself.** The cleanest boundary.
  Rejected: `ship` and `review` scan run roots identically, so the duplication the change exists to
  remove would survive in both.
- **Own all three enumerations, the store calls included.** Rejected: it contradicts the
  backends-are-pluggable rule, which keeps store mechanics out of `skills/` and `references/` alike.

## Consequences

`/superdev:ship`'s candidate set excludes `shipped`, which mirrors its own §3 stage gate — every other
stage is shippable there, after a question. `/superdev:review`'s set is `merged` and
`documented-unreviewed`, exactly the two `skills/afk/SKILL.md` routes into the review, so the attended
and unattended paths select the same scopes and no second judgment exists to drift.

A caller whose resolution lives in a script refuses and lists instead of asking, since a script cannot
put a question. `plugin/scripts/publish-kb.js` is the one, and the section names it rather than leaving
its absence to read as a gap a later change would close by breaking the script.

The commands outside this family keep their own empty-argument defaults, and the no is as load-bearing
as the yes: `/superdev:document`'s full reconcile is what bootstrap and the audit chain rest on, and
`/superdev:status`, `/superdev:backlog`, and `/superdev:sweep` survey rather than act, so a singleton is
nothing for them to find.
