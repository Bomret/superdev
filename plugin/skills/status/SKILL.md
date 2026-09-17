---
name: status
description: Report per-scope DAG progress for every superdev run in this repo, from each scope's ledger. Read-only; makes no changes.
model: haiku
allowed-tools: Bash
---

# superdev status

Give a compact, read-only snapshot of every in-flight `/superdev:implement` run in this repo. You never
write, transition, or merge anything here — this is a report, not a control command.

## Run the report

Run, from the repo root:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" status
```

Print its output **verbatim** — `scripts/scope.js` owns the ledger's schema and renders the whole report
(ADR 0022). It scans `.superdev/scopes/*/` for run roots, prints one block per scope (slice tallies, the
run's stage, blocked slices, its degrade record — the ledger's `**Degraded:**` line, per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section — its unresolved-defect
record — the ledger's `**Unresolved:**` line, per that file's `## Unresolved defects` section — and its
deferred-finding record — the ledger's `**Deferred:**` line, per that file's `## Deferred findings`
section), reports an unreadable ledger as `<scope>: ledger unreadable`, and prints `No superdev runs
found in this repo.` when there are none. Do not create `.superdev/` or any file.

Every slice `merged` does not mean the run is done: the scope still has to be reviewed, documented, and
shipped. The stage says which of those already happened, so add nothing of your own — no `complete` note.

A **shipped** scope prints as one line, `<scope>  (shipped)`, with no slice tally and no blocked list. It
is finished with, and `hooks/scope-prune.js` reaps its run root together with its scope branch once the
staleness TTL elapses and that branch is contained in base or gone (ADR 0007, ADR 0053, ADR 0071), so it
is not work in flight. Its degrade
record, unresolved-defect record, deferred-finding record, and staged-page lines are the exceptions and
still print in full: the run root is about to disappear, and the pull-request body is otherwise the only
surviving copy of a pass that ran degraded, a defect the run left standing, or a finding nobody has
planned yet — see below.

A `pending publish:` line means that scope holds **staged pages** — knowledge-base pages
`/superdev:document` wrote but did not send, waiting for `/superdev:publish-kb` (ADR 0023). A shipped
scope can still carry one: the pages go live when a human decides the feature reached its readers, which
is later than the pull request and later than the merge. A block headed `(no ledger)` is staged pages
with no run root — an `_adhoc` doc pass, or a run whose root was pruned.

End with nothing further — no suggested next action, no mutation. If the caller wants to act on a
blocked slice, that's `/superdev:implement` or manual intervention, not this command.
