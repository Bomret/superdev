# 0290: A shared local git read carries a fixed bound and refuses when killed

**Status:** Accepted

**Context.** The shared local git reads (`resolveCommit`, `refResolves`, `existsAt`, `fileAt`, `listWorktrees`,
`mainWorkTree`, `isNamedRemote`, and `judgeContainment`'s local reads) spawn git with no bound, so a hung git hangs
the caller. Where a signal does end one, several turn the killed read into an answer: `null` from `resolveCommit`
reads as an absent ref, and `null` from `mainWorkTree` reads as no repository. INV-0009 forbids both.

**Decision.** Each of these reads carries one fixed 60 s bound by default, the bound `abandon`'s own local reads
already used, and a bound the caller passes still wins. A real answer keeps its return shape. Where a signal ends a
read whose answer would otherwise read as a fact (a ref absent, a remote unnamed, no repository), the read throws
the refusal error, which the CLI prints as one line naming the read as no verdict. A caller that can mark an item
`unknown` catches it, and a hook catches it and keeps its quiet fallback. A read that already answers "git cannot
say" (`existsAt`, `fileAt`, `listWorktrees`) keeps that answer. Containment keeps INV-0003: a local read with no
verdict answers not contained, which keeps the branch, and names that read beside the answer the way a killed refetch
is named.

**Considered options.**

- A three-state return (commit, absent, unknown) from every helper. It lets a command carry on past one unknown
  read, but every one of the helpers' callers would have to branch on the new state. A caller that skips that branch
  reads unknown as absent again.
- A bound the operator configuration can override, like the push timeout. A healthy local read takes milliseconds,
  so only a hung git reaches 60 s, and no operator has needed a different value.
