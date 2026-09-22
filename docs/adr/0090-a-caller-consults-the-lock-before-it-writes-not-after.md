# 0090: A caller consults the lock before it writes, not after

**Status:** Accepted

**Context.** Two Claude Code sessions were dispatched onto one released feature, `fix/no-verdict-gates`
(triage record #621). The first, `superdev-0e`, held the run: run root cut, scope branch cut, ledger at
`implementing`, `run.lock` fresh and naming it. The second, `superdev-f7`, was started on
`/superdev:implement` for the same feature label about four minutes later. It found the run root and the
lock, read the lock as a leftover from `/superdev:plan`'s own cut rather than a live claim, and proceeded:
it wrote `<run-root>/dod.md`, moved the ledger's stage to `implementing`, refreshed the lock itself, and
edited files in the scopetree — one of which reached a commit under the first session's authorship before
either session noticed.

`references/scope-mode.md`'s `## The run lock` section states when to write the lock and how stale it may
read before a run counts as dead. It does not state, anywhere a caller reads it, that a lock is read
*before* a write. The one place a liveness check exists at all is each execution playbook's own `Resume`
section — reached, in both playbooks, only after `run-init.md`'s own steps have already written `dod.md`
and advanced the ledger's stage. `/superdev:review`, `/superdev:document`, and `/superdev:ship` fare no
better: each names its lock step "refresh the run lock," with no read-first framing at all.
`/superdev:plan` is the one caller already safe, because its own §2 reads the lock immediately before its
first capture-driven write — the rule this decision generalizes, rather than invents.

`hooks/run-lock.js` cannot close this gap by itself. It guards one call, `git worktree add`, which fires
only when a scopetree is *created*. A session that finds one already there — the shape both `resumed`
run kinds take, and the shape `superdev-f7` met — makes no call the hook watches, and a plain file write
consults no lock at all.

**Decision.** `/superdev:implement`'s own entry into a run root it did not itself create in this
invocation reads the ledger's stage and the lock's freshness together, before its first write into that
run — the ledger, `dod.md`, or the lock itself. **Stage `planned`** means `/superdev:plan` cut the run and
nobody has implemented a slice yet: a fresh lock there is the ordinary hand-off, the same operator moving
from planning to implementing within the hour, so the caller proceeds exactly as today. **Any stage other
than `planned`** means a run has actually started, so a fresh lock there (under an hour old, the
`run-lock` hook's own threshold) is a live implement run: attended, the caller names the lock's age and content and
the ledger's stage, and asks whether to continue; unattended, it blocks, per `scope-mode.md`'s
`## Unattended`. A stale or absent lock, at any stage, leaves the caller to proceed exactly as `## The run
lock` already describes, unchanged.

The stage is the necessary second signal, not an optional refinement: a fresh lock by itself cannot tell
`/superdev:plan`'s own just-cut lock apart from a live implementer's, because both are fresh by
construction — `/superdev:plan` writes one at its own cut, the same way an execution playbook does. This
is exactly the ambiguity the incident's own account shows: `superdev-f7` read the lock as `/superdev:plan`
leftover rather than a live claim, and the ledger's stage — `implementing` at the moment it arrived — is
what would have told the two apart, where the lock alone could not.

**The check governs `/superdev:implement`'s own entry alone, never `/superdev:review`,
`/superdev:document`, or `/superdev:ship`.** A fresh lock and a stage past `planned` are both true by
construction at every ordinary hand-off in the chain, not only at a genuine collision: each command
refreshes the lock and advances the stage at its own exit, so the very same signature the check reads for
a live `/superdev:implement` also describes the routine moment `/superdev:review` starts right after
`/superdev:implement` finished. Only `/superdev:implement` can be legitimately redispatched by an
independent invocation while a run is genuinely still in progress — nothing stops a human, or a script,
typing `/superdev:implement <label>` twice, which is exactly what happened. The other three commands are
each the chain's single designed entry immediately after the previous command's own exit; testing them
the same way would trip the stop on every ordinary hand-off, and, unattended with no standing answer
written, block `/superdev:afk` outright at the first tail command past `merged`.

**`/superdev:plan` keeps its own, separate, narrower check** (triage #510), unaffected by the rule above:
before its own cut, a lock already present always means a second plan session — that checkpoint runs
before `/superdev:plan` has written anything of its own, so no stage exists yet to distinguish a hand-off
from a collision the way the new rule does, and none is needed, since nothing but a second `/plan`
session could have left a lock there.

The rule is stated once, in `scope-mode.md`'s `## The run lock` section — the one place `/superdev:implement`'s
own entry (`run-init.md`) and both execution playbooks already cite — rather than duplicated at each call
site.

No identity scheme is added to the lock's content. The content stays freeform text, whatever a session
chooses to write into it — a session name, in the incident's own case — and the check is on the
ledger's stage plus the lock's freshness, never on a name inside it. Where a human is asked to confirm, that freeform text is what lets them judge self from other; where
nobody is watching, the rule blocks regardless, which is the safe direction on a signal nobody is present
to read.

**What this does not cover.** A lock can also go stale while its run is genuinely still live — a long
attended run whose slow steps (an implementer dispatch, a per-slice review, a fix cycle) write no lock
between them outlives the hook's one-hour threshold without ever having stopped. That run then reads as
dead to exactly this decision's own check, which tests freshness and nothing else. Triage record #620
holds that gap. It is a different remedy — refreshing a lock mid-run needs a point in the chain that does
the refreshing, not a point that reads the lock before writing — and closing it here would make this
decision wait on a heavier design for a problem `#621` never had: the lock `superdev-f7` met was fresh,
not stale, and a freshness check would have stopped it.

Nor does this decision close the `planned`-stage window itself: two `/superdev:implement` invocations
that both enter while the stage still reads `planned` both take the ordinary-hand-off branch and both
proceed, indistinguishable from the `/superdev:plan`-to-`/superdev:implement` hand-off that branch exists
to admit. Only `run-init.md`'s own advance of the stage to `implementing` closes that window — this check
does not, by design, since it is what lets the ordinary hand-off through in the first place.

**Consequences.** `/superdev:implement` entering a live implement run stops before it writes, not after — the
ordering the incident's own timeline shows was missing. A session resuming its own run within the hour is
asked once, attended, and answers in a word; the same session running unattended blocks, the same way
every other unresolved ambiguity in a headless run does. `/superdev:review`, `/superdev:document`, and
`/superdev:ship` carry no version of this check: a genuine two-session collision on one of those three
remains as unguarded as it was before this decision, which is a real, accepted gap — narrower in
consequence than `/superdev:implement`'s, since each is read-mostly or gated behind its own ask-once fix
loop already. The stale-lock gap named above stays open too, named rather than silently assumed closed.

**Considered options.**

- **Add a session-identity field to the lock, and refuse automatically on a mismatch.** Rejected: ordinary
  Claude Code carries no reliable, portable way for a session to learn its own identity outside this
  incident's own multi-agent naming, so a general mechanism would either invent an identifier nobody else
  reads or silently do nothing for the common single-operator case. A human reading the lock's existing
  freeform content, asked once, resolves the same question without new machinery.
- **Have `hooks/run-lock.js` guard every write, not only `git worktree add`.** Rejected: the hook fires on
  a `Bash` tool call; the writes this decision guards are `Edit`/`Write` calls and direct ledger-CLI
  invocations, which the hook never sees today, and widening its trigger surface is a larger, riskier
  change than a prose rule read at one already-shared reference.
- **Fold `#620`'s stale-while-live gap into this same decision.** Rejected: the two failures have different
  shapes — one is "nothing checked a fresh lock," the other is "a live implement run's lock went stale with nothing
  refreshing it" — and the incident that motivates this decision needed only the first. Bundling them
  waits the cheap, correct-as-far-as-it-goes fix on a heavier one.
- **Apply the check to every caller of the run lock, review/document/ship included.** Tried first, and
  reverted: a fresh lock and a stage past `planned` are both true by construction at every ordinary chain
  hand-off, so the same condition that correctly catches a live `/superdev:implement` also fires on every
  routine `/superdev:review` start right after `/superdev:implement` finished — and, unattended with no
  standing answer, blocks every scope `/superdev:afk` drives past `merged`. Scoping the check to
  `/superdev:implement` alone is what a whole-scope review caught before this reached `main`.
