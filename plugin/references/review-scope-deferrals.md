# Review in scope mode: deferred findings

Applies to a scope-mode `/superdev:review` that holds a finding §4.4 defers to a plan. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` sends it here. `<run-root>` is the value `review-scope-mode.md` names, and a `§` number names that file's step. `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Deferred findings` owns the boundary and the record.

## The triage section

**The section.** Applies before the first deferral write, when `docs/agents/issue-tracker.md` exists. Read its `## Triage record` section. The writes below need the section's presence.

## The deferral writes

**The writes.** Applies to each deferred finding, in this order. Give it this durable home before any ledger write.

1. Read `scope.js get deferred` first, and skip a finding it already reports. That one read guards both writes below, across a later fix cycle and a second `/superdev:review` invocation on the same run.
2. **The store states no `## Triage record` section** (`docs/agents/issue-tracker.md`) → report that, and write only the ledger bullet, with `no triage record — store defines none` in the reference's place.
3. **The store defines one** → list the open records and follow `${CLAUDE_PLUGIN_ROOT}/references/store-records.md`'s *Triage record* rule. On a match the ledger bullet carries the matched record's reference.
4. **No record plainly matches** → create the triage record first, the way the store's `## Triage record` section states. Its body carries the finding, why no Definition of Done criterion covered it, the date, the feature label, the scope branch, the scope anchor's reference, and a copy-pasteable `/superdev:plan "<the finding>"` line, with no pull-request URL because none exists yet.
5. Capture the record's reference, and write the bullet with a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deferred add - --root <run-root>` (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`). The bullet text carries that reference.
6. **The create fails** → the bullet names the failure in the reference's place: `no triage record — create failed`, or `no triage record — create denied` where a permission classifier refused the write. Then leave the scope as it is.

Report a failed create once per run and write the ledger bullet regardless.

## Re-entry

**Re-entry.** Applies to a deferred finding that `final-reviewer` names a guard-rail remedy for at the scope review, attended or unattended alike.

- **The remedy adds no capability** → the finding joins the next cycle's fix list. The dispatch asks the fix implementer for the fixing commit. Resolve the finding by `scope-findings.md`'s `## Deferred findings` procedure, in its order, once that report names the commit and a later re-review no longer lists the finding.
- **The remedy still adds a capability** → the finding stays deferred.
