# 0049: An advisory survey judges the backlog more loosely than an actor

**Status:** Accepted

## Context

`/superdev:afk` §2 already states a full set of rules for reading the slice store: which anchors are
eligible, which are skipped, which are deferred, and how to tell each apart. `/superdev:backlog` reads
the same store, over the same anchors, asking a question that overlaps heavily — what is out there, and
what does each item need. Two documents stating rules over one store is the shape drift-check exists to
catch, and the obvious response is to extract the shared rules into a reference both cite.

The two consumers do not ask the same question, and the difference is not cosmetic.

`/superdev:afk` runs unattended and **acts**. A wrong verdict there costs a stranded run root, a scope
branch nobody expected, or a feature built twice. Its rules are written for that cost: a `404` that could
mean "not visible" as easily as "not there" defers; a missing run lock falls back to the ledger's mtime
rather than being read as no run; an anchor dependency it cannot confirm satisfied defers rather than
proceeds. Every ambiguity resolves toward doing nothing.

`/superdev:backlog` prints a table and stops. A wrong verdict there costs the reader one glance at a row
that turns out to be stale. It has no `--unattended` path, opens no worktree, and writes nothing. Its
readership is a human who is about to make the judgment themselves.

`/superdev:backlog` also reports on what `/superdev:afk` deliberately hides. An unreleased anchor, an
anchor never decomposed, and a triage record are all invisible to afk's selection by design — afk cannot
act on any of them. They are precisely the planning backlog the survey exists to surface. A shared
eligibility reference would have to describe both the acting verdict and the surveying verdict for every
condition, which is two rule sets in one document rather than one.

## Decision

**`/superdev:backlog` states its own rules, and they are deliberately looser than `/superdev:afk`'s.**
The two commands share the *facts* they read from the store — an anchor's open state, its release
signal, its `blocked` label, its recorded anchor dependencies, whether its scope has a run root — and
each reaches those facts through the active `docs/agents/issue-tracker.md`, which is where the single
statement of every backend mechanism already lives. What they do not share is the verdict. `/superdev:afk`
resolves an ambiguity toward deferring; `/superdev:backlog` resolves it toward showing the row with what
it saw.

No shared eligibility reference is written, and no drift row pins the two rule sets to each other. The
store document remains the one place a mechanism is stated once, which is the coupling that actually
matters.

## Consequences

The store documents (`references/issue-tracker-*.md` and the `docs/agents/issue-tracker.md` a repo
configures) stay the single home of backend mechanism, and gain one more consumer. `/superdev:backlog`
reads them exactly as `/superdev:afk` does, so a new backend needs no second integration.

The two commands can disagree about one anchor, and that is intended. `/superdev:backlog` may show an
anchor as `ready` that `/superdev:afk` would defer, because the survey did not repeat afk's careful
confirmation of an anchor dependency. The row is advisory; the maintainer running `/superdev:implement`
on it gets that command's own checks.

A rule that later becomes genuinely shared — identical facts *and* identical verdict, in both
documents — is the signal to revisit this and extract. Nothing here forbids that; it records that the
condition did not hold when `/superdev:backlog` was written.

## Considered options

**Extract the fact-gathering and eligibility rules into a shared reference both commands cite.**
Rejected: the verdicts differ per condition, so the reference would state each condition twice — once for
the actor, once for the surveyor — and the extraction would buy no single statement of anything. It also
risks the stronger failure of the two, an advisory report inheriting afk's defer-on-doubt behaviour and
hiding the very rows a maintainer opened it to see.

**Add `--dry-run` to `/superdev:afk` instead of a new command.** Rejected: afk's eligibility deliberately
skips unreleased anchors, never-decomposed anchors, and triage records entirely, and those are the larger
half of what the survey exists to show. A dry run reports the machine's view of the backlog, which is not
the view that was missing.

**Extend `/superdev:status`.** Rejected: its contract is a verbatim print of `scripts/scope.js status`
with no added judgment and no suggested next action, on `model: haiku` with `allowed-tools: Bash`. It also
reads ledgers only, and is blind to the store. Adding a store survey and a recommendation contradicts
every one of those.

**Implement the survey in `scripts/`.** Rejected: reading the slice store is backend-pluggable prose, and
a script hardcoding one backend breaks the plugin's central rule (`AGENTS.md` → *Backends are pluggable*).

**Name the command `/superdev:next`.** Rejected: every command in the implement chain ends by printing
the next command a scope runs (ADR 0013), so `next` reads as "advance the chain" — the opposite of a
read-only survey that touches no scope. `backlog` names what the command reads, and its `description`
carries the trigger that routes "what should I work on next" to it, which is the only thing the shorter
name bought.
