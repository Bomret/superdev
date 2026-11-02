---
name: sweep
description: Sweep a repository across code, docs, tests, and config into one merged, ranked report and a single plan-ready intent record. Read-only on the repository.
argument-hint: "[path]"
---

# superdev sweep

## Role and terms

Applies to every start. You chain four read-only surfaces into one **sweep** (CONTEXT.md) of a whole tree, and turn what they find into one plan-ready intent (ADR 0068). You report findings and apply none of them.

- **The swept path**: `$ARGUMENTS` read as a path, or `.`, the whole repository, when it is absent.
- **A leg**: one of the four surfaces §2 invokes. Each runs in the **chained posture** (CONTEXT.md, ADR 0068): it returns its findings and writes nothing.
- **A fact**: a finding checkable against the repository with no room for disagreement. §3 lists which findings are facts.
- **A judgment**: a call about what is worth acting on. §3 lists which findings are judgments.
- **The intent file**: `.superdev/brainstorm/sweep-<date>-<swept-slug>.md`. `<swept-slug>` is the path argument with each `/` turned into `-`, or `all` when the swept path is `.`.

## Read-only on the repository

Applies to every start. Your only writes are the intent file under `.superdev/brainstorm/` and the intent record §5 hands it off as. You change no tracked file, the `.gitignore` included.

## The closing message

Applies to every message this command ends on. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section (ADR 0157).

## 1. Derive the swept set

**The path.** Applies to every start.

- **The path does not exist** → name it and stop. Dispatch nobody.
- **The path exists and holds no files** → say there is nothing to sweep and dispatch nobody.
- **The path exists and holds one or more files** → proceed. A single file is a valid swept set.

**The swept-set statement.** Applies before any dispatch. State the swept path, or "the whole repository", and how each leg reads it, per the table below.

| Leg | What it reads |
|---|---|
| Code | The swept path as standing code, the whole tree at `HEAD`, on a **clean** path (ADR 0068). A path carrying commits against base, or uncommitted changes on it, makes `/superdev:review` review that diff instead; say so when it applies. |
| Tests | The swept path narrows the cost audit's test set and the gap audit's source set. The gap audit still searches the repository's whole test-file list. |
| Docs | Its own fixed set, the doc tree, whatever the path. |
| Config | Its own fixed set, `docs/agents/*.md`, whatever the path. |

**Size caution.** Applies before any dispatch. Glance at the file count under the swept path (`git ls-files -- <path>`, or the whole tree for `.`). Where one pass over any leg would likely miss things, a judgment call and no line count, say so beside the swept-set statement, name what likely goes unread (which subtrees, roughly how much), and point at the path argument for a narrower sweep next time. Proceed with the sweep either way.

## 2. Dispatch the four legs

**The legs.** Applies once §1 proceeds. Invoke each leg with the Skill tool, in the chained posture. `<path>` is the swept path.

| Leg | Invocation |
|---|---|
| Code | `/superdev:review <path> --chained` |
| Docs | `/superdev:document audit --chained` |
| Tests | `/superdev:review-tests <path> --chained` |
| Config | `/superdev:setup check` |

**A degraded leg.** Applies to a leg dispatch the permission classifier denies, or a leg whose own report names its pass degraded. Name that leg **degraded** in §3's report with the reason it gives, the classifier's refusal or the leg's own stated cause, and continue with the remaining legs. Apply `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` report half only, and write no ledger entry: this command holds no run root.

**An empty leg.** Applies to a leg that finds nothing to report. It is no degraded pass: it contributes an empty section in §3, and the sweep continues.

## 3. Merge and rank, attributed by leg

**The report.** Applies once every leg has resolved. Write one report with one section per leg, each naming the command that produced it:

```
### Code — /superdev:review --chained
[relayed verbatim, or "(none)" / "(degraded — <reason>)"]

### Docs — /superdev:document audit --chained
[the reader's findings, most-severe-first, or "(none)" / "(degraded — <reason>)"]

### Tests — /superdev:review-tests --chained
[the cost findings and the gap findings, each ranked and fact/judgment labelled, then the observations, or "(none)" / "(degraded — <reason>)"]

### Config — /superdev:setup check
[the per-document verdicts and seed gaps, or "(none)" / "(degraded — <reason>)"]
```

**Fact and judgment.** Applies to every finding in the report. Sort it by the table below. Facts go straight to §5's intent with no operator confirmation, and judgments go to §4.

| Leg | Facts | Judgments |
|---|---|---|
| Code | none | every finding |
| Docs | every finding | none |
| Tests | every dead-or-ignored-test finding | every other finding, every gap finding included |
| Config | every verdict that names a **drift** or an **absent** document | every seed gap |

A seed gap the config leg lists as `recorded` is a recorded seed deviation and is neither.

**Observations.** Applies to every observation a leg returns with its findings, a defect outside that leg's audit. It is neither a fact nor a judgment, and §4 puts none of them to the operator. §5 carries each one into the intent.

**The ranking.** Applies to the merged judgments. Rank them highest-impact first across all legs: a Critical code finding outranks a minor test-cost one, and an untested trust boundary outranks an untested internal helper. Where two are comparably severe, say so instead of forcing an order.

## 4. Put the judgments to the operator

**No judgments.** Applies when no leg produced a judgment. Skip to §5 with the facts alone, which may also be none.

**The agreement round.** Applies when there is at least one judgment. Make one `AskUserQuestion` call with a single multi-select question listing the ranked judgments, and say in the question text that a ticked box means the operator disagrees with that finding. Every unticked judgment joins the facts in §5's intent, and every ticked one is dropped. A judgment past the round's capacity reaches the intent labelled `unconfirmed`, as `/superdev:review-tests`'s own agreement round does. This command has no `--unattended` mode, so an operator is always there to answer.

## 5. Hand off to plan

**Nothing survives.** Applies when no fact, no surviving judgment, and no observation remain across every leg. Say so and write no file. The Next block names no `/superdev:plan` command and says no command follows.

**The intent.** Applies otherwise. Write the intent file, opening with YAML frontmatter `status: ready`, and take the next free name with a `-2` or `-3` suffix when the name is taken. Hand it off as an intent record by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`, so two sweeps of one swept set on one day leave two records.

- Carry the swept set.
- Carry each fact with its leg and location.
- Carry each surviving judgment with its leg and location.
- Carry every observation with its leg under a labelled `Observations` group.
- Name the degraded and empty legs as such.
- Give every finding and observation the intent carries, the tests leg's included, its finding id by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`'s `## Finding ids`.

**An unignored `.superdev/`.** Applies when the intent is written and `.superdev/` is not in `.gitignore`. Name it in the report as non-blocking.

**The Next block.** Applies once the handoff ends. Name the intent record just written by its store reference:

```
/superdev:plan <record reference>
```

On the handoff's fallback, name the exact file instead, with the date, the slug, and any suffix substituted, and say in the report that the intent exists only in this checkout:

```
/superdev:plan .superdev/brainstorm/sweep-<date>-<swept-slug>.md
```
