# 0016: Unattended is an invocation argument, not scope state

**Status:** Accepted

**Context.** Under `/superdev:afk` the chain answers its own questions instead of asking the maintainer
(ADR 0015). The stage is the only other signal that crosses commands within a run, and it lives in the ledger, so
the ledger is the expected home for this one too.

**Decision.** `--unattended` is a token in each command's `$ARGUMENTS`, passed fresh on every invocation.
Nothing about it is written to the run root.

**Why.** "Nobody is watching" describes one invocation, not the scope. Ledger state outlives the run that
wrote it, so an afk interrupted between writing the marker and clearing it would leave a scope that
silently answers its own questions on the next command a maintainer types, losing a gate without being
told. An argument cannot go stale, because there is nothing to clear.

**Considered options.**

- *A `**Unattended:** true` ledger line that afk clears when the scope leaves its hands*. Rejected: an
  interrupt between the write and the clear leaves the marker standing.
- *The same marker, self-expiring after an hour like the run lock*. Rejected: it bounds the hazard rather
  than removing it, and adds a second staleness clock to keep in step with the lock's.

**Consequences.** `references/scope-mode.md` states the token once, for every command that reads it,
including the catch-all: an unattended command never asks a question, and where no standing answer is
written for a stop it reaches, it blocks. A command that grows a new question later is therefore covered
without being edited. That matters, because a question nobody answers stalls a run until morning.
