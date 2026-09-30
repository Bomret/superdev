---
name: sweep
description: Sweep a repository across code, docs, tests, and config into one merged, ranked report and a single plan-ready intent. Read-only end to end.
argument-hint: "[path]"
---

# superdev sweep

Chain four read-only surfaces into one pass over the repository, and turn what they find into a single
plan-ready intent (ADR 0068). Where `/superdev:review` resolves a range, a **sweep** (CONTEXT.md) reads a
whole tree, which is what lets it see a property of a pair — a redundant implementation, a fact stated
twice — whose covering half no range is guaranteed to contain.

**Outside the chain.** implement → review → document → ship never reaches this command, the standing shape `/superdev:backlog`, `/superdev:prose-check`, and
`/superdev:review-tests` already hold.

**Read-only end to end.** Every leg it dispatches is itself read-only, and it dispatches each in the
**chained posture** (CONTEXT.md, ADR 0068): a leg returns its findings and writes nothing. Its own only
write is the intent under `.superdev/brainstorm/`.

## 1. Derive the swept set

`$ARGUMENTS`, if present, is a **path**. Absent → `.`, the whole repository.

- **The path does not exist** → name it and stop. Dispatch nobody.
- **The path exists and holds no files** → say there is nothing to sweep and dispatch nobody.
- **The path exists and holds one or more files** → proceed; a single file is a valid swept set.

**State the swept set before any dispatch**: the path (or "the whole repository"), and which legs it
narrows. The path reaches `/superdev:review` and `/superdev:review-tests`, whose own `[path]` argument
narrows what they read — the code leg reads that path as standing code, the whole tree at `HEAD`, only on
a **clean** path (ADR 0068): a path carrying commits against base, or uncommitted changes on it, makes
`/superdev:review` review that diff instead, and the swept-set statement says so when it applies. `/superdev:document audit` and
`/superdev:setup check` take no path — each reads its own fixed set (the doc tree, `docs/agents/*.md`)
regardless, and the swept-set statement says so, so the operator knows the scope is uneven across the
four legs rather than discovering it in the report.

**Size caution (qualitative, non-blocking)**, `/superdev:review`'s own rule applied to a tree instead of a
diff: glance at the file count under the swept path (`git ls-files -- <path>`, or the whole tree when the
path is `.`). If it is large enough that one pass over any leg would likely miss things — a judgment
call, not a line count — say so alongside the swept-set statement, **name what likely goes unread** (which
subtrees, roughly how much), and point at the path argument for a narrower sweep next time. Proceed with
the sweep anyway; never block on it.

## 2. Dispatch the four legs

Invoke each with the Skill tool, in the chained posture:

| Leg | Invocation |
|---|---|
| Code | `/superdev:review <path> --chained` |
| Docs | `/superdev:document audit --chained` |
| Tests | `/superdev:review-tests <path> --chained` |
| Config | `/superdev:setup check` |

`<path>` is §1's swept path — `.` when none was given. The docs and config legs carry no path, per §1. The
code leg's `--chained` (ADR 0068) is what keeps it read-only regardless of the invoking checkout's `HEAD`:
it runs no `git add -N :/` and never enters scope mode, so the write paths scope mode opens — the run-lock
refresh, the `**Degraded:**` ledger entries, the remote-anchor snapshot, the fix loop's commits — are
foreclosed by construction rather than by a guard on this command.

**A leg dispatch the permission classifier denies, or a leg whose own report names its pass degraded** —
name that leg **degraded** in §3's report, carrying whatever reason it gives (the classifier's refusal, or
the leg's own stated cause), and **continue with the remaining legs**. This command holds no run root of
its own — it sits outside the implement chain (ADR 0068) — so
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section applies the way
`/superdev:review-tests` already applies it to its own no-run-root case, borrowing only that section's
report-and-no-ledger-entry half: report the degraded pass in this output, and write no ledger entry —
there is no ledger. Never let one leg's denial stop the sweep; a merged report over three legs is worth
more than no report at all.

