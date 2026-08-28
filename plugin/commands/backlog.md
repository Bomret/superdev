---
description: Backlog survey — what is planned, stuck, waiting, or unbuilt in the slice store, and what to work on next. Read-only.
allowed-tools: Read, Bash
model: sonnet
---

# superdev backlog

Survey the slice store and show the maintainer what is in it, grouped by **the action each item needs**.
`/superdev:status` reports the runs already started, from their ledgers. This reports the **store**: the
planned, the unplanned, the released, the waiting, and the stuck.

**This survey writes nothing.** No issue, no label, no comment, no file, no `.superdev/` directory. It
answers a question and stops. Acting on a row is `/superdev:plan`, `/superdev:implement`, or a human
decision, in another invocation.

**Its rules are looser than `/superdev:afk`'s, deliberately** (ADR 0049). That command acts unattended, so
it resolves every ambiguity toward doing nothing. This one prints a table, so it resolves an ambiguity
toward showing the row with what it saw. Where the two disagree about one anchor, the maintainer running
`/superdev:implement` on it gets that command's own checks. Share no rule set with it and derive nothing
from its eligibility list.

## 1. Config

Read `docs/agents/issue-tracker.md`. **Absent** → say the slice store is unconfigured, point at
**`/superdev:setup`**, and stop. List nothing and run `/superdev:setup` yourself for nobody: it is an
interview.

That document is where every backend mechanism this command uses already lives. Name no store's own query
here: a call written into this file is right on one backend and blind on the rest.

## 2. Survey the store

Two listings, and the store document owns both.

- **The scope anchors.** Its `## Scope anchor` section states how to list the candidates, how to
  recognise one, how to tell an anchor that is itself a slice, how to list the slices beneath one, and how
  to read an anchor's own dependencies. Follow it.
- **The triage records.** Its `## Triage record` section states the listing call for this backend. A store
  document carrying no such section has none to list, which is an empty set rather than an error. A
  document carrying the section but no `List the records` bullet inside it is a different shape: the
  common one on a consumer configured on 0.38.0 or earlier, since ADR 0046 shipped the section before this
  survey's listing call existed. That is a configuration gap, not an empty backlog — say so in the line
  above the table (§3), naming the remedy: copy the `List the records` bullet from the matching
  `references/issue-tracker-*.md` seed — `/superdev:setup` only rewrites this file on a backend switch,
  not to patch one section in place. Never invent a backend query to fill the gap.

**A listing that fails is not an empty backlog.** The store being unreachable, a token rejected, a
timeout — say which listing failed and what it returned, in one line, and stop. Reporting an empty table
there tells the maintainer the backlog is clear, which is the one wrong answer this command can give.

Resolve the checkout once, not per anchor: the main checkout is the PARENT of
`git rev-parse --path-format=absolute --git-common-dir`, which resolves identically from the repo root
and from inside a scope worktree (ADR 0045 leaves the operator in one for the whole implement chain).
Address every run root by that absolute path — `scope.js`'s `--root` wants one — and note which checkout
the survey read, the same way `references/issue-tracker-local.md` names the branch its own listing read.

