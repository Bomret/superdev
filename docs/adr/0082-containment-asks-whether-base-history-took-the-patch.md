# 0082: Containment asks whether base's history took the patch

**Status:** Accepted

**Amends:** [ADR 0053](0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md), whose
Decision states the test as one `git merge-tree --write-tree` tree comparison, and reads its exit 1 as not
contained. And [ADR 0065](0065-containment-refetches-the-base-before-it-answers-not-contained.md), whose
`Considered options` rejects fixing the conflicting-base case.

**Context.** ADR 0053 fixed the question the containment test asks: content, not ancestry. ADR 0065 fixed
the ref it asks the question of: `FETCH_HEAD` after a refetch, not a stale local base. Both leave exit 1
answering not contained.

`git merge-tree --write-tree <base> <branch>` runs a three-way merge from the fork point. A base that
edits, after taking the branch's work, a region the branch also touched conflicts there. Overlapping hunks
conflict whether or not the two sides carry the same content, so a branch base holds in full exits 1 and
reads not contained.

Measured on this repository 2026-09-21, on git 2.54.0. `/superdev:publish-kb --scope invariant-register`
refused a scope squash-merged onto `main` as `9b6e7b5` twenty hours earlier, naming its branch "not
contained in main". Twenty shipped run roots sat in `.superdev/scopes/` past ADR 0007's seven-day TTL,
every one with its branch still present and every one reading not contained, so `hooks/scope-prune.js` had
reaped none of them. `fix/squash-merge-containment`, the branch that built the containment test, was among
them. This is the symptom ADR 0053's Context measured on 2026-09-07 — seventeen merged branches unreaped,
eighteen run roots, six past the TTL — reached by a different route.

ADR 0065 considered this case and rejected it, on the grounds that "no git primitive decides whether a
patch is already applied under later edits, so the test would need a heuristic that can be wrong in the
unsafe direction". That holds for the proposition it names. A neighbouring proposition is decidable
exactly, and it is the one both callers need.

**Decision.** `references/scope-mode.md`'s `## Containment` section runs a second tier. Where the tree
comparison exits 1, and where the `git merge-base --is-ancestor` fallback a git older than 2.38 takes
answers no, take the patch id of the branch's cumulative diff from the merge base and look for it among
the patch ids of the commits base gained since that same merge base:

```sh
mb=$(git merge-base <base> <branch>)
pid=$(git diff "$mb" <branch> | git patch-id --stable | cut -d' ' -f1)
git log -p --no-color "$mb..<base>" | git patch-id --stable | grep -q "^$pid "
```

A match answers **contained**. No match answers **not contained**, which is the verdict the first tier
already reached. The vocabulary stays at three verdicts.

`git rev-list --count "$mb..<base>"` gates the scan. Past the cap the probe is skipped and the answer is
not contained, so a repository whose base has diverged far from an abandoned branch pays a single counting
call instead of a full patch walk. The bound is a commit count rather than a wall clock, because a guard
whose verdict varies with machine load is a guard nobody can reason about.

`plugin/scripts/scope.js` owns the implementation and exports it. `plugin/hooks/scope-prune.js` requires
it, the way it already requires `readLedgerHeader` (ADR 0022), and keeps both of its own properties: `HEAD`
as its base, and no fetch. A `require` failure leaves that hook on the tree comparison alone.

**Why.** The probe decides one proposition: base's history holds a commit whose diff equals the branch's
cumulative diff from the fork point. That is exact evidence, not a heuristic — `git patch-id --stable`
hashes the normalised diff content, so a match means the same change, and no match means the probe stays
silent and the first tier's verdict stands.

It is also the proposition both callers want. `/superdev:publish-kb` asks whether a feature reached its
readers, and a feature merged into base reached them. `hooks/scope-prune.js` asks whether a branch is safe
to delete, and a branch whose work sits in base's history carries nothing the repository would lose.

The scan writes no objects, where the tree comparison it follows writes trees. The cost lands on the
conflict path alone: a clean merge answers in the first tier and never reaches it. Measured on this
repository, a 64-commit range costs 0.12s batched through one `git log -p | git patch-id` pipe, against
1.0s for a subprocess pair per commit.

**Considered options.**
- *A fourth verdict, `undecidable`, for a conflict the probe cannot settle.* Rejected: the vocabulary
  reaches `references/scope-mode.md`, the `scope-prune.js` mirror, `publish-kb.js`'s message, and the
  drift rows pinning all three, and the probe already resolves the case the operator meets.
- *Reverse-apply the branch's diff against base.* `git apply --reverse --check` in a throwaway worktree
  answers whether the change is present. Rejected: it needs a worktree, and it fails on exactly the later
  edits that cause the conflict in the first place.
- *A wall-clock bound, the shape `publish-kb.js` uses for backend commands (ADR 0076).* Rejected: it
  bounds the real cost, and it lets one repository state produce two different verdicts.
- *A reverse patch-id guard for the apply-then-revert case.* After a forward match at commit C, scan
  `C..<base>` for the reversed diff's patch id and answer not contained on a hit. Rejected: it catches a
  plain `git revert` and misses a hand-written undo, so it buys partial cover for a second full scan.
- *Leave `hooks/scope-prune.js` on the tree comparison, and probe for `/superdev:publish-kb` alone.*
  Rejected: the hook's wrong verdict is what leaves twenty run roots and twenty branches standing, and the
  delete it gates loses nothing a patch id match has not already found in base's history.

**Consequences.** A base that takes the branch's work and then reverts it in a way that also conflicts
with base's own later edits — so the tree comparison reaches the probe at all — reads contained. The work
stays reachable from base's history, so the branch delete destroys nothing unique, and a knowledge-base
page published for a reverted feature is the operator's to retract. A revert that does not conflict never
reaches the probe: the tree comparison settles it, and which way depends on how the work arrived.
Reverting a true merge leaves the branch an ancestor of base still, so the comparison reads contained.
Reverting a squash-merge leaves the branch's tip outside base's history, so the comparison reads not
contained.

`hooks/scope-prune.js` gains a second `require` of `plugin/scripts/scope.js`, beside `readLedgerHeader`.
Both fall back rather than crash when the `require` fails, and the fallbacks differ: the ledger reader
sweeps nothing, and the containment probe drops to the tree comparison.

A repository whose base has gained more commits than the cap since a branch's fork point keeps the
not-contained verdict, and an operator who knows the branch landed passes `--allow-unmerged` as before.

A `Stop` hook in this repository reaps the twenty standing run roots and their branches on the first turn
after this lands.
