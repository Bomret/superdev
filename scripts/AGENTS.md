# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`.
The shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js`
(the knowledge-base section merge, ADR 0027), `publish-kb.js` (the backend-independent half of publishing a scope's staged
knowledge-base pages, ADR 0069), `profile.js` (the run profile, ADR 0103), and `md-to-storage.js` (the markdown to Confluence `storage` conversion
`publish-kb.js` requires, ADR 0109). The maintainer-only ones live here in `scripts/`: `drift-check.js`
(the cross-document contract checks), `invariant-check.js` (the invariant register validator,
ADR 0093), and `run-tests.js` (the suite runner behind `bun run test`). This doc owns them all regardless of which dir each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack, the working rules, and the release flow.

## Local Contracts

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the ledger's schema and is the only `ledger.md` read and write path in the chain:
`init`, `stage set`, `slice`, `degraded add|add-denial|reset-denials`, `unresolved add|clear`,
`deferred add|resolve`,
`docs set <value>|clear`, `pr set <n>|clear`,
`deploy set <target> pending|deployed|failed [--exit <n>]`, `deploy get`,
`suite set <green|red|denied|none> <sha> [--whole]`,
`suite reusable --branch <b> [--whole]`,
`base set <sha>`, `base resolve --branch <b> --base <ref>`,
`get stage|branch|anchor|slices|unresolved|degraded|deferred|denials|docs|pr|suite`,
`status` (which renders the whole `/superdev:status` report), `trace [--slice <id>]` (prints the run trace, read-only), `publish`, `adopt`, `root <slug>`,
`staging <scope> [--count]`, `collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]`, `dod-line`, `fail-to-pass <base>..<tip>`, and `test`.
`--help` or `-h`, alone or after any verb, prints the usage and exits 0, except that a flag's value, or the bullet text after `add` or `add-denial`, is data and never a help request. It is checked before any verb
reads stdin or touches a ledger, so a stdin verb such as `dod-line` never waits on input for it.
`suite set` writes the **suite record** (CONTEXT.md) — the last full-suite run's result and the commit
it ran on, as `**Suite:** <result> @ <sha>` — refusing a sha that does not resolve to a commit in the
repository; `get suite` prints `<result> <sha>` back, or nothing on a ledger with no record (INV-0017).
`suite reusable` is the read half of that same reuse rule: it exits 0 (printing `reusable`) when the
record is `green`, the run trace backs the recorded commit, and `<branch>`'s tip is that commit, and
refuses (exit 1) otherwise, an unrecognized argument included. No slice store commits its own records on
the scope branch (ADR 0110), so a commit since the record counts. The one exception is a Markdown-only
range (ADR 0128): the recorded commit is an ancestor of the tip, every path changed since ends in `.md`
and is no test path and not `docs/agents/verification.md`, and the run trace shows the latest test run at
the tip passed on a clean tree with no failed full or whole run there. The test paths come from the tip
commit's `verification.md`, through `isTestPath`, the classifier `hooks/run-trace.js` also calls. A
refusal on a moved tip names the condition that failed after `predates tip`.
`base set` writes the `**Base:**` header, the remote base tip the base step merged into the scope branch,
as a full commit, refusing a sha that does not resolve. `base resolve` prints the scope's range base: the
newer of `merge-base(<ref>, <b>)` and the recorded tip, the tip counting only when it resolves and is an
ancestor of `<b>`, and the merge-base alone when no usable record exists or neither candidate holds the
other (ADR 0120). Both flags are required: no verb defaults the base. `publish` carries the header and
`adopt` rebuilds it, as they do `**Suite:**`.
`degraded
add-denial` prefixes its bullet `denied: `, which is what separates a denied verification dispatch from
the other degraded shape sharing that line, and `get denials` counts those prefixed bullets — the number
an unattended run caps at two (ADR 0041). `degraded reset-denials` appends a bullet prefixed
`denials reset: `, and the count runs from the last such marker, so a human who addressed the cause
returns the whole budget while every recorded denial stays on the line (ADR 0044). Both prefixes are
structural, so plain `degraded add` refuses a text beginning with either and names the subcommand that
owns it. `get degraded` prints every bullet whatever its prefix, prefixes intact.
`unresolved add -`, `deferred add -`, `deferred resolve -`, `degraded add -`, `degraded add-denial -`, and `degraded
reset-denials -` — the sole word `-` past the subcommand — read the
bullet text from stdin, one trailing newline stripped, instead of a shell-interpolated argument
(`references/dod-ticks.md`, triage #680); a classifier's own refusal (`add-denial`) or an operator's own
reason (`reset-denials`) can carry a quote just as easily as any other bullet text. Any other shape of
these subcommands' own arguments keeps joining its
positional words with spaces as it always has.
Every verb that writes the ledger appends one `ledger` line to the run trace after its write succeeds, through
`appendTrace(runRoot, event)`, the single writer of `trace.log` (ADR 0117); no verb takes a caller-chosen event.
It also exports `readLedgerHeader` as a module
API. This per-header ledger-line reader is what `hooks/scope-prune.js` and `hooks/slicetree-sweep.js`
both use instead of carrying their own regex. `hooks/scope-prune.js` takes a second export off the same
`require`, `baseHistoryHasPatch` — the containment probe (ADR 0082) — and the two fall back
differently: the reader missing stops that hook's sweep outright, while the probe missing narrows its
containment test back to the tree comparison alone, silently. The API guards its CLI entry with
`require.main === module`, so a `require` for that reader alone runs no CLI code. `profile.js` takes
`mainWorkTree`, `SLUG_RE`, and `CHANGE_TYPES` off the same `require`, so the run profile resolves the
main working tree and reads a feature label by the same rules the ledger does. `base set` appends a `ledger`
trace event like every other ledger-writing verb. Normalisation is per
header: `Stage` and `Branch` are single tokens,
cut to the first whitespace-delimited token and stripped of markup and trailing punctuation.
`Anchor` is a prose title that reaches a pull request, trimmed and otherwise left alone. An empty
header line reads as absent, not as an empty string. Both `readLines` and `readLedgerHeader` split
on `\r?\n`. A `ledger.md` an editor or `core.autocrlf` wrote with CRLF line endings reads exactly as
an LF one does. A lone `\r`, the classic-Mac line ending, reads as absent, and that is deliberate.
Any verb that writes the file normalises it back to LF. A scope whose ledger stage reads `shipped` or `closed`
collapses to one line, `<scope>  (shipped)` or `<scope>  (closed)`. It drops the slice tally and the blocked list.
`hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so per-slice detail is no longer
work in flight. Its `**Degraded:**` line, its `**Unresolved:**` line, its `**Deferred:**` line, and its
staged-page lines survive the collapse, because each is otherwise recorded nowhere else. `deferred add`
carries no `clear` counterpart: a defect stops being true once a run re-verifies the scope green, while
unplanned work stays unplanned until somebody plans it (ADR 0035). `deferred resolve` removes one finding
the same run fixed after all (ADR 0121). It matches the exact bullet text, removes every identical bullet,
drops the line once none remain, and refuses text that matches no bullet, leaving the ledger unchanged.

`root <slug>` is a verb that touches no ledger (ADR 0080). It resolves and prints a run root's
absolute path — `<main-worktree>/.superdev/scopes/<slug>`, where `<main-worktree>` is the parent of
`git rev-parse --git-common-dir`, or the checkout that directory's `core.worktree` names inside a submodule
(never the superproject's `.git/modules`) — so it takes no `--root` of its own. `mainWorkTree` is the one
resolver; `publish-kb.js` and `hooks/run-trace.js` call it. The result is identical whichever
checkout it runs from: the invoking checkout, a scopetree, or a slicetree of the same repository, which is
what lets every prose caller resolve `<run-root>` the same way regardless of its own cwd. It refuses
outside a git repository, and refuses a slug carrying a path separator or a leading `.`, since either
would path a ledger read or write outside `.superdev/scopes/`.

`collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]` reads git and touches no
ledger and no run root (ADR 0126, INV-0134). It prints one line per numbering collision: an ADR number,
in one directory named `docs/adr`, or an invariant id in `docs/invariants.md`, that the branch added since
the range base and the base already holds under another path. A file renamed into a number counts as
added. A base ADR at the same number is no collision only when the range base held that path and the
branch no longer does, because the scope renamed or replaced it; a file the base renamed or added is a
different ADR, so one ADR renamed to two paths, one on each side, collides. An invariant entry whose text
is identical on both sides is no collision. Paths are read NUL-separated, so a non-ASCII slug survives.
Each line carries the next free number, above every number that home carries on the base, the branch,
and every `--also` ref, so two collisions never receive one number. Callers pass `--also` only for each
other live run whose scope branch resolves. The verb renames and rewrites nothing, because a citation of
the base's ADR and one of the scope's read the same. The verb exits 0 when nothing collides and 1 when something does.
It exits 2 when a ref resolves to no commit, a flag is missing, given twice, or lacks a value (or its value starts with `--`), or git fails.
A caller never reads a failed check as no collision. The base step and `/superdev:ship` §4 call it before they merge the base. `findCollisions` is
exported for `tests/scope.test.js` alone.

`staging <scope> [--count]` is another verb that touches no ledger and needs no run root (ADR 0119). It
prints a scope's staging directory, `<main-worktree>/.superdev/kb-pending/<scope>`, resolved the same way
`root` resolves a run root, so a page staged from a scopetree or a slicetree lands in the main working
tree and survives that checkout's removal. It accepts `_adhoc`, and refuses what `root` refuses, outside a
git repository included. `--count` prints the number of `.md` pages in that directory instead, `0` when
it is missing. The staged-page scan behind `status` resolves its staging root through the same main
working tree.

`test full|whole`, `test focused [<path>…]`, and `test -- <command>` run a test command in bash and append one
`run` line carrying the command's own exit status, an **Observed run** (CONTEXT.md, ADR 0127, INV-0117). The verb
streams the command's output and exits with its status. `full`, `focused`, and `whole` run the command
`docs/agents/verification.md` configures, as written; `focused` substitutes its shell-quoted paths for `{paths}`
and, given none, runs the full command and records `full`. `--` runs a command that `hooks/run-trace.js`'s
`testRuns` classifies as exactly one test run, and records the kind and files a direct run records. A status the
command shape hides from the test, such as a pipe without `pipefail`, records `unknown`. A command that classifies
as no test run, or a kind with no configured command, is refused and nothing runs. The verb reads the run root,
slice, commit, and tree state when the command starts, and appends the line when it finishes. A run during which
HEAD moved, the tree was dirty at either end, or the trace recorded an edit, revert, or restore for the slice
during the run records `dirty`, so it never backs `suite reusable`. A change no hook records shows only at the two ends. A command ended by a
signal, or a verb killed first, writes no line, and the command's process group dies with the verb (a watcher
process covers `SIGKILL`). A failed trace write prints a note on stderr and leaves the exit status unchanged.
Outside every run tree the command runs and nothing is written. So does a command that `cd`s out of every run tree:
`hooks/run-trace.js`'s `outsideTree` classifies the `cd` target against its repository top. The verb takes no option that sets an outcome,
kind, slice, or tree state. It requires `hooks/run-trace.js` at call time for `locate`, `testRuns`, and
`treeState`, and `scope.js` assigns its exports before `main()` runs so that hook's own require finds them.
`hooks/green-gate.js` writes its own suite-run line through `scope.js`'s `appendTrace`, taking `locate` and
`treeState` from `hooks/run-trace.js` under that hook's bounded git probe (`GIT_BOUND_MS`), so both attribute a run
to the same tree. `hooks/run-trace.js` records no run for a Bash command that runs `scope.js test`, and still evaluates the Missing
RED note after a foreground call.

`fail-to-pass <base>..<tip>` runs a commit range's tests twice and reports whether they discriminate
(CONTEXT.md **Fail-to-pass run**, ADR 0134, INV-0139). It creates a throwaway worktree detached at `<tip>`. In a run
root the worktree sits beside `slicetrees/`, outside every tree the run trace attributes a run to. Outside a run root it
sits under `.superdev/`, which the verb git-ignores first through the repository's `info/exclude`. The command and the
test paths come from `<tip>`'s own `docs/agents/verification.md`. The verb runs the focused command over the range's whole
changed-path set where the focused command carries `{paths}`, and the full command otherwise.

The first run is against the changed code and must pass. The verb then resets and cleans the worktree. The verb puts
every changed file outside the test paths back as that file stood at `<base>`, and commits the put-back on the detached
HEAD. The verb runs the command again and bounds that second run at 10 times the first run's duration, measured in the
same invocation (INV-0009). The verb refuses a range that changes no file and a range that changes only test files,
because nothing is put back.

The outcome is `fail-to-pass` when the second run fails, and `pass-to-pass` when it passes. It is `unknown` when the first
run fails, and when the second run is killed at its bound or ended by a signal. No reviewer reads `unknown` as a verdict,
and no gate reads it as green.

Inside a run root the verb appends one `fail-to-pass` trace line, `<base>..<tip> <outcome> <reason>`. Its slice is the
ledger row that records exactly that range, else the slice the run's directory attributes to, else `scope`. The line is no
`run` line, so it satisfies no Missing RED step and moves no suite record. The scope run's first `unknown` draws a stderr
note that tells the controller to capture an observation (`references/scope-mode.md`, `## Observations`).

The verb exits 0 when it read an outcome and 1 on a refusal or an error. It exits 2 when no test command is configured, so
nothing ran, and 128 plus the signal number when interrupted. An interrupt ends the command's process group, and a watcher
process covers `SIGKILL`, so no worktree outlives the verb. A suite that outlasts the Bash tool's time limit runs the verb
in the background (`references/test-selection.md`).

