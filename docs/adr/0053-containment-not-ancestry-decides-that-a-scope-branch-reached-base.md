# 0053: Containment, not ancestry, decides that a scope branch reached base

**Status:** Accepted

**Amended by:** [ADR 0065](0065-containment-refetches-the-base-before-it-answers-not-contained.md), which
adds a second pass to the test below: a not-contained verdict against the local base fetches base from the
remote and retests against `FETCH_HEAD`, whose answer wins.

**Amends:** [ADR 0007](0007-scope-prune-ttl.md), whose Decision rests on "A code host that squash-merges
also deletes the branch, which is why absence carries the signal that ancestry lost", and
[ADR 0028](0028-the-scope-branch-is-cut-once-and-reused-losslessly.md), whose `appended` paragraph runs
the ancestor test to decide containment and then fast-forwards.

**Context.** Three surfaces ask whether a scope branch's work reached the base branch, and all three ask
it with ancestry — `hooks/scope-prune.js` through `git branch --merged`, `references/scope-mode.md`'s
`appended` run kind and `skills/publish-kb/SKILL.md` §3 through `git merge-base --is-ancestor`. Ancestry
asks whether the branch's *commits* are reachable from base. A squash-merge rewrites those commits into
one new commit, so the answer is always no, however completely base holds the work.

ADR 0007 knew ancestry fails under squash-merge and accepted it, pairing ancestry with branch **absence**
on the reasoning that a squash-merging host deletes the branch, so the deletion carries the signal
ancestry lost. Epic #197 built that pairing and recorded a matching non-goal: "A two-armed predicate that
verifies landed content when the branch still exists. Absence covers the squash case, and ancestry still
covers the merge-commit case."

The host half of that reasoning is correct — verified 2026-09-07, `git ls-remote --heads origin` on this
repository returns `main` alone, so Codeberg does delete the branch on merge. The gap is that absence is
computed from the *clone's* refs, not the host's: `hooks/scope-prune.js` reads `git for-each-ref
refs/heads refs/remotes`, and both kinds of ref survive the host's deletion indefinitely. Nothing removes
the local `<type>/<scope>` branch — `skills/ship/SKILL.md` correctly leaves it, since the pull request is
open from it, and no later step returns for it — and the stale `origin/<type>/<scope>` remote-tracking ref
persists until someone runs `git fetch --prune`, which superdev neither runs nor may assume. So the
branch reads present forever while its commits are never ancestors, and both halves of the test fail
together.

The consequences were measured on this repository on 2026-09-07. `git branch --merged main` returned
`main` alone while seventeen shipped scope branches sat merged in base, so the seven-day reap had never
fired: eighteen run roots stood in `.superdev/scopes/`, six of them past the TTL. `/superdev:publish-kb`
warned "not merged" on every squash-merged scope and asked the operator to confirm, every time, which
trains the operator to wave through the one warning that is real. The `appended` run kind read "present
and not contained" and offered to rename a branch whose content was already safe in base.

**Decision.** A scope branch has reached base when merging it into base would change nothing. The test
is `git merge-tree`:

```sh
tree=$(git merge-tree --write-tree <base> <branch>) && [ "$tree" = "$(git rev-parse <base>^{tree})" ]
```

Exit 0 with an equal tree is **contained**; exit 0 with a differing tree, and exit 1 (a conflict), are
both **not contained**. Verified 2026-09-07 against `git-merge-tree(1)` and the git v2.38.0 release notes,
and observed on git 2.38's own semantics under 2.50.1: the squash-merged `feat/opencode-upgrade` yields
main's exact tree, genuinely unmerged work yields a differing one, and a branch stays contained after base
moves on.

`references/scope-mode.md` states this test once, in a section of its own beside `## The scope branch`.
`## Cutting the scope branch` and `skills/publish-kb/SKILL.md` §3 both delegate to it rather than
restating the incantation, and `hooks/scope-prune.js` mirrors it in JavaScript. Absence stays a merged
signal beside containment, unchanged, for the hosts that do delete the branch.

`--write-tree` requires git 2.38 (2022-10-02). Where it is unavailable each surface falls back to the
ancestry test it runs today, so an older git degrades to current behaviour rather than failing.

An `appended` run that reuses a contained branch re-points it to base with `git reset --hard <base>`
instead of `git merge --ff-only <base>`, which exits 128 on a squash-merged branch because base is not a
descendant of it. This is a second, narrow exception to `scope-mode.md`'s **No forcing flag** rule,
admissible only because the containment test has just proved base holds identical content — the rule
exists to prevent losing merged slices, and here nothing can be lost.

**Why.** The question every one of these surfaces means to ask is about content, not ancestry: does base
already hold this work. Ancestry was a proxy that happened to answer it under merge-commit workflows and
answers it never under squash-merge, which is the default on Codeberg, GitHub, and GitLab alike.
`git merge-tree` asks the intended question directly, locally, with no credential and no network, and it
stays correct under every merge strategy rather than trading one blind spot for another. Querying the code
host for the pull request's merge state would be truer still, but it would couple a containment test to
every code-host backend and drag a network call into a `Stop` hook.

**Considered options.** *Ask the code host whether the pull request merged.* The truest answer, immune to
every merge strategy, and rejected for the reason epic #197 already recorded: a network call and a token
inside a deterministic `Stop` hook is the shape ADR 0023 rejected, and it would couple a containment test
to every code-host backend. *Match patch ids with `git cherry`.* A squash combines many commits into one,
so no individual patch id matches; epic #197 measured this against a real twelve-commit squashed scope and
found every commit unmatched. *Drop `/superdev:publish-kb` §3 altogether*, on the argument that a warning
which never blocks and always fires is worth less than the noise it makes. Rejected: it abandons a real
guard on the one surface where publishing unreachable pages is the actual risk, and it repairs neither of
the other two. *Keep absence as the only squash signal*, which is epic #197's non-goal above.
It is **overturned** here, on the gap its own reasoning left: absence is read from the clone's refs, and
the clone's refs outlive the host's deletion with nothing in superdev to remove them.

**Consequences.** `hooks/scope-prune.js` reaps the run roots it has been silently skipping, so ADR 0007's
TTL takes effect for the first time on a clone whose stale local and remote-tracking refs outlive the
host's branch deletion. Its filter order
inverts: the TTL and `shipped` checks run first, and the containment test only for what survives them, so
a `Stop` in a repository with nothing prunable runs no `merge-tree` and writes no objects. `--write-tree`
writes tree objects into the object database, which is why the cheap filters must gate it; git 2.50's
`--quiet` does not help, because it reports only whether a merge is clean and never yields the tree this
test compares.

`/superdev:publish-kb` stops asking about a squash-merged scope, so its warning means something again.
`references/scope-mode.md` gains the one canonical statement of the test, and the drift check pins it
along with the conditions the forcing-flag exception requires. `hooks/worktree-sweep.js` is untouched: a
slice branch merges into the scope branch normally, so its ancestry survives and ADR 0007's reasoning
about it still holds.

A **fourth** surface follows without deciding anything of its own. `skills/plan/SKILL.md` §0 refuses to
extend a feature whose `shipped` scope branch has neither reached base nor gone, and it applies whatever
test `hooks/scope-prune.js` applies. It restated that test inline as ancestry, so it moves to containment
with the hook and delegates to `## Containment` for the command. Left behind, it would refuse every
append against a squash-merged shipped feature — the same defect on the one surface this ADR did not
count.