List every run root **once**, up front: `<main-checkout>/.superdev/scopes/*/` — a run root is a
directory there holding a `ledger.md` (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live
scope run`). For each, read its stage: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root
<run-root>`. This is the same ledger `/superdev:status` reports from, so the two agree about a scope by
construction; deriving one from git state instead would stop agreeing with nothing to catch it.

Match each run root to an anchor by **scope slug** — the anchor's feature label minus its change-type
prefix (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The change type`) against the run root's
directory name. **Validate a feature label before you match it**, per that file's `## The scope slug`
section, both segments — a label that fails either one gets its row in the `blocked` bucket with the
rename as its act, never a match attempt.

A run root matching no open anchor, whose stage reads short of `shipped`, is a **stranded run**: give it a
row in the `stranded` bucket (§3), the item §5 ranks most expensive — unless its directory name is the
scope slug of a feature label this same survey already gave a `blocked` row for; that row already names
the act, so the run root beneath it earns no second one. A run root matching no open anchor whose stage
reads `shipped` gets **no row at all** — `/superdev:ship` closes the anchor and sets that stage in the
same step, so this is the ordinary end state a finished run sits in until `hooks/scope-prune.js` reaps it,
not a mismatch to report. The reciprocal case — an open anchor whose own run root reads `shipped` — is a
row too; §3 buckets it.

**No open anchor, no triage record, and no stranded run root** → say the backlog is empty, in one line,
and stop.

## 3. Bucket every item

A `## Triage record` section with no `List the records` bullet is a document to fix, not an item: name it
in one line above the table (§2), never as a `needs planning` row.

Each open anchor, each triage record, and each stranded run root lands in **exactly one** bucket. Take the
first that fits, reading down:

| Bucket | What is in it | What it needs |
|---|---|---|
| `blocked` | the anchor carries the store's blocked signal, an open one among the slices its `## Scope anchor` listing returns beneath it does, its feature label fails the scope-slug rule, its feature label matches two or more anchor candidates, or its matched run root's stage reads `shipped` while the anchor is still open — close the anchor | a human, now |
| `stranded` | a run root whose stage is short of `shipped` and matches no open anchor | a human, now — resume the run if its anchor still exists, otherwise delete the branch, worktree, and run root |
| `in flight` | its scope has a run root whose stage is short of `shipped` | the chain command that stage has not reached |
| `waiting` | an anchor dependency it records is unsatisfied | the anchor it waits on |
| `needs planning` | a triage record, or an anchor that is neither itself a slice nor has slices beneath it | `/superdev:plan` |
| `unreleased` | an anchor carrying no release signal (`docs/agents/issue-tracker.md`'s `## Release` section) | a release decision |
| `ready` | everything else: released, no run root, dependencies satisfied | `/superdev:implement <feature-label>` |

**Every open anchor, every triage record the two listings returned, and every stranded run root appears in
the table.** An item you cannot classify is a `blocked` row naming what you could not read about it, never
an item left out — a missing row reads as work that does not exist.

The `in flight` row's act is the chain command its stage has not reached — `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`
and `${CLAUDE_PLUGIN_ROOT}/commands/afk.md`'s `## 3. Take it through the chain` table map a stage to it.
The scope branch is the
feature label verbatim (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`, "The scope branch is the
feature label verbatim"), so a range argument is `<BASE>..<feature-label>` with `<BASE>` from
`git merge-base <base> <feature-label>`, `<base>` read from `docs/agents/code-management.md` (default
`main`).

A scope with a run root is **one row**, carrying its stage. Its individual slices are `/superdev:status`'s
report, not this one.

## 4. Report

One table. Each row: the item's store reference, its title, its bucket, and the concrete next act — a
copy-pasteable superdev command, or the human act in a few words.

```
#368 backlog survey        in flight       reviewed → /superdev:document main..feat/backlog
#412 export formats        ready           /superdev:implement feat/export-formats
#377 rate limiting         waiting         waits on #412
#390 audit trail           unreleased      release it: the `released` label on #390
#402 retry storms          needs planning  triage record → /superdev:plan "retry storms"
#355 search indexer        blocked         label `Search_Indexer!` fails the scope-slug rule — rename it
```

Sort by bucket in the table's own order, then by store reference within a bucket. Print the buckets that
have rows and leave out the ones that do not.

## 5. Recommend one move

End with **one** line: the single thing you would do next, and why in half a sentence.

**Finishing beats starting.** An in-flight scope outranks a `ready` anchor, which outranks a fresh
`/superdev:plan`. A stranded run root is the most expensive item in the backlog: it holds a branch, a
worktree, and a lock, and every day it sits there the base moves further from it. A `blocked` row outranks
all of it when one exists, because nothing else in the table moves until a human clears it.

Recommend one move, not a ranked list. The table is already the ranked list.

## Red flags

- **Writing a store's own query into this file.** The store document owns every call. This command reads
  it.
- **Reporting an empty backlog on a failed listing.** Say what failed.
- **Expanding into `/superdev:status`.** A scope with a run root is one row. Per-slice detail is that
  command's.
- **Inheriting `/superdev:afk`'s defer-on-doubt.** Its skips hide unreleased anchors, undecomposed
  anchors, and triage records. Those are the rows this survey exists to show.
