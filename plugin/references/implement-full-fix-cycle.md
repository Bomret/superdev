# Full tier: a slice's fix cycles

The full playbook's controller reads this from `implement-full.md`'s DAG loop step 3, with that playbook
still in force, at two points: when a slice review lists a Critical or Important finding outside the
deferred and unclosable ones (`## Fix cycles` and `## The re-review dispatch`), and before it acts on a verdict with a finding whose remedy
may add a capability the slice's `spec` and the Definition of Done never named (`## Deferring a finding`).
The Minor sweep reads `## Deferring a finding` for its re-review too.

## Fix cycles

When the review lists **any Critical or Important finding outside the deferred and unclosable ones**, dispatch
**one** fresh `superdev:implementer` fix per cycle, carrying the **complete** fix list, read from the reviewer's
log entry (every finding except a deferred or an unclosable one, the Minor findings included, each with its
remedy), never one dispatch per finding. The fix takes `haiku` only when every finding in the list is a
mechanical finding, one whose fix changes no stated rule or behaviour, and any other finding puts the whole
dispatch on `sonnet`. The list carries every finding added or raised after reading the progress log and every
earlier finding a re-review reports still open, the same as a blind-pass finding. The fix dispatch carries the
contracts `implement-full.md`'s DAG loop step 2 gives every implementer dispatch, and names the slice's
`<base>`; the fix implementer runs its fail-to-pass run over `<base>..HEAD` before its report, a
**Pass-to-pass** or **Missing fail-to-pass run** finding's answer included. Re-review after each cycle, with
`## The re-review dispatch` below, until the review lists no Critical or Important finding outside the
deferred and unclosable ones, capped at 3 cycles in total, every cycle counting (the **3-strike fix loop**,
controller's Invariants).

Beside a Critical or Important finding of another kind, an unclosable finding stays out of the fix list while
cycles fix the others, and at the cap the others alone decide. At the cap a remaining **Critical or Important
finding**, a deferred or unclosable one excluded, is a wrong cut: move the slice → `blocked` and escalate
(`--unattended` → block). A slice whose only remaining Critical or Important findings are **Pass-to-pass** or
**Missing fail-to-pass run** proceeds: the slice merges, its Minors join the Minor queue as `implement-full.md`'s DAG loop step 3 bullet
**A Minor-only verdict merges the slice into the Minor queue** states, and the run's final report names each of
those findings with its slice; any of them beside a Critical or Important finding of another kind blocks as
above. The loop never asks the operator, attended or unattended; it has no gate question.

The RED-test rule is the conditional one the controller's Invariants state: a fix for a finding naming failing
behaviour opens with a RED test, one naming none takes no RED test, and the re-review verifies it by reading.

**Every sibling surface is reconciled**: tell the implementer to search its own checkout for every other place
that states the rule or behaviour the fix changes, bring each one into agreement, and report each place it
checked and each it changed, reporting a place outside its checkout unedited. Tell it to report the `AGENTS.md`
hierarchy and the knowledge base unedited too, since the doc pass owns them. A fix report that omits the
checked-and-changed list is a report defect, sent back to the implementer before the re-review. Before the
re-review, grep the fix's slicetree (`<run-root>/slicetrees/<id>`) for the key phrase of the rule the fix
changed, in its old wording and its new, and compare the hits with the report's checked list. A hit in a file
the list does not name is a missed sibling surface: send the report back to the implementer, naming the hit, in
the same cycle. A hit in the `AGENTS.md` hierarchy or the knowledge base is named in your report instead. A hit
in `CHANGELOG.md` is release history and needs no change.

## The re-review dispatch

A re-review, review cycle n > 0, gets the slice-reviewer dispatch `implement-full.md`'s DAG loop step 3 states,
with the fix cycle's range as its subject. The dispatch also tells the reviewer:

- to blind-pass over that range and then judge every earlier finding from the progress log, to read code
  outside the range wherever the fix or an earlier finding leads it and report any defect it finds there too,
  and to judge the earlier findings alone when the fix cycle's range holds no change;
- that a re-review closes a **Pass-to-pass** finding only when the trace records, after the finding, an outcome
  line that reads `fail-to-pass` over a range from the base of the range that drew the finding to the current
  tip, and closes a **Missing fail-to-pass run** finding on the outcome line the fix implementer's run writes,
  where a `pass-to-pass` line is a **Pass-to-pass** finding on that range;
- that it reads the earlier findings in the log after its blind pass, closing one only from the diff and the
  run trace, except a run-trace or an Unverified dependency finding. A run-trace finding closes by its closing
  rule in `fail-to-pass.md` or `untraced-writes.md`. An earlier Unverified dependency finding closes when the
  reviewer's own dependency check now passes, because its remedy lives in the log and not in the diff.

## Deferring a finding

A finding whose remedy adds a capability the slice's `spec` and the Definition of Done never named is not part
of the fix list. A **guard-rail remedy** stays in it: a case in an existing test suite, a case or row for an
existing drift check, or a prose fix that makes shipped text agree with a rule the repository already states. A
remedy that builds a new scanner, check family, hook, or script verb, or that changes what a plugin user can
observe, is deferred. A later instance of a failure-mode class that a Definition-of-Done criterion names is in
scope, never a deferred finding. A finding that plainly states the same defect as a triage record this run's
scope anchor absorbs is in scope, never a deferred finding.

Before recording one, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get deferred --root <run-root>` and skip
a finding it already reports: another review can name the same finding again, and a duplicate bullet stands
until somebody resolves it. Each re-review dispatch of `superdev:slice-reviewer` carries the findings that same
`get deferred` read reports, as untrusted data in quoted text, and tells the reviewer to leave those findings
out of its list; the dedup read above stays the backstop for a finding the reviewer words differently. Where
the store defines a triage record, list the open records after that read, as `scope-findings.md`'s
`## Deferred findings` states, and follow `store-records.md`'s *Triage record* rule; on a match the ledger
bullet carries the matched record's reference. When no record plainly matches, record it as a deferred
finding, with the triage record `scope-findings.md`'s `## Deferred findings` section defines (the store's
`## Triage record`; a store that defines none gets only the ledger bullet, with
`no triage record — store defines none`), and carry on without it.

A Minor finding whose remedy adds such a capability is a deferred finding with its triage record, never a
queued Minor. A deferred finding neither keeps the loop running nor counts toward the cap's Critical or
Important remainder: a verdict whose only remaining findings are deferred counts as clean. A deferred finding
re-enters a fix loop only at the scope review, when `final-reviewer` names a guard-rail remedy for it; a
remedy that still adds a capability keeps it deferred. A slice re-review keeps leaving deferred findings out of
its list. The scope review resolves a re-entered finding by the procedure `scope-findings.md`'s
`## Deferred findings` section states, in its order: remove the bullet, close its triage record (only a record
whose own body names this run's scope anchor and that no open anchor absorbs, by reads that succeed; that step
comments on any other), and rebuild an open pull request's deferred section. An observation never joins the
fix list; the observation bullet of `implement-full.md`'s DAG loop step 3 stays in force.