**Every leg still resolves independently.** A leg finding nothing to report is not a degraded pass — it
contributes an empty section in §3, and the sweep continues exactly as it would with findings.

## 3. Merge and rank, attributed by leg

One report, one section per leg, each naming which command produced it:

```
### Code — /superdev:review --chained
[relayed verbatim, or "(none)" / "(degraded — <reason>)"]

### Docs — /superdev:document audit --chained
[the reader's findings, most-severe-first, or "(none)" / "(degraded — <reason>)"]

### Tests — /superdev:review-tests --chained
[the ranked findings, fact/judgment labelled, or "(none)" / "(degraded — <reason>)"]

### Config — /superdev:setup check
[the per-document verdicts, or "(none)" / "(degraded — <reason>)"]
```

**Split fact from judgment, the same split the test leg already applies to itself.** A **fact** is
checkable against the repo with no room for disagreement: every doc-leg finding (the doc-reader grounds
each claim against the repo before it reports it), every config-leg verdict that names a **drift** or an
**absent** document (a named command or fact either still resolves or it doesn't, and a document the repo
never wrote is exactly as checkable as one that drifted), and the test leg's own dead-or-ignored-test
findings. A **judgment** is a call about what's worth doing something about: every code-leg finding, and
every other test-leg finding. Facts need no operator confirmation and go straight to §5's intent.
Judgments are what §4 puts to the operator.

**Rank the merged judgments**, highest-impact first across all legs — a Critical code finding outranks a
minor test-cost one; where two are comparably severe, say so rather than forcing an arbitrary order.

## 4. Put the judgments to the operator

**No judgments at all, across every leg** → skip straight to §5 with the facts alone (which may also be
none).

Otherwise, **one `AskUserQuestion` call, asked as a single multi-select question**, the merged judgments
ranked highest-impact first, where **a ticked box means the operator disagrees** with that finding — say
that in the question text. Every unticked judgment joins the facts in §5's intent; every ticked one is
dropped. **Findings past that round's capacity** reach the intent labelled `unconfirmed`, exactly as
`/superdev:review-tests`'s own agreement round already does — `/superdev:plan`'s own interview is the
second gate, so an unasked finding is deferred rather than lost. This command carries no `--unattended`
mode of its own, so an operator is always there to answer.

## 5. Hand off to plan

**No fact and no surviving judgment, across every leg** → say so, write no file, and print no handoff.

Otherwise, write the survivors as a plan-ready intent under
`.superdev/brainstorm/sweep-<date>-<swept-slug>.md`, the same git-ignored scratch location
`/superdev:brainstorm` and `/superdev:review-tests` already use. `<swept-slug>` is §1's path argument with
each `/` turned into `-`; a whole-repository sweep (no path argument) uses `all`. Two sweeps of different
paths the same day then write to different files instead of colliding on one; two sweeps of the same
swept set the same day still resolve to the same filename, and the second overwrites the first, including
the operator's own agreement-round answers.
**This intent is the run's only write, and it changes no tracked file** — `.superdev/` not yet in
`.gitignore` is named in the report, non-blocking, rather than fixed: those two commands own that fix on
their own runs, and this one stays read-only on every tracked file, the `.gitignore` included. Carry the
swept set, each fact with its leg and location, each surviving judgment with its leg and location, and the
degraded/empty legs named as such.

Then print the handoff with the date and the slug resolved — substituted, not literal placeholders —
naming the exact file just written:

```
/superdev:plan .superdev/brainstorm/sweep-<date>-<swept-slug>.md
```

## Red flags

- **Applying a finding.** This command reports. `/superdev:plan` is where one becomes work.
- **Aborting the whole sweep on one denied or degraded leg.** Name it, and merge the rest.
- **Asking about a fact.** A grounded doc claim, a config drift verdict, and a dead-or-ignored test are
  checkable, not a matter of taste — they reach the intent directly.
- **Editing a tracked file, the `.gitignore` included.** The intent under `.superdev/brainstorm/` is the
  run's only write.
