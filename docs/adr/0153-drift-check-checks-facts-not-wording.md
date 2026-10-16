# 0153: drift-check checks facts, not wording

**Status:** Accepted

**Supersedes:** [ADR 0061](0061-the-check-narrative-keys-on-check-id-not-ordinal-position.md).

**Amends:** [ADR 0097](0097-a-guard-rail-remedy-stays-in-the-fix-loop.md), whose guard-rail remedy list
names a new row in an existing drift contract table.

## Context

`drift-check` grew to 174 registered checks and 248 contract tables, 12,819 lines under
`scripts/drift/`. Most of the checks pin how a clause is worded in one or more skills, agents, or
references. Rewording such a clause fails the check, so the prose change also needs a contract-row
edit. Between 2026-08-14 and 2026-10-14, 88 of 111 commits that changed `plugin/skills`,
`plugin/agents`, or `plugin/references` also changed `scripts/drift/`. In the same window the drift
code changed by more lines than all of `plugin/`. The checks' narrative took about 2,800 of the 3,602
lines of `scripts/AGENTS.md`, and the `narrative-coverage` check required it to grow with every check.
70 of the 144 invariant register entries named a drift check as their `Check:`.

The cost is authoring time, review weight, and agent turns. Run time is small: `drift-check` takes under
a second and its `--selftest` about 22 seconds. The maintainer judges that most drift failures reported
a stale pin, not a product defect. That judgment is not measured.

## Decision

A drift check tests a mechanical fact or forbids a form. A mechanical fact is a link or section target
that resolves, a number that is unique, a file or command that exists, or a property of code or
configuration. A forbidden form is text that shipped prose must never contain, such as a force-merge
option or a commit to the base branch. A check that asserts how a positive clause is worded is not
kept and not added. A comment is wording, so a check that compares a value with a comment is not kept.

The structural checks and the prohibition scans stay, each with its own selftest cases. Every other
check is deleted with its contract tables, scanner code, and selftest cases. `narrative-coverage` is
narrowed to an id fact: every registered check has one row in the `scripts/AGENTS.md` table, and no row
names an unregistered id. A surviving check fails when a document it reads is missing, which replaces
`pinned-paths`.

An invariant register entry whose check is deleted is retired when its statement only says that
documents agree on a clause. An entry that states a rule about what the system or a command does stays,
and names a surviving check, a test suite, or `final-reviewer`'s invariant-compliance judgment as its
enforcement. A citation of a retired id is removed from every document except the ADRs and the
changelog.

The fix loop's guard-rail remedies (ADR 0097) are a case in an existing test suite, a case or row for
an existing drift check, or a prose fix.

## Considered options

- **Delete the whole suite.** The simplest result. Rejected because the structural checks are cheap,
  rarely change, and catch real breakage such as a dead reference or a duplicate ADR number.
- **Freeze the suite and add no new pins.** It keeps all the code and the documentation weight, and
  relief comes only as pins break and are deleted one by one.
- **Convert the pins into behaviour tests.** Prose has no behaviour to test. Testing what prose
  achieves is the A/B harness ADR 0129 removed.

## Consequences

- A reworded clause fails no drift check unless it breaks a link, removes a section a reader is sent
  to, or writes a forbidden form. A contract that reads differently in two documents is caught by
  review, or not at all.
- Some code-to-configuration facts lose their check, among them `verb-pointer`.
- The invariant register shrinks. Its remaining entries are rules a reviewer applies, and more of them
  rely on `final-reviewer`'s invariant-compliance judgment instead of a mechanical check.
- ADR text that describes a drift row pinning a decision stays as history. The row it names may no
  longer exist.