`dod-line` is another verb that touches no ledger, and makes no store call of its own
(`references/dod-ticks.md`, INV-0014, triage #664): `--match <criterion text>|--match-file <path>
--verdict met|not-met|ceiling|accepted --note <text>|--note-file <path> [--line]`. It is the one
Definition-of-Done checklist-line edit every store's own `## Definition of Done ticks` section cites
instead of restating by hand — a store seed fetches the checklist text through its own call, runs
`dod-line` on it as the producer in its gated **Edit an issue's body** rule, and writes back what comes
out on stdout only when `dod-line` exited 0 with non-empty output (ADR 0115), the same shape `kb-patch.js`
already gives a staged knowledge-base patch (ADR 0027). `--match-file`/`--note-file` are each an
alternative to `--match`/`--note` that reads the same text from a file instead of a shell-interpolated
argument, one trailing newline stripped verbatim otherwise — the text a controller pipes in this way is
typically report-derived, and may carry a quote, a backtick, a `$(`, or worse (`references/dod-ticks.md`,
triage #680); giving both forms of the same argument refuses. The verb writes the verdict's own label, so a note that
already opens with that label (`met: …` under `--verdict met`) loses that one prefix and carries the label
once. A note opening with any other verdict's label is note text and stays as given. The default mode takes a whole markdown
body on stdin and prints the transformed body; `--line` takes and prints exactly one checklist line
instead, for the Jira seed's ADF text node, which is JSON, not markdown lines. A checklist line is `- [ ]
<criterion>[ — <tag>][ — <verdict>: <note>]` (`plan-contract.md`'s line format) — the tag absent on a
single-slice feature's own DoD, a run predating tagging, or one untagged line inside an
otherwise-tagged DoD; `--line` mode accepts the same line with no leading `- `, the shape a Jira text
node's own string carries. The tag — slice ids (`01`, `01, 02`), store refs (`#667`, `#672, #673`), or the
literal `scope` — and any verdict note past it are parsed off the line's *right* end, greedily handing
everything before that to the criterion, which is what keeps a criterion carrying its own " — "
(`plan-contract.md`'s own worked example, "Reachable: none — entrance unchanged; … — scope") intact
instead of splitting at its first dash. An untagged criterion that merely ends in something shaped like a
tag (`- [ ] Retries capped — 3`) offers a second reading alongside the rightmost-tag one — the whole line,
untagged — and a line matches when either reading's criterion equals `--match` (triage #679); a genuinely
tagged line still parses its tag as before. The same offer reaches a line that already carries a note
(`- [x] Retries capped — 3 — met: e`), so a re-judge against the same untagged criterion still finds it —
a line offering two readings still counts once toward the match limit below. Matching runs after both the line's own criterion text and
`--match` collapse internal whitespace to one space and trim, so a criterion an editor reflowed onto two
lines is still found, and after `kb-patch.js`'s own `maskFencedLines` blanks every fenced line, so a line
shown inside a fenced illustrative example is never a candidate. Body mode further scopes matching to the
body's own `## Definition of Done` section — the heading whose text starts "Definition of Done," up to
the next heading of the same or a higher level — when one exists, so an identical checkbox elsewhere in
the same document is never a candidate; a body with no such heading matches over the whole body, as a
single-slice feature's own acceptance-only checklist does (triage #679). `met` renders `- [x] <criterion>
— <tag> — met: <note>`; `not-met`, `ceiling`, and `accepted` each render `- [ ]` with
`not met:`/`ceiling:`/`accepted:` — the marker is derived from the verdict alone, so a same-verdict
re-write always leaves it unchanged, and the new note always replaces whatever note the line carried
(INV-0014's own note rule, never appended beside it). `accepted` is an operator's own decision that an
unmet criterion stands accepted as unmet (ADR 0095) — the box stays unticked, since the criterion is
honestly unmet. Refuses, printing nothing, on zero matching lines, on two or more (which one to edit
cannot be resolved — a line offering two readings counts once), on a `--verdict` outside the four named
values, on a missing `--match`/`--match-file` or `--note`/`--note-file`, or on both forms of the same
argument given together.

`init` writes a fresh ledger at stage `planned` (ADR 0079) — the one stage that precedes the four-command
chain rather than naming a step within it, ranked below `implementing` so `stage set implementing` (or any
higher stage) moves forward out of it and no later write moves back. `init` over an existing ledger at
stage `planned` overwrites it, since a plan that cut the branch and scopetree but ran no slice yet has
nothing to lose; any other stage still refuses.

`publish` and `adopt` (ADR 0042) mirror the ledger to the scope anchor's **published snapshot**, and
neither performs store I/O: slice-store I/O stays in-agent (ADR 0022). `publish --root <run-root>`
prints the ledger on stdout as a single `## Run state` section: that heading, then the ledger — its
`# Ledger — <slug>` title line dropped, every other byte untouched — wrapped between a
`<!-- superdev:run-state -->` line and a `<!-- /superdev:run-state -->` line. `adopt --root <run-root>`
reads a whole anchor body on stdin, takes the payload between those two markers, reconstructs the title
from the payload's own `**Branch:**` line, validates the result against the same schema (`Stage` against
the known set, every table row's 7 columns), and writes `<run-root>/ledger.md`.

The payload's boundary is marked, never inferred. `adopt` disregards every heading in the body — the
markers alone bound the payload, so a bare or fenced `#`-led line inside it, an unrelated markdown table
in a later section, or prose reusing `**Degraded:**`/`**Unresolved:**`/`**Deferred:**` elsewhere on the
anchor plays no part in the extraction and triggers no refusal. `kb-patch.js`'s `merge()` still finds and
replaces the `## Run state` section by that heading, unchanged: the markers sit inside the section that
heading bounds, so the section merge and the payload boundary answer different questions. Two fix cycles
on the previous, heading-inferred boundary moved the failure between a stray heading silently truncating
the payload and a false refusal on ordinary anchor content reusing ledger vocabulary — a truncated ledger
is itself a well-formed ledger, so no heuristic over the payload's shape, or over what follows it,
separated the two cases (ADR 0042).

The marker scan itself `require`s `kb-patch.js`'s `maskFencedLines` — the same function
`extractSection()` uses — rather than growing a second copy (ADR 0022's second-reader lesson). An HTML
comment renders invisibly, so a fence is the only way to *show* the marker syntax to a human at all
(documentation, an issue comment quoting a snapshot), and a shown marker is neither mistaken for the real
payload boundary nor counted toward the duplicate-opening-marker refusal. A body whose only marker pair
sits inside a fence therefore reads as carrying no real marker at all and refuses, rather than adopting
the fenced example as live state. An unterminated fence in the body refuses outright, the same posture
`extractSection()`/`merge()` already take, rather than guess where it would have closed and risk masking
a real marker past it. `adopt` refuses, writing nothing, when the opening marker is absent, when it
appears more than once (which payload to adopt cannot be resolved), when the closing marker is absent,
or when the closing marker precedes the opening one. It also refuses when the payload carries no
`**Branch:**` line (the heading cannot be reconstructed without it), when the run root's directory name
does not match the Branch line's slug, or when a ledger already exists at that root.

`status` also reports every scope's **staged knowledge-base pages** under `.superdev/kb-pending/`
(ADR 0023): a `pending publish:` line per scope, a scope with no run root under `(no ledger)`, a
non-`.md` file staged and ignored, and a `.md` file staged directly under `.superdev/kb-pending`
outside any scope directory. Each is a page `/superdev:publish-kb` would otherwise silently miss.

The stage machine's transition rules are enforced in its code, not in prose, and
`hooks/ledger-guard.js` denies every other write path. `tests/scope.test.js` carries the retired
drift assertions along with scope.js's own behavior: the stage machine, the ledger schema and header
lines, a pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`,
`hooks/run-lock.js`, and `references/scope-mode.md`. A further pin — the same class of assertion as
`hooks/ledger-guard.js`'s byte-identical `ARG` token against `hooks/merge-guard.js`, adapted for a
shared function instead of a duplicated constant — asserts that `scope.js`'s own source still requires
`maskFencedLines` from `kb-patch.js` and declares no private function of that name, so a reintroduced
private copy of the masking rule fails this instead of only being caught by chance, on whichever
fixture happens to exercise the drift.

### kb-patch.js, the knowledge-base section merge (ADR 0027)

`kb-patch.js` is the deterministic half of a staged page's `action: patch`. It reads a live
knowledge-base page and a staged page carrying **one section**, prints the merged markdown on
stdout, and writes nothing. `/superdev:publish-kb` holds the backend credential and calls it.
`agents/doc-writer.md` stages the section and reaches no backend at all (ADR 0023). The merge lives
here rather than in the command's prose so that a reader-facing page is not edited by a model
reading it.

The staged section names itself by the **first ATX heading in its body**, spanning to the next
heading of the same or higher level, so a sub-heading belongs to the section and a sibling ends it.
A heading may carry up to 3 leading spaces. That is CommonMark's own limit, because a fourth space, or
a leading tab, makes the line an indented code block instead. An indented live section is therefore
still recognised as a boundary and is never swallowed into the section ahead of it. The comparison that
finds the live section to replace requires a line to clear that same up-to-3-space gate before it counts
as a candidate at all. It then compares the line by a key that folds three surface spellings of one
heading into a single form: trailing whitespace, a closed-ATX form (`## A ##`), and the gap between the
`#` marker and its text (one space, several, or a tab). The key reads a staged heading as always
column-0, so a live target indented up to 3 spaces still matches instead of missing and appending a
duplicate. A 4-space or tab-indented line that merely *shows* the heading text in a code block never
matches, no matter how it reads once trimmed. Setext headings are unsupported as a section marker: one
notation is what makes "does the
live page carry this heading" a string comparison instead of a parse, and a staged body using one has
no ATX heading and refuses. A *live* page is never validated that way, so the merge separately refuses
when a setext underline falls inside the live region about to be dropped, rather than silently
swallowing that section into the replaced one. `extractSection()` applies the identical `hasSetextHeading()`
check to the **staged** body's own section, refusing there too, rather than accept a shape it merges
cleanly today and then refuses to ever patch again. That failure belongs on the staged file, which
a doc pass re-runs, not on the live page it would otherwise strand. Heading detection runs on fence-masked lines (matches
`scripts/drift/lib.js`'s `maskFences`, including its at-least-as-long closing-fence rule), so a
`#` or `~~~` shown *inside* a fenced code example is never read as a heading, in the staged body, in the
live section being replaced, or by the duplicate-heading scan. An unterminated fence in either input
refuses instead of guessing where it would have closed, because it would otherwise mask every line
after it and hide real headings. The live page carrying that exact heading line has its section
replaced. A page without it gains the section at the end. Sorting is deliberately absent, because where
a new section belongs is editorial, and appending is correct for the ascending-number case
(`ADR summaries`) that motivated the ADR. Appending onto a live page whose trailing blank lines vary
collapses them to exactly one before the new section. That is harmless, since a blank-line run carries
no content.

The merge is **idempotent**: applying the same patch to its own output changes nothing, which is
what makes it safe under `/superdev:publish-kb`'s retry of a staged page whose call failed. It
refuses, nonzero and with a one-line stderr reason, in five cases. A staged body with no heading. A
staged body carrying content before its first heading, or more than one section, where a patch stages
exactly one. A live page carrying the heading more than once, because which section to replace cannot
be resolved, which is the same reason `/superdev:publish-kb` refuses two staged files sharing one
title. An unterminated fenced code block in either input. A setext underline inside the live region a
replace would drop, or inside the section the staged body itself stages. A CRLF live or staged page
merges exactly as an LF one does, the way `scope.js` reads a CRLF ledger.

Removing a single section is out of scope: `patch` replaces or appends, and `delete` still removes a
whole page (ADR 0027, Consequences).

`kb-patch.js` also exports `headingKeyOf`, the same key function the merge uses internally.
`scripts/publish-kb.js` `require`s it, together with `maskFencedLines`. It detects two sibling staged
files naming the identical section heading before either one applies, rather than growing a second
copy of the key logic.

### md-to-storage.js, the Confluence storage conversion (ADR 0109)

`md-to-storage.js` exports `toStorage(markdown)`, and has no CLI and no dependency. It is line-based, not
CommonMark. It covers ATX headings, paragraphs, hard breaks, nested lists, GFM tables, fenced code, block
quotes, rules, links, autolinks, images, and inline formatting, where emphasis wraps a whole link. A link or image
destination is `http:`, `https:`, `mailto:`, or scheme-less, and any other scheme renders the link text
alone. It escapes raw HTML and self-closes void
elements, so its output is well-formed XML for any input. Setext headings, indented code, reference links
and HTML blocks render as plain paragraphs. `tests/md-to-storage.test.js` checks each construct and runs a
tag-balance check on every output.

### publish-kb.js, the backend-independent knowledge-base publish (ADR 0069)

`publish-kb.js` is the fourth shipped CLI. `skills/publish-kb/SKILL.md` invokes it and relays its
report, and keeps no publishing mechanics of its own. It resolves the main checkout from any current
directory, a scopetree or a submodule included, through `scope.js`'s `mainWorkTree`. It takes `CHANGE_TYPES` and
`refResolves` off the same `require`, and carries no copy of either.
This is what makes `.superdev/kb-pending/` resolve against the repository root, not one level too
deep, from inside `.superdev/scopes/<scope>/scopetree`. `--scope <slug>` selects which pending scope to
publish. Left out, the script publishes the one pending scope there is. It refuses when there is more
than one pending scope or none, and names every pending scope with its staged-page count on refusal.

It classifies `docs/agents/knowledge-base.md`'s `- **Backend:**` bullet. A `local` or `none` value
publishes nothing, since a local backend keeps its pages as repository files (ADR 0023). A remote
backend with no `## Commands` section refuses and names `/superdev:setup`. A remote backend that
carries one parses its five `### <verb>` subsections, `find`, `read`, `create`, `update`, and
`delete`, by heading name, never by position. A fenced block inserted or removed elsewhere therefore
never shifts which template a later verb reads. Each template runs under `/bin/sh -c`. Every value
passes to it as an environment variable, never interpolated into the command string. A title carrying
a quote, a `$`, a backtick, or a newline therefore reaches the backend unchanged and starts no shell of
its own.

Every template runs under a **30-second bound** (ADR 0130), applied at `runTemplate`'s own `spawnSync`
with `killSignal: 'SIGKILL'` — the same shape `scope.js`'s `testContainment` bounds its `git fetch`
with. The bound sits in the script rather than in the templates, so it covers an operator-written
template carrying no `curl --max-time` of its own. `SUPERDEV_PUBLISH_KB_TIMEOUT_MS` overrides it, and
sits outside the `SUPERDEV_KB_` prefix on purpose: `fieldsToEnv` forwards every key a `find` result
carries under that prefix, so a backend returning `timeout_ms` would otherwise rewrite the bound from
the wire. A value that is not a positive integer reads as absent, never as "no bound" or "kill at once".

**A timeout stops the batch, and nothing else does.** `processStagedFiles` walks the title groups and
breaks on the first result carrying `timedOut`, reporting every remaining file as `untried` and leaving
all of them staged. A host that black-holes one call black-holes the next, so continuing would spend the
bound once per staged page and reproduce the hang the bound removes. `spawnFailure` is the single site
that tells a timeout from any other `res.error`: a `maxBuffer` overflow and a shell that will not start
say nothing about the host, so each still fails only its own page.

`find`'s exit code is the contract the other four verbs rest on (ADR 0069's table). Exit `0` with a
JSON object on stdout means `found`, and each key in that object becomes a `SUPERDEV_KB_<KEY>`
variable for the later verbs. Exit `3` means `absent`, the only verdict that may create a page. Any
other exit means `unknown`, which leaves the page staged instead of guessing. `action: upsert` finds,
then creates or updates. `action: delete` finds, then deletes, or reports `already-absent` when `find`
already answers `absent`. `action: patch` requires a `read` template, since a backend declaring none
leaves every `patch` page staged. It also refuses, leaving the page staged with the reason reported per
page, when `classifyBackend` resolves a `- **Body format:**` configuration bullet that names anything
other than markdown (absent means markdown): `kb-patch.js` merges by matching markdown ATX headings, and
a page stored as something else (Confluence's `storage` XHTML) would otherwise take an unrendered
markdown section appended to it on every publish (ADR 0027). Otherwise, `patch` reads the live body,
merges the staged section into it through `kb-patch.js`'s exported `merge()`, and creates or updates with
the merged result. A `read` call that returns no body for a title `find` did list counts as a read
failure, never as an empty live page. It therefore never wipes an aggregate page's other sections (ADR
0027, 0069).

**A `storage` body format converts the whole page before `create` and `update`** (ADR 0109).
`processFile` hands the upsert's temp body file `md-to-storage.js`'s `toStorage()` output when
`templates.bodyFormat` is `storage`. Every other body format receives the staged body byte-identical
(INV-0109). A staged page's optional `parent:` names the title of the page it is created under.
`resolveParent` looks that title up through `find` on the create path only, and passes the id as
`SUPERDEV_KB_PARENT_ID`. An `absent` or `unknown` parent leaves the page staged, with the parent named in
the reason. A `create` template that never mentions `SUPERDEV_KB_PARENT_ID` leaves a parented page staged
with a reason naming the fix, and resolves and creates nothing. `parentsFirst` orders the title groups by their depth in the batch's own parent chain, so a
parent staged in the same batch is created before its children.

Two or more staged files sharing one title are the aggregate-page case, since a `patch` filename is
`<title-slug>--<section-slug>.md` and an outline entry's sections arrive as sibling files.
`processTitleGroup` applies each file in turn, re-reading the live page as it then stands, so the
second file's merge sees the first file's own section already landed. It leaves both files staged and
unresolved when two siblings name the identical section heading. A group where not every file carries
`action: patch` is ambiguous, and nothing in it publishes. A staged file's backend call landing is
what deletes it. A call that fails leaves the file staged, so the next run retries exactly what did
not make it. A malformed file (no frontmatter, no title, or an unknown action) is reported and left
untouched. A timeout on one sibling stops the rest of that group untried, the same stop the outer
batch loop applies between groups (ADR 0130, time-bound). A host that black-holes one call
black-holes the next, regardless of which loop is calling it.

`--read <title>` is a read-only entry (ADR 0094, INV-0091), invoked directly rather than through
`run()`'s scope-and-staging path: it resolves the backend the same way, then runs `find` and `read`
under the same bound as every other call, and never writes to it or moves a staged file. It prints
`{"title","exists","body","hash"}` as one JSON object on stdout — `hash` the sha256 of `read`'s
stdout, normalised for CRLF and a trailing newline, so two reads of an unchanged page agree — and a
page `find` does not find prints `exists: false` and exits 0, never as a refusal. A backend
declaring no `read` template, a failed call, or an exhausted bound each refuse with a one-line
reason, the same shape `main()`'s `isRefusal` catch already gives every other refusal.

A staged `upsert`'s frontmatter may carry the `live-hash` key: the hash of the live body the page
was staged against. Before an `upsert` replaces a page `find` reports as already existing,
`publishUpsert` checks that recorded hash against a fresh `read` of the live page (`checkLiveHash`)
and refuses — leaving the page staged, with the refusal reported per page exactly like any other
`left-staged` reason — when the recorded hash differs from the live one, or when the staged page
carries no recorded hash at all: a writer that never read the live page has nothing to check an
overwrite against, so it is refused precisely like a mismatch, never treated as leave-it-blank means
overwrite-it-blind. A backend with no `read` template refuses the same way, since the check cannot
run at all. `action: delete` and `action: patch` are untouched by the guard.

Before a hashless `upsert` finds the page absent and sends `create`, `markStagedCreate` writes a
`created-by-publish: <ISO-8601 time>` line into the staged file's own frontmatter, ahead of the
`create` call — a call this same run then sends. A create killed after it lands leaves that marker
on the staged file that survives it, so a later run whose `find` locates the page reads the marker
and sends `update` directly (ADR 0130), never the hash guard and never a `read` call. A hashless
`upsert` `find` reports existing, carrying no marker, is refused exactly as before: only a page this
run itself just created skips the guard.

Before publishing, `checkContainment` refuses a scope whose branch is not confirmed merged into
`docs/agents/code-management.md`'s base branch. It resolves the branch from the ledger's
`**Branch:**` header, falling back to the same branch-shape scan `hooks/scope-prune.js` applies. A scope
whose branch and run root are both gone reads as contained rather than as a refusal: `hooks/scope-prune.js`
reaps the two together, and gates that reap on the branch already reading contained in base or gone, so
their joint absence is the fully-reaped steady state a publish meets (ADR 0071). A run root that survives
without a resolving branch is the real unreachable case, and still refuses. It
delegates the ancestry test to `scope.js`'s exported `testContainment` instead of reimplementing it.
`--allow-unmerged` overrides the refusal once the operator confirms. `_adhoc`, the literal value
`/superdev:document` writes for a doc pass outside a live scope, skips the check entirely. The report
a run prints never carries a page's body, only filenames, titles, and reasons.

The module guards its CLI entry with `require.main === module`. It exports every function above,
`resolveMainCheckout`, `listPendingScopes`, `resolveScope`, `classifyBackend`,
`parseCommandsTemplates`, `parseStagedPage`, `runTemplate`, `runFind`, `publishUpsert`,
`publishDelete`, `publishPatch`, `processFile`, `processStagedFiles`, `resolveScopeBranch`,
`parseBaseBranch`, `parseRemote`, `checkContainment`, `hashBody`, `readPage`, `renderReport`, and
`run`. `tests/publish-kb.test.js` imports `run`, `parseCommandsTemplates`, `parseStagedPage`,
`classifyBackend`, `parseBaseBranch`, `parseRemote`, and `hashBody` by name — the last one to build a
staged page's `live-hash` frontmatter against a known live body — and separately imports and calls
`runFind` for one JSON-array edge case. It otherwise exercises the module through its exported
`run()`, the way `tests/scope.test.js` exercises `scope.js`'s own CLI verbs (ADR 0059).

### profile.js, the run profile (ADR 0103)

`profile.js` prints where a scope run's wall-clock time went, and `skills/profile/SKILL.md` runs it
and explains the report. It reads the transcripts Claude Code writes under
`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/` and writes nothing there (INV-0101). The repository's
transcript directory is the main working tree's absolute path with every non-alphanumeric character
replaced by `-`. A directory carrying that name plus `--superdev-scopes-` holds the sessions started
inside one of its run roots, and is read too. A sibling repository whose path only shares the prefix is
not. Each session's `<session>/subagents/` transcripts and `.meta.json` files are read with it. The
format is Claude Code's own and undocumented: an entry lacking a field the script reads is reported as
unrecognized, never counted, and a tree with no recognized entry exits non-zero with "format not
recognized".

A **phase segment** (`CONTEXT.md`) starts at every superdev command invocation, typed or through the
`Skill` tool, and runs to the next one. Only implement, review, document, submit-pr, and ship segments
are reported. A segment belongs to the scope a whole `<change-type>/<slug>` argument names, or the
right-hand `<change-type>/<slug>` of a `BASE..branch` or `BASE...branch` review-range argument, or a
lone bare slug argument some cwd read elsewhere in the transcripts evidences as a real run root — never
a bare word with no such evidence, which would otherwise let a mode word like `audit` or `staged` pass
for a scope. Only when the arguments name none of these does the segment fall back to the run root any
entry of the session, or of a subagent it dispatched, ran under (`.superdev/scopes/<slug>/`); a named
scope is never diluted by a leftover cwd from a session that has not yet cd'ed into it, and a
`BASE..branch` argument whose right-hand side names no scope falls back the same way. With no slug
argument, the scope whose segment ended last is profiled, ties broken alphabetically.

The phases view splits each segment's wall-clock time by precedence, so the columns sum to it: human
wait first (`AskUserQuestion`, a rejected dispatch's own window, and the gap from a turn's end to
whatever closes it, INV-0102), then subagent time (each `Agent` call's window joined with its subagent
transcript's own span), then idle time, then tool time. A turn end is `type: "system"`, an assistant
entry with no `tool_use` block, a synthetic assistant entry (`message.model === "<synthetic>"` — a
rate-limit or spend-limit notice, a "No response requested." filler after a cut-off), or an interrupt
entry (`type: "user"`, not `isMeta`, its text `[Request interrupted by user]` or a variant such as
`[Request interrupted by user for tool use]`). Consecutive turn ends, with any filler between them, form
one block, and the gap runs from the block's last real, non-synthetic assistant entry — the model's own
last real output — walking back only past a turn end that carries none (a thinking-only entry, a
synthetic notice). The walk-back stops at an interrupt entry instead of walking further back to it,
since that is where machine work stopped: a real assistant entry still streaming when the operator cuts
it off never lends its own generation time to the gap. The walk-back likewise stops at a Stop hook
summary (`type: "system"`, `subtype: "stop_hook_summary"`) that follows the block's last real output,
so the gap starts at the summary rather than the output before it — the hook's own recorded duration is
then counted once, as hook time, never also folded into human wait or idle. A block with no real
assistant entry still starts at its earliest turn end. Harness filler — an attachment (a hook result, a
SessionStart context block on resume) other than a
task-notification, a compact summary (the harness's own injected recap after a context compaction), an
isMeta note wrapped in a harness tag (a caveat ahead of a typed `/command`), or a non-meta
harness-injected `user` entry that is not itself a task-notification (a local command's own echoed
stdout) — sits between a turn end and whatever closes the gap, carrying no signal of its own, and is
walked past rather than closing anything itself. The first entry after the block that is neither filler
nor a turn end closes the gap: a `user` entry carrying no `tool_result` (a typed prompt — including one
carrying only an image, with no text of its own — a peer-session message, a plain-text resumption note
such as "Continue from where you left off." or "Your response above was cut off..."), or a
task-notification attachment. A typed prompt makes the gap human wait; anything else — a cross-session
message from a peer Claude Code session, a resumption note, or a task notification — makes it **Idle**
(CONTEXT.md, INV-0102). There is no separate allow-list of wake shapes: whatever is not a typed prompt is
idle. Idle only claims what human wait and subagent time left uncovered, so a subagent interval spanning
the same gap stays subagent time instead. Recorded hook durations come out of the tool time around a
tool hook and out of the remainder for every other hook, and model time is what is left. Several Stop
hooks in one `stop_hook_summary` run in parallel, so only the slowest one's duration is taken out as hook
time — the session waited for that one, not their sum — while the per-hook-name breakdown the report
prints keeps every hook's own duration, so it can sum to more than the hook column. A tool call with
no result is listed as unfinished and adds nothing (INV-0103). A dispatch rejected at the permission
prompt counts its own window as human wait — the operator deciding, not the machine working — while a
dispatch denied by the auto-mode classifier or blocked by a PreToolUse:Agent hook stays subagent time,
since the classifier or a hook decided, not the operator. The repeated-commands view drops the body
lines of a heredoc (`<<[-]?['"]?WORD['"]?` through the line that is exactly WORD, recognized inside a
double-quoted string only where a `$(` opened earlier in that same quoted span is still open — plain
quoted text such as `"use <<EOF here"` opens no heredoc) and of a quoted argument that spans several
lines, so a `node -e '…multi-line…'`, a `cat <<'EOF' … EOF`, or a `git commit -m "$(cat <<'EOF' … EOF )"`
groups only under its own opening line, never under a body line such as `const` or `Co-Authored-By:`.
Once a quote closes — on its opening line or a later one — the real code past the closing quote is kept
and rescanned, so a statement following a multi-line quoted argument on the same physical line
(`"…multi-line…" && git log …`) still gets its own key. A run of backslashes escapes the character after
it only when the run's length is odd (`\\"` is an escaped backslash followed by the real closing quote,
not an escaped quote), except inside a single-quoted string, which has no escapes, and a `#` at a word
start outside any quote starts a comment that drops the rest of its line. It then splits each Bash call
into its statements on `&&`, `||`, `;` and line breaks, recognizing an operator only outside a quote — an
operator inside quoted text (a `;` in a commit message) never splits the statement there, so a quoted
argument keys once, as its real command, not once per fragment a naive split would cut mid-quote — drops
a leading `time`, drops a leading shell keyword (`while`, `until`, `do`, `done`, `if`, `then`, `elif`,
`else`, `fi`, `esac`, `{`, `}`, `(`, `)`) so the real command after it on the same statement keys
instead (`do bun run test` keys `bun run test`) and a statement left with nothing after the drop keys
nothing. A `for` or `select` statement keys nothing, since its words are a loop variable and a list; a
`case … in` header keys nothing and each arm keys its command, the pattern before `)` being no command.
A backslash-newline joins the next line into the statement, and a `(` or `{` attached to the first word
is dropped. It keeps each pipeline's first stage past any `cd`, assignment, or redirection.
A whole `VAR=$(cmd …)` statement, with the substitution optionally double-quoted and the assignment
optionally led by `export`, `local`, `readonly` or `declare`, keys the command inside the substitution
instead of the assignment's own leftover word (`SHA=$(git rev-parse HEAD)` keys `git rev-parse`, not
`rev-parse`). A quote opens only where an odd backslash run does not escape it, in every scan. An interpreter
(`node`, `python3`, `python`, `bun`, `deno`, `ruby`, `bash`, `sh`) keys instead by its first non-flag
argument when that argument looks like a script path (`node tests/profile.test.js`) or starts with `$`,
quoted or not (`node $S`, `node "$S"` both key `node $S`), or by that argument itself when it is an
inline-source flag (`node -e`, `python3 -c`, `node -`), so each interpreter call keys by what it ran
rather than collapsing every one under the interpreter's own name; an argument that is neither, such as
`run` in `bun run test`, falls back to the plain-word rule. An absolute script path, quoted or not, past a
version-numbered directory — the shape a plugin cache installs a script under
(`…/superdev/0.41.0/scripts/scope.js`) — keys past that directory (`node scripts/scope.js`), so two
plugin versions running the same script group under one key rather than splitting one row per version.
A call with one key credits its whole duration to that key. A call with
several keys splits its duration by weights: a key's weight is the median duration of its single-key
calls across every transcript session the profile reads for the repository, not only the profiled
scope's segments. A key with no single-key call takes the mean of the other
keys' weights in that call, or an even split when none has one, and a call whose weights are all 0 splits
evenly. The count stays the number of calls that ran the command, so the per-key totals sum exactly to
the Bash time of every call that ran a command (a call with no command key, such as `cd /tmp` or `X=1`, is in no total), and the report says how a compound call's time is shared. The dispatches view reads each `Agent` result's
`totalDurationMs`, `totalToolUseCount`, and `totalTokens`; a background (`run_in_background`) dispatch's
own result carries none of these, so its figures come from the later task-notification entry's `<usage>`
block instead, keyed by the dispatch's tool-use id. A dispatch whose notification never arrives is
reported as "not yet notified", never counted as zero (INV-0101) and never reported unrecognized. A
failed or killed dispatch's notification carries `<status>` and no `<usage>` block at all. A dispatch
refused before it ran carries no notification at all — only its own tool_result string: the fixed string
`User rejected tool use` for a rejection at the permission prompt, a string starting "Error: Permission
for this action was denied by the Claude Code auto mode classifier" for a classifier denial, or a string
starting "Error: PreToolUse:Agent hook error:" for a hook block. The report names that status — "failed",
"killed", "rejected", "denied", or "blocked" — in place of a duration, still never zero and never
unrecognized. The view groups dispatches whose time spans overlap into numbered parallel batches,
flagging each batch's longest.

The exit codes are 0 for a report, 1 for no transcript directory, no segment for the slug, or an
unrecognized format, and 2 for an argument that is not a slug. Each non-zero exit prints one line on
stderr, and the first two name the slug and the path searched. Its suite is `tests/profile.test.js`, which builds synthetic
transcript trees in a temporary directory and points `CLAUDE_CONFIG_DIR` and `HOME` at them.

### run-tests.js, the suite runner

`node scripts/run-tests.js` is the whole of `bun run test`. It discovers the suites under `tests/` by
name: every `*.test.js` file directly in that directory, in name order, so a suite added to the tree runs
with no edit to `package.json`. A helper (`spawn-verdict.js`, `fixture-git.js`) and a subdirectory
(`tests/fixtures/`) are not suites. It runs each suite under `node`, then the fixed tail: `invariant-check.js
--root .`, `drift-check.js --selftest`, `drift-check.js`, and `claude plugin validate ./plugin`. Every step,
suite and tail alike, prints one `run-tests: <label>: <ms> ms` line carrying its wall clock, which
`docs/agents/verification.md` names as the repository's timing command. The first
failure stops the run, prints which suite or tail command failed, and exits nonzero; a child that was
killed or never started counts as a failure (INV-0009). A `tests/` directory holding no suite prints
`no suite found` and exits nonzero.

`node scripts/run-tests.js --related <path>...` is the focused mode, the second fence of
`docs/agents/verification.md`. The tail always runs. `selectSuites` picks the suites the repository-relative
paths reach, matching by name, so a deleted path maps like any other. A suite is reached when its own text
names the changed file (its basename, or its bare stem between path or quote delimiters), when the shipped
file its name pins (`plugin/hooks/<name>.js`, `plugin/scripts/<name>.js`, or `scripts/<name>.js`) directly
requires the changed file, or when the path is the suite itself. A test helper reaches every suite that names
it. A `.md` path follows the same naming rule, because a suite may execute or pin a document
(`tests/publish-kb.test.js` runs the templates of `docs/agents/knowledge-base.md`, `tests/scope.test.js` pins a
sentence of `plugin/references/scope-mode.md`). A `.md` path also reaches a suite whose text names a directory
holding it, because a suite that lists or scans a directory reads every document in it
(`tests/model-explicit.test.js` lists `plugin/agents/`, `tests/invariant-check.test.js` scans `plugin/`). A named directory
is a path string that is a directory of the repository, or the literal segments of a `path.join` or `path.resolve`
call. A call whose first argument is `__dirname` or a literal is anchored at the repository root. A call whose leading
directory is computed (`path.dirname(hookPath)`) names its literal tail, which matches that tail at any depth, so
it may select a suite for a directory the suite does not scan and never misses one it does. A directory built from
computed expressions with no literal segment names nothing. The directory rule never applies to a code path. A `.md` path no
suite names, directly or by directory, and a path under `scripts/drift/`, reach no suite, because the drift selftest sits in the tail. A code path no rule places runs every suite, and an empty list runs the tail alone and exits 0. The
`require` scan is a regex over relative `require` calls, one level deep. A focused run is never a full suite
(INV-0017).

Its suite is `tests/run-tests.test.js`, which calls `discoverSuites`, `selectSuites`, `parseArgs`, and
`runAll` against throwaway trees it removes at the end. It carries no roster of this repository's suites. The
tail is exported as `TAIL`, so a suite reads it instead of matching the runner's source text.

### invariant-check.js, the invariant register validator (ADR 0093)

`node scripts/invariant-check.js --root <dir>` validates `<dir>/docs/invariants.md`. `bun run test` runs
it with `--root .`. The maintainer also runs it by hand against another repository's register, so it
takes the root as an argument rather than reading its own checkout. It prints one line per
failure, `<id>: <field>: <reason>`, then a summary, and exits 1 on any failure. A root with no register
file at all exits 0 and says so; a register file that exists but parses to zero entries — an empty
file, a file whose encoding reads as garbage (a UTF-16LE file, since the CLI never sniffs an encoding),
or one whose every heading is blockquoted or indented — fails instead, as `(register): id: no
\`### INV-NNNN\` entry found`, rather than passing as "0 entries hold". A missing or non-directory
`--root` exits 2 with usage.

It checks these kinds of rule:

- **Format.** `Class`, `Concepts`, `Statement` and `Breaks` are present. `Class` and `Statement` each
  carry a word once unquoted: a letter or a digit, in any script. `-`, `—` or `_` fails as carrying no
  word. `Concepts`, and `Paths` or `Symbols` when present, each name at least one comma-separated item
  once trimmed. A bare `,` fails as naming no concept, path, or symbol. A `Breaks:`
  value is `silently` or `loudly`, matched case-insensitively, optionally followed by ` — ` and a
  reason and nothing else — anchored, so `loudly, silently` fails rather than passing as loudly and
  skipping the `Check:` requirement; any other shape fails too. A `Breaks: silently` entry carries
  `Check:`, its backticks stripped before the check, and the three ways it can fail each name a
  different reason: missing fails as naming no proof at all, and `` `none` `` (bare or backticked)
  with no reason fails as needing the reason nothing cheaply tests it. `none` wrapped in any other
  punctuation (`*none*`, `"none"`, `(none)`) fails the same way. A value with no letter or digit
  once unquoted (`-`, `_`, empty backticks) fails as naming no proof; `TBD` stays legal content. No id
  repeats. An entry is a `### INV-NNNN` heading — exactly three
  `#`, `INV-` and four digits, nothing else on the line — and the `Key: value` lines under it, in any
  order, and a heading may follow the previous entry's last field with no blank line. A heading that
  mentions an id (case-insensitive `INV-` plus digits) but is not exactly that form fails, naming the
  heading text, rather than silently dropping every field under it — this also covers a heading
  missing its required space (`###INV-0002`) or carrying leading whitespace (` ### INV-0002`), neither
  of which either heading pattern recognises: instead of falling through as a field line on the entry
  above, each is caught by the non-field-line rule below. Outside any entry, a `Key: value` line fails,
  naming the line, and so does any other line that — once leading whitespace, `>` blockquote markers
  and list markers are stripped — still begins with a heading marker or a field-like shape and mentions
  an invariant id: this catches a retired entry left blockquoted or indented under a non-`INV` heading
  (e.g. `## Retired`) instead of silently dropping it. The register's own title and intro prose cite no
  id, so this narrower, heading-or-field-shaped test never flags it. Inside an entry, a non-blank line
  that is not a `Key: value` field line fails, naming the entry and the line, rather than silently
  reparenting onto the entry above. A field key repeated inside one entry fails as appearing twice,
  naming the entry and the key, and the first value is kept rather than overwritten. A field key that
  is not one of the seven the format names — `Class`, `Concepts`, `Statement`, `Breaks`, `Check`,
  `Symbols`, `Paths` — fails, naming that key, so a misspelling like `Path:` or `Symbol:` is never
  silently ignored; a key matching one of the seven case-insensitively but written in the wrong case
  (`paths:`) is reported as such, naming the correct spelling, rather than as an unrecognised field.
  CRLF reads as LF, and a leading byte-order mark is dropped before parsing.
- **Resolution.** Every `Concepts` value equals a glossary term — the bold text opening a line, or a `- `/`* `
  list item, of any `CONTEXT.md` the walk reaches, so a multi-context repository needs no map parser. Every `Paths` glob
  matches a file. Every `Symbols` value appears as a whole word in the files the entry's `Paths` match, or
  anywhere but the register when the entry names none. A dotted symbol matches on its last segment. Every path-shaped
  token in `Check:` names a file; drift ids and quoted test names are prose and stay unchecked.
- **Citations.** Every `INV-NNNN` cited in a walked file names an entry the register carries, so
  retiring or renumbering an entry cannot leave its citations silently stale. A citation is `INV-` and
  four digits. No letter, combining mark, or digit, in any script, may sit directly before `INV-`, and no digit after the
  four digits. So `_` or punctuation on either side does not hide it, and an unrelated id such as
  `SINV-2024` stays out. A stale citation fails as
  `<id>: citation: cited at <file>:<line>, …`. The register itself, `CHANGELOG.md` and every file under
  `docs/adr/` are not scanned. The changelog is release-managed and an ADR is superseded rather than
  edited, so a stale citation there is dated history that no edit can fix.

The walk prunes `.git/`, `node_modules/`, `.superdev/` and `.claude/` — the last because
`.claude/worktrees/` holds whole repository copies with their own `CONTEXT.md`, and the walk reads
no `.gitignore`: an ignored file outside the pruned directories still counts toward `Concepts`,
`Paths`, `Symbols` and citations. Parsing `.gitignore`, or shelling out to `git ls-files`, is out of scope — the
CLI is deliberately pure Node with no shell-out. It builds relative paths with `/` itself, so
a glob matches the same files on every OS. `globMatcher` is its own: `fs.globSync` needs Node 22, and
`package.json` supports Node 20.8.1. The validator filters and ranks no entry — `/superdev:plan` and
`final-reviewer` still read the register whole (INV-0088) — and nothing under `plugin/` requires it
(INV-0051). Its suite, `tests/invariant-check.test.js`, runs the CLI against throwaway repositories under
the OS temp dir, every spawn through `assertSpawnDecided` (INV-0009).

### drift-check.js, the cross-document contract checks

`drift-check.js` is the entry point only: it walks the check registry and reports. The checks themselves
live beside it, in `scripts/drift/`.

| File | Owns |
|------|------|
| `drift-check.js` | the CLI: `runChecks(checks, root)` (the per-check walk, catching a thrown `run()` as that check's own `threw` result instead of letting it crash the walk), `main()`, the ok line, the exit code, and the `--selftest` handoff. Guards its CLI dispatch with `require.main === module`, so a `require` of the file (the selftest's own `runChecks` import) runs neither branch |
| `drift/checks.js` | the **registry**, one entry per check: `id`, `run`, its `ok` phrase, and how one gap prints. Its `id` is the key this narrative organizes each check's paragraph around |
| `drift/contracts.js` | the contract tables and patterns. Data only |
| `drift/scanners.js` | the bespoke scanners, every check whose assertion is more than one pattern over one document |
| `drift/lib.js` | what they share: `maskFences`, `extractSection`, the frontmatter readers, `readDoc`, `storeDocuments`, and `scanContract` |
| `drift/selftest/` | `index.js` (the `fixture` helper, `realRoot`, temp-dir cleanup) plus one suite per area: `scanners`, `chain`, `kb-plan`, `coverage`, `observation`, `drift-check`, plus `coverage.js`, the coverage verdict helper. `coverage` is the one harness every table without a bespoke fixture goes through. A suite asserts no real-tree result: `drift-check.js` scans the shipped documents itself |

The checks named below are the exceptions, and every other one is a **drift assertion**: it compares a
restated fact against its source. `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`,
`return-to-controller`, and `conflict-conclusion-no-commit` are **negative** assertions. Each reports a
document that still says something, rather than one that stopped saying it. `adr-status` compares a
document against a **schema**.
`pinned-paths` is a plain **existence** assertion.

The exceptions are named and the rule covers the rest, deliberately. A list of every drift assertion by id
is maintained by hand at the moment its author is thinking about code, so it falls behind. Naming the
exceptions cannot drift when a new check lands.

`drift-check.js` guards the checks below, each keyed to its registered check id. The
`reference` contract: every `references/*.md` path named in `skills/`, `agents/`, or `references/`
itself resolves to a file that exists. A reference cites another reference, as both execution
playbooks point at `scope-mode.md`, so a rename there dangles like any other. The
`run-root` contract: `skills/implement/SKILL.md`, `skills/review/SKILL.md`, `skills/document/SKILL.md`,
`skills/submit-pr/SKILL.md`, `skills/publish-kb/SKILL.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, `references/run-handoff.md`,
`references/scope-mode.md`, `agents/implementer.md`, `agents/slice-reviewer.md`,
`agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
run-root artifacts by absolute `<run-root>/…` path. The `scopetree-run-root` contract (ADR 0080) is the
same shape over a narrower, deliberately separate list: `skills/ship/SKILL.md`,
`skills/document/SKILL.md`, and `plugin/scripts/publish-kb.js` each address another run's scopetree from
their own cwd, which may not be the invoking checkout, so each names it `<run-root>/scopetree` rather
than the checkout-relative `.superdev/scopes/<scope>/scopetree` a real `git worktree add`-style command
legitimately builds elsewhere. The `run-root` check's own artifact pattern deliberately excludes
`scopetree` for that reason — most of its occurrences across `RUN_ROOT_DOCS` are exactly those
legitimate, cwd-relative commands — so a reversion in one of these four needs a pattern of its own rather
than widening the shared one and flagging every legitimate cut. The `assignee` contract: every
issue-backend document carries both halves of it, and each is reported apart. One half **requires** the
`## Assignee` section, the store side of the generic contract, which `Assignee` shares with every other
member of the specialising family. The other **forbids** the `- **Assignee:**` config bullet: the
assignee is read from the untracked `.superdev/info.json` (ADR 0073), so a bullet is a personal account
identifier committed to a repository other people maintain, and configuration nothing reads. This is the
one member of the family whose halves pull opposite ways. The section is found through
`specialisingHeading('Assignee')` rather than a second copy of the pattern, so the family's heading
anchoring reaches this check too. Both halves read fence-masked text, defensively: no store document
renders either inside a fenced example today, and the seeds' habit of showing headings inside fenced
examples elsewhere makes one plausible. The filename alone triggers the check, with no content gate on
how the doc phrases issue creation. No store is exempt from either half (ADR 0110). Presence and
absence are all either half claims; what the section must say for its backend stays a review's job.
Coverage is automatic — `storeDocuments()` picks up a `references/issue-tracker-*.md` seed added later
with no scanner edit. The
`anchor-contract`: every slice-store document (every `references/issue-tracker-*.md` plus this
repo's own `docs/agents/issue-tracker.md`) carries a `## Scope anchor` section stating all five of
its elements: how to recognise an anchor, list its candidates, list the slices beneath one, tell
that an anchor is itself a slice (ADR 0017), and read an anchor's own dependencies (ADR 0040). Each
element is matched on a bullet's bolded lead-in
(`- **Recognise one.**` style, `-` or `*`, American or British spelling) rather than anywhere in the
section, so intro prose that merely lists the five concepts satisfies none of them. The lead-in
anchoring carries extra weight on the dependency element: two store documents open the section by
noting that a native issue-dependencies unit is disabled, which states no way to read the relation.
The
`writing-standard` contract: `references/documentation.md` still offers a `## Writing standard`
section (ADR 0012). The `content-types` contract: `references/doc-pass.md` and
`agents/doc-reader.md` each still instruct themselves to read `references/content-types.md` (ADR
0014). The writing side moved off `agents/doc-writer.md` and onto the reference with the rest of the
pass's prose (ADR 0031). The `command-resolution` contract: every `/superdev:<name>` reference in `skills/`
or `agents/` resolves to a `skills/<name>/SKILL.md` file, so a chain handoff never points the reader at
a command that does not exist. The `chain-handoff` contract: `skills/implement/SKILL.md`,
`skills/review/SKILL.md`, and `skills/document/SKILL.md` each name their successor in the chain.
`skills/submit-pr/SKILL.md` ends the chain and is deliberately outside that check.

`spawn-failure-answers` pins green-gate's answer to a spawn that never started. Such a spawn is a **Spawn
failure**, outside INV-0009 (ADR 0087): `plugin/hooks/green-gate.js` blocks, because it fires only on a merge
and a tree that cannot run its suite is a defect in the thing being gated. The row pins that **reason**, not
the behaviour alone: a behaviour with no stated reason reads as an oversight to the next editor, which is
how a fail-open answer once survived (#606).

The `verification-ceiling` contract (ADR 0084, INV-0006): verifying a Definition-of-Done
criterion observes, and changes no system outside the repository. `references/scope-mode.md` states the
rule once, in its own `## Verification ceiling` section, and the rows pin the clause on both
verifying agent bodies (`agents/final-reviewer.md`, `agents/implementer.md`) and on every surface
that verifies a criterion or dispatches an agent that does (`skills/review/SKILL.md`,
`skills/implement/SKILL.md`, `references/run-handoff.md` — whose red-full-suite implementer dispatch
sits outside `skills/implement/SKILL.md` entirely, and whose own handoff pass re-checks every
`scope`-tagged and earlier-ticked criterion, `skills/document/SKILL.md`'s §8 re-check bullet, and
`references/dod-ticks.md`'s Document's case those two dispatch through, plus its Verify-ship's case and
`skills/verify-ship/SKILL.md`, which also states it never runs a deploy target's command — ADR 0106). A contract in an agent body
also has to hold in the prose that dispatches it, so `implementer.md`'s one body clause is reached by
a dispatch row in each of `skills/implement/SKILL.md` and `references/run-handoff.md`.
`skills/submit-pr/SKILL.md` carries no row here: ADR 0091 retired ship's own verification step, and the
row that once pinned its "Verifying an item observes" sentence went with it (see `ship-ticks-nothing`
below).

The `wrap-up-gate` contract (ADR 0106, INV-0099), on `skills/wrap-up/SKILL.md` and one row on
`skills/verify-ship/SKILL.md`: the gate collects every reason that holds and names all of them in one
refusal, counts an unknown merge state as not merged, refuses a Definition-of-Done line neither ticked nor
`accepted:` (naming `/superdev:verify-ship <scope>`) and a target not `deployed` (naming
`/superdev:verify-ship` or `/superdev:ship`), asks once per standing `**Unresolved:**` entry, stops on any
failed store call, and cleans up only after a successful close. Further rows pin the gate's evidence:
a listed target not recorded `deployed`, an `absent` record included, is a reason (a session can end
between ship's stage write and its first deploy record); settledness is judged from `dod.md`, with the
anchor read only when `dod.md` is missing, and an anchor disagreeing with a settled `dod.md` names
`/superdev:verify-ship <scope>` as the reconciler; slice records closed before a failed anchor close stay
closed and a rerun converges; and a refused scopetree removal leaves the stage at `shipped` and never
force-removes. The cleanup rows pin that the scope branch is never deleted, `.superdev/kb-pending/<scope>/`
is kept, and the cleanup runs from the invoking checkout. The verify-ship rows pin that it prints
`/superdev:wrap-up <scope>` as its next command once every line is settled, reconciles the anchor from `dod.md` before it observes, treats a `manual` target with no record
like a `pending` one, keeps the records of an earlier yes when a later target is answered no, and reads a
ledger with no `**PR:**` header as posture `none`.

The `ship-ticks-nothing` contract (ADR 0091), all on `skills/submit-pr/SKILL.md`: it replaces the
retired `dod-suite-criterion` contract, which once pinned §4's suite-criterion tick logic — that logic
moved to `/superdev:review`'s own §4 once every scope started passing review, so submit-pr ticks nothing
at all. One row pins the plain "writes no tick anywhere" statement; one pins the `## Post-merge
checklist` paragraph — every `dod.md` line noted `— ceiling:` copied into the pull-request body under
that heading, with no empty heading when none exist. Two rows on `skills/ship/SKILL.md` pin that ship
writes no tick anywhere and closes no anchor and removes no checkout, slice checkout, or lock: the close
is `/superdev:wrap-up`'s (ADR 0106, INV-0099).

The `doc-untick-on-break` contract (ADR 0091) pins the doc pass unticking, with a note, a ticked
`dod.md` criterion its own commits broke, and leaving every other tick untouched. `references/dod-ticks.md`
states the case — **Document's case**, the mapping gate's third listed-lines case alongside implement's
and review's: the pass's own listed lines are exactly the ticked lines its own doc commits could touch,
judged directly against the branch those commits just landed on, never from a dispatched report. The doc
pass also routes the anchor's tick update through the active store's own `## Definition of Done ticks`
section (`docs/agents/issue-tracker.md`), best-effort. `skills/document/SKILL.md` §8 restates the same
re-check on its own dispatch-free bullet, per root `AGENTS.md`'s dispatch-prose rule. A further row pins
that same file's print-next-command bullet: the step that opens the pull request asks once when attended
and refuses only when unattended, on a scope with an unmet criterion — never an outright refusal, which
overstated what that step actually does (triage #660). Both surfaces also
carry the verification-ceiling clause the `verification-ceiling` contract pins (ADR 0084, INV-0006).

The `feature-label-argument`, `unattended-token`, `change-type`, `degraded-pass`, `derived-criteria`,
`reachable-criterion`, `release-risk-criterion`, `label-validation`, `green-gate-timeout`, and `verb-pointer` checks
share one scanner, `drift/lib.js`'s `scanContract()`, run over
a table of `[document, pattern, expectation]` rows in `drift/contracts.js` instead of one function each.
It reads every
document a table names and reports the rows whose pattern that document no longer matches. The
`feature-label-argument` contract: `skills/implement/SKILL.md` declares an `argument-hint` naming a feature
label and resolves `$ARGUMENTS`, and `skills/plan/SKILL.md` names `/superdev:implement <label>` as its
resolved successor, in a backtick-delimited invocation. That pins the contract only, never the label's
shape (ADR 0019). The
`unattended-token` contract: `references/scope-mode.md`
carries the `## Unattended` section (ADR 0016), and `skills/implement/SKILL.md`, `skills/review/SKILL.md`,
`skills/document/SKILL.md`, `skills/submit-pr/SKILL.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, and `references/run-handoff.md` each name
`--unattended` and carry an instruction to read and apply that section. The `change-type` contract:
`references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
`CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone,
and gone is one of the two conditions that make a scope prunable (ADR 0007). The hook then reaps a
shipped run's root that is still in progress, silently: the Stop hook that runs it reports nothing. The
glossary is the copy most likely to drift, because nothing executes it. The `degraded-pass`
contract:
`references/scope-mode.md` carries the `## Degraded passes` section, and `skills/implement/SKILL.md`,
`skills/review/SKILL.md`, `skills/document/SKILL.md`, `skills/submit-pr/SKILL.md`, `skills/status/SKILL.md`,
`references/implement-full.md`, `references/implement-lite.md`, and `references/run-handoff.md` each
name the `**Degraded:**` ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
never got, such as a pull request claiming a review that was its author reading their own work. The
section also states that a denied-dispatch bullet quotes the classifier's refusal text, which is what
tells a genuine safety block from one of auto mode's documented false positives (ADR 0039). The `derived-criteria` contract: `skills/review/SKILL.md` hands `final-reviewer` the **path**
`<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
`## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
because a prompt arrives at once. DoD text inlined in the dispatch is already read by the time the
instruction asks for a derivation. Losing either half degrades the derivation into theater: references
still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
The `per-criterion-verdict` contract (ADR 0091) pins the reviewer's own verdict shape and the dispatch
that asks for it: `agents/final-reviewer.md` carries its
`## Judge every criterion` step and the `### Criteria` output section it feeds — a verdict (holds,
broken, or ceiling) for every `dod.md` line, ticked or not — and `skills/review/SKILL.md`'s scope-mode
dispatch tells it to produce that list. The dispatch-prose pin the root AGENTS.md's rules demand for a
contract stated in an agent body: `review/SKILL.md`'s §4 fix loop unticks and re-ticks from that list, so
a dispatch that stops asking for it starves the loop of the input it reads from.
The `reachable-criterion` contract (ADR 0062) pins rows on `references/plan-contract.md`, which carries the
`### The reachability criterion` section, names `Reachable:` as the token the criterion is led by, and
states the every-change-type clause itself — the rule the reference owns, not only the surface it is
dispatched to — and `skills/plan/SKILL.md` carries the **Emit the reachability criterion into the
Definition of Done.** step, emits a criterion by that same token, and carries the every-change-type
clause on its own rather than only the one `no in-repo consumer exists` reason `plan-contract.md` gives
for `none` — the fuller reference list also covers a behaviour-preserving refactor's `none — entrance
unchanged`, a branch the narrower surface clause used to leave with nothing to fit. The rule is the artifact that replaces two adjectives an
agent grades its own compliance against — "each slice is a tracer bullet" and "the Definition of Done
states observable, user-facing behaviour" — so it is an artifact only while both halves say one word.
Renaming the token in the rule alone leaves every plan emitting the old one, and renaming it in the
surface alone leaves the rule describing a criterion nothing writes. Either way both documents read
correct on their own, which is the one-sided-pin shape the root `AGENTS.md`'s prompt-architecture rules
name. The token rows pin `Reachable:` inside its own backticks, so prose that merely discusses
reachability satisfies neither.
The `release-risk-criterion` contract (ADR 0133, INV-0137) has the same shape. It pins rows on
`references/plan-contract.md`, which carries the `### The release-risk criterion` section, names
`Release risk:` as the token the criterion is led by, and states the every-plan, every-change-type clause.
It pins rows on `skills/plan/SKILL.md` too, which carries the **Emit the release-risk criteria into the
Definition of Done.** step, emits a criterion by that same token, and states the same clause. The clause on
both halves is what keeps the step from becoming plan's judgment. The no-recorded-posture rows and the
deferral rows cover the branches a plan can take. The no-recorded-posture rows define a deploying feature to
include one that reaches a running production system in a repository with no recorded posture. They also
have the surface ask once per plan whether the feature reaches a running production system. A rule keyed on
recorded targets alone answers the deploy-dependent categories `none` whatever the operator replies. The
deferral rows pin the reference to state that a `Release risk:` criterion only a deployed system can show
stays in the Definition of Done, unticked, until `/superdev:verify-ship` observes it
(`references/scope-mode.md`'s `## Verification ceiling`). They pin the surface to exempt that criterion from
the offer to move a live-system-only criterion out of the Definition of Done. A rename
or a dropped clause on one half alone leaves both documents reading correct while the plans and the rule
part ways. The token rows pin `Release risk:` inside its own backticks, so prose that merely discusses
release risk satisfies neither.
The `review-range-shapes` contract (ADR 0063) pins rows on `skills/review/SKILL.md`'s §1, which emits the
**Standing code** range shape, reports that there is nothing to review on a path holding no files, and
skips `simplicity-reviewer` on that target; its §2 dispatch sentence hands `final-reviewer` the path and
its file set at `HEAD` in place of a range on that same target, since there is no diff behind it to derive
a range or a summary from; `agents/final-reviewer.md` enumerates four range shapes rather than three and
names standing code as a subject it accepts. The seventh row pins §1's own staging clause: it stages
untracked files with `git add -N :/` **before** the range bullets resolve, not after them, so a path scope
diffed against `HEAD` (or a working-tree review) sees a brand-new untracked file too — staged only after
the bullets resolve, the path/area bullet's scoped diff comes back empty for an untracked-only path,
falling into the standing-code shape and silently reviewing nothing instead of the file the caller just
wrote. Ad-hoc review is diff-based in every other shape, so a path
on a clean checkout resolves to an empty diff and reviews nothing — the shape is what makes "review this
existing area" work at all. Both halves have to agree, and each reads correct alone: a surface emitting a
shape the reviewer's brief has already counted away leaves the reviewer looking for a diff that does not
exist, and a brief naming a shape nothing emits is a contract with no live path behind it. That is the
`FULL_SUITE_CONTRACTS` shape the root `AGENTS.md`'s prompt-architecture rules name, which is why neither
half is pinned on its own. The four-shapes row pins the count itself, because adding a fifth shape to the
surface without touching the brief is the same drift one step later. The third and fourth rows' patterns
are bullet-bounded — each disallows the substring `- **` (a bullet's own opening) inside its capture, in
both the raw and whitespace-normalized text `scanContract` tries — so a standing-code bullet rewritten to
dispatch both reviewers cannot pass by reaching a later bullet's own `skip` text, and the fourth row's own
clause cannot pass by reaching the `simplicity-reviewer` bullet's unrelated text once it is no longer part
of the `final-reviewer` dispatch bullet it names. The seventh row's pattern is order-bounded instead: it
requires the staging clause's own heading text to appear, followed eventually by the `- **Range**` bullet
that opens the range list, so moving the clause back below that bullet — the original defect — fails the
row exactly as removing the clause does.
The `empty-argument` contract (ADR 0078) pins rows on `references/scope-mode.md`, which carries the `##
Resolving an empty argument` section heading; `skills/review/SKILL.md` cites that section for its own
empty-argument cascade and states its own dirty-working-tree precedence rather than folding either into
the shared section's own words; further rows pin `skills/review/SKILL.md`'s scope-slug resolution —
order-bounded, the same shape `REVIEW_RANGE_SHAPES_CONTRACTS`' seventh row uses, so a slug bullet moved
ahead of the four range shapes it must follow fails the row exactly as removing the bullet does — and its
`## The scope branch` shape-scan fallback for a run root whose ledger names no branch or a stale one; and
rows pin `skills/submit-pr/SKILL.md` and `skills/implement/SKILL.md`, one citing the shared section
and one naming that command's own candidate set (run roots neither `shipped` nor `closed` for submit-pr, features whose
slices are ready for implement) ahead of the citation. Anchored on the section's own heading and on each
citing document's literal citation and candidate-set sentences, the same shape `UNATTENDED_CONTRACTS`
uses, because a document that restates the cascade in its own words instead of citing the section reads
correct in isolation and is exactly the defect ADR 0078 removes. A further row pins `references/scope-mode.md`'s
run-root enumeration naming submit-pr's qualifying stages as every stage but `shipped` and `closed`.
The `agent-lens-list` contract (ADR 0062), one sentence row per audited agent's own lens list, a further
row where a dispatch restates that list instead of deferring to it, and `scanAgentLensNoDesignSmell()`:
`agents/slice-reviewer.md` reads the anti-pattern and vulnerability-class lenses from
`references/review-checklist.md`, plus `## Dependency verification` (ADR 0114), and `agents/final-reviewer.md` reads the anti-pattern, design-smell,
vulnerability-class, reuse-audit, and consistency lenses. Three rows pin the glossary-drift bullet in
`references/review-checklist.md`'s `## Consistency` section, the lens `final-reviewer` reads through its
consistency lens and `slice-reviewer`'s list never names: one pins the bullet, one pins its reading
strategy (grep the change's terms against the entry headwords and `_Avoid` lines, open only the entries
that match), and one pins its rule that a term the glossary lacks is no finding. Each row bounds its match
to the `## Consistency` section, so an inline ` ## ` between the heading and the bullet fails the row
falsely. Write such text in backticks there. The `orphan-lens-placement` contract below is
meaningful only because these two lists differ — the orphan lens reaches `final-reviewer` through
`design-smell` and never reaches `slice-reviewer`. The sentence rows alone pin only the sentence
each file already carries, so appending a further sentence that names design-smell — without touching
either pinned sentence — would still route the orphan lens into per-slice review with every other check
here green: exactly the one-sided-pin shape the root `AGENTS.md` names. `scanAgentLensNoDesignSmell()`
closes that gap the sentence rows cannot: it asserts `agents/slice-reviewer.md` carries no
`design-smell` / `design smell` token anywhere in the file, not only outside its pinned sentence. The
dispatch prose that reaches `slice-reviewer` and `final-reviewer` (`references/implement-full.md`,
`skills/review/SKILL.md`) defers to the agent body without restating a lens list, so those two agents'
rows close the contract alone. `agents/test-auditor.md` reads the test-cost lenses (ADR 0066), and its
own dispatch — `skills/review-tests/SKILL.md` — restates the lens set instead of deferring to the agent
body, so that dispatch carries a pinned row of its own alongside the agent-body row.

Further rows pin the test-smell entries (ADR 0134). `references/review-checklist.md` defines **Tautological test** under
`## Anti-patterns` as a test that passes whatever the code under test does. `slice-reviewer`, `final-reviewer`, and
`test-auditor` all read that section. Its rows pin the named shapes, the independent source of truth, and the probe (would
the test still pass if every call returned an empty or a wrong value). Its rows also pin the two carve-outs and the
statement that a `fail-to-pass` outcome does not clear the finding.

One row pins that **Weakened net** counts regenerating a snapshot, golden file, or recorded expected output as the same
smell. The row exempts output that the slice's acceptance criteria or the Definition of Done changed.
`agents/test-auditor.md`'s `tautological test` category restates the **Tautological test** definition. The selftest flips
the carve-out lead-in, `Two cases are not this smell`, and the regeneration clause, `is the same smell`, in the checklist
fixture. Each flip must make its own row fail.

The `orphan-lens-placement` contract (ADR 0062), `scanOrphanLensPlacement()`:
`references/review-checklist.md` names **Orphan production symbol** under `## Design smells`, states it
with its own scoping clause, and does **not** also carry it under `## Anti-patterns`. Which section an
entry sits in is the whole contract, because that is what decides who reads it: `final-reviewer` applies
the anti-pattern, design-smell, and remaining lenses, while `slice-reviewer` applies anti-patterns and
vulnerability classes alone. A slice legitimately lands a symbol whose caller arrives two slices later,
so from either section `slice-reviewer` reads, the lens reports noise on correct work, and only the
integrated scope tells an orphan from a symbol nothing calls yet. Both sections are lists of named smells
in one file, so moving an entry between them reads as tidying and nothing else would catch it. The
negative half matters on its own: a copy added under `## Anti-patterns` while the original stays put
leaves the section check green and still reaches `slice-reviewer`. The scoping clause is pinned on
wording unique to this entry, because `## Design smells` already carries `whole-scope range` in
`speculative generality`, and the looser phrase would pass on that neighbour alone.
The `test-cost-lens-placement` contract (ADR 0066), `scanTestCostLensPlacement()`:
`references/review-checklist.md` names **Dead test** and **Expensive test** under `## Test cost`, and
carries neither under `## Anti-patterns`. It is the orphan contract's shape on the test-cost lenses,
and for a second reason: each is judged against a measured duration over a whole test tree, which only
a test audit holds. `slice-reviewer` reads `## Anti-patterns` on every slice with no durations at all,
so an entry that drifts there is guessed at rather than measured. `agents/test-auditor.md`'s own lens
sentence is the other half, pinned as a third row of the `agent-lens-list` table above: the placement
decides who can read the section, and that row decides that the one agent routed to it still is. The
absent-`## Anti-patterns` gap fires on its own, so a renamed section never hides a leak into it.
The `dependency-lens-placement` contract (ADR 0114), `scanDependencyLensPlacement()`:
`references/review-checklist.md` names **Unverified dependency** under `## Dependency verification` and
carries it in no other section. The entry is judged against a slice's progress log, which only a
per-slice review holds, so every section another review agent reads is a wrong home for it.
`agents/slice-reviewer.md`'s lens sentence is the other half, pinned in the `agent-lens-list` table: the
placement decides who can read the section, and that row decides that `slice-reviewer` still does.
The `dependency-record` contract (ADR 0114) pins the implementer's half of the record the review
checks. `agents/implementer.md` and the implementer dispatch in `references/implement-full.md` each state
that the progress log names the exact package and a URL for every dependency the implementer adds, or
names the package as unverified because the documentation was unreachable and returns
`DONE_WITH_CONCERNS`. Another row pins `agents/implementer.md`'s statement that the unverified line
names no URL as checked. No dispatch can contradict it: the implementer dispatch states the unverified
line without naming a URL. The dispatch row names fix dispatches too. A further row pins
`references/review-checklist.md`'s counting rule under `## Dependency verification`: only an
implementer-written line recording the package as verified counts, and a re-review closes the finding
when the check now passes. Three more rows pin the exclusion in `references/review-checklist.md`, `agents/implementer.md`, and
`references/implement-full.md`: a dependency the repository itself provides (a workspace, path, or file
reference) is not a new dependency. The dispatch row is needed because the dispatch defines a new
dependency as a direct dependency declared in a package manifest, and without the exclusion it would
override the agent body. The selftest removes each row's own clause
and expects exactly that row to fail. Losing a row leaves the reviewer with no record to check, so every
new dependency reads Critical.
The `conflict-conclusion` contract (ADR 0123) pins the form every instruction uses to conclude a resolved
merge conflict: `git -C <run-root>/scopetree merge --continue`, in the base step of
`references/scope-mode.md`, in `references/merge-conflicts.md`, and in the DAG loop's merge step of
`references/implement-full.md`, which is the dispatch prose that reaches the controller. A `git commit`
there concludes the same merge, and the green-gate reads the landed merge from the reflog either way, but
the prose names one form. The playbook's row is anchored at the merge step's own heading, so the clause
cannot move out of the DAG loop and still match. The gate rows pin how `references/implement-full.md` and
`references/test-selection.md` state the gate: it runs after a landed merge, on a succeeding or failing
call, reports a red suite for a fix or a revert, and reads its changed-path set once the merge has landed.
The rows pin the correct statement of the gate: a document that replaces a pinned clause with a claim that
the gate blocks a merge, or that it runs on a path the hook does not run, fails its row. The rows are
presence rows, so such a claim added beside the pinned clause passes. That gap is the stated ceiling. The
selftest removes each row's own clause and expects exactly that row to fail.
The `conflict-conclusion-no-commit` contract (ADR 0123), `scanConflictConclusionNoCommit()`, is the
**negative** half: no skill, agent, or reference concludes a resolved conflict with `git commit`. A
presence row cannot fail when a step keeps `merge --continue` and adds `git commit --no-edit` beside it,
so the scanner reads every prose document for `commit --no-edit`, for a `conclude … \`git commit\``
sentence, and for "commit the merge with `git commit`". A shape-based absence check, it carries its
ceiling in `CONFLICT_COMMIT_CONCLUSION_PATTERNS`: a paraphrase such as "finish the merge by committing"
walks past.
The `label-validation` contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `skills/implement/SKILL.md`
points at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does. A rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. The
`green-gate-timeout` contract: `hooks/hooks.json` sets `"timeout": 600` on both green-gate hook entries,
PostToolUse(Bash) and PostToolUseFailure(Bash), each row anchored to its own event key so one entry's timeout never satisfies the other, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
same 600s ceiling and identifies it as Claude Code's own default for a `command` hook. Green-gate
re-runs the scope suite synchronously inside the hook, so a suite slower than the configured timeout
is killed mid-run and the gate silently does not fire. The explicit entry states the ceiling where the
suite runs and holds it if that platform default ever moves, so the check pins both the value and the
comment's account of it: a comment naming a wrong default sends a consumer whose suite is too slow to
the wrong knob, and the suite stays green until a run happens to exceed the ceiling.
The `verb-pointer` contract (ADR 0022): every ledger touchpoint in the chain invokes its
`scope.js` verb, as `references/run-init.md` does `init`, `references/run-handoff.md` `stage set merged`,
`unresolved add`, and `unresolved clear`, `skills/review/SKILL.md` `stage set`, `get anchor`, `unresolved add`,
and `unresolved clear`, `skills/document/SKILL.md` `stage set`, `skills/submit-pr/SKILL.md` `get stage`,
`stage set submitted`, `get unresolved` (for the unresolved-defect record its §3 gate and §4 body
read), and `get degraded` (for the degrade record its §4 body reads),
`skills/status/SKILL.md` `status`,
`skills/plan/SKILL.md` `get branch --root` (for
the refusal signal its §0 reads before extending a feature), both execution
playbooks `slice`, `references/scope-mode.md` `degraded add`, `references/implement-lite.md` `docs set`
(the inline-doc-pass record, ADR 0031), `skills/document/SKILL.md` `get docs` (read before it decides whether
to dispatch a `doc-writer`), and `skills/review/SKILL.md` and `references/run-handoff.md` `docs clear`
(when a fix cycle of either lands commits, the cap path included). A
document that drops its verb goes
back to hand-editing or hand-parsing the ledger, which the `ledger-guard` hook only catches as a tool
call at runtime, never as prose. No row pins `skills/publish-kb/SKILL.md` to `get branch` (ADR 0069):
`plugin/scripts/publish-kb.js` reads the scope branch by `require`ing `readLedgerHeader` directly, real
code no verb-invocation pattern can match, and `tests/publish-kb.test.js`'s ledger-route assertions cover
the behavior instead. No row pins a `scope.js` verb on `references/run-init.md` or `skills/plan/SKILL.md`
for a base-branch write (ADR 0079): no superdev command commits to the base branch, and the
`no-base-branch-commit` check (INV-0001, below) is what catches a reintroduction of that commit, not this
table.
The `planned-handoff` contract (ADR 0079, ADR 0080) pins rows on `plugin/scripts/scope.js`, which ranks `planned`
below `implementing` in `STAGE_RANK` and carries the `root <slug>` verb; `skills/plan/SKILL.md` writes the
ledger with `scope.js init` and commits what the scopetree holds on the scope branch before writing it;
`references/run-init.md` takes a `planned` ledger by skipping `init` and moving the stage forward to
`implementing`; `references/scope-mode.md` names a `planned` ledger as the `resumed` run kind
`/superdev:plan` already cut, and names `/superdev:plan` as a second run-lock writer beside the
execution playbooks; and further rows are `skills/plan/SKILL.md`'s own dispatch sentences citing
`scope-mode.md`'s cut rule and its run-lock section rather than restating either. Each half reads correct
alone — `scope.js` can carry the stage and verb while `skills/plan/SKILL.md` stops writing the ledger or
committing in the scopetree, and `scope-mode.md` can still state the rule while `skills/plan/SKILL.md`
stops citing it — which is the one-sided-pin shape the root `AGENTS.md`'s prompt-architecture rules name.
The `base-merge` contract (ADR 0120, INV-0124) pins `plugin/references/scope-mode.md`'s
`## Bringing the scope branch to base` section, its fetch under the Bash tool's `timeout`, its ref-only
fast-forward `git fetch . <tip>:refs/heads/<base>`, its merge of the fetched tip in the scopetree and the `base set` that records it, its
full-suite gate that re-runs until `suite reusable` accepts the tip and runs the full command itself through the Bash tool after any
merge, clean or resolved, its `lite`-tier in-progress-slice skip, its degraded pass with the same-reason dedupe, and its resolution of a conflicting
base merge by intent through `plugin/references/merge-conflicts.md`, whose numbering-collision rule it pins
too. It also pins the call to that section, with its placement sentence,
in both `plugin/references/implement-lite.md` and `plugin/references/implement-full.md`. Each half reads
correct alone: the section can stay intact while a playbook stops calling it, and a playbook can keep citing
a section that has lost a clause. Rows also pin each consumer's citation of `## The scope's range base`,
the `scope.js base resolve --branch` call in review, backlog, the implementer, and run handoff, backlog's
`git merge-base` fallback for a row with no run root, and the range base in review's empty-argument step 2.
Further rows close a Critical review finding that `init` stamped `**Stage:** planned` unconditionally
regardless of who was writing the ledger: `plugin/scripts/scope.js` carries `INIT_ENTRY_STAGES`, `init`'s
required entry-stage argument with no default, and `references/run-init.md`'s own `init` call — the one
caller with no `/superdev:plan` interval to enter through — names `implementing` rather than leaving the
argument to a default `scope.js` might grow back.
Rows close the review's Minor D finding — the two triage closures the prior fix cycle left
unpinned: `skills/plan/SKILL.md` passes `planned`, never `implementing`, at its own cut-time write
(`scope.js init <type>/<scope> planned`); it writes the ledger right at the cut rather than waiting for
§6 (triage #509's own closure); and it reads `<run-root>/run.lock` unconditionally before §2's first
write, whether or not a cut happens below (triage #510's own closure). A document that drops any one of
the three silently reopens the exact gap that closure named.
Final rows close the review's Important A finding: `references/run-init.md` names a `planned` ledger
carrying no slice rows as an interview abandoned between the cut and the slice-table write, never a normal
`resumed` run — the `planned` bullet's own text says to check the store's slices before choosing `stage
set` (an interview that finished) or a re-init at `implementing` (one that did not) — and the adopt path
carries the same check for an adopted snapshot that lands at `planned` with an empty slice table. Losing
either row lets `/superdev:implement` silently adopt a header-only ledger as ready work.
The `no-base-branch-commit` contract (INV-0001, `docs/invariants.md`), `scanNoBaseBranchCommit()`: no
file under `skills/` or `references/` instructs a commit, a push, or a merge to the base branch, whether
the target is named by the phrase `base branch` or by the base's own configured name (read from
`docs/agents/code-management.md`'s `**Base branch:**` bullet, so a consumer repo whose base is named
something else still gets a check that is true for it), other than `/superdev:ship`'s own squash-merge
through the host's merge API (ADR 0096, INV-0092) — the one site this scan admits, and only when
`skills/ship/SKILL.md`'s own text sits next to the host's-merge-API wording, never by file alone: a
merge-to-base instruction anywhere else in ship's own file, without that wording nearby, still fails.
The verb (`commit`/`push`/`merge`, any inflection) and
the target have to sit within a small sliding window of joined lines, one file at a time. A `never`
excuses the match only when it sits immediately next to the *verb* ("Never commit … to the base
branch") or immediately next to the *target* ("commit … never onto the base branch",
`references/prototype.md`'s own caution) — not merely somewhere between the verb and the target: a
`never` negating an unrelated aside earlier in the same sentence ("commit … (never mind the formatting)
… to the base branch") is still a live instruction. The configured name is a git
target only when backtick-quoted or pushed to `origin` (`` `main` ``, `origin main`), never as a bare
word, since a base branch's name (`main`) is also ordinary English ("the main checkout"). `push-only` (a
PR posture value `skills/setup/SKILL.md` and the code-management seeds carry) is excluded by requiring
the verb not be immediately followed by a hyphen, since the hyphenated compound names a config value,
not an instruction to push anywhere. The reported line is the sliding window's own start line, which
sits close enough to the offending sentence's own first line even across its hard wrap. The window is a
4-line/150-char proximity heuristic, not a parser — an instruction split across 5 or more lines is
missed (a documented ceiling, widen `BASE_BRANCH_COMMIT_WINDOW` if that shape turns up for real).
`negated()` tests the full document up to a match's absolute offset, never only the sliding window that
found it, so a caution split across a line break — "but never\ncommit it to the base branch" — reads
correctly even once the window's own start has slid past the `never` line; every hit in a file is
reported, keyed on its absolute offset so a real violation later in the same file is never masked by an
earlier one the scan already excused. **Its reach is narrow: it catches a verbatim revert of prose this
scope deleted, never a paraphrase.** The verb/target pattern is fixed shape (`commit`/`push`, any
inflection, near `base branch` or the base's own configured name), so it misses a target stated before
its verb ("to the base branch, commit…"), a `<base>` placeholder spelling instead of the literal phrase
or name, and anything sitting inside a fenced code block (masked out, the same way every other scanner
here treats a fence). A green `no-base-branch-commit` is evidence against one specific phrasing, not
proof that no shipped document instructs a base-branch write.
The `ship-human-only` contract (INV-0093), `scanShipHumanOnly()`: `skills/ship/SKILL.md` carries
`disable-model-invocation: true` in its frontmatter, and none of `skills/ship/SKILL.md`,
`skills/verify-ship/SKILL.md`, and `skills/wrap-up/SKILL.md` carries an `--unattended` token anywhere. None has an
unattended mode of its own, unlike every step the implement chain drives (ADR 0096, ADR 0106, ADR 0132).
Absent skill files are skipped, matching every other contract scanner.
The `model-invocation-split` check (INV-0066), `scanModelInvocationSplit()`: `skills/implement/SKILL.md`,
`skills/review/SKILL.md`, `skills/document/SKILL.md`, and `skills/submit-pr/SKILL.md` carry no
`disable-model-invocation: true`, because an unattended run invokes each through the Skill tool and a step
off that surface strands the run there. `skills/setup/SKILL.md` and `skills/plan/SKILL.md` carry none
either, because `/superdev:plan` and `/superdev:implement` start them through the Skill tool, and so do
`skills/verify-ship/SKILL.md` and `skills/wrap-up/SKILL.md`, because `/superdev:ship` starts them through it
(ADR 0132). The key counts only inside the frontmatter. Ship's half is `ship-human-only`'s. Absent skill files
are skipped.
The `invocation-start` contract (INV-0093, ADR 0132): the `description:` line of `skills/verify-ship/SKILL.md`
and of `skills/wrap-up/SKILL.md` opens with the start condition, that the operator asked for the skill or agreed
to `/superdev:ship`'s offer. A model reads the description when it picks a skill, so a condition stated only in
the body fails the pin. The platform enforces nothing once the flag is gone, so this pin and each skill's own
gates carry the bound.
The `skill-tool-invocation` contract (#944): every stop where `skills/plan/SKILL.md` or
`skills/implement/SKILL.md` starts `/superdev:setup` or `/superdev:plan` tells the agent to call the Skill
tool, one row per stop, each anchored on that stop's own condition. Two more rows pin what gates those
calls: implement's `--unattended` block and `references/scope-mode.md`'s rule that an unattended command
never starts an interview command. A last row keeps the ad-hoc review's act-on-findings line addressed to
the operator. The two one-fence rows of `paths-derivation` pin the same Skill-tool call for INV-0007.

The `staged-close` check pins how a scope's close names its staged pages (ADR 0119). `references/scope-mode.md`'s
`## Staged pages at close` reads the page count through `scope.js staging <scope> --count`, names a
count above zero with the directory and that wrap-up keeps the pages, and says nothing at zero. Ship's
hand-off, verify-ship's end message, and wrap-up's finish each cite that section (INV-0123). Ship's
and verify-ship's rows also pin the condition on the `Or: /superdev:publish-kb <scope>` line: the line
appears only when the count is above zero. The check
also pins wrap-up's gate reason for a staged file under the scopetree's or a slicetree's own
`.superdev/kb-pending/`, ahead of its `## 6. Clean up` step, so the refusal comes before
`git worktree remove` deletes the ignored file (INV-0122).

The `kb-staging` and `kb-no-backend-call` checks are the ADR 0023 knowledge-base contracts, checked in two
halves because either alone passes while the invariant is gone. The `kb-staging` half: `skills/plan/SKILL.md`,
`skills/document/SKILL.md`, and `references/doc-pass.md` each name the `.superdev/kb-pending/` directory
`scope.js staging` prints. That directory is the place a remote backend's page goes instead of a live call.
`references/implement-lite.md` and `agents/doc-writer.md` each take the staging path from that verb. The
dispatch prose and the agent body that receives the path are both pinned (ADR 0119, INV-0121). A negative
row per staging document fails a restored cwd-relative instruction. Each row is a whole-document negative
lookahead. It rejects these phrasings: "in the invoking checkout" after a `kb-pending/` path, "resolved from
the invoking checkout", a "checkout-relative" `.superdev/kb-pending`, and "against your own cwd".
The
`kb-no-backend-call` half, `scanKbNoBackendCall()`: none of those three, nor `agents/doc-writer.md`,
carries a backend-directed verb. The check keeps `doc-writer.md` in this list, because the agent still dispatches the knowledge-base pass, and a regression
could add a backend call to its own framing without touching the reference at all. The verb checked is
publish, create, update, or upsert, in any morphology, so a passive "is published to" or a gerund
"updating the wiki page" counts too. An HTTP `POST`, `PUT`, or `DELETE` counts as well. The verb must
be aimed at a page, wiki, space, or backend object.
`skills/publish-kb/SKILL.md` is exempt, because dispatching the one path to the backend is its job, and
`plugin/scripts/publish-kb.js` — the script that job now runs as (ADR 0069) — is exempt too, for the
opposite reason: it is real code making a real `/bin/sh -c` call, not prose this instruction-shape scan
reads at all, so the list was never asked to carry it. The check reads the
instruction's shape rather than a backend's literal endpoint or credential name, because
**Backends are pluggable** already forbids these documents from naming a backend at all, so a
literal-only marker would catch almost nothing.
The `kb-read-never-write` check (ADR 0094, INV-0091) pins the rule `kb-no-backend-call` still forbids a
write to: `references/doc-pass.md`, `agents/doc-writer.md`, and `skills/document/SKILL.md`'s own dispatch
prose each carry the sentence stating the doc pass may **read** a remote knowledge-base backend and never
**writes** to it — the reference and the agent body verbatim, the dispatch prose in its own words that
agree (ADR 0035). Losing the clause from any one of the three fails that row alone.
The `no-second-reader` contract (ADR 0022), `scanHookLedgerParsers()` scans every
`hooks/*.js` file for a literal `**…:**`-shaped header regex. This pattern marks whether a hook grows a
ledger-header reader of its own instead of `require`ing `scope.js`'s `readLedgerHeader`. It reads the
pattern's shape rather than running the hooks, because the same drift happened to `scope-prune.js`'s own
copy. A second reader can diverge on anchoring, capture width, newline handling, or markup normalisation
silently, and prose alone would not have caught it.
The `test-selection-wiring` contract (ADR 0025): `agents/implementer.md`,
`references/implement-lite.md`, `agents/slice-reviewer.md`, and `skills/document/SKILL.md` each still instruct
themselves to read `references/test-selection.md` **and run the command it selects**. The row is anchored
on that clause, not the bare mention, so a document that keeps the path in a passing aside but drops the
run instruction still fails. The fourth consumer is the odd one out: the other three narrow a run inside
the implement loop, before the review's full-suite runs, while `skills/document/SKILL.md` runs after them —
a doc commit lands on the scope branch once the review has already passed, and nothing else re-verifies
it before the pull request, so the documentation step judges just what it changed with the same focused
command, never the full suite (ADR 0025). The `doc-pass-range` contract (ADR 0128, INV-0017):
`references/test-selection.md` and `skills/document/SKILL.md` both state that, on a live run whose suite
record's commit is an ancestor of the tip, the documentation step's focused run covers every path changed
since that commit. `scope.js suite reusable` carries a green record across Markdown-only commits on the
strength of that run, so a run over the doc commits alone would leave a commit another author landed after
the review unverified. Each row is anchored on the range clause, and losing it from either document fails
that row alone. The `suite-carry` contract (ADR 0128, INV-0017): `references/scope-mode.md`'s suite
record bullet, `references/run-handoff.md`, `skills/review/SKILL.md`'s reuse gate, and
`skills/ship/SKILL.md` each state that `scope.js suite reusable` carries a green record across a
Markdown-only range, not only on an exact tip match. Each row is anchored on the carry clause and its ADR,
and losing it from one document fails that row alone. The `submit-pr-whole-repo` contract (ADR 0105, INV-0017, INV-0009), on `skills/submit-pr/SKILL.md`'s
§4: a red whole-repo run opens no pull request, records an unresolved defect, leaves the stage where it
was, and names `/superdev:review`; a denied run opens none, records `denied` of kind `whole`, and writes a `**Degraded:**` entry; a
killed or never-started run opens none and records no green result; the red and denied paths' snapshot publish
cites `## Publishing run state` at the write, the Denied bullet's own text anchoring its row; the red, denied, and killed
or never-started paths each state that `--unattended` blocks; and the reuse check passes `--whole`, so only a record of kind `whole` spares the run. Each row is
anchored on its clause, so a rewrite that drops the stop or the kind while keeping the step still fails.
The `affected-form` contract (ADR 0105, INV-0105):
`references/test-selection.md`'s guarantee — an affected form never selects fewer projects than the
change can break, dependents included, and selection by path prefix does not qualify — is anchored on
that clause in the reference, and `skills/setup/SKILL.md`'s decision E carries the matching writer-side
guarantee: it probes the affected form on the base branch's own tip before writing it, and writes none
until a missing dependency-graph tool is installed. A second row pins its second probe: the tool's list
mode must select a project on a committed change in a throwaway worktree, and a form that selects none is
not written. The first probe runs in a throwaway worktree at the base branch's tip under the second
probe's location, creation, hook-free, and always-removed rules, and `check` mode flags a full command that looks affected in a document with no
`## Whole-repo command` section. Each row is anchored on the substantive clause, not
the passing "affected form" mention, so a rewrite that drops the guarantee while keeping the term still
fails its row.

The `whole-repo-ship` contract (ADR 0105, INV-0092): `skills/ship/SKILL.md` adds `--whole` to its
`suite reusable` calls. Where a whole-repo command is configured and the tip carries no green whole-repo
result, ship runs that command itself on the tip, records it with `--whole`, and merges nothing on a red,
denied, or killed result. The same rule covers a moved base's merged tip, never counting the green-gate's
own pass, and the whole-repo run replaces the full-command run on that merged tip. Before its own run, ship refuses when the suite record reads `none` without the `whole` kind, at
any sha, and an unresolved defect stands, naming the finding and pointing at `/superdev:review`, so ship
never overwrites review's invalidation. Ship's own killed run records `none … whole`, which carries the
kind and does not trigger the refusal. A killed or never-started whole-repo run is recorded that way by
`/superdev:submit-pr` too. Each clause has its own row, the refusal and the merge-nothing bullet included.

The `full-suite` contract (ADR 0025, ADR 0075). `skills/review/SKILL.md` still
runs the full suite itself, before dispatching `final-reviewer`. It states that a `fail` there is itself
a Critical finding folded into the fix loop. It states that the stage does **not** advance while a
full-suite fail, or a Critical or Important finding, stands. That last clause is the one that blocks a
red scope, distinct from the finding merely being named. ADR 0075 adds the loop's own rows: each fix
cycle runs the focused command over the fix diff and hands that result to the re-review; a full suite
runs once more when a verdict first comes back clean, with a red result there counting toward the
3-strike cap (a remainder of only Missing RED, Pass-to-pass, and Missing fail-to-pass run findings at the cap advances instead, ADR 0125, ADR 0134); and a denied exit run takes the entry run's own local deviation — record and continue
attended, block unattended — rather than the generic record-and-continue default, since it is the gate
the stage advances on. Each row lost has its own failure — dropping the exit run advances a stage on a
suite that never saw the fixes, dropping the focused cycle run silently reinstates a full suite per
cycle, the cost ADR 0075 removed, and dropping the exit run's own local deviation advances an unattended
stage on the entry run's suite alone. Further rows carry ADR 0105's review clauses: a review entered
on a red `whole` suite record runs the whole-repo command in place of the full command, records it with
`--whole`, and keeps fix cycles on the focused command; the exit run is then the whole-repo command
recorded with `--whole`; the result handed to `final-reviewer` is labelled whole-repo; and
`agents/final-reviewer.md` accepts a result so labelled as the full run. `agents/final-reviewer.md` reviews a live
scope against whichever result the controller hands it — full entering or leaving the loop, focused
inside a cycle — running no suite of its own, and states that
`Full-suite run: fail` makes the verdict `Ready to merge? No` on its own. Its ad-hoc branch keeps its own
re-run, which is the only verification a range with no controller behind it gets. The `skills/review/SKILL.md`
dispatch rows pin that command's own dispatch sentence — the prose that reaches `final-reviewer` at
runtime alongside the agent body — so it hands the result, names which run it is, and tells the reviewer
to review against it,
running no suite of its own, never that its own re-run "stays optional." That sentence is the live path: a
leak there reopens the duplicate run regardless of what `agents/final-reviewer.md` itself still says.
Further rows sit on `references/run-handoff.md`, implement's own full-suite run — every scope gets exactly
this one, whatever its slice types (ADR 0091): the entry run itself, and the fix loop's own two clauses —
a cycle inside it runs only the focused command over the commits that cycle's implementer just landed, and
a cycle's clean focused run is followed by exactly one full re-run, whose own red result counts toward the
loop's 3-strike cap. Losing any one row quietly reopens a gap: dropping the entry run leaves every scope
reaching `/superdev:review` with nothing for it to reuse (INV-0017); dropping the focused-only clause
reinstates a full suite per cycle, the cost ADR 0075's loop shape avoids; dropping the exit run lets a fix
read as done the moment its own diff passes narrowly, with the full suite never run again.
The `paths-derivation` contract (ADR 0074), one row per branch `skills/setup/SKILL.md`'s decision **E**
takes, plus one row per section of `references/test-selection.md` that states the self-detecting-flag
clause — the `{paths}`-token section, anchored on the worked `vitest --changed --passWithNoTests` and
`jest -o --passWithNoTests` forms that appear only there, and the fallback section, anchored on its own
"never a self-detecting runner flag" exclusion. Anchoring both on the generic wording made the first row
satisfiable by the second section, so deleting a whole statement left the table green. What the rows say: a
runner that maps source files to the tests covering them gets a `{paths}` form, a runner that maps
nothing gets a `{paths}`-less fast subset instead of being routed to `none`, a self-detecting `{paths}`-less
runner flag carries that runner's own pass-with-no-tests flag for the same reason a `{paths}` form does,
and a repository with a suite never reaches `none` at all (ADR 0085, INV-0007): the already-cheap and
cannot-narrow cases both write the full command again as the second fence, with the reason recorded as
prose beside it, and the write step's own examples are pinned the same way, including the cannot-narrow
one. Losing a row leaves a repository on the wrong command while the rest keep the check green, and
losing the fast-subset row is the expensive direction: it routes every non-mapping runner back to `none`,
which is the full suite at every in-loop caller — the cost ADR 0025 removed.
Further rows guard the stop half of ADR 0085 / INV-0007, the side that replaced silent inference with a
loud one: rows on `references/test-selection.md` — its `## Stop on a missing focused command` section
naming `/superdev:setup` on one fenced block, unreachable once `/superdev:plan`/`/superdev:implement`
have auto-invoked setup, and its naming of `hooks/green-gate.js` as the one exception that runs the full
command and emits a notice instead of stopping — plus one row each on `skills/plan/SKILL.md` and
`skills/implement/SKILL.md`, pinning that their existing config steps treat `docs/agents/verification.md`
carrying one fenced block as missing configuration too. Losing either `test-selection.md` row reopens the
silent full-command inference the fallback used to take; losing a skill row leaves that command's own
config step never reaching `/superdev:setup` for a repository stuck on one fence.
The `unmapped-paths-form` check (ADR 0074), `scanUnmappedPathsForms()`, is that contract's negative half,
and neither is worth much alone: the table above cannot see a bad example, and this scan cannot see a
derivation that vanished. It denylists a `{paths}` form proposed to a runner that maps nothing — `pytest`,
`go test`, `cargo test`, `mvn`, `gradle`, `dotnet test`, `rspec`, `phpunit` — across the two documents
that propose a focused command, `skills/setup/SKILL.md` and `references/test-selection.md`. Such a runner
is handed source paths it collects nothing from, and reports RED on a change set holding no tests, which
is the documentation step's own range on every scope. `pytest {paths}` shipped in exactly that position,
and is where ADR 0074 came from. The scan reads a **command**, never a mention: only flags, path
arguments, or a bare `--` separator may sit between the runner and the token, which is what keeps it off
the prose that explains the rule and necessarily names both. Its ceiling is the denylist itself — a runner
outside it passes silently until a row names it.
The `deployment-posture` contract (ADR 0101, INV-0098): `references/deployment.md` carries the `##
Posture` section naming `none`/`manual`/`auto`, the `## Targets` table with its name/command/read-only-
reach columns, the absent-document-reads-as-`none` default, and the ship-only/`auto`-only sentence
INV-0098 states; `skills/setup/SKILL.md` proposes `manual` as decision **G**'s default and never proposes
`auto`, and lists `deployment.md` among the documents its `check` mode reports. Four more rows pin the
one `Posture:` line form: the seed states that `/superdev:ship` reads the posture from that line, and that
a document carrying no such line reads as posture `none`; `skills/ship/SKILL.md`'s own deploy gate states
the same read; `skills/plan/SKILL.md`'s own deploy question states the same read too (whole-scope review,
ship-deploys fix cycle 1 — it used to cite the `## Posture` section alone, which a document carrying that
heading but no `Posture:` line would satisfy on a plain-text reading it should not); `skills/setup/SKILL.md`
writes decision **G**'s answer as that same `Posture:` line, never
a bare value. A last row pins that `references/AGENTS.md` routes `deployment.md` in its own table row
rather than lump it into the three-backend "every other file here is a backend seed" sentence, since it is
one seed for every repository, never a per-backend choice (same fix cycle). Rows pin that the seed's
`## Targets` section and setup's decision **G** both state that, under `auto`, a target's command runs in
a tree detached at the merge commit that can still carry ignored files from the run — installed
dependencies, build output — so the command must not rely on their presence or absence, and an operator
writing one knows it has to install and build what it needs (#751). Losing a seed row leaves the
document free to omit the shape `/superdev:plan` and
`/superdev:ship` both read; losing a setup row reopens the risk ADR 0101 named directly — a default that
runs a deploy command against a live system nobody asked to automate, or a `check` mode blind to a seventh
config document the other six already get; losing one of the four posture-line rows lets setup write, or
plan or ship read, a form the other side no longer recognises; losing the routing row lets the routing
table misdescribe `deployment.md` as a pluggable backend it is not.
The `plan-deploy-line` contract (ADR 0101): `references/plan-contract.md`'s `## Scope anchor` section
defines the `**Deploy:**` line as optional, anchor-only, and reading as deploying nothing when absent;
`skills/plan/SKILL.md` asks what the feature deploys to in §1, under `manual`/`auto` posture, offering
only the recorded targets plus `none` in the operator's own answer order, asks nothing under `none`
posture or with no recorded target, and writes the line on the scope anchor in §6, revising it in place
on an append; `docs/agents/issue-tracker.md` and every `references/issue-tracker-*.md` seed state how the
line is written and read on that store, by the same body-edit each
already uses for `**Blocked by feature:**`. Each document is its own row: losing plan-contract's
definition leaves the line's shape undocumented even while plan still writes it, losing plan's own
question or write leaves the field defined but never produced, and losing a store's own row leaves that
backend's write/read path unstated, silent on exactly the store a repository has configured. Seven further
rows pin the promotion clause each document also carries: plan-contract.md and skills/plan/SKILL.md state
that the deploy line migrates to the new epic on promotion, the same way as the anchor-dependency line
(*Extending a single-slice feature creates the epic first*), and each store document's own `## Append
mode` migration list carries the deploy line alongside the anchor-dependency line. Losing any one of
these leaves that document's promotion rule silent on the deploy line, stranding it on the lone slice
after promotion while the new epic — the record `/superdev:ship` reads — carries none.
The `repairs-line` contract (ADR 0124, INV-0131): `references/plan-contract.md`'s `## Scope anchor`
section defines the `**Repairs:**` line as optional and anchor-only, naming the original anchor, and its
*Append mode* migrates the line to the new epic on a single-slice promotion, the same way as the deploy
line. `docs/agents/issue-tracker.md` and every `references/issue-tracker-*.md` seed each carry four rows:
the field mapping, the **Record the Repairs line** write, the **Read an anchor's Repairs line** read with
its absent-line reading, and the line's own promotion sentence. Each document is its own row, because
losing one store's row leaves the backend a repository has configured unable to write or read the link
that `/superdev:plan`, `/superdev:backlog`, and `/superdev:wrap-up` rely on.
The `plan-repair-choice` contract (ADR 0124, INV-0131, INV-0004): `skills/plan/SKILL.md`'s §0 asks new,
extend, or repair; repair lists exactly the `shipped` run roots whose `dod.md` holds a `not met:` verdict,
read by the note, marks a candidate an open repair already names and still lets it be picked, says there
is nothing to repair when no candidate exists, and stops naming `/superdev:setup` when the store document
describes no Repairs line. The repair is a `fix` feature whose Definition of Done copies none of the
original's criteria, its label defaults to `fix/<scope>-repair` with the first free numeric suffix, and §6
writes the Repairs line on the repair's own anchor and nothing to the original. The extend refusal names
the repair choice for a shipped feature holding a `not met:` line, in plan and in
`references/plan-contract.md`'s *Append mode* alike, and `references/cross-exam.md` keeps the three-way
question among the skill-required ones. Each clause is its own row, so losing one fails on its own.
The `repair-routing` contract (ADR 0124, INV-0116, INV-0131): `references/scope-mode.md`'s `## Routing a
shipped run` names the repair outcome among its routes and sends a run holding a `not met:` line to
`/superdev:plan`'s repair choice, or `/superdev:verify-ship` again, ahead of the other two routes. Its
callers name the same command: ship's hand-off, document's leave-alone hand-off, and run init's
shipped-run stops. `skills/verify-ship/SKILL.md` ends on the repair choice while a line reads `not met:`,
with verify-ship again on the `Or:` line. `skills/backlog/SKILL.md` carries the `awaiting repair` and
`needs repair` buckets and maps the rule's repair outcome onto them. `skills/wrap-up/SKILL.md` hands a
closed repair to its original through the routing rule, names nothing for an original that is closed,
missing, or unresolvable, and still refuses on a `not met:` line whatever repair exists. Each clause is its
own row.
The `entries-standing-gate` contract (ADR 0026), `scanShipGateContract()`: `skills/submit-pr/SKILL.md`
§3's own "Entries standing." paragraph asks once whether to submit with a standing unresolved defect, and
refuses outright under `--unattended`. §3 also carries an unrelated, pre-existing gate (the warning about a
missing review or document step) using the identical ask-once and refuse-under-`--unattended` phrasing
for a different question. Both halves are therefore matched inside the "Entries standing." paragraph
alone, extracted with the same `extractSection()` helper `scanAnchorContract()` uses, anchored on the
paragraph's bolded lead-in rather than a markdown heading. A whole-file match lets the unrelated gate
satisfy either half after the entries-standing gate's own clause is deleted. A consumer that keeps §4's
`## Unresolved defects` pull-request heading and loses either half still reads right and ships a broken
branch, the exact failure every other contract in this file exists to catch. The `ship-no-opens-pr`
contract (ADR 0096), `scanShipNoOpensPr()`: nowhere under `skills/`, `agents/`, `references/`, or
`README.md` does the open-the-pull-request phrase attach to `/superdev:ship` — attach meaning
`/superdev:ship` is immediately followed, within 80 chars and with no other `/superdev:<name>` mention in
between, by that phrase — since `/superdev:submit-pr` opens it and `/superdev:ship` only merges what is
already open. The attachment test, rather than whole-sentence co-occurrence, is what lets "Once
`/superdev:submit-pr` opens the pull request, `/superdev:ship` merges it" pass: the phrase there attaches
to submit-pr, and `/superdev:ship` is never its subject, even though both names sit in one sentence.
`docs/adr/` carries the same pairing repeatedly, describing the design as it stood before ADR 0096 split
the two commands apart, and is deliberately outside this check's reach: an ADR is history, not a shipped
surface. The `unresolved-glossary` contract
(ADR 0026), `scanUnresolvedGlossaryContract()`: `CONTEXT.md`'s **Degraded pass** and **Unresolved defect**
entries restate what `references/scope-mode.md`'s `## Degraded passes` and `## Unresolved defects`
sections define: that a degraded pass is never a failure of the code under review, and an unresolved
defect is exactly that. Each fact is pinned once per document, in its own wording, as a canonical clause
that must appear verbatim. That is the same literal-phrase shape every other contract in this file uses.
What separates a correct sentence from a contradiction here is coreference (which subject a clause
attributes to), which no pattern-matching heuristic can recover, so the check requires the clause's exact
words in their exact order: a negated, reworded, or dropped clause fails the same way a dropped clause
does anywhere else in this file. Both sides of the comparison are whitespace-normalized first, so runs of
whitespace, including a line break, collapse to a single space. That matters because `CONTEXT.md` and
`references/scope-mode.md` are hard-wrapped and a canonical clause can span a line break in the real
document. Nothing executes the glossary, so it is the copy most likely to drift.
The `arg-token` contract: `hooks/merge-guard.js`, `hooks/green-gate.js`, and `hooks/ledger-guard.js`
each carry the canonical `const ARG = …` shell-word token **verbatim**. The three parse the same shape
out of a Bash command line by hand, and nothing links the copies, so this pins the literal rather than
testing mutual equality. A token that narrows in one hook reopens the quoted-argument bypass there:
`git -C "my repo" merge` walks past the guard. A token with a narrower reading of a command substitution
or a `${…}` parameter expansion reopens a second bypass:
`git -C $(git rev-parse --show-toplevel)/wt merge` or `git -C ${X:-a b} merge`. A deliberate improvement
is meant to reach all three hooks and this pin in one commit. `ledger-guard.js` also scans with a second
token, `RAW_ARG`, which no pin covers. Same shape as the scope-slug charset assertion in
`tests/scope.test.js`.
The `audit-set` contract: `skills/setup/SKILL.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `skills/document/SKILL.md` still reads that
section back with its stated fallback for when it is absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. These documents agree on the section only in
prose, the same shape as the `arg-token` triple. A renamed heading or a dropped
fallback clause leaves the section unreachable in every repo that carries it, unnoticed, until a doc
audit runs on one and finds nothing there.
The `chained-code-review` contract (ADR 0068) pins rows on `skills/review/SKILL.md`: it still names
`--chained`, the signal a sweep passes its code leg; it still runs no `git add -N :/` once that flag is
present, so the leg never writes an intent-to-add entry into the index; and it still never enters scope
mode, whatever the invoking checkout's `HEAD` is. Separate rows because the signal and its behaviours sit
in separate places in §1 — the extraction, the untracked-files step, and the scope-mode bullet — and a row
anchored where each lives is what keeps an edit to just one of them from leaving the others silently
unpinned, the same shape `chained-doc-audit` and `chained-test-audit` already use. Only the code leg can
reach scope mode — the other three legs never could — so this contract closes that one risk by
construction: `--chained` makes every write path scope mode opens unreachable from the code leg, with
nothing for `/superdev:sweep` itself to check or refuse first.
The `chained-doc-audit` contract (ADR 0068) pins rows on `skills/document/SKILL.md`: it still names
`--chained`, the signal a sweep passes its doc leg, and it still dispatches no `doc-writer` and commits
nothing once that flag is present, whatever the reader found. Both rows pin the same document because
the signal and the posture it triggers live in one place — losing either half silently reopens the
mid-sweep commit ADR 0068 rejects, while the suite stays green and the prose still reads correct on its
own.
The `chained-test-audit` contract (ADR 0068) pins rows on `skills/review-tests/SKILL.md`: it still
names `--chained`, the signal a sweep passes its test leg; it still runs no `AskUserQuestion` once that
flag is present; it still labels every dead-or-ignored-test finding `fact` and every remaining finding
`judgment`, keeping that split distinguishable in what it returns — the sweep's own agreement round asks
about judgments alone; and it still writes no intent and prints no handoff, returning the findings to
the caller instead. Separate rows because the signal and its behaviours sit in separate places in the
file — §1's extraction, §5's round and its label, and §6's write — with §5 alone hosting more than one
of them. A row anchored where each lives is what keeps an edit to just one of them from leaving the others
silently unpinned, the same one-sided-pin shape `chained-doc-audit` guards against on the doc leg. The
§6 row is anchored on that section's own bolded clause (`**\`--chained\` present** — write no intent and
print no handoff`), not on a `--chained`-then-window match: an earlier, unrelated bullet in §1 also pairs
`--chained` with the phrase "write no intent and print no handoff" within the same window, so a looser
pattern stays green even once §6's own clause is rewritten to write something.
The `sweep-chained-legs` contract (ADR 0068) pins rows on `skills/sweep/SKILL.md`: it still dispatches
its code leg as `/superdev:review <path> --chained`, its doc leg as `/superdev:document audit --chained`,
its test leg with `--chained`, and its config leg as `/superdev:setup check` rather than bare
`/superdev:setup`. Each row is anchored on §2's dispatch table row for that leg, never on the bare
invocation string — §3's report header repeats every leg's invocation verbatim, so an unanchored pattern
stays green off that header alone once §2's own row drops the flag or the argument, the false green a
whole-tree review found in the doc and test rows before this contract anchored them. `chained-code-review`,
`chained-doc-audit`, and `chained-test-audit` each pin only the callee's own reading of the flag; nothing
pinned the caller side until `/superdev:sweep` existed to dispatch it, so a later edit could drop the flag
(or, on the config leg, the `check` argument) from the sweep's own table while every callee contract stayed
green — the code, doc, or test leg would then read and repair the sweep's own tree mid-sweep, unchained, or
the config leg would open the full interactive interview mid-sweep, with nothing failing to say so.
The `aggregate-page` contract (ADR 0027) pins rows. `references/doc-pass.md` and
`skills/plan/SKILL.md`, the two stagers, each stage `action: patch` carrying one section for an outline
entry marked aggregate. `plugin/scripts/publish-kb.js` applies it by merging through `kb-patch.js`'s
exported `merge()`, and `references/knowledge-base-confluence.md` documents the `(aggregate)` marker
that decides which pages get one. The `publish-kb` row retargeted from `skills/publish-kb/SKILL.md`'s
prose onto the script (ADR 0069): it is anchored on the `require`/call shape, not on the word `patch`, so
a script that keeps the action but splices the section in by hand still fails — a script cannot
paraphrase its own merge call away the way a document's prose could drift from what it describes. The
marker row is the quietest to lose. Every other document still reads correct, the doc pass never marks a
page, and it stages `upsert` forever, replacing an aggregate page with the one section a scope can see.
That is the state that left this repository's own `ADR summaries` page four decisions stale.
The `read-path` contract (ADR 0027) pins a row on `docs/agents/knowledge-base.md`: a config document that
marks an outline entry `(aggregate)` documents the call that returns a `patch`'s live body. The row is
conditional rather than a bare pattern: it documents a call returning the page body only when it marks
some outline entry `(aggregate)`, so a config document that marks none owes no read, and the row is
implemented as a `test()` function rather than a literal `RegExp` to express that. The table used to
carry a second row pinning `skills/publish-kb/SKILL.md`'s own read-failure branch — **positive
absence**, where the find call does not list the title, creates the page; **any other outcome** (no
documented read, a transport or authorisation failure, the read itself reporting the page absent for a
listed title, or an empty body for a listed title) is a **read failure**, not absence, and must leave the
file staged. That row retired (ADR 0069): `plugin/scripts/publish-kb.js`'s `publishPatch` runs this
branch as code, not prose a document could drift from, and `tests/publish-kb.test.js` proves every arm
directly — a read failure, an empty body, and a missing `read` template each leave the staged file on
disk, name the reason, and create nothing.
The `publish-kb-invocation` contract (slice #493, ADR 0069) pins a row: `skills/publish-kb/SKILL.md` still
invokes `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js"`. Once the skill's own job shrank to the two
human stops and relaying the script's report, nothing else stops a future edit from having a model hand-run
the old mechanics again instead of calling the script — a reviewer flagged exactly this gap on the slice
that thinned the skill down. The row is anchored on the real invocation string rather than a prose mention
of the script's name, so a rewrite that talks about `publish-kb.js` without ever running it still fails,
the same anchoring principle `aggregate-page`'s `require`/call row and `containment-delegation` already
apply to the script's own delegation. The
`pinned-paths` contract, `scanPinnedPaths()`: every document a contract table pins still exists.
`scanContract()` skips a document it cannot read — the convention that lets a fixture carry only the files
one assertion exercises, and lets a partial checkout fail nothing — so a table reports zero gaps the
moment its document is renamed or deleted, and the whole suite stays green while the contract it asserted
is gone. Measured before this check existed: `FIX_BOUNDARY_CONTRACTS` against a tree with no
`skills/review/SKILL.md` returned no gaps at all. It collects the paths from the tables themselves rather than
a list kept beside them, so a table added later is covered without anyone remembering to, and each gap
names the path that went missing. That collection is shape-based, not exhaustive: it recurses every
exported array, plain object, and string, keeping the ones ending `.md`, `.json`, or `.js`, so a future
table that pins a path with none of those extensions, as an object key instead of a value, or inside a
`Map`, goes uncollected without either check going red — measured clean against every table this file
exports today.
The `adr-status` contract: every `docs/adr/*.md` states a `**Status:**` line
carrying one of `Accepted`,
`Proposed`, `Superseded`, or `Rejected`. An ADR with no status line reads as accepted whether or not
anything implements it, which is how a decision reaches the glossary and the command bodies while the
code has none of it. The value's capitalization is pinned with the set, so one ADR does not sort and
grep apart from the rest. The `adr-numbers` contract (ADR 0126, INV-0134): no two
`docs/adr/*.md` files share a four-digit number. Two files with one number and different slugs never
conflict in git, so a duplicate would land silently. The failure names the number and every file that
carries it. The `append-mode` contract (ADR 0004): every slice-store document
(every `references/issue-tracker-*.md` plus `docs/agents/issue-tracker.md`) carries a `## Append mode`
section stating four universal elements. Append creates only new slice records and never edits, closes,
or deletes a merged one. Extending a single-slice feature creates the epic first, copying the lone
slice's `acceptance` into it as the global DoD. Amending a promoted epic's own body is the one
sanctioned edit, with the clause anchored on that permission's own wording, not on "amend" or "epic"
alone, either of which recurs elsewhere in the section's surrounding prose. The fourth is ADR 0043's
exception to the first. Promotion migrates a lone slice's anchor-dependency line to the epic it creates,
because the epic is now the anchor (ADR 0040). A store document that returns to the unqualified rule
lets a dependent feature run before its blocker, with the suite green. The first three elements are
matched on a bullet's bolded lead-in, the same `scanAnchorContract` shape, over the same
candidate-document list. The migration element lives inside the epic-promotion bullet's body rather than
opening a bullet of its own. It is matched on its own bolded run instead, and the bold is still what
carries it. A document stating the migration in running prose alone matches nothing. The
`status-seed` contract (ADR 0004) pins rows against `references/run-init.md`: it carries a `"status"` field
in the JSON its run init pipes into `scope.js init`, and it states that a slice the store reports as merged
seeds `merged` and is never dispatched. Append mode never renumbers or re-merges a slice already shipped,
so a second run over a feature whose earlier slices merged must seed each loaded slice's real status rather than defaulting
every row to `todo`, and skip every row already seeded `merged` rather than re-dispatching it. A document
that drops the field, or drops the never-dispatched clause while keeping the field, silently re-dispatches
a merged slice either way, so the rows fail independently.
The `plan-append` contract (ADR 0004) pins rows against
`skills/plan/SKILL.md` and `references/plan-contract.md`. Its §0 asks whether the feature is new or extended before the interview begins, and
states that answering "new" makes no store call. It states the store refusal signal (a slice
`in-progress`, `in-review`, or `blocked` elsewhere) as one row, and the ledger refusal signal — a run
root whose stage is other than `planned` — as another. Losing either therefore
fails on its own rather than only in aggregate. It states the single-slice epic-promotion clause,
including that the lone slice is left untouched. Further rows pin ADR 0043's exception to that
byte-identical rule. A promoted lone slice's anchor-dependency line migrates to the new epic. Each row
falls on one of the two documents `scanAppendContract` cannot reach, since neither is a store document:
`references/plan-contract.md`, which states the generic contract every store specialises, and
`skills/plan/SKILL.md`, which performs the promotion. Without them the store documents would be pinned
around a hole.
Each refusal row is anchored on the condition's own wording, not on the rationale sentence
that explains it a few lines below, so a document that keeps the rationale but loses the
condition still fails.
The `shipped-append` contract (ADR 0083, INV-0004) pins rows against `skills/plan/SKILL.md` and
`references/plan-contract.md`. `/superdev:plan`'s extend path states that a feature whose
anchor has shipped takes no append, names both signals that trigger the refusal and that either one
alone refuses — a run root whose ledger stage reads `shipped` or `closed` (INV-0004), and a scope anchor
at the store's done status — and names the remedy, a new feature carrying `**Blocked by feature:** #<anchor>`.
`references/plan-contract.md`'s *Append mode* section states the same boundary for a shipped or closed
feature, because it owns what an append may do and every backend renders it. A further row on the same
document pins the anchor-dependency rule (ADR 0106, amending ADR 0040): a dependency is satisfied only
by the named anchor's closure or absence, with no ledger-stage branch. The signals are pinned as one row rather than two, since
neither answers the question alone: a reaped run root leaves no ledger, and a best-effort anchor close
leaves the anchor open beside a `shipped` ledger, so a document naming one signal is as broken as one
naming neither. The remedy has a row of its own because a refusal without it is a dead end, which is the
failure a reader works around by appending anyway. The `anchor-candidate-all-states` contract (ADR 0083)
carries two families of row, both scoped to the issue-tracker documents that filter their anchor-candidate
listing by state: `docs/agents/issue-tracker.md`, `references/issue-tracker-forgejo.md`, and
`references/issue-tracker-github.md`.

The first family, one row per document, is anchored on the query itself — `` labels=<type>%2F<feature>&state=all ``
in the GitHub seed, `` --labels <type>/<feature> --state all `` in the two Forgejo documents, whose listing
is a `tea issues list` call — never on the rationale sentence beside it. A shipped
feature's epic is closed, so a `state=open` candidate listing never returns it for *Recognise one* to
resolve, and the shipped-anchor refusal above has no anchor to refuse on — the exact dead end ADR 0083
exists to close, reached anyway because the second signal's anchor never surfaced. Each document already
states the identical hazard for its *List the slices beneath it* call, which already runs `state=all`;
this contract pins the same fix on the candidate listing itself. Anchoring on the query string, not the
rationale, matters: the rationale sentence ("`state=all`, not `state=open`: a shipped feature's epic is
closed…") reads true on its own even when the query beside it reverts to `state=open`, so a row matching
only the rationale stays green through that revert. Jira carries no row in this first family, because
it has no query parameter to pin: its *List the candidates* call runs no status filter at all — it
already spans every state unconditionally.

The second family pins the rule a listing spanning every state forces once a feature label is reused
after retirement: the listing can then return a retired label's closed (or, on Jira, `<Done>`-status)
root beside a reused label's open (not-`<Done>`) one, and *Recognise one*/*Ambiguous* must resolve that
shape without reporting a well-formed plan as ambiguous. This family's precondition is a listing that
spans every state, not a state query to pin, so it reaches Jira too — its label listing spans every
status inherently, the same property the first family's exemption reasoning names.
`references/plan-contract.md`'s generic `## Scope anchor` section carries one row stating the rule once —
the open candidate is the anchor, and `Ambiguous` is two or more *open* candidates, never a closed one
beside a single open one — and each store document's own section specialises it: the Forgejo-shaped
documents (`docs/agents/issue-tracker.md`, `references/issue-tracker-forgejo.md`) carry one row each for
*Recognise one*'s open preference and one each for *Ambiguous*'s open-only shape;
`references/issue-tracker-github.md` carries the same two, phrased against its root/`/parent` shape;
`references/issue-tracker-jira.md` carries the same two, phrased against its `fields.status.name` versus
`<Done>` shape, since Jira has no open/closed issue state to phrase against. Every
row in both families is exercised by its own selftest in `drift/selftest/kb-plan.test.js`, including the
query-only-revert mutation the first family exists to catch. The `rotate-on-shipped` contract (table `RUN_INIT_FINISHED_STAGE_CONTRACTS`; the check id keeps its original name so existing write-ups and ids stay stable) (ADR 0004, ADR 0007, ADR 0079/0080's Important review finding B):
`references/run-init.md` states that run init reads a present ledger's stage before choosing between
resume and init, that stage `closed` runs `init` directly and `init` itself rotates the existing ledger
aside to `ledger-closed-<date>.md` before writing the fresh one, that stage `shipped` — read from the local ledger, or from the anchor's snapshot when no ledger exists — stops run init with nothing created and names `/superdev:verify-ship` and `/superdev:wrap-up` by citing `references/scope-mode.md`'s `## Routing a shipped run` (INV-0116; the second-read stop cites it with the just-written `dod.md` treated as missing), and that both stops sit in the entry step, ahead of the design-doc move and the DoD write (`init` refuses over a `shipped` ledger, ADR 0106). A third stop, the second-read stop in **Create the ledger**, runs after the DoD write: it removes that `dod.md` (and the run root, if that leaves it empty) and reports any design-doc commit left in place, and the entry step names it as the one exception to its write-nothing promise. Two contracts pin it: the `dod.md` and run-root cleanup, and the adopt-refusal-at-`shipped` exception. It also states that every other stage (`implementing`,
`merged`, `reviewed`, `documented`, `documented-unreviewed`, `submitted`) keeps the existing resume path, and that
nothing is deleted, so `scope-prune`'s seven-day post-close reap still runs on its own terms. A further
clause states that the rotation never overwrites an existing `ledger-closed-<date>.md`, so a scope that
closes twice in one calendar day keeps both trails instead of the second rotation clobbering the first.
`scope-prune` keeps a run root on disk past merge, so a new feature reusing that retired label
can land while the finished run's ledger is still there; `init` rotates that ledger aside only for `closed`, and refuses over `shipped` (ADR 0083, ADR 0106). A document that goes back to treating any
present ledger as an in-progress resume re-dispatches a finished run instead of beginning the new one.
`init` owns the rotation mechanics — `plugin/scripts/scope.js`'s `rotateFinishedLedger()`, called only
after `verbInit` has validated stdin, so a refused `init` never rotates a ledger it is about to leave
in place (Important review finding G) — because `scope.js` is the
sole `ledger.md` read and write path (ADR 0022) and the rotation is a ledger operation; `references/
run-init.md` describes what `init` does rather than instructing a reader to rename the file by hand
first, which is what let the instruction die stranded after the branch, scopetree, and run lock already
existed when `/superdev:plan` itself became an `init` caller over a `shipped` ledger (`docs/agents/
issue-tracker.md`'s ADR 0004 append flow). `tests/scope.test.js` carries the rotation's own coverage: the
fresh ledger lands at the requested entry stage, the rotated file carries the closed ledger byte for
byte, a second same-day rotation never overwrites the first, nothing is deleted, and `init` over a `shipped`
ledger refuses, naming both commands, and writes nothing. The
`parked-questions` contract (ADR 0004, ADR 0005) pins rows against `skills/plan/SKILL.md`. It surfaces an
epic's `## Parked questions` the moment §0 loads it, before the interview diverges into new ground. A
question the interview resolves has its line deleted from that section, with the new slice's `spec`
and `acceptance` standing as the sole record, because `references/domain-modeling.md`'s revise-in-place
rule forbids holding both. Losing either row independently: a document that keeps surfacing questions but
stops deleting a resolved one's line leaves two records of the same decision, and one that stops
surfacing them silently strands a load-bearing decision no later interview ever revisits. The
`run-kind` contract (ADR 0028, ADR 0045, ADR 0053, ADR 0083) pins rows against
`references/scope-mode.md`. Its
`## Cutting the scope branch` section specifies the branch step for both run kinds. `fresh`
cuts one from `<base>`, and where a squash-merging host or a scope-prune reap left a same-named branch
standing it decides on the same contained-or-gone test `## Containment` owns (ADR 0007) — its
**Present** branch delegating that decision to the document's own `## Containment` section rather than
naming a git command of its own. `resumed` runs no
containment test and cuts nothing. `fresh` gets one row per clause it carries — the cut, the
taken name, the contained-or-gone decision, and the delegation; `resumed` gets one. ADR 0083 retired the
`appended` run kind and its rows with it: a shipped feature takes no append, so no run finds a `shipped`
ledger rotated aside mid-chain, and `fresh` states the containment test it used to cite.
Further rows carry ADR 0053's other halves. One pins the `## Containment` section itself — the
`git merge-tree --write-tree` test, and the git 2.38 floor its fallback covers — because
two sections and `skills/publish-kb/SKILL.md` §3 all delegate to it, and a delegation pinned against a
section nothing pins is the one-sided shape the root doc's prompt-architecture rules name. The other
pins the **No forcing flag** rule's second exception as **conditional on the containment proof**:
`git reset --hard <base>` is admissible only on a branch that test has just proved contained, because
that proof is what establishes the content is already landed, on `<base>` or on the base the second pass
fetched. Written as a general permission it becomes the branch-stranding ADR 0028 exists to forbid. An
eighth row pins the guard that precedes that
same reset: the scopetree must be clean (`git -C <scopetree> status --porcelain` returns nothing)
before the re-point, and a dirty one stops, naming what is dirty, and blocks unattended — because the
containment proof covers the branch's committed history, never the index or the working tree, so
`reset --hard` there would discard an uncommitted change no test vouched for.
The rows sit against that one document rather than the two playbooks, which hold a pointer plus their own
tier's command: pinning a pointer's prose goes red on a
reflow while catching no revert. Losing any row independently: a document that stops specifying one
clause leaves that run's branch step to whatever a reader infers, which is the gap three consecutive
review fix cycles kept re-opening. This table used to carry a row pinning the contained-reuse
clause when it split by tier ("the `full` tier switches the invoking checkout … the `lite` tier works in
its existing scopetree"). ADR 0045 retired both the clause and the row: reuse now means working in
the one scopetree both tiers share, which the `scopetree` check pins
instead.
The `forcing-branch-flag` contract (ADR 0028), `scanForcingBranchFlag()`: neither execution
playbook names a forcing branch flag, in any of its spellings.
`git switch -C` and `--force-create`, `git checkout -B`, and `git worktree add … -B` and
`--force-create` all reset an existing branch instead of failing on it. `git switch -C` prints
`Reset branch` and exits 0
while leaving every slice already merged into that branch unreachable from any ref, and the ledger still
records those slices as `merged`, so nothing in the run rebuilds what it lost. Every spelling is pinned,
not just the two the playbooks happen to use, because the flag a hurried edit reaches for is whichever
one it already knows. It is a **negative** check, asserting that a document no longer matches a pattern
where most assert that one still does, which is why it is a scanner rather than a contract-table row.
`return-to-controller` is the other.
The `source-sections` contract: each canonical reference still carries the sections its readers
are sent to. `references/plan-contract.md` (`## Fields`, `## Epic visuals`, `## Slice lifecycle & status`,
`## Append mode`, `## Scope anchor`, `## Triage record`, `## Feature label`),
`references/test-selection.md` (`## The two
commands`, `## Fallback to the full command`), `references/content-types.md` (`## The four types`, `## The
conceptual layer`), `references/controlled-prose.md` (`## Modes`, `## Self-check`), and
`references/review-checklist.md` (`## Anti-patterns`, `## Vulnerability classes`, `## Reuse audit`, `##
Consistency`). Every other check pins these files from the reader's side: a loop consumer must say *read
`references/test-selection.md`*, both doc agents must name `references/content-types.md`. None asserts that
the named file still holds the rule. Delete a body and keep the filename, and the reference resolves, every
consumer still points at it, and the suite stays green while the rule is gone. A bare heading is the
weakest thing worth asserting and the strongest a pattern can honestly claim: a section still present may
say the wrong thing, which is the reviewer's job, but a section deleted outright is drift that no review of
the diff which deleted it would connect to the readers it silently broke. `references/scope-mode.md` is
already pinned this way, by the `unattended-token` and `degraded-pass` checks' heading rows. This check gives the same
treatment to the five sources that never got it.
The `return-to-controller` contract (ADR 0029), `scanReturnToController()`: neither execution
playbook, nor `references/run-init.md`, nor `references/run-handoff.md` instructs a return to the command
body. The run is one-directional: it opens at run-init.md and ends at run-handoff.md. Nothing guarded that
shape until this check, so a later edit could reintroduce "return to the controller",
"resume at `skills/implement/SKILL.md`", or any of the other verb and target pairings `contracts.js`
enumerates, with the suite staying green throughout. A bare mention of the controller, the command body,
or `/superdev:implement` is legitimate prose on its own. Only a directional verb paired with one of those
targets is a gap.
The `playbook-edges` contract (ADR 0029) pins rows: both execution playbooks still name
`references/run-init.md` as their opening step and `references/run-handoff.md` as their closing one. The
`return-to-controller` check is the negative half of the run's one-directional shape, an instruction
to go back. This is the positive half, that a playbook still points forward at all. Deleting "read
run-handoff.md as your last step" from a playbook leaves every other check green, because the reference
still resolves and nothing points back to the controller either. The run then ends with no
`scope.js stage set merged` write and, on an all-`mechanical` or all-`docs` scope, with no full-suite run
anywhere in the chain.

The `doc-pass` contract (ADR 0031) pins rows. `agents/doc-writer.md` and
`references/implement-lite.md` each read `references/doc-pass.md`, the file that states the documentation
pass they perform. The pass has two callers, the dispatched writer and the `lite` execution playbook's
controller working in its own context, so it is stated once and read by both. A caller that drops the
read keeps performing a pass it
no longer holds the rules for, and nothing else notices: `reference` only resolves paths that are
still cited, and the content-type, staging, and aggregate contracts moved onto the reference with the
prose, so they stay green while the caller that lost the read quietly writes to no standard at all. The
row is anchored on the `Read` instruction rather than the bare path, for the reason the `content-types`
contract states: a passing mention is not a read.

The third row is the **dispatch-prose half** of the same contract (root `AGENTS.md`'s rule of that name,
ADR 0035): `skills/document/SKILL.md` names `references/doc-pass.md` in the dispatch it builds. A controller
writes its dispatch from what that command says the writer does, so a command that paraphrased the pass
("it runs two passes, deleting stale text") put the paraphrase in front of the writer while both rows
above stayed green. `references/implement-lite.md` needs no pairing — it is a caller rather than a
dispatcher, and its own row is the instruction it acts on. `test-selection-wiring` was judged under the
same rule and deliberately left one-sided: the dispatch steps in `references/implement-full.md` name no
test command at all, so there is no dispatch sentence for a row to pair with.

The `narrative-coverage` contract, `scanNarrativeCoverage()`: every check registered in
`drift/checks.js` is written up in this file by its backticked `id` (ADR 0061). The Work
Guidance below already required the write-up. Nothing enforced it, and it was skipped twice, for two
checks whose only account was their own code. That write-up is prose a maintainer updates by hand at the
moment they are thinking about code, which is exactly when it gets forgotten. A check the classification
sentence above names by `id` needs no other write-up. For every other check the write-up is the only
mention, and this is what holds it in place. The check is otherwise deliberately shallow: it pins that
each check is described **somewhere**, never that a description is accurate or
that the classification sentence files a check under the right kind. Those stay human judgment, and no
check can replace them.

The `marketplace-source` check, `scanMarketplaceSource()`: each plugin in
`.claude-plugin/marketplace.json` names the shipped tree. A `git-subdir` source's `url` is this
repository's clone URL, `https://codeberg.org/bomret/superdev.git`, its `path` resolves to a directory in
this repository that carries `.claude-plugin/plugin.json`, and its `ref` equals `v` followed by that
file's version (ADR 0131). A relative string source resolves to such a directory the same way (ADR 0032).
An object source of any other shape fails the `url` test. The source is what limits an install to the
shipped `plugin/` tree and pins it to the release tag, and `claude plugin validate .` accepts a source that
names no directory at all. A renamed tree, a fat-fingered path, a fork or mistyped URL, or a hand-edited
ref therefore breaks every install while `bun run test` stays green. An absent manifest is
skipped.

The `readme-commands` check, `scanReadmeCommands()`: `README.md` and `skills/` name the
same command set: every `skills/<name>/SKILL.md` is mentioned in the README as `/superdev:<name>`, and
every `/superdev:<name>` the README names has a command file. The README is the user-facing map of the
commands, and nothing else cross-checks it: the `command-resolution` check resolves command names in `skills/` and
`agents/` prose only. A command added without a README section, or a README still routing users to a
renamed command, stayed green before this check landed. Either half is skipped when its side is absent, matching
every other scanner's fixture rule.

The `audit-set-globs` check, `scanAuditSetGlobs()`: every pattern listed under `## Audit
set` in this repo's own `docs/agents/documentation.md` resolves to at least one file. The `audit-set`
check pins that the section exists and that `skills/setup/SKILL.md`, `skills/document/SKILL.md`, and the seed
still agree about it. Nothing there expands a pattern. A pattern matching no file is the one drift the
reader cannot see, because `/superdev:document audit` reads zero files for it and reports the same clean
pass as a real audit. That is the state this repo shipped in when the plugin tree moved under `plugin/`
(ADR 0032) and three globs kept their old repo-root prefixes. Patterns are repo-relative by the section's
own rule, so they resolve against the repo root and never through `docPath()`'s `plugin/` fallback. A
plain path is checked for existence and a `*` in the final segment is expanded by reading that directory. An
absent `docs/agents/documentation.md`, or one carrying no such section, is skipped.

The `release-contract` check, `scanReleaseContract()`: every slice-store document carries a
`## Release` section, and `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, and
`skills/backlog/SKILL.md` each name it.
A release is the human agreement that a written plan may be built (`references/plan-contract.md` →
*Release*), and it is expressed differently per backend — a label on Forgejo and GitHub, a label rather
than a status on Jira.
Both halves fail silently, which is why both are pinned: a store document without the section leaves the
consumers no signal to read, and a consumer that drops the reference builds whatever it is handed, which
is the gate gone with every command still valid prose. The consumer half matches the backticked
`` `## Release` `` rather than the bare word, since "release" recurs in ordinary prose. Absent documents
are skipped, matching every other scanner.

The same check carries ADR 0083's removal half (INV-0005), because a release signal nothing removes is
the same gate failing from the other side. A release decision covers the work that existed when it was
made, so on an append `/superdev:plan`'s §6 applies the answer in both directions: declining removes the
signal from the scope anchor, releasing applies it. Two further assertions, each silent alone. Every
store document carries a `## Release` **Remove** bullet naming the concrete call, beside **Apply** and
**Read** — without it the command has nothing to invoke. No store is exempt (ADR 0110). And
`skills/plan/SKILL.md` states the both-directions rule itself, since a store
document carrying the call while §6 still reads "apply nothing" leaves the signal standing over slices
nobody released — which is exactly what `/superdev:implement` then builds.

The `doc-steps-no-suite` check, `scanDocStepsNoSuite()`: `skills/document/SKILL.md`,
`skills/submit-pr/SKILL.md`, `agents/doc-writer.md`, and `agents/final-reviewer.md` name no full-suite run of
their own (ADR 0025). That is narrower than "performs no full-suite run": `skills/document/SKILL.md` reads
`references/test-selection.md` and runs the focused command it selects over its range (its own doc commits, or every path since the suite record's commit, ADR 0128), and a
repository whose runner cannot narrow, or whose suite is already cheap enough not to need a distinct one,
records the full command again in that second fence — the same duplication this repository dogfoods for
every other focused caller (ADR 0085). What this check forbids is a document *instructing* a full run in
its own prose; the second fence producing one at runtime is `test-selection.md`'s contract, not a gap this
check would catch or should. `/superdev:review`'s scope mode owns the scope's one
**review** run, so an instruction named in any of the first three is a second pass over a tree the review
already verified — and on a slow suite that is minutes per scope, spent proving what was just proved.
`agents/final-reviewer.md` joins the list for a
different reason: it already carries the presence row in `full-suite` stating it reviews against
the handed result, running no suite of its own, but that row only checks presence — a document carrying
both that clause and the old "your own re-run here stays optional" sentence it replaced reads as zero gaps
there. This check's absence half is what actually forbids the old clause from growing back beside the new
one. This is the only check that asserts an **absence**, so a gap is a match rather than a missing clause,
and it runs through `scanDocsAvoid()` instead of `scanContract()`. The patterns are the shapes a real
instruction takes here: a bare imperative ("Run the full suite before opening the pull request", "Re-run
the full suite before staging it" — the reflexive "yourself"/"itself" phrasing `skills/review/SKILL.md` used to
use is one case of this, not a separate pattern), that same imperative with "full" dropped ("Re-run the
suite … before the handoff", "Run the whole suite once more before staging the pull request"), the
take-it-from-the-config one `references/run-handoff.md` uses ("take the full command from … and run it"),
and the optionality clause `agents/final-reviewer.md`'s own re-run sentence used to carry, generalized past
its exact wording ("stays optional" or "remains optional", "own" or no "own"). The bare-imperative
pattern's discriminator against a legal past-tense mention is the auxiliary, not the pronoun: a negative
lookbehind for "has"/"have"/"had", up to two more words, then "run" is what lets `skills/submit-pr/SKILL.md`'s
"the run handoff *has* already *run* the full suite" stay silent — the same `(?:\s+\w+){0,2}` gap
`RETURN_TO_CONTROLLER_PATTERNS`'s `HAND_BACK_VERB` uses, wide enough for an intervening word or a hard-wrap
landing between the auxiliary and the verb, tight enough not to swallow an unrelated sentence. Each spells
its words with `\s+` for the same hard-wrap tolerance, because the negative scanner runs no normalized
retry. `agents/final-reviewer.md`'s own legitimate ad-hoc "you may re-run the suite over the range" and its
"the controller already ran the full suite itself" stay legal too: neither is the optionality clause this
check forbids, and the bare-suite pattern's own trailing "before" anchor is what keeps it off the ad-hoc
sentence, which never carries one nearby. Prose is the wrong guard for this one: root `AGENTS.md`'s
prompt-the-positive rule keeps a "never run the suite" line out of always-loaded context, so the silence
is enforced by test instead. This is a shape-based prose guard, not a grammar: it catches the phrasings
named above, not every paraphrase a maintainer could write, and the reviewer's eye covers the rest.

The `fix-boundary` contract (ADR 0035) pins rows on `skills/review/SKILL.md`. §4's fix loop
states that it changes **how** the code meets the Definition of Done, that a remedy adding a
capability the Definition of Done never named is recorded and handed to `/superdev:plan`, and that a
deferred finding enters no fix loop and is not an unresolved defect — taking precedence over
`--unattended → fix` — with a verdict whose only remaining findings are deferred counting as clean. All
three are pinned because any one alone is inert: a boundary with no destination leaves the finding
nowhere to go, so the fix cycle builds it regardless; a destination with no boundary never fires; and a
boundary with no exit deadlocks the run the moment a finding is actually deferred, since every other path
§4 offers either fires on it anyway or never fires at all. Nothing else in the chain notices when this
becomes advice — the review returns a bigger diff, green, and the scope grows by whatever the remedy was.
That is not hypothetical: it is what the run this check comes from did, and two fix cycles went into
settling the addition. The boundary sits at the Definition of Done rather than at "behaviour", since
repairing a defect in planned behaviour is frequently behavioural and stays in the loop.

ADR 0097 adds the guard-rail carve-out as further rows of the same table, one per rule. On
`skills/review/SKILL.md` §4: a guard-rail remedy (a test in an existing suite, a row in an existing drift
contract table, or a prose fix agreeing shipped text with a stated rule) stays in the loop while a new
scanner, check family, hook, or script verb, or a user-observable change, still defers; severity does not
move the boundary; and a plan-coverage gap is fixed with the proving test or drift pin, a derived
criterion the code fails staying a deferred finding. One row each sits on `references/scope-mode.md`'s
`## Deferred findings`, `references/plan-contract.md`'s deferred-finding definition, and
`agents/final-reviewer.md`'s "how to fix" wording for a plan-coverage gap. No row anchors on the report
template's own phrase. The selftest copies the shipped documents, removes each row's matched clause, and
expects that row to fail (INV-0095).

The `deferred-resolve` contract (ADR 0121, INV-0125) pins the way back out of the deferred record. On
`skills/review/SKILL.md` §4 and `references/implement-full.md` step 3: a deferred finding re-enters the fix
loop only when a later review names a guard-rail remedy for it, and the run resolves it once the fix
implementer's report names the commit that fixed it and a later re-review no longer lists it, through the
procedure `references/scope-mode.md`'s `## Deferred findings` states. `implement-full.md` also takes a
re-entered finding out of the findings the slice-reviewer is told to leave out, since otherwise no re-review
could confirm the fix. On `scope-mode.md`: the procedure's order (remove the bullet, close the triage record,
rebuild the open pull request's deferred section) and its best-effort clause. A loop that drops re-entry
fixes a finding nobody re-judged; one that drops the trigger resolves on an unconfirmed claim.

The `denial-authorship` contract (ADR 0039) pins rows. Rows sit on
`references/scope-mode.md`: the rule names the **verification dispatch**es it governs, keys the unattended
stop on whether the controller authored what the denied pass verifies, and derives the tier from the
ledger's slice rows. Further rows sit on `skills/review/SKILL.md`, `skills/document/SKILL.md`,
`skills/implement/SKILL.md`, and `references/implement-full.md`, the documents that dispatch one of those passes. A dispatch is the later,
more specific instruction, so a call site still reading "unattended → block" wins the conflict and the
central rule becomes prose nothing executes — the one-sided pin ADR 0035 names, which is why the call
sites are pinned on the condition itself rather than on a pointer to the section.
`references/run-handoff.md` is deliberately outside the table: its denial case is the full-suite Bash
command, and the only dispatch it makes is an implementer on a red suite, so nothing there can contradict
the rule. This is a shape-based prose guard, and it carries the same ceiling as its siblings: it catches
the phrasings above, not every paraphrase.

The `denial-cap` check (ADR 0041), the sibling of `denial-authorship` from the other side. That
rule decides what a *single* denial costs; this one bounds how many an unattended run absorbs. It runs two
scans under one id: `DENIAL_CAP_CONTRACTS`, a table of presence checks, and `scanDenialCapNumberSilence`,
an absence check over the same call sites. The rows on
`references/scope-mode.md` are the cap itself (an unattended run blocks on its **second denied verification
dispatch**), the recording verb `degraded add-denial`, and the read `get denials`. Rows also sit on
`skills/review/SKILL.md`, `skills/document/SKILL.md`, `skills/implement/SKILL.md`, and
`references/implement-full.md` — the same documents `denial-authorship`'s table pins, because a document that
dispatches a verification pass is exactly one that records its denial. Each carries both halves, and each
half fails on its own: a call site recording with plain `degraded add` writes a bullet the count cannot
see, and one that never reads `get denials` continues inline on every denial. Either leaves the cap stated
centrally and executed nowhere, so the run rides on to Claude Code's own three-denial kill — which
terminates a headless sweep outright, with no `blocked` label, no comment, and a stranded run root. The
presence check on `add-denial` is deliberate where an absence check on `degraded add` would be wrong: the
plain verb stays correct for the other degraded shape, and `references/implement-lite.md` legitimately
uses it for a knowledge-base pass it could not stage. Same shape-based ceiling as its siblings. Further
rows tie the plain verb to an *authoring* dispatch by name on `skills/review/SKILL.md`,
`skills/document/SKILL.md`, `skills/implement/SKILL.md`, and `references/implement-full.md` (a document that
dispatches both an authoring pass and a verification one has to say which is which, or every denial in
that breath reads as the classifier's, and the plain-verb branch goes dead), plus one narrowing
`references/implement-full.md`'s cap to `slice-reviewer` alone — it alone also dispatches the advisory
`simplicity-reviewer`, outside the closed set of counted verification dispatches. `scanDenialCapNumberSilence`
closes what the presence rows cannot: none of the four call sites may restate the cap's own number,
because a call site that does can drift to a different one — "three or more" — while every presence row
above still matches it. A call site defers to `references/scope-mode.md`'s `## Degraded passes` section by
name instead, so the number lives once.

The `publish-run-state` contract (ADR 0042) pins rows. `references/scope-mode.md`
carries the `## Publishing run state` section, stating that publishing follows any ledger write the
snapshot would show — not `stage set` alone — with one exception, a slice-row move, and stating the
criterion for which write cites the section *directly*, in its own "Which sites cite this directly"
paragraph: a write whose own instruction can end the command — a block, a stop, a refusal — before any
later write in the same run reaches a site that already cites the section gets a direct citation at the
write; every other write relies on its defining section's own citation instead, since the run is guaranteed
to reach a citing site regardless of which branch it takes. Further rows sit on that same file: its
`## Degraded passes`, `## Unresolved defects`, and `## Deferred findings` sections, and `## The ledger`'s
`**Docs:**` bullet, each carry the publish instruction where they name their own write.

The rule was first scoped to `stage set` alone, and a first fix cycle broadened it: a scope-wide suite's
3-strike halt writes `**Unresolved:**` and deliberately leaves the stage untouched, so a stage-only rule
never covered it, and the durability ADR 0042 promises was lost on exactly the path that needs it. That
cycle's own citations were file-level — one presence check per document — which a second fix cycle found
too weak the moment a file carries more than one citation: `skills/review/SKILL.md` and
`references/run-handoff.md` each already satisfied a bare per-file row from an unrelated branch's citation
(the clean-verdict write, the `stage set merged` write), so three sites where a denied dispatch or a denied
full-suite run writes `**Degraded:**` and then blocks unattended — reaching no later write in the same run —
sat uncited with the check green throughout. The remaining rows are the sites that write one of
those ledger lines, each anchored on text unique to its own write wherever its file carries more than one
citation, not merely the repeated section name: six on `skills/review/SKILL.md` (a denied `final-reviewer`
dispatch, a denied full-suite dispatch in its own scope-mode fix loop, the "Declined" stop, the 3-strike-cap
stop, a denied fix-implementer dispatch, and the clean-verdict writes together), three on
`references/run-handoff.md` (a denied full-suite dispatch, the 3-strike red-cap stop, and its own
`stage set merged` write), and two on `skills/document/SKILL.md` (a denied `doc-writer`/`doc-reader` dispatch,
and its own stage write). `references/run-init.md` and `skills/implement/SKILL.md` carry exactly one citation each and no other
mention of the section, so a bare file-level row stays unambiguous there. `skills/submit-pr/SKILL.md`
carries two (the red whole-repo path in §4 and the `stage set submitted` write), so its row is anchored
on the stage write's own lead-in. `references/implement-lite.md` carries no direct citation, one inheritance note, and sits outside
this table entirely: neither of its two
writes (`docs set inline`, the knowledge-base pass's `degraded add`) can end the command, so both rely on
inheritance — the same shape the file-level version of this check could not tell apart from a genuine gap,
proven by stripping one of its two prior citations and watching the check stay green.

`references/implement-full.md` keeps one shared citation covering a single bullet that describes three
sibling write-shapes (a denied implementer/fix, a denied `slice-reviewer`, a denied `simplicity-reviewer`) —
only the first two can end the command, and the citation sits before either's block description, the same
order `skills/implement/SKILL.md`'s own near-identical bullet already uses. The bullet also names the section a
second time, in a sentence stating that the third, non-terminal shape relies on inheritance instead — so its
row is anchored on the real citation's own lead-in ("Publish the snapshot after either write, per…") rather
than a bare heading match, which a second mention in the same file would satisfy on its own regardless of
which one survived. **Ceiling:** the anchor still proves only that this exact sentence exists somewhere in
the file, never that it sits before the block descriptions rather than after — it is a presence check with
no notion of position, and an ordering regression there would need a human or a reviewer to catch, the same
way these three fix cycles did.

The `adopt-run-state` contract (ADR 0042), the mirror image of the `publish-run-state` check: where
publishing writes the ledger onto the anchor, adopting reads it back. Rows sit on
`references/run-init.md`'s `## Run init` step: that a missing local ledger triggers a check of the scope
anchor for a snapshot to adopt, skipping straight to `init` on a store that declares itself
snapshot-less; that a failed anchor read falls through to `init` too, reported once rather than treated as
a stop; that a `shipped` stage or a section-less anchor is not adopted, also falling through to `init`;
that adopting writes `<run-root>/dod.md` from the anchor body before piping it to `scope.js adopt`, the
ordering ADR 0042 states explicitly; that the adopted slice table gates no re-dispatch on its own, because
the playbook's own Resume reconciliation against `git log` decides that instead; and that the run kind for
an adopted ledger is named `resumed`, beside a ledger already on disk. Further rows sit on
`references/scope-mode.md`'s `resumed` branch bullet: that a name which does not verify locally is fetched
from the remote `docs/agents/code-management.md` names before the stop, since a fresh clone or a
just-adopted ledger holds no scope branch until that runs; that the post-fetch check re-verifies the
fetch's own remote-tracking ref (`git rev-parse --verify <remote>/<branch>`), never the bare name a second
time — `git fetch <remote> <branch>` only ever populates `refs/remotes/<remote>/<branch>`, never a local
`refs/heads/<branch>`, so a bare re-verify always fails, the Critical defect a fix cycle found and fixed
after two review passes read the wrong-ref sentence as correct; and that the stop itself, once the fetch
finds nothing either, still names the branch it looked for and blocks rather than asks under
`--unattended`.

The `resumed-scopetree-trigger` contract (ADR 0042, ADR 0045) pins a row: `references/scope-mode.md`'s action in
that same `resumed` branch bullet creates or reattaches the scopetree, at both tiers, whenever it is absent for either
cause — `/superdev:wrap-up` already removed it, or this checkout never held it at all, the case
`adopt-run-state` makes reachable on a fresh clone. A fix cycle found the sentence named only the first
cause, so `references/implement-lite.md`'s Resume step — which works "in the scopetree"
unconditionally, assuming it exists — had nothing creating that scopetree on a fresh clone; `implement-lite.md`
itself needed no change once the bullet it delegates to was broadened, because its own Branch model step
already runs `## Cutting the scope branch` in full before Resume ever reads the scopetree. Split into its
own check rather than folded into `adopt-run-state`'s table, because the two answer different questions —
which branch gets fetched, versus which scopetree gets created — and no fixture anywhere previously
distinguished "removed by wrap-up" from "never created", so a regression narrowing the sentence back to one
cause would have passed silently.

The `run-lock-liveness` contract (INV-0013, ADR 0090) pins rows across `references/scope-mode.md`,
`references/run-init.md`, and both execution playbooks. Two sessions dispatched onto one released
feature both worked its run root: the only liveness check that existed lived in each playbook's own
`Resume` section, reached after `run-init.md` had already written `dod.md` and advanced the ledger's
stage — a plain file write consults no lock, and `hooks/run-lock.js` guards only `git worktree add`, the
scopetree's own creation, never an entry into one that already exists. Rows pin the rule itself,
stated once in `scope-mode.md`'s `## The run lock`: `/superdev:implement`'s own entry into an existing run
root reads the ledger's stage together with the lock's mtime before its first write, a `planned` stage at
any lock age is the ordinary hand-off from `/superdev:plan`'s own cut and never a collision, any stage
past `planned` with a lock under an hour old names a live implement run, the check governs `/superdev:implement`'s
own entry alone — never `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, or
`/superdev:ship`'s ordinary hand-off, each the chain's single designed entry right after the previous
command's own exit — and
`/superdev:plan` keeps its own separate, narrower check (triage #510) rather than folding into this one.
A fresh lock and a stage past `planned` are both true by construction at every ordinary chain
hand-off, since each command refreshes the lock and advances the stage at its own exit — which is why the
rule is scoped to `/superdev:implement` alone: that is the one caller a second, independent invocation can
redispatch onto a live implement run, where review/document/submit-pr/ship's entry is instead the chain's
own single designed hand-off. The remaining rows
pin `run-init.md`'s and both playbooks' own deferral — `run-init.md` takes the check as its first step,
ahead of the DoD write and the ledger-stage advance, naming `<scope>` as the feature label the calling
command already resolved; both playbooks' `Resume` sections state that run init's own entry step already
checked liveness, so `Resume` itself only reconciles the ledger against `git log` from there. The rule
does not close the gap where a live implement run's lock goes stale past `planned` because nothing refreshes it
mid-run (triage #620) — a different remedy, named as a stated limit rather than folded into this
contract.

The scoping decision above is a presence pin only — nothing in `RUN_LOCK_LIVENESS_CONTRACTS` would notice
`review`, `document`, or `ship` re-acquiring liveness-check language of their own, which is exactly the
regression a first cycle of this feature shipped and a whole-scope review caught. `scanRunLockLivenessSilence`
(`scanners.js`) is the absence half, the `scanDocsAvoid` shape: it asserts those
three `SKILL.md` files carry no "liveness check" phrase and no "ledger's stage … lock's mtime/freshness/age"
phrase, wired into the `run-lock-liveness` check's own `run` alongside the presence table.

The `agent-tool-agnostic` contract: no `agents/*.md` names a concrete package-manager or
test-runner command. The test command is `references/test-selection.md`'s to select from the consumer
repo's own configuration, and the shipped briefs execute in consumer repos, so a literal command there
is this repo's toolchain leaking into another repo's dispatch — `bun run test` shipped exactly that way,
as a pipe example in three agent briefs, inviting an agent to pattern-match a maintainer-only command in
a repo that uses another runner. The doc list is the `agents/` directory read at scan time, not a pinned
table, so a new agent is covered the day its file lands. `skills/setup/SKILL.md` and `skills/document/SKILL.md`
name such commands legitimately, as interview and focused-command examples, which is why the scan covers
`agents/` alone.

The `scopetree` contract (ADR 0045) pins rows: the `full` tier cuts its scope
branch into the same dedicated scopetree the `lite` tier uses, `.superdev/scopes/<scope>/scopetree`,
and does every merge there — the invoking checkout is never switched, at either tier. Rows sit on
`references/scope-mode.md`. `## The scope checkout` resolves to that one location for both tiers, states
the `git worktree add .superdev/scopes/<scope>/scopetree <branch>` call that recreates an absent one,
states that a `run-lock` refusal met while recreating is this run's own lock rather than a competing
session's and names the remedy (remove and retry) — a fix cycle otherwise found the recreate path
unreachable inside a live run, since the same run's own lock, refreshed by every earlier command in the
chain, is what blocks it — and names a stop, writing nothing, when a different working tree already holds
the branch — the same reuse the retired `run-kind` row used to describe split by tier. It also states that
an absent checkout at `shipped` or `closed` is never recreated, `/superdev:ship` alone excepted at
`shipped`, and `skills/ship/SKILL.md` stops on a `closed` scope before recreating anything (nothing removes
what a recreate at that terminal stage would leave behind). `## The run
lock` states that both tiers write `<run-root>/run.lock`, and only once `## Cutting the scope branch` has
already cut the scopetree, or the `run-lock` hook's own guard on `git worktree add` would block the run
making that very call. Further rows sit on `references/implement-full.md`, the tier ADR 0045 actually
changed: its Branch model states that every later command in the file — every merge — addresses the
scopetree with `git -C` rather than the invoking checkout, once the cutting/reuse command itself has run
from that checkout the way any `git worktree add` does; its DAG loop's merge step addresses that scopetree
with `git -C`; its integration-branch bullet keeps `integration/<scope>` there too, and the
integrate-and-verify slice switches that same scopetree, never the invoking checkout, for the final merge;
its Resume step finds the scopetree — present, recreated, or a named stop — before reading anything out of
it; its own `## Run lock` section reads scope-mode.md's `## The run lock` — a fix cycle otherwise found
this file with no lock section at all while two other documents still claimed the lock was lite tier only.
(Its Resume step's own liveness-check deferral is the `run-lock-liveness` contract's own row — INV-0013,
ADR 0090 — pinned there once rather than restated here.) Another row sits on `references/implement-lite.md`: its
`## Run lock` section reads scope-mode.md's `## The run lock` rather than restating who writes the lock
and when, now that the rule covers both tiers there — the same caller-reads-the-rule shape the `doc-pass`
contract already uses. Further rows sit on `references/run-init.md` and `references/run-handoff.md`: each
lists `run.lock` with no `lite tier only`/`(lite tier)` qualifier, since a qualifier is the later, more
specific instruction and silences scope-mode.md's shared rule for the full tier. More rows sit on
`skills/review/SKILL.md` — a fix cycle found this chain-tail command naming no working directory anywhere, so
its §4 tested the controller's own invoking checkout against `<type>/<scope>` instead of the scope
checkout, ran the full suite nowhere in particular, and could hand a fix-cycle implementer no working
directory at all, landing commits on the base branch in the operator's own clone. The rows pin its
scope-checkout branch test, its full-suite run in the scope checkout, and its fix-implementer dispatch
handing over the scope checkout as a working directory — the same working-directory statement
`implement-full.md` and `skills/document/SKILL.md` already carry. More rows sit on `references/run-handoff.md` for
the same class of gap on its own only full-suite run: a scope of all `mechanical`/`docs` slices reaches no
other verification before `/superdev:submit-pr`, so its full-suite run and its Red-branch fix dispatch each
naming no working directory reached the invoking checkout on the full tier — sitting on the base branch by
then — reading `docs/agents/verification.md` off base, running the suite over base's tree, and landing any
fix commit on base in the operator's own clone; the rows pin the full suite running in the scope checkout
and the fix implementer taking that same checkout as its working directory. The last row sits on
`references/merge-conflicts.md`: its winner-picking-overlap abort names the scopetree with `git -C`,
not a bare `git merge --abort` — this file is read after `implement-full.md` delegates the whole
conflict-resolution step to it, so its own unqualified abort used to win the conflict, exiting 128 in the
invoking checkout and leaving the scopetree sitting on `MERGE_HEAD`, which `hooks/green-gate.js`'s
`mergeInProgress()` then reads as a deferral that gates nothing. Losing any one row independently reopens exactly the cost ADR 0045 removed: a full run parking
a second session's checkout on its own branch, a merge landing in a tree `/superdev:submit-pr` never expects, a
restated lock rule drifting from the shared one, a full run that writes no lock at all, a whole-scope
review or run-handoff full-suite pass that
writes to the wrong checkout, or a merge abort that silently ungates the next merge in the scopetree.

**Its selftest fixture is guarded, and that guard observes instead of declares.** `scanContract()` skips a
document it cannot read — the same convention that lets a fixture carry only the files one assertion
exercises — so a table whose fixture never names one of its documents lets that row's "every clause
present yields zero gaps" assertion pass without ever running it. `selftest/index.js`
installs an observer through `lib.observeContracts(fn)`, which `scanContract` reads inside its own body at
call time, so the observation holds whichever module loaded first. `drift/checks.js` holds its own
reference to `scanContract`, and `drift-check.js` loads it before it hands off to the selftest; the
observer is reached through that reference all the same. The call returns the function that restores the previous observer, which
the selftest runs in a `finally`; a plain `drift-check.js` run installs none. The observer records, per
table, every document any call actually resolves (via `readDoc`, so a `realRoot` call counts too). Once
every suite has run, `selftest/coverage.js`'s `coverageFailures` returns every table at fault in one list: a
table whose recorded set misses a document it pins, and a table the registry declares (a `table()`-built
check, or a custom-`run` check with a `contracts` field naming its table, carries it as `contracts`) that no suite scanned at all. The selftest asserts that list is empty,
naming both the table and the document, since "a fixture is incomplete" leaves the reader searching every
row the table pins. `selftest/observation.test.js` pins the seam and the verdict. This covers every table
any suite scans, with no per-table call and no hand-typed document list to fall out of sync with the fixtures — including a table
like `FULL_SUITE_CONTRACTS` whose fixtures are legitimately split across many small calls, since the
recorded set just accumulates across the run instead of needing one fixture to carry every document at once.
`selftest/coverage.test.js` is the one harness for the tables listed by name in the suite. Its fixture
for a table is that table's pinned documents, copied from this repository at the paths the table spells.
Per table it asserts a clean scan of the full fixture and, per row, that cutting the span the row's
pattern matches (at every place the document states it) makes the scan report exactly that row's
expectation. Where the span cut also takes a neighbour's clause, the harness tries single-character drops
across the match and requires exactly one gap from the first drop that isolates the row. A row whose clause
another row's pattern contains has no isolating edit. The suite names those rows in `NOT_ISOLATABLE`,
and each only has to be reported among the gaps of its own document. The suite also scans a
fixture without the documents against every exported `*_CONTRACTS` table and asserts no gap, outside the
coverage observation. The bespoke scanners keep a case of their own for an absent document, because each
has its own skip.

The `denial-reset` contract (ADR 0044) pins rows, all on `references/scope-mode.md`: the cap
the `denial-cap` check pins has a way back, and it is only reachable where two of that file's sections
state it.
Rows sit on `## Degraded passes` — the reset command with its required reason
(`degraded reset-denials '<reason>'`), what it does to the count and to the record (the count runs from
the last reset marker, so every recorded denial survives), and that a reset is a human act no command in
the chain performs. Another sits on `## Unattended`'s block procedure, which names the reset command in
the comment a capped run leaves on the anchor. The two halves fail independently and for different
reasons. A section that drops the reset leaves the cap append-only, which is the state ADR 0044 amends:
the maintainer adds the denied dispatch to `permissions.allow`, resumes, and the resumed run reads the
same bullets and blocks on the next denial from any cause. A block that stops naming the command leaves
the reset stated in a document nobody reaching that block is reading — the quoted refusal is in the
comment, and the way back is a section away. That row's pattern spans from `comment on the anchor`
to `reset-denials`, so it matches inside the block procedure rather than anywhere the file happens to say
both words.

The `triage-record` contract (ADR 0046, ADR 0088): a scanner plus rows. `scanTriageRecordContract`
(`scripts/drift/scanners.js`) walks `storeDocuments()` for the presence half — the same call
`scanAnchorContract` and `scanReleaseContract` already make over the same candidate list, every
`references/issue-tracker-*.md` seed plus this repo's own dogfooded `docs/agents/issue-tracker.md` — and
reports the ones carrying no `## Triage record` section, stating where a **triage record** lives on that
backend. The same scanner then
holds every section it did find to `TRIAGE_RECORD_ELEMENTS`, whose one element is the **listing** call:
every store stated how to create a record and none stated how to read one back, so the record reached no
consumer at all until `/superdev:backlog` needed one. The element is anchored on a bullet's bolded lead-in
and requires both the listing verb and its object inside that lead-in, so an exclusion bullet's bold
never reads as the listing contract. A second element holds every section to the same
outcome `plan-contract.md`'s own generic `## Triage record` section already promises ("No candidate
listing and no slice loader ever selects it"). The section must itself state how that backend keeps
the record out of `/superdev:implement`'s slice loading. Otherwise the checker passed a store carrying
a create call and a list call but no exclusion clause clean. This is exactly the gap a fifth backend
seed could have walked through (issue #357). The pattern requires the literal phrase "slice loading"
inside the section, the vocabulary every shipped seed's own exclusion bullet carries. A further element holds
every section to a **Close it** bullet, the call a run uses to close the triage record of a deferred finding
it resolved, with a comment naming the fixing commit (ADR 0121). Further rows, a table
run through `scanContract()`, sit on `skills/review/SKILL.md` and `references/scope-mode.md`, the two
documents that write it. The record is what makes a deferred finding outlive the run root
`hooks/scope-prune.js` reaps and the scope anchor's own close, whether or not the scope ever ships
(ADR 0110) — and before this record the only survivor was the body of a merged pull request, which appears in no
backlog and no query.
`/superdev:review` writes it through whichever store document is active, so a store document with no
`## Triage record` section leaves the command asking a backend for a record that backend never defined:
the review defers, the ledger bullet lands, and the finding reaches nothing. Walking `storeDocuments()`
rather than a hardcoded four-seed table is what covers a fifth backend seed, and this repo's own dogfooded
config, the moment either exists, with no second row for anyone to remember to add.

The two writer rows fail independently, and for different reasons. `skills/review/SKILL.md`'s row spans from
the record to the `deferred add` call, so it pins the **ordering** as well as the presence: a bullet
written before the record is exactly what a failed create leaves behind, and a command that reverses the
two reads as if that were the design. `references/scope-mode.md`'s row spans from the record to
`docs/agents/issue-tracker.md`, which pins the split — the reference names the record and sends the reader
to the active store document for the mechanics. A reference that states the mechanics itself hardcodes a
backend into a tool-agnostic document, which the **Backends are pluggable** working rule exists to
prevent, and it stays green against a store that renders the record some other way.

What a section must *say* past what its own row spans stays a review's job: a seed that names the create
call but drops the "no feature label and no `ready` label" clause writes a record `/superdev:implement` then
loads as work to build, and no pattern here catches that.

The `specialising-citations` contract: every store document cites the generic contract each
section it carries specialises. `scanSpecialisingCitations` (`scripts/drift/scanners.js`) walks the same
`storeDocuments()` candidate list that `anchor-contract`, `append-mode`, `release-contract`,
`triage-record`, `run-state-contract`, `dod-ticks-contract`, and `assignee` each walk, and for each member of the
**specialising family** reports a section that no longer names `` `plan-contract.md` → *<section>* ``
anywhere inside itself.

**`SPECIALISING_SECTIONS` is the family's one membership list**, and three sides follow from it with no
second edit: the generic-side row in `SOURCE_SECTION_CONTRACTS` (built by `specialisingGenericRows()`),
this citation assertion, and the heading each is found by (`specialisingHeading()`). The store-side
presence contract is the one side that stays per-section, because each has its own elements to assert.
The list holds `Scope anchor`, `Release`, `Run state`, `Append mode`, `Triage record`,
`Assignee`, and `Definition of Done ticks`.

**The membership rule:** a section is a member when `plan-contract.md` states its generic contract **and
at least one store document renders it as its own section**. `Assignee` passes — every store
document but one carries a `## Assignee` section and each of those cites it — and was the cost of the two lists this
one replaced. Its store side was pinned by `scanAssigneeContract` while nothing pinned its generic side
and nothing pinned those citations, because the rows were written out by hand beside the list rather
than derived from it. Root `AGENTS.md`'s reference table names one more: it includes `## Feature label`,
which fails the rule's second half. That table describes what `plan-contract.md` owns rather than what
this list checks, and stays prose.

`Feature label` keeps a hand-written row instead of joining the list, beside `Fields`,
`Slice lifecycle & status` and `Epic visuals` — the sections cited by name that no store renders as a
section of its own. Every seed folds the feature label into a configuration bullet, so there is no store
side for a citation to come from.

`specialisingHeading()` stops at a word boundary rather than end-of-line, because a real heading carries a
trailing qualifier on both sides of the family: `references/plan-contract.md` writes
`### Assignee — store configuration, not a slice field`, and the Jira seed writes
`## Run state (fill in at setup)` on the sections a consumer completes at setup. The `#{2,3}` span is what
reaches `Assignee` at its real depth, under `## Issue-backend mapping (general)`.

This is the third side of an arrangement whose other two were already pinned, and the one that was
load-bearing. `SOURCE_SECTION_CONTRACTS` proves the generic section still exists in
`references/plan-contract.md`; the anchor, append, release, triage-record and run-state contracts prove
the store document carries its own matching section. Neither reads the citation between them,
so a store document could point anywhere, or nowhere, and stay green. That is not hypothetical: four
seeds opened their `## Triage record` with `` `CONTEXT.md` → *Triage record* ``, a reference resolving to
nothing in a consumer install — `plugin/` ships no `CONTEXT.md` and no `docs/adr/`, and a consumer's own
`CONTEXT.md` is that repo's glossary — and the suite stayed green until a human review caught it.

Four details are deliberate. The citation is matched **anywhere inside the section**, not only in its
opening sentence, so the check's own message says "somewhere in its own section" rather than "opens by
citing": a stricter positional claim would be one the pattern cannot honestly make. Every space in a
section name matches any run of whitespace, because the citation is prose and wraps —
a store document can carry it as `*Append\nmode*`, which a literal space would report as drift. And a
section the store does not carry yields nothing, because `extractSection()` returns `null` and the loop
moves on: whether a store owes the section is the presence contracts' question. The citation test runs on the
fence-masked section, so a citation shown only inside a fenced code example does not count.

That skip is why membership alone is not a presence contract. A member a store renders nowhere is silently
clean here, which is what the store-side contracts exist to catch. `scanAnchorContract`,
`scanAppendContract`, `scanReleaseContract`, `scanTriageRecordContract`, `scanRunStateContract`, and
`scanAssigneeContract` each pin a member's own `## <Section>` heading, and none exempts a store by name.
`scanAssigneeContract` pins
two halves: the `## Assignee` heading through `specialisingHeading('Assignee')`, and the
`- **Assignee:**` configuration bullet, which it forbids rather than requires, because the assignee lives
in the untracked `.superdev/info.json` (ADR 0073).

One notation is pinned, not an alternation. Accepting `` `plan-contract.md`, *Section* `` beside the arrow
would make both forms true forever and leave a new seed's author guessing which to copy, so every
comma-form citation this repo's own `docs/agents/issue-tracker.md` carried was normalised to the arrow
instead of widened into the pattern. Its `## Assignee` section is held to the same one notation, as a
member of the family like any other.

The `glossary-specialising-citations` contract: every `CONTEXT.md` glossary entry cites the
generic contract the member it names specialises. This is the citation the `specialising-citations`
check already pins on the store side. `scanGlossarySpecialisingCitations` reads `CONTEXT.md` alone and
splits it into paragraphs at blank lines, on the fence-masked text. A paragraph that names a
**specialising family** member's backticked `` `## <member>` `` heading owes
`` `plan-contract.md` → *<member>* ``. Each paragraph that does not carry it is a gap naming the
entry's bold term. `SPECIALISING_SECTIONS` is the only membership source.

Two entries naming one member
both owe the citation, as **Scope anchor** and **Anchor dependency** do for `Scope anchor`. A paragraph
naming only a non-member heading, such as `` `## Untriaged item` ``, owes nothing. A heading reference or
a citation inside a fenced example neither triggers the check nor satisfies it. The trigger is the
backticked heading alone: an entry that defers in unbackticked prose passes silently. The
`simplicity:` note beside `glossaryHeadingReference` in `drift/contracts.js` states that ceiling.

The `backlog-survey` contract (ADR 0049) pins rows on `skills/backlog/SKILL.md`, the read-only
survey that reports every open scope anchor, every triage record, and every stranded run root by the
action it needs. Rows pin
the coupling that matters — the command names `` `## Scope anchor` `` and `` `## Triage record` ``, so the
candidate listing and the triage listing both resolve through whichever `docs/agents/issue-tracker.md` is
active rather than through a query written into the command. Another pins `scope.js get stage`, the same
ledger read `/superdev:status` reports from, so the two commands agree about a scope by construction
instead of by coincidence; a stage derived from git state disagrees with no error anywhere. A further row
pins the read-only clause, anchored on a bolded run that opens its own line rather than the bare words.
A fix cycle found the prior anchor spanning newlines between two unrelated bold runs and matching a
document that asserted the opposite. That opposite assertion was: "it mostly writes nothing, though a
label update is fine". Unbolded hedging prose sat unmatched in between. "Writes nothing" is exactly the phrase that recurs in passing
prose about some other command, and a passing mention is not the contract.

Each row fails silently on its own, which is why they are pinned rather than reviewed. A survey
that has quietly started writing looks identical in its own output. One that has learned a backend's own
query works perfectly on this repo and reports an empty backlog on every other. One reading the wrong
stage contradicts `/superdev:status` about the same run with both commands exiting zero.

The `backlog-submitted-buckets` contract (#687) pins the survey's own carve-out for a run root at stage
`submitted`: only a human moves it further, so the
generic `in flight` act lookup — "the chain command that stage has not reached" — resolves to nothing for
it. One row pins the two buckets that stand in for it, `awaiting merge` and `merge unrecorded`, each
pointing at `/superdev:ship <scope-slug>`; the other pins the `scope.js get pr` read that tells them
apart, off the ledger's own `**PR:**` header rather than a query written into the command.

The `deploy-step-visibility` contract (ADR 0101, INV-0099, whole-scope review, ship-deploys fix cycle 1):
two surfaces that tell an operator what `/superdev:ship` does, or what to run next after it, had fallen
behind ADR 0101's deploy step. One row pins `skills/submit-pr/SKILL.md`'s own next-command line naming the
deploy alongside the merge, then ship's offer to start `/superdev:verify-ship <scope>`, or
`/superdev:wrap-up <scope>` when nothing is left to verify, and that command printed when the operator does not take
the offer (ADR 0106, ADR 0116, ADR 0132). One row pins the same
document's run-standing sentence stating that `/superdev:wrap-up` closes the anchor after the merge and any
verify-ship pass the run needs. One row pins
`skills/backlog/SKILL.md`'s claim that ship closes no anchor and wrap-up closes the anchor, so a
`shipped` run root with an open anchor is the ordinary state between the two, not an anomaly. One row pins
the `deploy resume` bucket: a `shipped` run root stuck mid-`auto`-deploy gets `/superdev:ship <scope-slug>`
as its act whatever the scope checkout holds (ship leaves the checkout standing until wrap-up), rather
than steering an operator into closing an anchor by hand and stranding the deploy INV-0099 forbids.
Rows pin that a stalled deploy shows on every store and ranks first (#750): a `shipped` run root
meeting the `deploy resume` definition gets its row whether or not an open anchor matches it — under a
scope anchor a human closed by hand, no open anchor matches (ADR 0110) — the bucket's
own definition requires no matched run root, such a run root counts against the empty-backlog exit, and §5
ranks a `deploy resume` row above every other row, `blocked` included.
Losing the submit-pr row leaves an operator who has never run ship before unaware it deploys anything;
losing either backlog row reopens the steer into breaking INV-0099; losing any of the four visibility rows
hides a half-deployed merge under a hand-closed anchor, or ranks it behind work that has not started.

The `reviewer-model-tiers` contract (ADR 0118): the review model tiers rest on measured runs, so a value
reverted at one site would silently undo the decision there. Rows pin `skills/implement/SKILL.md`'s
model-selection table naming `opus` for `slice-reviewer` and `sonnet` for `simplicity-reviewer`, each
agent's own frontmatter default (`agents/slice-reviewer.md`, `agents/simplicity-reviewer.md`), and
`skills/review/SKILL.md`'s whole-range `simplicity-reviewer` dispatch on `sonnet`. A pin on a model value
fails when the value changes, not only when the line goes. `references/implement-full.md`'s cut rule is
pinned too: the controller applies a recommended cut only when it honours the rules the repository documents
for itself, and names each cut it declines with the rule it would break.

The `fix-dispatch-siblings` contract (ADR 0118, INV-0120): measured scope fix cycles left most of their
re-review findings behind as incomplete fixes, a fix that changed a rule in one file while another file
kept stating the old one. Rows pin the sibling-surface clause on both halves: every dispatch that sends a
fix (`skills/review/SKILL.md`'s fix cycle, `references/implement-full.md`'s per-slice fix loop,
`references/run-handoff.md`'s red-suite fix, which also states that a red suite's rule is the behaviour
the failing test pins), the implementer's own brief (`agents/implementer.md`), and
`skills/implement/SKILL.md`'s invariants beside the conditional RED-test rule. Each of those files
also carries the carve-out: a fix reports the `AGENTS.md` hierarchy and the knowledge base unedited,
because the doc pass owns them. The dispatch sites and the invariants also state that a fix report
omitting the checked-and-changed list is a report defect, sent back to the implementer. They also state
the controller's cross-check: before the next step, the controller greps the checkout for the key phrase
of the rule the fix changed, in its old wording and its new. A hit in a file the checked list does not
name is sent back in the same cycle, a hit in the `AGENTS.md` hierarchy or the knowledge base is
reported, and a hit in `CHANGELOG.md` is release history that needs no change. The controller greps the
checkout it dispatched the fix into: the slicetree for a per-slice fix, the scopetree otherwise. The
implementer's brief states that its list names every file its search hit, because the controller
cross-checks it, and that a `CHANGELOG.md` hit needs no change. The fix models are pinned too: the scope
fix cycle on `opus` and the red-suite fix on `sonnet`, each with `haiku` only when every finding in the
fix list (every failure in the failing output, for the red-suite fix) is a mechanical finding. Any other
finding keeps the whole dispatch on the site's model. A mechanical finding is one whose fix changes no
stated rule or behaviour, such as a rename, a rewrap, or a typo (`CONTEXT.md`, *Mechanical finding*). A fix
that changes a rule or behaviour any surface states needs the sibling-surface search, so it stays off `haiku`. Each site
pins that definition clause beside the model rule. The same rule is pinned in
`references/implement-full.md`'s per-slice fix loop (`sonnet` otherwise) and in the model table of
`skills/implement/SKILL.md`, whose prose under the table carries the definition and the sibling-surface
reason. The selftest mutates each row's `sonnet` or `opus` fallback.

The `backlog-verify-wrap-up` contract (ADR 0106, ADR 0116) pins the survey's routing of a `shipped` run root.
Rows pin the `awaiting verification` bucket (act `/superdev:verify-ship <scope-slug>`) and the `awaiting wrap-up`
bucket (act `/superdev:wrap-up <scope-slug>`); backlog's citation of `references/scope-mode.md`'s
`## Routing a shipped run`, verify-ship mapping to the first bucket and wrap-up to the second (INV-0116); a
`shipped` run root over an already closed anchor going to wrap-up; and a `closed` run root getting no row.
Losing a bucket row leaves a merged scope with no next command in the survey. Further rows pin the rule
itself in `scope-mode.md`: a line neither ticked nor `accepted:`, or a listed `manual` target not recorded
`deployed`, going to verify-ship; the lines judged from `<run-root>/dod.md`, with an anchor whose verdict
differs from it going to verify-ship; and a missing or unreadable `dod.md` judged from the anchor alone.
Backlog keeps its own row for an unreadable anchor, a `blocked` row naming what could not be read, and a
`shipped` run root under an anchor a human closed by hand goes to `deploy resume` when its deploy stalled,
and to `awaiting wrap-up` otherwise (ADR 0110). The rows pin presence only: no row scans for an instruction
to close an anchor by hand.

The `run-state-contract` check, `scanRunStateContract()`: every store document carries its
own `## Run state` section (`plan-contract.md` → *Run state*, ADR 0042). It walks the same
`storeDocuments()` candidate list the anchor, append, release and triage-record contracts walk, so a
backend seed added later and this repo's own dogfooded `docs/agents/issue-tracker.md` are both covered
without either being named. Without it, deleting a whole `## Run state` section from a store document
leaves the suite green — the citation check reads a section that is present, and `extractSection()`
returning `null` is the same branch that correctly skips a store rendering none. Every specialising
section carries a store-side presence contract this way. `Assignee`'s lives inside
`scanAssigneeContract`, beside that contract's other half.

**No store is exempt, and that is the point.** A snapshot-less backend declares itself snapshot-less
*inside* this section — the Jira seed's own `## Run state` says the store carries no snapshot by default,
and `references/run-init.md` reads that section for a single yes-or-no answer before it adopts. A document
without the section leaves that question unanswerable rather than answered "no", so exempting the
snapshot-less store would drop the check exactly where it matters most.

**The heading may carry a trailing parenthetical.** The Jira seed writes `## Run state (fill in at setup)`
on the sections a consumer completes at setup, the same suffix it puts on `## Configuration` and
`## Status workflow`, so this check matches the heading through `specialisingHeading('Run state')` rather
than a pattern of its own — the same word-boundary latitude the citation assertion, the generic-side
rows, and `scanAssigneeContract`'s section half already take, and the hand-written `## Epic visuals` row
already took, so changing the anchoring in one place can never diverge from any of them. Among the
other store-side presence contracts, `scanAnchorContract`, `scanAppendContract`, and
`scanTriageRecordContract` still anchor their own pattern to end-of-line. Each also feeds
`extractSection()` for element checks a word boundary would not serve.
`scanReleaseContract` anchors the same way, but tests raw text for presence alone: `RELEASE_PATTERN`
carries no elements to extract.

The presence of a section is all this check claims. What that section must *say* for its backend — which
call writes the snapshot, which reads it, that the section is machine-owned — stays a review's job, the
same ceiling the release contract carries.

The `dod-ticks-contract` check, `scanDodTicksContract()`: every store document carries its own
`## Definition of Done ticks` section (`plan-contract.md` → *Definition of Done ticks*, ADR 0091). It
walks the same `storeDocuments()` candidate list `run-state-contract` walks and is modeled directly on
`scanRunStateContract()` — same word-boundary heading match through `specialisingHeading('Definition of
Done ticks')`, same fence-masked text, same absent-file skip. **No store is exempt, the same point
`run-state-contract` makes for its own section:** the tick is independent of `## Run state` (ADR 0091,
INV-0001, INV-0015) — a store with no snapshot still ticks its anchor's own checklist, and still states
how in this section, so exempting a snapshot-less store here would drop the check exactly where a reader
most needs the answer. Beyond section presence, the check carries three content rules. Two hold INV-0014:
the section **cites `dod-line`** — `scope.js`'s own verb (below) — for the target-state line edit itself,
rather than restating that edit's mechanics by hand, and still reads that the write replaces the line's
previous note rather than appending a second one — a section with no `dod-line` citation, or one still
reading "append the note", is flagged by name. The third (triage #662) holds `plan-contract.md`'s own
`## Definition of Done ticks` section, which `DOD_TICKS_CONTRACTS` pins the same clause on: the section
states that a failed anchor write — the tick write itself — is **reported once per run and never stops
the run**, `dod.md` staying authoritative regardless. A section stating neither half of that sentence is
flagged by name, the same way the citation and append checks are. Each store's own fetch and write calls,
and how a criterion's tag renders in that store's own notation, stay a review's job.

The `body-edit-contract` check, `scanBodyEditContract()`: every store document, over the same
`storeDocuments()` candidate list, edits an issue body only through one gated rule (ADR 0115, INV-0115).
The document carries an **Edit an issue's body** bullet, and that bullet chains the edit after `&&` and a
`[ -s` non-empty-file test, so a failed read or producer, or an empty result, stops the chain before the
host call. Every issue body-edit call takes its body from a named file variable, through a flag that
reads that file. The flag's kind sets the allowlist:

- A **path flag** (`--input`, `--description-file`, `--body-file`, `-T`, `--upload-file`, `gh issue edit
  -F`) reads the file it names, and takes `"$f"` or `"$p"`.
- An **`@` flag** (curl and `tea api`'s `-d`, `--data`, `--data-binary`, `--data-ascii`, `--json`,
  `-F body=` in `gh api` and `tea api`, plus `--field body=` in `gh api` only and `--Field body=` in
  `tea api` only) reads a file only behind `@`, and takes `@"$f"`, `@"$p"`, or `"$(cat "$f")"`.
- A **literal flag** (`-f`, `--raw-field body=`, and `--field body=` under `tea api`, `--data-raw`,
  `--data-urlencode`, `--description`, `--body`, `-b`, and `-d` under `tea issues edit`, where it means
  `--description`) takes only `"$(cat "$f")"`. All but `--data-urlencode` send their value unchanged.
  `--data-urlencode @file` does read the file, and sends it URL-encoded, which is the wrong body for these
  APIs, so it stays flagged.

Anything else is a gap: stdin (`-`, `@-`, `--input=-`), a command substitution, an inline `"body"` or
`"description"` payload, a bare path on an `@` or literal flag, and an `@` on a literal flag, which each
send the path text as the body. A short flag reads the same fused as spaced (`-d@-`, `-XPATCH`,
`-sfXPUT`), and a field flag reads the same with its `body=` fused on (`-fbody=@-`, `-Fbody=@-`,
`--field=body=@-`, `--raw-field=body="$(cat)"`). The scanner's `simplicity:` note names these ceilings. A
value-taking short flag at the end of a cluster (`-sd@-`) is not read. A `tea` global flag before `api`
(`tea --login cb api … --field body=@"$f"`) hides the `tea api` call, so its `--field` reads as gh's `@`
flag. The scan covers the fence-masked prose plus every fence tagged `sh`, `bash`, `shell`,
`shell-session`, `zsh`, or `console` (any letter case), one command per line after backslash
continuations are joined. Every other fence (`json`, untagged) stays masked, as an illustration. A
body-edit call is `issues edit` or `issue edit` with a body flag, or a `PATCH` or `PUT` aimed at a bare
issue path (`/issues/<id>`, `/issue/<id>`) that carries a payload flag, quoted or not. Label adds, label
and assignee `PUT`s, `PATCH` closes, creates, and prose citing the rule by name are no body edit. These
known false positives stay. A commented-out command inside a shell fence
(`# tea issues edit 1 --description-file -`) counts as a call, because the scan reads the shape of each
line and not shell syntax. For the same reason a heredoc body line inside a shell fence counts as a
command: a `bash` fence holding `cat <<EOF`, `gh issue edit 1 --body-file -`, and `EOF` is flagged. The
scan reads curl's cookie flag `-b` (`curl -X PATCH -b "$c" -d @"$p" …`) as gh's `-b` body flag, so that
call is flagged. A quoted or unquoted `gh api` field (`-F "body=@$f"`, `-F body=@$f`) is flagged too. A
`PATCH` or `PUT` on a bare issue path whose payload is a command substitution counts as a body edit even
when it carries no body (a label update built by `jq -n`). The literal-JSON exception, which lets a
`PATCH` or `PUT` carry a payload that names no body (a close), rejects any payload carrying a `$`. A store
document builds either payload into a file first. A create keeps its heredoc stdin and its inline payload,
because nothing upstream of it can fail. The `## Definition of Done ticks` section names its body
extraction (`jq`), since `dod-line` reads a markdown body and never a JSON response. Each condition is
flagged by name. Whether a section cites the bullet, and what a controller actually runs, stay a review's
job.

The `untriaged-item` check, `scanUntriagedContract()`: every store document carries a
`## Untriaged item` section stating how that backend recognises an **untriaged item** — an open record
superdev never wrote, carrying no feature label and no triage signal (`CONTEXT.md`'s glossary entry) —
how it lists them, and how it reads one's age. It walks the same `storeDocuments()` candidate list the
anchor, append, release, and triage-record contracts walk, so a backend seed added later and this repo's
own dogfooded `docs/agents/issue-tracker.md` are both covered without either being named. Modeled
directly on `scanTriageRecordContract()`, including its own asymmetry: the heading alone is not the whole
contract, so a section stating only how to recognise one and never how to list them, one that lists them
and never states how to recognise one, or one that lists them and never how to read one's age, still
fails, the same gap that check corrects for its own section.
`/superdev:backlog`'s `untriaged` bucket is the reader this check protects — a store document that lost
its recognise bullet would leave that survey unable to tell an untriaged record from any other open one,
one that lost its listing bullet would leave the survey unable to reach the backend's own untriaged
items, and one that lost its age bullet would leave the survey unable to order and cap that bucket, all
three with nothing going red. Unlike the other five members of the
specialising family, `plan-contract.md` carries no generic `## Untriaged item` section to specialise:
`CONTEXT.md`'s glossary entry already sends a reader straight to "that store's own `## Untriaged item`
section", so this check has no citation half in `scanSpecialisingCitations` to pair with.

**Beside the specialising family's own checks, one selftest with no id of its own in the registry** (`scripts/drift/selftest/scanners.test.js`,
right after its `scanGlossarySpecialisingCitations` suite): store-side presence coverage for the whole
specialising family. Each member has its own store-side scanner, pinned in this file beside
that member's own check — `anchor-contract`, `append-mode`, `release-contract`, `triage-record`,
`run-state-contract`, `dod-ticks-contract`, and `assignee` — and that per-member shape is
exactly what let `Assignee` ship with a store-side hole `scanSpecialisingCitations`
could not see — a citation check reads a section that is present and skips one that is not, so a member
with *no* store-side scanner at all is invisible to every check individually, and nothing before this
selftest ever asked the question at the family level. It builds one fixture rendering every real
`SPECIALISING_SECTIONS` member as a bare heading plus its citation, then for each member reruns the whole
`checks.js` registry against a copy with that member's section removed entirely, comparing the two gap
sets by identity (`checkId::JSON.stringify(gap)`, not by count) — a member is covered when the
section-removed run carries an identity the full run does not. It is a selftest, not a registered check,
because running the registry from inside the registry recurses. A member added to `SPECIALISING_SECTIONS`
with no store-side scanner for it is caught here with no fixture edit: proven by temporarily adding a
seventh, unscanned name to the real list, which fails this assertion and names that member, then reverting
both to restore green.

The `tier-skip` contract (ADR 0037) pins rows, one per end of a dependency between
two documents. `skills/review/SKILL.md` skips `superdev:simplicity-reviewer` on a `full`-tier scope, and that
skip is sound only because `references/implement-full.md` dispatches the same reviewer per `behavior`
slice and applies its cuts before each slice merges — a `mechanical`/`docs` slice gets no per-slice pass
either way, and the skip's own report line says so rather than claiming blanket coverage. Pinning
`review/SKILL.md` alone would be a one-sided pin in the
direction that matters least: a `review/SKILL.md` that loses the skip costs one redundant pass. The costly
direction is the other one, so another row sits on `implement-full.md`'s per-slice dispatch — remove it
and a `full` run has no over-engineering pass anywhere, while `review/SKILL.md` goes on skipping on the
strength of a pass that no longer happens, every check green and the coverage gone. The `lite` tier needs
no row: it dispatches nobody, so its whole-scope pass has nothing to be redundant against, and the
`review/SKILL.md` row names the tier it fires on rather than the tiers it does not. A further row pins the
`behavior` qualifier itself, anchored to the bullet that states the skip rather than to any occurrence of
the phrase in the document: the prose already drifted once, to an unqualified "covered per slice", and a
whole-document presence test would have stayed green as long as a copy of the qualified phrase survived
anywhere else in the file — an assessment-template example, say — which is exactly the shape the drift
took. This is a presence table, so a paraphrase it does not recognise fails loudly rather than silently,
and it carries no ceiling note for the same reason its sibling presence tables carry none.

The `containment-delegation` contract (ADR 0053) pins a row, retargeted onto code (ADR 0069):
`plugin/scripts/publish-kb.js`'s `checkContainment` delegates the test by `require`ing `testContainment`
from `scope.js` and calling it directly, rather than stating an ancestry check of its own — the same
delegation `skills/publish-kb/SKILL.md` §3 used to state in prose, by pointing at
`references/scope-mode.md`'s `## Containment` section, before the mechanics moved into the script. A
dispatch cannot contradict this the way a skill's restated incantation could: `checkContainment` is code
the script always runs, not prose a model re-reads and might paraphrase into its own git command. Its
own table rather than a row on `RUN_KIND_CONTRACTS`, whose subject is scope-mode.md's three run kinds —
a publish-kb row there would make that check's `ok` phrase lie about what it guards. The row is a
presence pattern, so it catches only one half of the drift ADR 0053 names: `checkContainment` dropping
the `require`/call and reaching for whatever ancestry test replaces it is the state ADR 0053 measured —
"not merged" on every squash-merged scope, and an operator trained to wave through the one warning that
is real. A script that keeps the real call *and* grows a second, redundant ancestry test beside it is the
other half — a presence pattern cannot see a second implementation sitting beside the one it requires, so
that half has no assertion here.

The `containment-refetch` contract (ADR 0065) pins rows, all on `references/scope-mode.md`'s
`## Containment` section: that test refetches the base before it answers not contained. ADR 0053 fixed
what the test asks — content, not ancestry — and left the ref it asks of alone, so a pull request
squash-merged on the host reads not contained until the clone pulls, and every consumer inherits that
answer: `skills/publish-kb/SKILL.md` §3 asks the operator to confirm a publish, and
`## Cutting the scope branch`'s `fresh` run kind offers to rename a branch whose work is already safe.
`/superdev:plan`'s extend path reads no containment: ADR 0083 made a shipped feature's refusal a plain
ledger-stage read, with no branch test behind it. One document carries the whole contract, because that inheritance is
what the delegation above already pins. The rows sit apart because each fails on its own. The fetch row
pins the retested ref by name: `git fetch <remote> <base>` populates `refs/remotes/<remote>/<base>` and
never the local branch, so a second pass rewritten to retest `<base>` re-asks the stale ref and can only
agree with the first verdict — a contract that reads enforced while the defect stands. The fallback row
covers the git older than 2.38 route, the weaker signal to begin with and the one most in need of a fresh
base. The scope-prune row is the negative half: that hook mirrors this section in JavaScript and is the
one caller excluded from the fetch, so a section that stops naming the exclusion invites a network call
onto a `Stop` hook firing every turn. The failure row keeps the second pass advisory, so an unreachable
host leaves the first verdict standing, named as local, rather than ending the caller.

The `containment-probe` contract (ADR 0082) pins rows, all on the same `## Containment` section: where
the tree comparison conflicts, the test asks the neighbouring question — whether base's history took the
branch's patch. A base that edits the branch's files after taking its work conflicts on a branch it holds
in full, which is what left twenty shipped run roots and their branches standing. One document carries
the contract for the same reason the refetch rows do: `plugin/scripts/scope.js` implements the section's
answer and `plugin/hooks/scope-prune.js` calls that implementation, so neither restates it. The tier row
pins the probe's existence and its exit 1 trigger, without which the implementation drifts back to the
verdict that caused the symptom. The cap row pins the bound as a commit count: a wall clock swapped in
lets one repository state answer two ways, the property ADR 0082 rejected it for. The fail-closed row
pins INV-0003 across every probe step, the direction a probe that guesses breaks first.

The `setup-check` contract (ADR 0068) pins rows on `skills/setup/SKILL.md`: it declares an
`argument-hint` naming `check`, the literal word `/superdev:document audit` already established for a
sniff-free mode switch, and it states that mode's posture — writes no file, makes no slice-store call,
and starts no interview — in that same document. Losing the argument-hint row strands the mode behind an
argument-hint that never mentions it; losing the posture row lets `check` silently grow a write or drift
into the ordinary interview, the exact mid-sweep mutation ADR 0068 rejects for every leg.

The `seed-gap-check` contract (ADR 0107) pins rows on `skills/setup/SKILL.md` and `skills/sweep/SKILL.md`:
`check` still compares each present document with its seed and lists its seed gaps, states that a renamed
heading, a filled-in placeholder, setup-facing instruction text, and a document-only section are no gap,
reports `no seed to compare` for an "Other" backend, a `None` knowledge base, a `documentation.md` recording the user's own convention, `toolchain.md`, and
`verification.md`, names the compared plugin version, lists a `## Seed deviations` bullet as recorded,
and defines that bullet's shape once, never in a configuration-key form. Sweep still classifies every
config-leg seed gap as a judgment. `check` lists a `## Seed deviations` bullet that names no rule in the current seed as a stale deviation, never as a gap. Losing the no-gap row reports every renamed heading as a gap. Losing
the shape row lets a deviation bullet take the `- **Backend:**` form that `plugin/scripts/publish-kb.js`
matches anywhere in `knowledge-base.md`. Losing the sweep row writes a deliberate deviation into the intent
as a fact. The comparison itself is agent judgment (ADR 0107), so the rows pin the instruction to compare
and never a verdict.

The `seed-reconcile` contract (ADR 0107, INV-0107) pins rows on `skills/setup/SKILL.md` and
`skills/backlog/SKILL.md`: a plain re-run still offers each seed gap with apply, record as a seed
deviation, and leave for later, writes nothing for a gap without the operator's choice, requires a reason
before it records a deviation, asks a repository-specific gap's fresh-path question and writes the answer
never the seed's placeholder, keeps `## Commands` behind the `find` probe and writes no assignee into a
tracked document, writes a backend switch fresh with no deviation carried over, joins `deployment.md` to the reconcile with its targets keeping the delta rule, asks nothing when no gap
remains, offers each stale deviation a drop or keep choice, and names the reconcile in §4's closing message. Backlog's two configuration-gap lines still name the `/superdev:setup` re-run as
the remedy. Losing the choices row turns the re-run into an overwrite of the operator's text. Losing the
placeholder row writes a seed's `<PROJ>` into a consumer's document. Losing a backlog row sends an
operator back to hand-copying a section from a seed, the remedy the re-run replaces. INV-0107's `Check:`
is these rows.

The `reference` and `content-types` checks are opposites. `reference` catches a reference to a file that
does not exist. `content-types` catches an agent that drops its wire to a file which still exists. That
drift leaves the reference resolvable and the suite green, and the lens then does nothing in any dispatch.

`reference` and `command-resolution` are the same check at two levels: one resolves a `references/` path,
the other a command name. `command-resolution` and `chain-handoff` are opposites in the same way as
`reference` and `content-types`: `command-resolution` catches a handoff that points at a command with no
file, `chain-handoff` a command that names no successor at all.

The `standing-code-lens` contract pins rows: `agents/final-reviewer.md`'s Brevity axis and
`references/review-checklist.md`'s Cross-slice divergence bullet each still carry a standing-code
reading beside their slice-scoped one. Both sentences are written for a scope with slices to compare —
"spans slices", "across slices" — and a standing-code target has none, so a literal reading of either
flags nothing there, while `simplicity-reviewer` is skipped on that same target
(`skills/review/SKILL.md`), leaving no other lens to pick up the slack. `final-reviewer.md`'s own blanket
re-aim for standing code ("applying every check below to the code itself rather than to a change")
re-aims a check's *target*, not what a slice-scoped clause cashes out to once there are no slices at all,
so it does not reach these two on its own. Losing either sentence leaves the matching lens reading
correct in prose and silent on a standing-code review.

The `invariant-register-path` contract (ADR 0077) pins a row on `references/domain-modeling.md`: it still
names the register's fixed path, `docs/invariants.md`. `/superdev:plan` and a human both find the
register by that path, so a copy that stops naming it strands both back at the `.claude/rules/` home
the register replaced, with nothing failing to say so.

The `setup-check-claude-rules` contract (ADR 0077) pins a row on `skills/setup/SKILL.md`: `check` mode
still reports a leftover `.claude/rules/` directory, naming `docs/invariants.md` as where its content
belongs and that the move is by hand. A repository that still carries `.claude/rules/` lost its
rule-compliance check the day the register replaced it; losing this row leaves `check` mode silent on
that directory, with no signal telling the operator the content wants migrating — by hand, because
`Class` and `Concepts` are mandatory register fields a glob-scoped rule records nowhere.

The `invariant-register-doc-pass` contract (ADR 0077) pins rows sharing one pattern:
`references/doc-pass.md` and `agents/doc-reader.md` each still instruct themselves to resolve every
`docs/invariants.md` entry's `Paths:` glob and `Symbols:` entry against the repository, reporting one
that matches nothing by its entry id. The two share the shape `content-types` guards on its own lens:
the writing side (`doc-pass.md`, performed by `doc-writer` and the `lite` playbook alike) and the
cold-reading side (`doc-reader`) can each drop the instruction independently, leaving a stale path or
symbol unreported and the suite green. Neither row asserts that the check's *logic* runs correctly — the
register carries no parser or script of its own, by design, so only a human reading a live repository can
tell a resolved entry from a stale one. What the row pins is narrower: that the instruction to look is
still there.

The `invariant-compliance` contract (ADR 0077) pins rows: `skills/plan/SKILL.md` still judges the
decomposition against the invariant register during grounding, reading `docs/invariants.md` whole and
holding every match before any slice exists; `skills/plan/SKILL.md` also still routes a held match's id
into the touching slice's own `spec` and `acceptance` once that slice is cut, leaving the epic's own
criterion stated as the behaviour the invariant protects (ADR 0091); and `agents/final-reviewer.md` still
carries the Invariant compliance check — reading `docs/invariants.md` itself, judging an entry covered
when an epic criterion states the behaviour it protects or the touching slice's `spec`/`acceptance`
carries its id, reporting a plan-coverage gap only when neither holds, skipping silently when the register
is absent. The judging and the routing are two different points in `/plan`'s own flow, so they are two
separate rows: any one of the three losing its wording strands an invariant somewhere on the route between
the interview that settles it and the implementer's isolated worktree that never reads the register
directly.

No row pins `skills/review/SKILL.md`'s `final-reviewer` dispatch to this wording, and none needs to: the
Invariant compliance check sits in `final-reviewer.md`'s own "What to check" list beside Plan alignment
and the quality axes, which the agent runs unconditionally on every dispatch. `review/SKILL.md`'s dispatch
prose lists the quality axes — correctness, consistency, whole-scope brevity, security, performance —
none of them invariant compliance or plan coverage, so no dispatch sentence states the coverage rule to
contradict; only editing `final-reviewer.md` itself, which this row already guards, can drop the check.

The `criterion-tag` contract (ADR 0091, INV-0014) pins rows across `references/plan-contract.md` and
`skills/plan/SKILL.md`. `plan-contract.md` still states the `### Criterion tags` rule — every epic
criterion tagged with the slice ids that deliver it, or `scope`, in the `- [ ] <criterion> — <ids|scope>`
line format — still states the judged-line note format (`— met:`, `— not met:`, `— ceiling:`, never a bare
tick, a later judgment replacing any earlier note rather than appending a second one), and still states
that a single-slice feature carries no tags. `skills/plan/SKILL.md` still tags
every criterion at decomposition (§3) once it settles which slice delivers what, still shows the operator
those same tags at the quiz (§5), and still formats the epic checklist in the reference's line format at
write time (§6). Any one row losing its wording leaves the tag rule stated somewhere the write path never
reaches, or leaves `/plan` writing a checklist a controller cannot later tick against (INV-0014,
INV-0015).

The `dod-ticks` contract (ADR 0091, ADR 0092, INV-0014, INV-0015) spans
`references/dod-ticks.md`, both execution playbooks, `agents/implementer.md`, `skills/review/SKILL.md`
§4, and `references/run-handoff.md`. `dod-ticks.md` still
states the mapping gate — a dispatch hands the worker the `dod.md` path plus the exact criterion lines
it must report on (the listed lines), and a controller ticks only a line its own dispatch listed, with
implement's slice dispatch listing the criteria a slice's tag names — still states the note rule (a
bare tick is invalid, and a listed line the report never touches is a report defect the controller sends
the report back for, rather than ticking around it), still states that only a controller writes a tick,
one criterion at a time, and still cites the active store's own `## Definition of Done ticks` section as
where the anchor's half of a tick lands. `implement-full.md` still hands each implementer the **path**
to `dod.md`, never its text, states that it builds only its own slice and reports on the criteria tagged
with its own id, and still ticks from that report only after the slice's merge lands. `implement-lite.md`
still ticks from its own per-slice report the same way, since that tier dispatches nobody to report to
it. `implementer.md` still reports one line for every criterion its dispatch listed, in the three shapes
(met + evidence, not met + reason — a criterion several slices share and this one cannot finish alone
naming what it delivered and the remaining slice ids, or ceiling + partial evidence), never omitting a
listed line, and states that a criterion tagged with several slices gets the same three shapes, reporting
only what this slice delivered — never a sibling slice or whether it merged, since the implementer cannot
see that. `dod-ticks.md` also states review's own listed-lines case — `final-reviewer` returns a verdict
for every `dod.md` line, and a fix cycle's dispatch lists exactly the lines that cycle unticked or found
broken — and `skills/review/SKILL.md` §4 restates that same fix-cycle dispatch clause on its own dispatch
surface (root AGENTS.md's dispatch-prose rule: a contract in a reference also holds in the dispatch prose
that reaches it). `dod-ticks.md` also states the **joint-tag controller rule**: a line tagged with
several slices never ticks while any other slice in its tag stands unmerged, per the ledger
(`scope.js get slices`) — only the controller reads that. A `met` report on such a line, with a sibling
slice still unmerged, is recorded as `not met: <evidence>; remaining: <unmerged ids>`, and only the last
tagged slice's own `met` report ticks the line. Further rows sit on `references/run-handoff.md`, the
mapping gate's fourth live path: its own fix dispatch states that it is a listed-lines case of
dod-ticks.md's mapping gate, handing the `dod.md` path plus the `scope`-tagged lines the red suite
blocks, and its own handoff pass — reached only once the fix loop above has settled the suite green,
none, or denied, since the loop's own 3-strike cap stops the run before this pass when a red suite never
goes clean — inline, no dispatch, on both tiers — reads dod-ticks.md, settles every `scope`-tagged
criterion, also settles every joint criterion (tagged with several slices) that an earlier tagged slice's
genuine `not met:`/`ceiling:` note left unticked, re-checks every earlier tick against the integrated
branch, and states that an unmet result stays unticked with its reason and never blocks the handoff
(INV-0016: review is the gate). Its closing line names what it skips — review, doc pass, pull request,
cleanup — and never "no DoD tick", since the handoff pass just above it ticks (triage #660). Any one row
losing its wording leaves the rule stated in a reference neither playbook's live path ever reaches,
leaves a playbook ticking (or reading) a report in a shape the reference never described, leaves the
report format stated only as a summary its own dispatcher never restates in full, leaves review's
fix-cycle dispatch prose free to drift from the reference it implements, lets a controller tick a joint
line early from a report that names only its own slice's share, leaves the fix dispatch ticking outside
the gate the reference exists to enforce, lets the handoff pass tick criteria against a scope the suite
itself never went green on, leaves a `scope`-tagged or joint criterion never settled or a broken earlier
tick standing forever, or lets the closing line contradict the pass it follows.

The `holds-verdict-ticks` contract (user decision, 2026-09-24; INV-0015) splits across
`references/dod-ticks.md` and `skills/review/SKILL.md` §4. Both still state that a `holds` verdict on a
line unticked with `not met:`, or carrying no note at all, ticks that line — the review's controller
writes the tick, with the verdict's own evidence as the note — and both still state that a line unticked
with `ceiling:` takes a holds tick only when the verdict itself states the criterion needs no deploy or
other outward-facing change to verify and cites evidence observed on the branch, and that a `holds`
verdict never ticks a line that genuinely needs a deploy to verify (INV-0006). Losing either surface's
general-case row lets a `holds` verdict on an unticked, unjudged, or under-reported line go unticked
forever outside a fix cycle; losing either surface's ceiling-case row lets a `holds` verdict tick a line
that still needs a deploy to verify, which INV-0006 forbids.

The `accepted-verdict` contract (ADR 0095) spans `agents/final-reviewer.md` and `skills/review/SKILL.md`
§4. `final-reviewer.md` still recognises **accepted** as one of the verdicts a `dod.md` line can carry —
an unticked line noted `accepted:` whose criterion the branch still does not meet is not a finding and
does not hold the stage — and `review/SKILL.md` §4 still restates that same clause on its own dispatch
surface (root AGENTS.md's dispatch-prose rule). Losing the agent's own row lets a reviewer report every
`accepted:` line as broken, since nothing tells it the verdict exists; losing the dispatch row lets the
controller's own §4 logic hold the stage on an accepted line, or fold it into the fix loop, exactly the
outcome the verdict exists to avoid.

The `always-review` contract (INV-0016) pins that `references/run-handoff.md` still prints
`/superdev:review <range>` for every scope, whatever its slice types. It is asserted on the document that
prints the handoff, so a `run-handoff.md` that quietly re-grows the retired
`/superdev:document`-instead-of-review branch leaves the invariant's own name stated nowhere true.

The `review-submitted-handoff` contract (#687) pins the re-review ADR 0096 sends an operator to after
resolving a base-merge conflict: it enters `/superdev:review` at stage `submitted` and leaves the stage
there, but §4's own handoff and suite-record write both change shape for it. One row pins that the
printed next command becomes `/superdev:ship <scope>` once the stage reads `submitted`, in place of
`/superdev:document`. The other pins that a standing finding there — the fix declined, or the 3-strike
cap reached — invalidates the tip's suite record with `suite set none <sha>`, so `suite reusable` never
still accepts a tip a standing finding stands against.

The `posture-read` contract (ADR 0101, ADR 0106) pins the one statement of how a merged feature's deploy
posture is read, `references/scope-mode.md`'s `## Reading the posture at the merge commit`, and that each
caller cites it. The statement carries five clauses: the merge commit comes from the pull request read by
the ledger's `**PR:**` number, with a ledger lacking the header reading as posture `none`; base is fetched
when the checkout lacks the commit; the posture comes from `git show <merge-commit-sha>:docs/agents/deployment.md`
in the invoking checkout, an absent document or `Posture:` line reading as `none`; the listed targets come
from the anchor's `**Deploy:**` line and the record from `scope.js deploy get`; and a target not recorded
`deployed`, an `absent` record included, is undeployed. `skills/ship/SKILL.md` (§3's resume test and §5's
deploy step), `skills/verify-ship/SKILL.md`, `skills/wrap-up/SKILL.md`, and `skills/backlog/SKILL.md` each
carry a citation row and state only their own branching. The same shape governs the `dod.md`-to-anchor
pairing: `references/dod-ticks.md`'s `## Pairing dod.md with the anchor` states it once, and rows on
verify-ship, wrap-up, and backlog pin the citation. The five-fold restatement had drifted apart, which is
the defect this contract removes.

The `closed-stage` contract (ADR 0106) pins the two exits that meet a `closed` run root, which is terminal
and which `scope.js` refuses to write out of. `skills/submit-pr/SKILL.md`'s stage gate reports "already
closed" and stops with no push and no pull request, as it does for `shipped`. `skills/review/SKILL.md`'s
stage write leaves the line alone at `closed` beside `documented`, `submitted`, and `shipped`.

The `vetted-options` contract (ADR 0122, INV-0126, INV-0127) pins the interview rule in
`references/cross-exam.md` and its use in `skills/brainstorm/SKILL.md`. `references/cross-exam.md` still
checks every load-bearing claim of every option before a composed question is asked, and cites
`references/doc-verification.md` for what makes a claim load-bearing. It still drops an option that fails
a check, names it with the reason, and labels a claim it cannot check as an assumption. It still shows the
evidence, the assumption labels, and the dropped options in prose before the question. It still keeps the
saves-something test, caps a composed question at two options, states a single survivor instead of asking
it, and puts a decision with no survivor as an open question. It still keeps the fixed option sets outside
the cap, and still makes a question wait for an exploration that would check one of its options.
`skills/brainstorm/SKILL.md` still offers only the vetted survivors, at most two, with a recommendation.
A presence row pins §2's exploration sentence to its clause that vets each direction before it is shown,
so rewording "Explore" to "Offer" fails it. A presence row in `skills/plan/SKILL.md` pins the derive-pass
settlement's explicit operator confirmation before §3 decomposes. A presence row in
`agents/final-reviewer.md` pins derive mode's hand-off: the plan's controller settles each gap and the
operator confirms the settlement. A presence row in the same file pins derive mode's **fold** lean, so a later
edit cannot drop it silently. Both final-reviewer rows tolerate any whitespace between words, so a rewrap cannot
fail them.
Absence rows reject brainstorm's earlier wording: neutral options, two to four directions offered, and a
reaction to every direction. Another absence row rejects a multi-select question in
`skills/plan/SKILL.md`'s `Settle the gaps` bullet, which would hand the sorting of gaps back to the
operator. A third rejects a gap settled as detail held for a slice, which leaves a derived criterion
outside the Definition of Done and every named non-goal (INV-0096). Each absence pattern tolerates any
whitespace between words, so a hard wrap cannot hide a restored phrase.

The `commitment-capture` contract (ADR 0081) spans rows across three documents.
`skills/brainstorm/SKILL.md` still names a discovery's load-bearing commitments in the intent as a pair,
the principle and the rule it implies. `skills/plan/SKILL.md` still routes every commitment — one a
seeded intent handed over and one its own interview originated — through
`references/domain-modeling.md`'s conversion, and still covers commitments in the seeded intent's
delete-gate beside `Rejected direction`. `references/domain-modeling.md` still carries the
conversion itself, in rows of its own. Each half reads correct alone while another is gone: an
intent can name commitments nothing converts, a conversion can exist that plan never routes to, and both
can stand while the delete-gate drops a commitment that found no home.

The same table pins the draft-intent contract (ADR 0112, INV-0110), two-sided. `skills/brainstorm/SKILL.md`
still writes its intent file as `status: draft` once the problem is confirmed and before any direction is
explored, still edits each settled point into its section in the turn it settles, still sets
`status: ready` at the handoff, and still offers every draft at its start to resume, delete, or start
fresh, never selecting one itself. `skills/plan/SKILL.md` still skips a draft in its brainstorm glob and
names each one skipped, still refuses an argument that names a draft, starting no interview and writing
nothing, and still states that only `status: draft` marks a draft. A one-sided pin would let one half go
while the other stays green: a plan that offers drafts seeds from half an intent, and a brainstorm that never marks an intent ready leaves
plan skipping it for good.

The reference's rows guard branches that fail in opposite directions. The sort still asks what
later decision a commitment constrains, which is the question the whole conversion turns on. The
authoring-rule guard is still asked first. So a rule about how the work is done is named out loud rather
than answering that question yes and landing in a consuming repository's register — a mis-route, not a
gap, and invisible once made. And the `Check: none` branch still keeps an untestable commitment as an
entry carrying its reason. So the sort cannot revert from what a commitment constrains to whether it can
be tested, which would drop a commitment binding a hundred decisions and no single test.

The `criterion-states-a-requirement` contract (ADR 0084, INV-0008) pins rows: `references/plan-contract.md`
still states that a Definition-of-Done criterion states a requirement the feature meets, never a procedure
superdev executes to verify it, naming no command superdev runs to check it; `skills/plan/SKILL.md` still
carries the **Write a Definition-of-Done criterion as a bare requirement.** interview step; and
`skills/plan/SKILL.md` still carries the **Surface a criterion verifiable only on a live system.** step,
naming the pre-merge deploy such a criterion would force and offering to keep it out of the
branch-verifiable Definition of Done. That offer does not reach a `Release risk:` criterion: the
`release-risk-criterion` contract pins that exemption on the same step (ADR 0133, which amends ADR 0084 on
the planning side). `Reachable:` stays the one standing exception to the bare-requirement rule, because it names an
entrance, never a verification step. Losing the reference row leaves that exception unexplained; losing
either skill row leaves the interview free to write a criterion naming a test command, or a live-system-only
criterion with no offer to keep it out of the branch-verifiable set — the exact shape ADR 0084 observed
forcing a pre-merge deploy.

The `clean-verdict-ends-loop` contract pins rows: a clean verdict ends the scope-mode fix loop the same
way attended or unattended, findings or not, and a finding the loop leaves outside its fix list is a
follow-up, never a fourth cycle. `skills/implement/SKILL.md`'s `## Invariants (both playbooks)` carries the
catalogue half; `skills/review/SKILL.md` §4's fix loop carries the acting half — the surface that
actually runs the loop when a re-review comes back clean with a finding left outside its fix list. Either half
losing the clause, or keeping it but making it conditional on `--unattended`, or keeping the "never a
fourth cycle" prohibition while dropping what the standing finding becomes, is the drift this pins:
without it a controller reading only the surface that runs the loop has no standing instruction to stop,
and a finding a clean verdict left behind is one a controller may read as still owed a cycle.

The `fix-loop-fixes-every-finding` contract (ADR 0098, INV-0094) pins one row per rule of the fix loop
that fixes every finding. `skills/review/SKILL.md` §4 carries the scope review's rows: the ask-once gate
fires on any finding, a Minor-only verdict included, and offers fix every finding, fix only Critical and
Important findings, or fix none; `--unattended` fixes every finding without asking; each cycle dispatches
one implementer with the complete list the chosen option covers, capped at 3 cycles in total with every
cycle counting; at the cap a remainder of only Minor findings takes the clean-verdict path with no
`unresolved add`, no `deferred add`, and no triage record, while a Critical or Important finding of any other kind than Missing RED, Pass-to-pass, and Missing fail-to-pass run (ADR 0125, ADR 0134), a broken
criterion, or a red suite keeps the `**Unresolved:**` entry; a declined fix splits the same way; the
RED-test rule is conditional; and an observation never joins the fix list (INV-0010).
`skills/review/SKILL.md` §4 also pins the exit run: the full suite runs once more when a re-review first
comes back clean or the cap leaves only Minor findings, so the stage never advances on focused runs alone.
The controller takes the cap's Minor-only clean-verdict path only once that exit run is green.
`skills/implement/SKILL.md`'s `## Invariants (both playbooks)` pins three rules. A Critical or Important
remainder at the cap blocks, except one whose only such findings are Missing RED, Pass-to-pass, or Missing fail-to-pass run,
which proceeds and is named in the final report (ADR 0125, ADR 0134). A Minor-only remainder proceeds. The RED-test rule is conditional.
`agents/implementer.md` carries the conditional RED-test rule, so the dispatch and the agent body agree.
`references/implement-full.md` step 3 carries the per-slice loop's rows:

- One fresh implementer fix per cycle for any finding outside the deferred ones, a Minor-only verdict
  included, carrying the complete fix list.
- Re-review capped at 3 cycles in total.
- A Critical or Important remainder at the cap blocks, except one whose only such findings are Missing RED,
  Pass-to-pass, or Missing fail-to-pass run (ADR 0125, ADR 0134). A Minor-only remainder proceeds and is written
  nowhere.
- The loop never asks the operator.
- The RED-test rule is conditional.
- A finding whose remedy adds a capability the slice's `spec` and the Definition of Done never named is
  not in the fix list. The controller records it as a deferred finding.
- The guard-rail carve-out: a test in an existing suite, a row in an existing drift contract table, or a
  prose fix making shipped text agree with a stated rule stays in the fix list.
- The dedup read: the controller reads `scope.js get deferred` first and skips a finding it already
  reports.
- Re-entry and resolution: a deferred finding re-enters the fix list only on a guard-rail remedy, leaves
  the reviewer's leave-out list, and is resolved once a re-review confirms the fix (`deferred-resolve`).
- The re-review hand-off: each re-review dispatch of `superdev:slice-reviewer` carries the findings
  `get deferred` reports, as untrusted quoted data, and tells the reviewer to leave them out of its list.
- The store-defines-none fallback: only the ledger bullet, with `no triage record — store defines none`.
- A deferred finding neither keeps the loop running nor counts toward the cap remainder.
- An observation never joins the fix list.

The selftest removes each row's own clause from the shipped documents and expects that row to
fail. Losing a row reopens its gap: a Minor-only verdict that skips the question, an unattended run that
leaves Minors, a cap that blocks on Minors, or a RED test demanded of a style fix.

The `run-trace-order` contract (ADR 0117, INV-0118) pins how the implementer and the slice review work
against the run trace. The agent bodies, the review checklist's `## Test order`, the `references/implement-full.md`
step 2 and step 3 dispatches, and `references/implement-lite.md`'s inline loop each carry the rule they
reach. The rows:

- `agents/implementer.md` states that its progress log carries no RED or GREEN line, that a note from the
  hook means a test edit has no failing run since, and the remedy: `git add`, `git restore --worktree --source=<base>`, a failing
  run, `git restore`, a passing run, never `git stash`.
- `agents/slice-reviewer.md` reads the slice's run-trace lines in its blind pass, names Missing RED as
  Important on a `behavior` slice only, raises no finding for a missing trace, an event-less slice, or a
  repository with no test command, and closes the finding on a re-review only on the revert, failing run,
  restore, passing run sequence.
- `references/review-checklist.md` defines Missing RED, so that implementation edits, then test edits, then
  only passing runs meets it, and states the closing sequence and the remedy.
- `references/implement-full.md` and `references/implement-lite.md` carry the same rules on the dispatch
  and inline surfaces, including the
  remedy sequence, so a playbook holding the old two-step form fails.
- `references/review-checklist.md`, `references/implement-full.md`, and `references/implement-lite.md` state
  Missing RED as a test edit followed by an implementation edit or a passing run with no failing run between
  them, and `agents/slice-reviewer.md` states it the same way. All five documents state that a `run … unknown`
  line is not a failing run, and every document stating the remedy names `<base>` as the commit the slice
  branch was cut from.
- `references/test-selection.md` states that the full, focused, and whole-repo commands run alone, after
  nothing but `cd` and `set -o pipefail`, and that trimmed output goes to a file outside the working tree. A run
  whose exit status does not reflect the test records `unknown`, and `scope.js suite reusable` never reuses it.
  `references/test-selection.md` also extends that background rule to `scope.js fail-to-pass`, which runs the test
  command up to twice. Each of `references/implement-full.md`, `references/implement-lite.md`,
  `references/run-handoff.md`, and `skills/review/SKILL.md` cites the rule at the call.

The same table pins the fail-to-pass run's readers (ADR 0134, INV-0138). The rows state each rule on every surface that
reaches it, because a dispatch is the later, more specific instruction and wins a conflict (CONTEXT.md **Dispatch prose**):

- `agents/final-reviewer.md`, `agents/slice-reviewer.md`, `references/review-checklist.md`'s `## Fail-to-pass run`,
  `references/implement-full.md`, and `references/implement-lite.md` state that a `fail-to-pass` trace line is no test
  run. That line satisfies no Missing RED step and moves no suite record.
- `references/review-checklist.md` defines **Pass-to-pass** and **Missing fail-to-pass run** as Important findings. A
  `pass-to-pass` finding closes only on a `fail-to-pass` line. That line covers the range from the original change's base
  to the tip current at the closing run. The finding stays closed once the verb writes that line. A trace-less run, a
  slice with no `edit` line, and a repository with no test command draw no finding. A fix cycle whose commits change only
  test-path files draws none either. Only `edit` lines count as change events of a slice or a cycle. A `run` or `ledger`
  line is none, even one written after the trace began for a slice whose edits came earlier. Rows pin that rule in
  `agents/final-reviewer.md`, `agents/slice-reviewer.md`, `references/review-checklist.md`,
  `references/implement-full.md`, and `skills/review/SKILL.md`.
- `agents/final-reviewer.md` raises both findings on the lite tier for every `behavior` slice. It reads a slice with no
  recorded range from its own `edit test` and `edit impl` lines. `agents/slice-reviewer.md` raises them on the full tier
  over each range its dispatch names, each range with both ends full commits.
- `references/implement-full.md` runs the verb from the slicetree before it dispatches `slice-reviewer` and after each fix
  cycle. It also records a `behavior` slice's range as full commits. `references/implement-lite.md` records the range and
  runs the verb before the `merged` write, while the slice is still in progress.
- `skills/review/SKILL.md` and `references/run-handoff.md` run the verb around each scope fix cycle whose commits change a
  test-path file and another file. `agents/final-reviewer.md` reads run handoff's cycles and earlier review cycles from
  the trace at every dispatch.
- `agents/final-reviewer.md`, `references/review-checklist.md`, and `skills/review/SKILL.md` bound a fix cycle's window
  and name its commits. The trace attributes the cycle's `implementer` `dispatch` line to `scope`, its name for a
  dispatch that belongs to no slice. The window runs from that line to the first `dispatch` line after the implementer's
  `dispatch-end` line. That `dispatch` line closes the window whatever agent type or slice it names. With no such line,
  the window runs to the end of the trace. A denied, failed, or interrupted implementer dispatch has no `dispatch-end`
  line, and its window ends at the first `dispatch` line after the implementer's own. `final-reviewer` reads a cycle's
  commits along the scope branch's first-parent chain. A cycle's commits exclude the base commits a merge brings in, and
  they exclude the merge commit itself. The review controller reads a run handoff cycle's range along the same
  first-parent chain.
- `references/implement-full.md` and `skills/review/SKILL.md` count a cycle that a controller's own fail-to-pass run
  answers, each by its own rule. The controller answers a Missing fail-to-pass run finding by running the verb itself.
  Where no implementer fix is dispatched before the re-review after the answer, `references/implement-full.md` counts the
  answer and that re-review as one of the 3 cycles. A fix dispatched before that re-review joins the answer and the
  re-review in one cycle. In `skills/review/SKILL.md`, the same two rules hold for a run that prints `pass-to-pass`. A
  review run that prints another outcome counts toward no cap. A loop of counted answers reaches the cap, and a cycle
  that holds an answer and a fix counts once (ADR 0134).
- At the 3-cycle fix cap, a remainder of only Missing RED, Pass-to-pass, and Missing fail-to-pass run proceeds and the
  report names each. Any of them beside a finding of another kind blocks. Rows pin the sentence in
  `references/implement-full.md`, `skills/implement/SKILL.md`, `skills/review/SKILL.md` (the fix loop, the unattended cap rule,
  and the §3 Assessment exception), `agents/final-reviewer.md`, `agents/slice-reviewer.md`,
  `references/review-checklist.md`, and `references/run-handoff.md`'s Report bullet.
- An `unknown` outcome draws no finding and starts no fix cycle. Each reviewer and the review report name it with its slice
  and reason, and the output templates carry a **Fail-to-pass unknown** line. `references/scope-mode.md`, the two
  playbooks, and the verb's own stderr note make the scope run's first `unknown` an observation, and a later one writes none.

The `setup-test-paths` contract (ADR 0117) pins `skills/setup/SKILL.md`. Its rows:

- Decision E proposes the repository's test paths and writes them as the unfenced `## Test paths` list,
  never a fenced block, and proposes none for a repository with no test command.
- `setup check` names a `verification.md` with test commands and no `## Test paths` section as an
  advisory that names the default patterns, never as drift.

The selftest removes each row's own clause from the shipped skill and expects that row to fail.

The `blind-slice-review` contract (ADR 0114, INV-0113, INV-0114) pins how the full tier's slice review
reads the progress log. `agents/slice-reviewer.md` and the slice-reviewer dispatch in
`references/implement-full.md` step 3 each carry the rule, because the dispatch is the later, more
specific instruction (ADR 0035). The rows:

- `agents/slice-reviewer.md` settles the verdict in a blind pass over the specification, the acceptance
  criteria, and the diff, before it opens the progress log.
- `agents/slice-reviewer.md` reads the log one way: it never withdraws a finding and never downgrades one.
- `agents/slice-reviewer.md` names the progress-log path on its input list and states that the dispatch
  carries no text from an implementer's report.
- Step 3's dispatch hands no text from an implementer's report, a controller paraphrase of one included.
- Step 3's dispatch states the blind pass before the log is opened.
- Step 3's dispatch states the one-way rule.
- Step 3's fix list carries every finding added or raised after reading the log and every earlier finding
  a re-review reports still open.
- `agents/slice-reviewer.md` closes an earlier Unverified dependency finding on a re-review when its own
  dependency check now passes, because the remedy lives in the log and not in the diff. Step 3's dispatch
  states the same carve-out.
- `agents/slice-reviewer.md` counts only a log line that records the package as verified, never a line
  marking it unverified, whatever URL that line carries. No dispatch can contradict this row: step 3's
  dispatch hands the reviewer no log text and states no counting rule, so the agent body is the only
  prompt that states it.
- `agents/slice-reviewer.md` appends its findings to the log through a quoted heredoc, never `echo` and
  never an unquoted heredoc, so backticks and `$(` in the text stay literal.

The selftest removes each row's own clause from the shipped documents and expects that row to
fail. Losing a row reopens its gap: a reviewer that reads the implementer's account before it forms a
verdict, a log line that withdraws a finding, a fix list that drops what the log added, a dependency
finding no re-review can close, or an unverified line that passes the check.

The `plan-derives-criteria` contract (ADR 0099, INV-0096) pins the derive pass on both halves.
`skills/plan/SKILL.md` §1 carries these rows:

- It dispatches `superdev:final-reviewer` in derive mode with an explicit `model`.
- It hands over the settled problem statement and solution shape as text, and the drafted Definition of
  Done by path, never inlined.
- It keeps the draft in `.superdev/dod-draft-<slug>.md`, keyed by the feature slug and outside every run
  root, so the pass creates no run root before the cut.
- It drafts an append from the epic's Definition of Done loaded in §0.
- It deletes the draft in §6 once the Definition of Done is in the store. It also deletes the draft
  written under the old slug when the label is revised before §6.
- It runs for every plan: a new feature, a single-slice plan, and an append.
- It settles each gap itself against the repository, with a one-line reason, and states the whole
  settlement as one proposal the operator confirms before slicing (ADR 0122).
- A gap becomes a criterion, a fold into an existing criterion, an epic non-goal,
  or, on a single-slice plan, a spec exclusion.
- No plan reaches §3 with a gap unsettled.
- A pass with no gaps is reported in one line.
- A denied dispatch derives inline.

`agents/final-reviewer.md` carries the `## Derive mode` section. It returns the uncovered derived
criteria with a reason and a lean, and states the derived list before it opens the DoD path. It writes no
`### Issues`, `### Criteria`, `### Ceiling`, or `### Assessment` section. Its `description` names the plan
dispatch. The selftest removes each row's own clause and expects that row to fail.
Losing a plan row ships a feature short of its intent; losing a reviewer row leaves the dispatch asking
for a mode the agent body does not promise.

The `observation-capture` contract (ADR 0088, INV-0010): `references/scope-mode.md`'s own
`## Observations` section states what an observation is — a real defect a run meets that no slice covers
and the scope did not cause — that its triage record is written the moment it is met, never at a handoff;
that the record is the only artifact, no ledger line and no pull-request body; that an observation is
recorded, never judged, carrying no severity, no stage, and no fix loop; that capture reads the store's
open triage records before it writes, comparing each against what was just met — a judgment about two
prose descriptions of a defect, never a string match, stated where the reader applies it rather than as a
mechanic alone; that an uncertain match writes the record, because the two errors are not symmetrical — a
duplicate is noise a human deletes, a false match silently drops the observation this rule exists to
preserve, the same asymmetry triage record #505 argues against `/superdev:review`'s own run-scoped
deferral read; that a store document defining no `## Triage record` section is reported to the operator
and dropped, not recorded — that section is what names the create call, so none means no artifact at all,
which is the one case in the section where an observation reaches no record; and that capture is
otherwise best-effort, the same posture every other store write in the chain takes, with a failed or
denied open-records read and a failed or denied create each reported once — the first still writing the
record as the possible duplicate the asymmetry favors. Every row pins that section's own statement of the
rule; where a controller is reminded of it is the `observation-capture-reminders` check below. The last
row pins `references/implement-lite.md`'s own capture clause directly, because the tier it governs
dispatches no subagent by design (ADR 0001) and so is no subject of that derived check — it is exactly
the tier where the controller meets a defect itself rather than reading a report, and a growing-set
scanner that skips it would leave that clause enforced by nothing.

The `observation-capture-reminders` check (`scanObservationCaptureReminders`, ADR 0088, INV-0010,
ADR 0064): every shipped document that dispatches a `superdev:` subagent names the observation-capture
rule. A controller standing at a dispatch reads a subagent's report, which is exactly where an
observation is met, so a dispatching document that carries no reminder leaves that controller with no
standing instruction at the one hop it needs one — and it reads correct in isolation, the one-sided-pin
shape the root `AGENTS.md`'s prompt-architecture rules name. The subject set is derived, never
enumerated: a `superdev:<name>` mention whose `<name>` is a file under `agents/`, with the leading slash
of a `/superdev:<command>` reference ruling that one out. A row per call site would be a count of a
growing set (ADR 0064), and the next document to gain a dispatch would be silently unpinned.
`references/scope-mode.md` dispatches nobody, so it is no subject here; the `observation-capture`
contract above pins its statement instead — and that contract's last row pins
`references/implement-lite.md` by name, since the derived check cannot reach a tier that dispatches
nobody either.

The `response-shapes` contract (ADR 0113, INV-0111, INV-0112): `references/response-shapes.md` defines
each Response shape once, and a covered skill cites the definition and restates none of it. Rows pin
the reference's own definitions: the Next block's parts (a `### Next` heading, the next command in a
fenced code block, one line on what it does, nothing after it), its variants (`Blocked: <reason>`
and `First: <action>` before the fence, and the one line a command with no successor writes), where it
applies (every exit, an unattended run, the chained posture, an `AskUserQuestion` turn), and the
brainstorm report's opening line and sections. `skills/brainstorm/SKILL.md` has rows for its
citation of the block's rule and of the report shape. Each other covered skill (`plan`, `implement`,
`review`, `document`, `submit-pr`, `ship`, `verify-ship`, `wrap-up`) has a row for its single citation of
the block's rule near its top. `review` and `document`, the covered commands that run as `/superdev:sweep` legs under `--chained`, carry a second row for
the sentence that a run under `--chained` prints no block, and `implement` carries one for the clause that
extends the rule to the next command run handoff prints. `review`, `document`, and
`references/run-handoff.md` each carry a row pinning the order of their close: the note that the
conversation is disposable comes first and the printed command comes last, so the Next block closes the
message. A skill that loses its citation leaves the shape defined and
unused, and its last message goes back to wherever the agent puts its next command. The selftest cuts
the span each row matches out of the shipped document and requires that row's gap, so every row
is proved to fire.

The `label-revision-at-decomposition` contract pins rows on `skills/plan/SKILL.md`: §1 states, where it
picks the feature label, that a later answer that changes what the feature does revises the label in
place; §3 restates the same clause at the decomposition step, where cutting slices is what most often
shows a `fix` adding behaviour or a `refactor` changing it. A controller who only reaches §3 with a
changed answer has no standing instruction there without the second row.

The `unmet-criterion-at-review` contract pins `skills/review/SKILL.md` §4's own rule for an unmet
criterion: it enters the fix loop like any other finding, except the verification-ceiling case, which is
reported and not chased because no work on this branch can close it. Review is the only gate an unmet
criterion meets — `skills/submit-pr/SKILL.md` carries no row here any more: ADR 0091 moved the gate to
review, so an unticked criterion reaches submit-pr already noted, and submit-pr's own read of a
`ceiling:` line is `ship-ticks-nothing`'s concern instead.

The `release-answer-not-inferred` contract pins rows: `references/plan-contract.md`'s own `## Release`
section credits the release answer to a human (ADR 0034); `skills/plan/SKILL.md` §6 restates that the
answer is the user's alone and closes the gap ADR 0034 leaves open on its own — an authorization to run
the whole chain unattended answers a different question (whether an unattended run may proceed once
released) and is never itself the release answer. This pins the exact confusion observed: a controller
holding a standing authorization to run unattended, read as the release question's own answer.

The `capture-checks-concurrent-plans` contract pins a row on `skills/plan/SKILL.md` §2: a capture
allocating a shared identifier — an invariant id, an ADR number, a glossary term — is checked against the
other run roots under `.superdev/scopes/*/` whose ledger stage reads `planned` or later, and the captures
already committed on their scope branches, before it is written. This clause restates nothing — no
earlier surface stated it before this row — so it is pinned on its own presence alone, the way every
other row here is pinned against a source it copies. Losing it reopens the collision this clause was
written to close: two plan runs allocating the same identifier the same afternoon, each on its own
unmerged branch, found only because the two operators compared notes by hand.

The `decomposition-names-what-it-checked` contract pins a row on `skills/plan/SKILL.md` §5: before the
decomposition is presented, state, for each file opened while grounding it, what it says about the
proposal itself — never what it said about the question it was opened for. The demanding form names
every file opened, not a self-selected subset the controller calls "checked": a controller who checked
nothing could truthfully answer "none" to the weaker form and satisfy it, exactly the reporting-form gap
the root `AGENTS.md`'s *Completion criteria demand* rule closes. This clause restates nothing — no
earlier surface named the check before this row — so it is pinned on its own presence alone, the same
convention `capture-checks-concurrent-plans` uses. Losing it reopens the six observed instances it
exists to close: a proposal formed against a rule a file already open contradicted, in every case caught
by a reader — a peer session, a reviewer, an operator — rather than named by the controller that formed
the proposal.

The `code-management-merge` contract (#683) is a presence table: each of the two code-management seeds
(`references/code-management-forgejo.md`, `references/code-management-github.md`) and this repo's own
`docs/agents/code-management.md` carries a `## Merge` section reading the pull request's state, head sha,
merged sha, and mergeability (GitHub's own answer for `mergeable` is asynchronous, so its row also pins
treating a `null` as unknown after a bounded re-read, never as mergeable), then merging it squashed and
pinned to that one head sha (Forgejo's `head_commit_id`, GitHub's `--match-head-commit`/`sha`), and
naming what a 405 (not mergeable) or 409 (head moved, or a conflict) refusal means (ADR 0096, INV-0092).
The `code-management-no-force` contract is its absence half: none of the same three documents may ever
invoke `force_merge: true` (Forgejo) or `--admin` (GitHub's `gh pr merge`) — either bypasses branch
protection and required approvals, which a pinned merge must never do. A `never` sitting right next to
the match — the seed's own caution naming the option to forbid it — is excluded, the same shape
`no-base-branch-commit`'s own negation handles.

The `forgejo-tea-only` check, `scanTeaOnly()` (ADR 0111, #794): none of the Forgejo slice-store and
code-host seeds (`references/issue-tracker-forgejo.md`, `references/code-management-forgejo.md`) or this
repository's `docs/agents/issue-tracker.md`, `docs/agents/code-management.md`, and
`docs/agents/knowledge-base.md` may name `GITEA_TOKEN` or `FORGEJO_TOKEN`, carry an `Authorization:`
header, or invoke `curl`. The documents state the prohibition in prose ("a raw HTTP call (curl)", "never
fall back to a token"), so the patterns match the shape of a use, not the words: a token env var's name,
the header's `Authorization:` with its colon, and `curl` as a command or followed by a flag, a URL, a
quote, or a `$`. Fenced blocks are scanned too, because a curl example lives in one. Its ceiling is those
three shapes: a token in another variable name, a header built from `Bearer` text alone, another HTTP
client, or a `curl` followed by a bare word walks past silently. The `simplicity:` note beside
`TEA_ONLY_MARKERS` in `drift/contracts.js` states it.

The `code-management-head-branch-lookup` contract (#685, INV-0092) is a second presence table over the
same three documents: each `## Merge` section also carries a find-open-pull-requests-by-head-branch call
(Forgejo/Codeberg's `tea pr list --state open` filtered client-side by `head`, since neither carries a
native head filter; GitHub's `gh pr list --head <branch> --state open` or the equivalent `head=`-filtered
REST call), scoped to open pull requests only. `/superdev:ship` reads the pull request `/superdev:submit-pr`
recorded in the ledger by number, and falls back to this lookup only for a ledger predating that header —
scoping the fallback to open pull requests is what keeps a reused branch name
(`references/scope-mode.md`'s `## Cutting the scope branch`) from ever surfacing an old, merged pull
request under the same head as this run's own. The two Forgejo/Codeberg rows also pin a paging clause:
Forgejo's `--state open` list paginates (`--page`/`--limit`), so the two Forgejo-facing documents
(`references/code-management-forgejo.md`, `docs/agents/code-management.md`) must page through every page
before counting matches, or a match sitting on a later page reads as zero. GitHub's `head=` filter is
server-side, so `references/code-management-github.md` carries no matching clause.

The `code-management-pr-body-edit` contract (ADR 0121) is a presence table over the same three
documents. Each carries an `## Edit the pull request body` section: it reads the pull request, edits only an
open one (Forgejo/Codeberg also tests `merged`), and sends the new body from a file, never from a pipe. A run
that resolves a deferred finding after `/superdev:submit-pr` opened the pull request uses it to rebuild the
`## Deferred to a plan` section.

The `ship-tested-push` contract (final-reviewer triage, INV-0087, #687 fix cycle): `skills/ship/SKILL.md`
§4 compares the scope branch's own tip against the pull request's `head.sha`, whether or not base itself
moved — a review's own fix loop, or an operator's own conflict resolution, can land commits at stage
`submitted` with no base merge involved, and those reach the pull request only through this same push.
The push-gate row pins that a difference gates the push on `suite reusable` accepting the tip and
refuses (never pushing an untested one) when it does not. The consent-print row pins that ship prints
the range the push is about to add (`git log <head>..<tip> --oneline`) before sending it. Calling ship
stays the consent that covers what is actually merged. The comparison row pins the core comparison
itself: the tip against `head.sha` whether or not base moved, since a fix loop or a conflict resolution
that never touched base still has to reach the pull request. Losing any of these reopens the recovery
loop the fix cycle closed: a commit that landed after submit-pr, and that a reusable green suite record covers, never reaches the PR head and the
pinned merge refuses forever.
Two more rows close what the push alone cannot. The rejected-push row pins a rejected push: someone can
push to the pull request from elsewhere (applying a suggestion on the host, say) after §3's own read,
so this checkout's own push lands non-fast-forward. Ship refuses instead of guessing past it: it names
the commits the pull request's head carries that the scope branch lacks, merges nothing, and points at
fetching them into the scope branch and re-running `/superdev:review <scope>`. That step tests and records
the new tip, then `/superdev:ship <scope>` runs again. The equality-check row pins the check the pinned merge
rests on: the freshest `head.sha` (the re-read after a push, or §3's own read when none ran) must equal
the local scope-branch tip `suite reusable` accepted, or ship refuses, naming both shas, and merges
nothing. The push rejection above catches most of the ways the two could still differ; this check is
what catches the rest, and is the row that actually guarantees the merge lands the commit the reusable record covers rather
than the push rule alone.
The other-rejection row pins that any push rejection other than non-fast-forward — authentication, a pre-receive hook, the network — relays git's own error and merges nothing, surfacing the actual failure instead of falling through to a stale equality check. The re-read row pins that after an accepted push, ship re-reads the pull request until its `head.sha` equals the pushed tip, at most 3 times with a short pause (the bound `code-management-github.md` uses for a `null` `mergeable`), before the equality check fires, ensuring the check compares against fresh data.
The `ship-merge-pin-local-tip` contract (final-reviewer triage, #687 fix cycle): the sha the pinned merge
sends is never read off the host. `skills/ship/SKILL.md` states it plainly — the merge call pins the
local scope-branch tip `suite reusable` just accepted — and each code-management document's own `## Merge`
section restates it for its own placeholder, `<tested-tip-sha>`, naming the pull request's `head.sha` as
read only to decide whether to push and to refuse a stale one, never as the merge's own pin. Losing this
row lets a stale or foreign `head.sha` slip back in as the pin, the exact gap the two `ship-tested-push`
rows above exist to close.
The `ship-legacy-shipped` contract (final-reviewer triage, #687 fix cycle): a `shipped` ledger reads two
different things depending on whether it carries the ledger's own `**PR:**` header. The header-present
row reads it as finished by this version and truly done — ship reports "already shipped" and stops,
merging and refusing nothing, whether or not the scope checkout is present (ADR 0106). A further row pins that this report recreates
no absent scope checkout: §2 recreates one at `submitted` only, and §3 recreates it at `shipped` once it finds an unfinished `auto` deploy to resume. A posture-first row pins that §3 reads the posture from the invoking checkout before any scope checkout is recreated, and recreates it only when the posture is `auto` and a target is undeployed, so a `manual` scope waiting for verify-ship never rebuilds a checkout. The header-absent row reads it as a legacy ledger a version before
ADR 0096 wrote the moment it opened the pull request, never once it merged, and `skills/ship/SKILL.md`
still treats it like `submitted`: it reads the pull request from the host. The none-found row pins that
its own **None found** case skips the `pr set <n>` recovery instruction that case gives a `submitted` run
with no findable pull request — a legacy run finding none already shipped under the old meaning, so it
reports nothing left to merge instead. The scope-mode row is `references/scope-mode.md`'s own
`## The stage never moves backwards` section stating the same split: the header, not `shipped` alone, is
what actually stops a second merge. The record-immediately row closes the gap that otherwise reopens the
split every time: the head-branch fallback's own **Exactly one** case records that pull request with
`scope.js pr set <n>` right away, rather than merging and leaving the ledger to read as a legacy run again
the next time `/superdev:ship` runs on it. Losing any one row lets a legacy run either
merge a second time undetected, get told to run `pr set` busywork it does not need, or keep reading as
legacy forever despite carrying a `**PR:**` header no earlier command wrote for it.
The `ship-deploy` contract (ADR 0101, INV-0098, INV-0099, #720): `skills/ship/SKILL.md` applies the
repository's deploy posture to the anchor's deploy targets after the merge, closing no anchor (ADR 0106), and routes to
`/superdev:verify-ship <scope>`, or `/superdev:wrap-up <scope>` when nothing is left to verify (ADR 0116). The
`ship-offer` contract below pins what ship does with that route. Two rows pin the pre-merge gate (§3): a listed target the targets table lacks
refuses, naming it, before anything merges; a pull-request diff touching `docs/agents/deployment.md`
prints the changed posture and target lines there too, so calling ship stays the consent to exactly the
commands it runs. Four rows pin §5's deploy step by posture: `none` (or an absent `**Deploy:**` line)
deploys nothing and says so; `manual` prints each command not already recorded `deployed` and records each
`pending`, then hands off — the same already-`deployed` guard `auto` has, so a posture switched to `manual`
mid-resume never downgrades a deployed target back to `pending`; `auto` fetches base and detaches the
scopetree at the merge commit rather than touching the invoking checkout; a non-zero exit records `failed`
with its exit status, names every target not yet deployed, and prints the resume command — and the
hand-off comes only once every listed target reads `deployed`; the rows pinning that hand-off cover: its citation of
`references/scope-mode.md`'s `## Routing a shipped run` (INV-0116), `/superdev:wrap-up <scope>` when that
rule routes to wrap-up with the hand-sync under `First:` for an unpaired line, `/superdev:verify-ship <scope>`
when it routes to verify-ship, and `/superdev:verify-ship <scope>` again when the anchor cannot be read
(ADR 0116). Three rows pin the resume path: an unfinished `auto` deploy — a
`shipped` ledger with a `**PR:**` header whose posture at the merge commit is `auto` and whose deploy
record leaves a listed target not recorded `deployed` (an absent record included: a session can end between
ship's stage write and its first deploy record), the scope checkout's presence no part of the test — joins ship's own empty-argument candidate set, that same shape skips straight to §5 rather than
merging again, and the `auto` loop itself resumes at the first target not already recorded `deployed`
instead of restarting the list. One row pins that §5 reads the posture and the deploy line fresh — at the
merge commit just found, by the literal `git show <merge-commit-sha>:docs/agents/deployment.md` read,
never the working tree or the invoking checkout — for ship's own merge, an adopted hand merge, or a
resumed run alike, never reused from an earlier pre-merge read (whole-scope review, ship-deploys fix cycle
1: §5 used to reuse §3's own pre-merge read for ship's own merge, which deployed the posture and commands
a base merge had already changed instead of what the merged commit records). One row pins that §5 reads
the merge commit, and refuses on its own failure, before the `stage set shipped` write, so a refusal there
leaves the stage where it was instead of stranding it at `shipped` with an absent deploy record. The last
row pins INV-0098's own statement at the deploy step: only ship runs a target's command, only under
`auto`, only after the
merge, only at the merge commit. Three more rows pin the same fix cycle's other half — the pre-merge
refusal and consent, re-run: §4 captures the scope branch's tip before merging base, as
`<pre-merge-tip>`; once that merge moves the tip, §4 re-runs §3's own gate at the new tip, refusing a
now-untabled target and printing the changed posture/target lines — sourced from base's own document —
before the pinned merge runs, the same consent §3 already asked, now against what the merge actually
carries; §3's own gate points at that re-run, so its prior claim that its own pre-merge read is what the
pinned squash lands no longer stands unqualified. A last row pins that `auto` runs each target's command
in the foreground, relaying its output to the operator as it runs. Rows pin the consent gap the host
merge leaves (ADR 0104, INV-0104, #749): under `auto`, before any target runs, §5 diffs the merge commit's
`docs/agents/deployment.md` against the tested head's, a document on one side only counting as a
difference, and a diff that fails to run at all — an unfetched `<tested-head>` among the reasons — counting
as one too, since the comparison not running is not the same fact as nothing changed; an adopted hand merge
or a resumed deploy, which ran no pre-merge gate, also takes the pull request's own change to the document,
diffed from the fork point — `git -C <run-root>/scopetree merge-base <tested-head> <merge-commit-sha>` —
rather than the merge
commit's lone parent, since a rebase or fast-forward hand merge can carry an earlier commit's own change to
the document that a lone-parent diff would miss, found as its own step so that its non-zero exit or empty
output counts as a difference instead of turning the diff into one against the working tree; either diff non-empty prints the changed posture and
target lines, or the diff itself when neither changed, and asks once; a decline deploys nothing, records
`pending` for every target the deploy record lacks so the run stays resumable, and prints the resume; both diffs empty ask nothing; and ship's opening paragraph
names this as the one exception to its no-second-question rule.
Losing any one row lets that one fact
drift silently — a target ship never validates before merging, a deploy step that hands off before `auto`
finishes, a resumed run that starts the list over instead of picking up where a failed target left it, a
resume that reads a working tree instead of the merge commit, a `stage set shipped` write that lands
before a refusal has a chance to stop it, a base merge that changes `deployment.md` without §4 or §5
ever noticing, an `auto` deploy running commands from a document nobody was shown, a diff failure read as
silence instead of a difference, or a rebase/fast-forward hand merge's own earlier change to the document
missed by a lone-parent diff.
The `deploy-runner-exclusivity` check, `scanDeployRunnerExclusivity()`: no skill or agent but
`skills/ship/SKILL.md` may name a deploy target's command as something it runs (INV-0098). It walks every
`skills/`, `agents/`, and `references/` document but `skills/ship/SKILL.md` itself and
`references/deployment.md` — the seed states the rule ("Only `/superdev:ship` ever runs a target's
command…") without claiming to run one, so it is exempt the way a caution naming the forbidden thing
always is — masks fenced examples first, and flags the shape a claim to run one would take: "run(s) …
target's … command" within a short span. Its ceiling is that shape: a claim phrased without those three
words in that order passes silently, same as every other shape-based absence check in this file. A denial
passes: "runs no deploy target's command" and "never runs a target's command" claim no run, which is how
`skills/verify-ship/SKILL.md` states it observes and deploys nothing (ADR 0106). The denial admission is
global, not scoped to verify-ship, because a denial claims no run in any document. The selftest pins both
halves: a denial in a document other than verify-ship passes, and a non-denial in verify-ship fails.
The `document-submitted-handoff` contract (final-reviewer triage, Minor 5): `skills/document/SKILL.md`
§8's stage write only knew `shipped` as a leave-alone stage, so a `submitted` scope — one review already
handed to ship — fell into the "anything else" branch and got a `documented-unreviewed` write `scope.js`
refuses as a backward move. One row pins that `submitted` joins `shipped` in the leave-alone branch. The
other pins that the next-command bullet prints `/superdev:ship <scope>` for a `submitted` scope rather
than `/superdev:submit-pr`, which would try to re-open a pull request already open. Losing either row
reopens the stage-write refusal a doc pass on a submitted scope hits today.
Further rows pin that a `shipped` scope picks its command by `references/scope-mode.md`'s
`## Routing a shipped run` (INV-0116), printing repair, verify-ship, or wrap-up as it routes and verify-ship when the
anchor cannot be read, and a `closed` one prints nothing, that `README.md` states ship merges, deploys, and offers once to start the next command, with verify-ship and wrap-up after it, and
that `README.md` names `closed`, never `shipped`, as the stage `scope-prune` reaps. One row pins the `README.md`
worked example: it goes from ship straight to wrap-up, nothing being left to verify (ADR 0116).
The `ship-offer` contract (ADR 0132, INV-0093, INV-0111, INV-0123): `skills/ship/SKILL.md`'s `**Offer to continue**`
asks the operator once whether to start the routed skill, before it prints the next command. It asks only when the
merge landed, every listed deploy target is recorded `deployed` or none is listed, and the route is verify-ship,
wrap-up with no hand-sync pending, or an unreadable anchor. It makes no offer for a repair or re-verify route, a
pending hand-sync, a refused ship, or a failed or declined deploy. The offer message names the staged pages with the
publish-kb alternative and ends on its question, so it carries no Next block. A clear yes starts the routed skill
through the Skill tool, one skill per call, and adds `--from-ship` to the verify-ship call. Any other answer prints
the command and starts nothing. After a started verify-ship returns, ship applies the routing rule again and starts
wrap-up with no second ask exactly when it routes there with no hand-sync pending. On any other outcome it starts no
wrap-up: it adds nothing when verify-ship ended on its Next block, and when a `--from-ship` verify-ship printed no
block, it prints the route's command as the Next block with the staged pages and the publish-kb alternative. A
started skill keeps every gate
and every ask, and a refused, failed, or missing start prints the command as the Next block, with the staged pages
and the publish-kb alternative, and stops. Only the last message of the
chain carries the Next block. The neighbouring rows pin the sentences that the offer depends on: verify-ship's
statement that a typed run starts no wrap-up, its `--from-ship` argument and the exit that prints no block under it,
its and wrap-up's statement that every gate and ask holds on every start, and `references/response-shapes.md`'s
statement that a chain started by ship's offer ends on the block once, with its sentence naming the `--from-ship`
verify-ship exit that prints no block by its condition, every line settled and none unpaired. Each row anchors on one sentence, so removing a
clause from one skill fails its own row.

## Work Guidance

- Scripts are CommonJS, like the hooks. `hooks/scope-prune.js` and `hooks/slicetree-sweep.js` both
  `require` `scope.js`, so `scope.js` must stay `require`-able under plain `node`. These are the only
  two dependencies `hooks/` has on `scripts/`.
  `scope.js` in turn `require`s `kb-patch.js` for `maskFencedLines`, so `kb-patch.js` must stay
  `require`-able under plain `node` too. `publish-kb.js` `require`s both `scope.js` and `kb-patch.js`,
  and `profile.js` `require`s `scope.js`. `adopt`'s
  payload boundary is a pair of markers, not a heading, but a marker can still be shown inside a fenced
  illustrative example, so the marker scan needs the same fence-masking `kb-patch.js`'s
  `extractSection()` already owns.
- The shipped scripts each have a suite in `tests/`, same convention as the hooks (ADR 0059).
  `drift-check.js` is maintainer-only and keeps its inline `--selftest`. `invariant-check.js` is
  maintainer-only too, and has its suite in `tests/` like a shipped script, because it takes no part in
  drift-check's registry. `run-tests.js` follows the same rule, with `tests/run-tests.test.js`.
- A **shape-based prose guard that asserts an absence states its ceiling beside itself.** A pattern over
  English catches the phrasings it names and not every paraphrase, and on an absence check — the document
  must *not* say X — a missed paraphrase is a **silent pass**: the check reads the reworded instruction as
  gone and stays green while it is still there. Write the ceiling down next to the patterns for one of
  these — a `simplicity:` comment naming it is the house idiom — or every reviewer who finds one more
  evadable phrasing reports a defect, and the guard grows by discovery instead of by decision. The
  convention governs these checks of this shape, and each carries its note: `doc-steps-no-suite`,
  `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, `return-to-controller`,
  `conflict-conclusion-no-commit`, `agent-tool-agnostic`, `agent-lens-list`, `code-management-no-force`, `forgejo-tea-only`, and `body-edit-contract`.
  `no-second-reader`'s reads differently
  from the rest on purpose: its gap is closed by an orphan test in `tests/scope-prune.test.js`
  rather than left open, and the note says so instead of claiming a ceiling it does not have. A **presence table** — the document must say X, one row per
  `[document, pattern, expectation]` — needs no such note: a paraphrase it doesn't recognize fails
  *loudly*, the row goes red until the pattern catches up, so the presence tables in `drift/contracts.js`
  (`FIX_BOUNDARY_CONTRACTS` among them) carry none.
- A new drift-check contract is one entry registered in the `drift/checks.js` registry, wherever it
  belongs (ADR 0061), plus its section in the narrative above, keyed on the check's own `id`, and its
  selftest in the matching `drift/selftest/*.test.js` suite. The `narrative-coverage` check enforces the
  middle piece by itself: the new id must appear backticked somewhere in this file. It does not enforce
  the selftest, or that the write-up is accurate or files the check under the right kind. Those stay a
  review's job.

## Verification

`bun run test` (repo root) runs `run-tests.js`, which runs each suite under `tests/`, then `invariant-check.js`
against this repository's register, then `drift-check.js`'s own `--selftest`, all under `node`, which
matches the production runtime. `node scripts/run-tests.js --related <path>...` is the focused run.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
