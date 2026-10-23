# 0167: Plan pushes the scope branch

**Status:** Accepted

**Amends:** [ADR 0042](0042-run-state-is-mirrored-to-the-scope-anchor.md), whose `resumed` run kind fetches
a branch that no command had pushed yet. [ADR 0053](0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md), whose
containment proof now also permits one forced push.

## Context

ADR 0042 makes a run resumable on another machine. Run init adopts the anchor's published snapshot, and
the `resumed` run kind fetches the scope branch from the configured remote. `/superdev:plan` cuts the
branch, commits the design captures on it, and publishes the snapshot, but it pushes nothing. The first
push is in `/superdev:submit-pr`. A feature planned on one machine therefore stops at the fetch on every
other machine, and its glossary terms, ADRs, and invariants exist only on the planning machine.

INV-0087 stated that only `/superdev:submit-pr` and `/superdev:ship` push a scope branch, so that nothing
unreviewed reaches the code host before the pull request opens. The invariant was backfilled; no ADR
recorded a decision behind it.

A squash-merging host that keeps merged branches leaves a stale remote copy under a reused feature label.
The plan cut re-points the local branch to base when `## Containment` proves it contained, so a plain push
of the re-pointed branch is rejected as non-fast-forward.

## Decision

`/superdev:plan` pushes the scope branch to the remote that `docs/agents/code-management.md` names, in its
§6, after the scopetree commit and `scope.js init … planned`, and before the release question. It pushes
on every plan run, fresh and append, attended and unattended, also when the branch carries no commit
beyond base.

`scope.js push --root <run-root> --remote <remote> --base <base-ref>` performs the push. It reads the branch from the
ledger's `**Branch:**` line, fetches the remote tip, resolves it to a full commit id, and decides the
**push mode** from that id:

- **No remote branch**, or a remote tip that is an ancestor of the local tip → a plain push with `-u`.
- **A remote tip that `## Containment` proves contained in base** → a push with
  `--force-with-lease=<branch>:<that tip>`. The lease names the tip the test judged, so a push that
  arrived after the test makes the push fail instead of being overwritten.
- **Any other remote tip** → no push. The remote branch carries content base does not hold, for example
  another person's plan under the same label.

The containment test receives the resolved commit id, never the bare branch name, because the name
resolves to the local branch first. The verb tells a missing remote branch apart from an unreachable
remote, a rejected credential, and a fetch its own time bound ended, the containment test's refetch of base
included. A `**Branch:**` line that names base is refused, so the verb never pushes base. Every answer it cannot give falls
toward no push or a plain push, never toward a lease push. A plain push is safe by construction, because
the remote rejects a push that is not a fast-forward. The verb runs in the controller's own Bash call, which
`merge-guard` allows. `merge-guard` denies the same call from a subagent, as it denies a subagent's git push. The decision and the push sit in one tested call, so the lease form and the time bound
on every git call are code a suite proves (INV-0009, INV-0169).

The remote is the `Remote:` value `docs/agents/code-management.md` names. Without that value, plan skips
the push with one note.

The push is best-effort, as the run-state publish is (`references/scope-mode.md`'s `## Publishing run
state`). A failed or refused push is reported once in plan's output, with the git command the operator
runs by hand and the consequence: until the branch is pushed, a resume on another machine stops. A
refused push also prints the remote branch's commits that base does not hold, judged against the base the
containment test refetched, and no command that would
overwrite them. The ledger and the anchor snapshot are unchanged by it, and plan finishes.

INV-0087 is revised in place: `/superdev:plan` joins `/superdev:submit-pr` and `/superdev:ship` as a
command that pushes a scope branch. Plan pushes before any slice runs, so the branch holds no slice
work: only the design captures the operator approved during the interview, and whatever else the branch
held at stage `planned`. `/superdev:implement`, `/superdev:review`, and `/superdev:document` still push
nothing.

The push rule lives in `references/scope-mode.md` beside `## Cutting the scope branch`, as the `resumed`
fetch does, not in the code-management seeds. Git's push is host-agnostic, and a seed change would cost
every adopter a seed-gap pass.

## Considered options

- *Push only when the operator answers "Release now".* Rejected: `/superdev:implement` still runs an
  unreleased feature after a confirmation, so "Later" leaves the same gap.
- *Push to a hidden ref (`refs/superdev/<scope>`) and keep INV-0087 literal.* Rejected: a second ref
  namespace for the fetch to know, and host behaviour for custom refs to verify on each code host, for a
  push that carries no code.
- *Re-cut from base on the second machine when the remote holds no branch.* Rejected: the design captures
  are lost.
- *Push at the first-capture cut and again at the end.* Rejected: nothing can pick up a half-interviewed
  plan, so the earlier push adds a call and no value.
- *Decide the push mode in prose, as the cut decides containment.* Rejected: this is the one forced push
  superdev makes, and its decision rests on code a suite tests.
- *A verb that decides the mode and prints it, with plan's prose running the push.* Rejected: the lease
  form and the race it guards would sit in prose no test reaches.
- *Record a failed push as a `**Degraded:**` entry.* Rejected: the entry would need a clear path once a
  later push succeeds, for a state the operator already sees in plan's output.

## Consequences

A feature planned on one machine resumes on another through ADR 0042's adoption, on a store that carries
a run-state snapshot. A snapshot-less store gets the pushed branch too, but run init there sees no
snapshot and cuts a fresh branch from base; detecting the remote branch there is separate work.

The code host sees a scope branch from the end of planning on. Pushes later in the chain stay where they
were: submit-pr pushes the implemented branch, and ship pushes a moved tip.

`/superdev:submit-pr`'s later push of the same branch is a fast-forward of plan's push, because a
`planned` or `resumed` run never re-points the branch.

Known limits, each outside this decision:

- A remote branch an abandoned plan left behind is not contained, so every later plan under that label
  refuses to push. The refusal names the remote branch's commits, and the operator removes or renames it.
  `hooks/scope-prune.js` deletes local refs only, never the host's branch.
- A remote tip that base already holds, but that an open pull request still uses as its head, is
  overwritten by the lease push, which moves that pull request's head.
- On a second machine whose local branch of the same name still resolves, run init skips the fetch and
  resumes on that local branch.
- A foreign plan under the same label is found only at plan's push, after this plan has taken its ADR,
  invariant, and glossary numbers.
- A consumer's pre-push hook, and continuous integration that runs on a branch push, run on a branch that
  carries design captures only.
- Run init's own `resumed` fetch verifies the remote-tracking ref, which a single-branch clone does not
  write.
