# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`.
The shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js`
(the knowledge-base section merge, ADR 0027), and `publish-kb.js` (the backend-independent half of publishing a scope's staged
knowledge-base pages, ADR 0069). The maintainer-only ones live here in `scripts/`: `drift-check.js`
(the cross-document contract checks) and `invariant-check.js` (the invariant register validator,
ADR 0093). This doc owns them all regardless of which dir each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack, the working rules, and the release flow.

## Local Contracts

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the ledger's schema and is the only `ledger.md` read and write path in the chain:
`init`, `stage set`, `slice`, `degraded add|add-denial|reset-denials`, `unresolved add|clear`,
`deferred add`,
`docs set <value>|clear`, `pr set <n>|clear`, `suite set <green|red|denied|none> <sha>`,
`suite reusable --branch <b> [--plan-files]`,
`get stage|branch|anchor|slices|unresolved|degraded|deferred|denials|docs|pr|suite`,
`status` (which renders the whole `/superdev:status` report), `publish`, `adopt`, `root <slug>`, and
`dod-line`.
`suite set` writes the **suite record** (CONTEXT.md) — the last full-suite run's result and the commit
it ran on, as `**Suite:** <result> @ <sha>` — refusing a sha that does not resolve to a commit in the
repository; `get suite` prints `<result> <sha>` back, or nothing on a ledger with no record (INV-0017).
`suite reusable` is the path-scoped half of that same reuse rule: it exits 0 (printing `reusable`) when
the record is `green` and `<branch>`'s tip either matches the recorded commit exactly or differs from it
only in paths under `docs/plans/<branch>/` (`git diff --no-renames --name-only`, so a file renamed into
that directory still counts at its pre-rename path), and refuses (exit 1) otherwise. `--plan-files`
declares that this run's backend commits plan files on the scope branch; `scope.js` derives the
directory itself from the ledger's own `**Branch:**` value rather than trusting a caller-supplied path,
so a caller can never declare an unrelated directory (a sibling scope's own plan dir, or a parent like
`docs/`) harmless — a caller passes no `--plan-files` when its backend commits nothing on the scope
branch, which reduces the check to the exact-tip match.
`degraded
add-denial` prefixes its bullet `denied: `, which is what separates a denied verification dispatch from
the other degraded shape sharing that line, and `get denials` counts those prefixed bullets — the number
an unattended run caps at two (ADR 0041). `degraded reset-denials` appends a bullet prefixed
`denials reset: `, and the count runs from the last such marker, so a human who addressed the cause
returns the whole budget while every recorded denial stays on the line (ADR 0044). Both prefixes are
structural, so plain `degraded add` refuses a text beginning with either and names the subcommand that
owns it. `get degraded` prints every bullet whatever its prefix, prefixes intact.
`unresolved add -`, `deferred add -`, `degraded add -`, `degraded add-denial -`, and `degraded
reset-denials -` — the sole word `-` past the subcommand — read the
bullet text from stdin, one trailing newline stripped, instead of a shell-interpolated argument
(`references/dod-ticks.md`, triage #680); a classifier's own refusal (`add-denial`) or an operator's own
reason (`reset-denials`) can carry a quote just as easily as any other bullet text. Any other shape of
these subcommands' own arguments keeps joining its
positional words with spaces as it always has.
It also exports `readLedgerHeader` as a module
API. This per-header ledger-line reader is what `hooks/scope-prune.js` and `hooks/slicetree-sweep.js`
both use instead of carrying their own regex. `hooks/scope-prune.js` takes a second export off the same
`require`, `baseHistoryHasPatch` — the containment probe (ADR 0082) — and the two fall back
differently: the reader missing stops that hook's sweep outright, while the probe missing narrows its
containment test back to the tree comparison alone, silently. The API guards its CLI entry with
`require.main === module`, so a `require` for that reader alone runs no CLI code. Normalisation is per
header: `Stage` and `Branch` are single tokens,
cut to the first whitespace-delimited token and stripped of markup and trailing punctuation.
`Anchor` is a prose title that reaches a pull request, trimmed and otherwise left alone. An empty
header line reads as absent, not as an empty string. Both `readLines` and `readLedgerHeader` split
on `\r?\n`. A `ledger.md` an editor or `core.autocrlf` wrote with CRLF line endings reads exactly as
an LF one does. A lone `\r`, the classic-Mac line ending, reads as absent, and that is deliberate.
Any verb that writes the file normalises it back to LF. A scope whose ledger stage reads `shipped`
collapses to one line, `<scope>  (shipped)`. It drops the slice tally and the blocked list.
`hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so per-slice detail is no longer
work in flight. Its `**Degraded:**` line, its `**Unresolved:**` line, its `**Deferred:**` line, and its
staged-page lines survive the collapse, because each is otherwise recorded nowhere else. `deferred add`
carries no `clear` counterpart: a defect stops being true once a run re-verifies the scope green, while
unplanned work stays unplanned until somebody plans it (ADR 0035).

`root <slug>` is a verb that touches no ledger (ADR 0080). It resolves and prints a run root's
absolute path — `<main-worktree>/.superdev/scopes/<slug>`, where `<main-worktree>` is the parent of
`git rev-parse --git-common-dir` — so it takes no `--root` of its own. The result is identical whichever
checkout it runs from: the invoking checkout, a scopetree, or a slicetree of the same repository, which is
what lets every prose caller resolve `<run-root>` the same way regardless of its own cwd. It refuses
outside a git repository, and refuses a slug carrying a path separator or a leading `.`, since either
would path a ledger read or write outside `.superdev/scopes/`.

`dod-line` is another verb that touches no ledger, and makes no store call of its own
(`references/dod-ticks.md`, INV-0014, triage #664): `--match <criterion text>|--match-file <path>
--verdict met|not-met|ceiling|accepted --note <text>|--note-file <path> [--line]`. It is the one
Definition-of-Done checklist-line edit every store's own `## Definition of Done ticks` section cites
instead of restating by hand — a store seed fetches the checklist text through its own call, pipes it
through `dod-line` on stdin, and writes back whatever comes out on stdout, the same shape `kb-patch.js`
already gives a staged knowledge-base patch (ADR 0027). `--match-file`/`--note-file` are each an
alternative to `--match`/`--note` that reads the same text from a file instead of a shell-interpolated
argument, one trailing newline stripped verbatim otherwise — the text a controller pipes in this way is
typically report-derived, and may carry a quote, a backtick, a `$(`, or worse (`references/dod-ticks.md`,
triage #680); giving both forms of the same argument refuses. The default mode takes a whole markdown
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

### publish-kb.js, the backend-independent knowledge-base publish (ADR 0069)

`publish-kb.js` is the fourth shipped CLI. `skills/publish-kb/SKILL.md` invokes it and relays its
report, and keeps no publishing mechanics of its own. It resolves the main checkout from any current
directory, a scopetree included, using `git rev-parse --path-format=absolute --git-common-dir`.
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

Every template runs under a **30-second bound** (ADR 0076), applied at `runTemplate`'s own `spawnSync`
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

Two or more staged files sharing one title are the aggregate-page case, since a `patch` filename is
`<title-slug>--<section-slug>.md` and an outline entry's sections arrive as sibling files.
`processTitleGroup` applies each file in turn, re-reading the live page as it then stands, so the
second file's merge sees the first file's own section already landed. It leaves both files staged and
unresolved when two siblings name the identical section heading. A group where not every file carries
`action: patch` is ambiguous, and nothing in it publishes. A staged file's backend call landing is
what deletes it. A call that fails leaves the file staged, so the next run retries exactly what did
not make it. A malformed file (no frontmatter, no title, or an unknown action) is reported and left
untouched. A timeout on one sibling stops the rest of that group untried, the same stop the outer
batch loop applies between groups (ADR 0076, time-bound). A host that black-holes one call
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
and sends `update` directly (ADR 0076), never the hash guard and never a `read` call. A hashless
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
  four digits with no digit after them, so a trailing letter or `_` does not hide it. A letter, digit
  or `_` immediately before `INV-`, with no separator, still hides it. A stale citation fails as
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
| `drift/selftest/` | `index.js` (the `fixture` helper, `realRoot`, temp-dir cleanup) plus one suite per area: `scanners`, `chain`, `kb-plan`, `drift-check` |

The checks named below are the exceptions, and every other one is a **drift assertion**: it compares a
restated fact against its source. `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, and
`return-to-controller` are **negative** assertions. Each reports a document that still says something,
rather than one that stopped saying it. `adr-status` compares a document against a **schema**.
`pinned-paths` and `marketplace-source` are plain **existence** assertions.

The exceptions are named and the rule covers the rest, deliberately. This sentence used to enumerate
every drift assertion by id, and it fell behind at five separate additions, because a list of forty is
maintained by hand at the moment its author is thinking about code. Naming the exceptions cannot drift
when a new check lands.

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
same shape over a narrower, deliberately separate list: `skills/afk/SKILL.md`, `skills/ship/SKILL.md`,
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
how the doc phrases issue creation. `references/issue-tracker-local.md` is exempt from both halves
through one set, because it has no assignee concept and renders neither. Presence and absence are all
either half claims; what the section must say for its backend stays a review's job. Coverage is automatic
— `storeDocuments()` picks up a `references/issue-tracker-*.md` seed added later with no scanner edit —
but exemption is not: a backend with no assignee concept must be added to `ASSIGNEE_EXEMPT` by name, or
it reports a section gap on a suite that was never wrong. The `run-state-contract` check resolves the same shape the
other way, exempting no store and letting a snapshot-less backend declare itself snapshot-less inside its
own section instead. The
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
`afk-selection-neutrality` contract: `skills/afk/SKILL.md`'s selection step (§2) names no backend's own
anchor mechanism, and instead points at the store's `## Scope anchor` contract. Four mechanisms are
checked. An epic (the `epic` label, matched case-insensitively whether backticked or not, which also
covers the local store's `00-epic-` filename). A change-type label prefix (any of them, and including
a concrete label like `feat/self-improvements`). A GitHub sub-issue relation. A Jira parent field. A
type is excluded only when a further `/`-delimited segment follows it. That exclusion is what separates
the paths this step legitimately carries from a label: `docs/agents/…`, the store config it is meant to
point at, and `docs/plans/<type>/`. A delimiter rule instead reads a real label as a path and passes
it, and an allowlist of the two path literals both misreads an ADR citation as a prefix and lets
`docs/plans-refactor` through. A step that stayed neutral by naming nothing at all still fails this. Naming no mechanism
is only half the property. `scanAnchorContract()` and `scanAfkSelectionNeutrality()` share one
helper, `extractSection()`, which masks fenced code blocks first. (CommonMark's at-least-as-long
closing-fence rule applies, so a shorter inner fence never closes a longer outer one.) Then it
isolates the text of one heading's section before either scans its body. The
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
`references/dod-ticks.md`'s Document's case those two dispatch through). A contract in an agent body
also has to hold in the prose that dispatches it, so `implementer.md`'s one body clause is reached by
a dispatch row in each of `skills/implement/SKILL.md` and `references/run-handoff.md`.
`skills/submit-pr/SKILL.md` carries no row here: ADR 0091 retired ship's own verification step, and the
row that once pinned its "Verifying an item observes" sentence went with it (see `ship-ticks-nothing`
below).

The `ship-ticks-nothing` contract (ADR 0091), all on `skills/submit-pr/SKILL.md`: it replaces the
retired `dod-suite-criterion` contract, which once pinned §4's suite-criterion tick logic — that logic
moved to `/superdev:review`'s own §4 once every scope started passing review, so submit-pr ticks nothing
at all. One row pins the plain "writes no tick anywhere" statement; one pins the `## Post-merge
checklist` paragraph — every `dod.md` line noted `— ceiling:` copied into the pull-request body under
that heading, with no empty heading when none exist. Closing the scope anchor on a remote store is
`/superdev:ship`'s own post-merge job (ADR 0096) and carries no row here yet: ship is a placeholder
until that command is built (`stage set shipped` is `verb-pointer`'s own row, below, and carries no row
here either for the same reason).

The `anchor-close-before-push` contract (triage #654) pins rows on a store whose anchor close is a commit
on the scope branch — the local store — commits that close before submit-pr's own push, so it reaches
base exactly when the pull request merges rather than never reaching base at all, and no command ever
commits straight to base (INV-0001). One row pins `skills/submit-pr/SKILL.md`'s §4 sentence stating the
scope-branch-commit case at the push step; the other pins `references/issue-tracker-local.md`'s own close
line, reworded to match. A store whose close is an API call is unaffected and keeps closing after the
merge, on `/superdev:ship`. A later feature is free to replace the `done` value with its own status; the
before-the-push mechanism stays either way.

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
`reachable-criterion`, `label-validation`, `green-gate-timeout`, and `verb-pointer` checks
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
`--unattended` and carry an instruction to read and apply that section. The `afk-invocation` contract: `skills/afk/SKILL.md`'s stage table invokes all
four chain commands and carries `--unattended` on every one of those rows. `scanAfkInvocations()`
checks this row by row: a
whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
unnoticed. The `afk-no-ship-step` contract (INV-0093), `scanAfkNoShipStep()`: `skills/afk/SKILL.md`
names `/superdev:ship` nowhere except within 60 chars of an admission that afk stops short of it —
"never", "only a human", "human-only", "stops before", or "human step" — on either side of the mention.
`AFK_NAMES` above excludes `ship`, so `scanAfkInvocations()`'s row loop silently skips a stage-table row
that named it — this check reads the whole file instead, sentence by sentence, so a bare mention with no
nearby admission (a table row or ordinary prose) is a gap. The window, rather than a whole-sentence
co-occurrence test, is what lets a legitimate paraphrase pass ("stops before invoking `/superdev:ship`,
which stays a human step" carries none of the three literal tokens the file's own two mentions use, but
sits right next to the phrasing the window looks for) while still catching a real invocation an
unrelated admission elsewhere in the same sentence would otherwise excuse. The `change-type` contract:
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
and one naming that command's own candidate set (run roots not `shipped` for submit-pr, features whose
slices are ready for implement) ahead of the citation. Anchored on the section's own heading and on each
citing document's literal citation and candidate-set sentences, the same shape `UNATTENDED_CONTRACTS`
uses, because a document that restates the cascade in its own words instead of citing the section reads
correct in isolation and is exactly the defect ADR 0078 removes.
The `agent-lens-list` contract (ADR 0062), one sentence row per audited agent's own lens list, a further
row where a dispatch restates that list instead of deferring to it, and `scanAgentLensNoDesignSmell()`:
`agents/slice-reviewer.md` reads only the anti-pattern and vulnerability-class lenses from
`references/review-checklist.md`, and `agents/final-reviewer.md` reads the anti-pattern, design-smell,
vulnerability-class, reuse-audit, and consistency lenses. The `orphan-lens-placement` contract below is
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
The `label-validation` contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `skills/implement/SKILL.md`
and `skills/afk/SKILL.md` each point at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does. A rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. The
`green-gate-timeout` contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
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
`skills/status/SKILL.md` `status`, `skills/afk/SKILL.md` `get stage`,
`skills/plan/SKILL.md` `get branch --root` (for
the refusal signal its §0 reads before extending a feature), both execution
playbooks `slice`, `references/scope-mode.md` `degraded add`, `references/implement-lite.md` `docs set`
(the inline-doc-pass record, ADR 0031), `skills/document/SKILL.md` `get docs` (read before it decides whether
to dispatch a `doc-writer`), and `skills/review/SKILL.md` `docs clear` (when its fix loop lands commits). A
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
`disable-model-invocation: true` in its frontmatter and no `--unattended` token anywhere — ship carries no
unattended mode of its own, unlike every step the implement chain drives (ADR 0096). Absent ship.md is
skipped, matching every other contract scanner.
The `model-invocation-split` check (INV-0066), `scanModelInvocationSplit()`: `skills/afk/SKILL.md` carries
`disable-model-invocation: true` in its frontmatter, and every skill its `## 3. Take it through the chain`
section names as a `/superdev:<name>` step carries none. Two directions, and the check needs both: afk
without the key lets the model start an unattended sweep itself, and a chain step with it is one afk cannot
invoke through the Skill tool. The step list is read from that section, so a step added there is held at
once and a mention outside it is no step. A section naming no step is a gap, not a vacuous pass. The key
counts only inside the frontmatter. Ship's half is `ship-human-only`'s. Absent skill files are skipped.
The `kb-staging` and `kb-no-backend-call` checks are the ADR 0023 knowledge-base contracts, checked in two
halves because either alone passes while the invariant is gone. The `kb-staging` half: `skills/plan/SKILL.md`,
`skills/document/SKILL.md`, and `references/doc-pass.md` each name `.superdev/kb-pending/` as the place a
remote backend's page goes instead of a live call. The third row moved from `agents/doc-writer.md`
onto the reference with the rest of the pass's prose (ADR 0031). The `kb-no-backend-call`
half, `scanKbNoBackendCall()`: none of those three, nor `agents/doc-writer.md`, carries a
backend-directed verb. The staging-path mention moved off `doc-writer.md`, but the check keeps that
document in this list, because the agent still dispatches the knowledge-base pass, and a regression
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
command, never the full suite (ADR 0025). The `full-suite` contract (ADR 0025, ADR 0075). `skills/review/SKILL.md` still
runs the full suite itself, before dispatching `final-reviewer`. It states that a `fail` there is itself
a Critical finding folded into the fix loop. It states that the stage does **not** advance while a
full-suite fail, or a Critical or Important finding, stands. That last clause is the one that blocks a
red scope, distinct from the finding merely being named. ADR 0075 adds the loop's own rows: each fix
cycle runs the focused command over the fix diff and hands that result to the re-review; a full suite
runs once more when a verdict first comes back clean, with a red result there counting toward the
3-strike cap; and a denied exit run takes the entry run's own local deviation — record and continue
attended, block unattended — rather than the generic record-and-continue default, since it is the gate
the stage advances on. Each row lost has its own failure — dropping the exit run advances a stage on a
suite that never saw the fixes, dropping the focused cycle run silently reinstates a full suite per
cycle, the cost ADR 0075 removed, and dropping the exit run's own local deviation advances an unattended
stage on the entry run's suite alone. `agents/final-reviewer.md` reviews a live
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
The `afk-routing` contract (ADR 0091) pins `skills/afk/SKILL.md` stating that every scope passes
review, whatever its slice types, and that its stage table routes every scope through `/superdev:review`
with no special case for an all-`mechanical`/`docs` ledger — every scope's `merged` stage routes to
`/superdev:review`, and its `documented-unreviewed` stage routes back to `/superdev:review` too, superseding
ADR 0025's skip of the whole-scope review. `skills/submit-pr/SKILL.md` carries no all-`mechanical`/`docs`
exemption from its own missing-step warning and so carries no row in this table either: `/superdev:submit-pr`
§3 names `/superdev:review` as missing for such a scope like any other. The same table's second row (triage #661)
pins that `skills/afk/SKILL.md` blocks a second document-to-review send-back of the same anchor in the
same sweep, through the ordinary unattended block path and counting toward the consecutive-block cap,
rather than sending it back to `/superdev:review` a second time — afk carries this count in its own
working memory alone, so nothing pins a written record of it. The
`arg-token` contract: `hooks/merge-guard.js`,
`hooks/green-gate.js`, and `hooks/ledger-guard.js` each carry the canonical `const ARG = …` shell-word
token **verbatim**. The three parse the same shape out of a Bash command line by hand, and nothing links
the copies, so this pins the literal rather than testing mutual equality. A token that narrows in one
hook reopens the quoted-argument bypass there (`git -C "my repo" merge` walking past the guard), and a
deliberate improvement is meant to reach every one of them and this pin in one commit. Same shape as the
scope-slug charset assertion in `tests/scope.test.js`.
The `audit-set` contract: `skills/setup/SKILL.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `skills/document/SKILL.md` still reads that
section back with its stated fallback for when it is absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. These documents agree on the section only in
prose, the same shape as the `afk-routing` and `arg-token` pairs. A renamed heading or a dropped
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
exports today. It holds the slot the `afk-existence` check held, which asserted
`skills/afk/SKILL.md` on its own. That check's stated reason — nothing else in the plugin names
`/superdev:afk` — was already false when it was written: plugin documents name the command, and
`skills/implement/SKILL.md` is one of them, so the `command-resolution` check already resolves
`/superdev:afk` there and already catches the file's deletion. Three contract tables also pin
`skills/afk/SKILL.md` directly, so the general rule covers it a second way, and the special case went,
replaced in place at the slot it had held.
The `adr-status` contract: every `docs/adr/*.md` states a `**Status:**` line
carrying one of `Accepted`,
`Proposed`, `Superseded`, or `Rejected`. An ADR with no status line reads as accepted whether or not
anything implements it, which is how a decision reaches the glossary and the command bodies while the
code has none of it. The value's capitalization is pinned with the set, so one ADR does not sort and
grep apart from the rest. The `append-mode` contract (ADR 0004): every slice-store document
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
carries it. A document stating the migration in running prose alone matches nothing.
`references/issue-tracker-local.md` alone carries a fifth element, that append continues file numbering
from the highest number already present and never reuses one. Its `id` is the file number `/plan`
itself assigns, unlike an issue backend's server-assigned key, which already satisfies the id rule on
its own. The
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
alone refuses — a run root whose ledger stage reads `shipped`, and a scope anchor at the store's done
status — and names the remedy, a new feature carrying `**Blocked by feature:** #<anchor>`.
`references/plan-contract.md`'s *Append mode* section states the same boundary, because it owns what an
append may do and every backend renders it. The signals are pinned as one row rather than two, since
neither answers the question alone: a reaped run root leaves no ledger, and a best-effort anchor close
leaves the anchor open beside a `shipped` ledger, so a document naming one signal is as broken as one
naming neither. The remedy has a row of its own because a refusal without it is a dead end, which is the
failure a reader works around by appending anyway. The `anchor-candidate-all-states` contract (ADR 0083)
carries two families of row, both scoped to the issue-tracker documents that filter their anchor-candidate
listing by state: `docs/agents/issue-tracker.md`, `references/issue-tracker-forgejo.md`, and
`references/issue-tracker-github.md`.

The first family, one row per document, is anchored on the query string itself —
`` labels=<type>%2F<feature>&state=all `` — never on the rationale sentence beside it. A shipped
feature's epic is closed, so a `state=open` candidate listing never returns it for *Recognise one* to
resolve, and the shipped-anchor refusal above has no anchor to refuse on — the exact dead end ADR 0083
exists to close, reached anyway because the second signal's anchor never surfaced. Each document already
states the identical hazard for its *List the slices beneath it* call, which already runs `state=all`;
this contract pins the same fix on the candidate listing itself. Anchoring on the query string, not the
rationale, matters: the rationale sentence ("`state=all`, not `state=open`: a shipped feature's epic is
closed…") reads true on its own even when the query beside it reverts to `state=open`, so a row matching
only the rationale stays green through that revert. Jira and the local file store carry no row in this
first family, because neither has a query parameter to pin: Jira's *List the candidates* call runs no
status filter at all — it already spans every state unconditionally — and the local store lists
directories, not issue state.

The second family pins the rule a listing spanning every state forces once a feature label is reused
after retirement: the listing can then return a retired label's closed (or, on Jira, `<Done>`-status)
root beside a reused label's open (not-`<Done>`) one, and *Recognise one*/*Ambiguous* must resolve that
shape without reporting a well-formed plan as ambiguous. This family's precondition is a listing that
spans every state, not a state query to pin, so it reaches Jira too — its label listing spans every
status inherently, the same property the first family's exemption reasoning names. Only the local-file
store is exempt from both families: a directory listing carries no state to span.
`references/plan-contract.md`'s generic `## Scope anchor` section carries one row stating the rule once —
the open candidate is the anchor, and `Ambiguous` is two or more *open* candidates, never a closed one
beside a single open one — and each store document's own section specialises it: the Forgejo-shaped
documents (`docs/agents/issue-tracker.md`, `references/issue-tracker-forgejo.md`) carry one row each for
*Recognise one*'s open preference and one each for *Ambiguous*'s open-only shape;
`references/issue-tracker-github.md` carries the same two, phrased against its root/`/parent` shape;
`references/issue-tracker-jira.md` carries the same two, phrased against its `fields.status.name` versus
`<Done>` shape, since Jira has no open/closed issue state to phrase against. Every
row in both families is exercised by its own selftest in `drift/selftest/kb-plan.test.js`, including the
query-only-revert mutation the first family exists to catch. The `rotate-on-shipped` contract (ADR 0004, ADR 0007, ADR 0079/0080's Important review finding B):
`references/run-init.md` states that run init reads a present ledger's stage before choosing between
resume and init, that stage `shipped` runs `init` directly and `init` itself rotates the existing ledger
aside to `ledger-shipped-<date>.md` before writing the fresh one, that every other stage (`implementing`,
`merged`, `reviewed`, `documented`, `documented-unreviewed`, `submitted`) keeps the existing resume path, and that
nothing is deleted, so `scope-prune`'s seven-day post-merge reap still runs on its own terms. A fourth
clause states that the rotation never overwrites an existing `ledger-shipped-<date>.md`, so a scope that
ships twice in one calendar day keeps both trails instead of the second rotation clobbering the first.
`scope-prune` keeps a shipped run root on disk past merge, so a new feature reusing that retired label
can land while the finished run's ledger is still there (ADR 0083). A document that goes back to treating any
present ledger as an in-progress resume re-dispatches a finished run instead of beginning the new one.
`init` owns the rotation mechanics — `plugin/scripts/scope.js`'s `rotateShippedLedger()`, called only
after `verbInit` has validated stdin, so a refused `init` never rotates a ledger it is about to leave
in place (Important review finding G) — because `scope.js` is the
sole `ledger.md` read and write path (ADR 0022) and the rotation is a ledger operation; `references/
run-init.md` describes what `init` does rather than instructing a reader to rename the file by hand
first, which is what let the instruction die stranded after the branch, scopetree, and run lock already
existed when `/superdev:plan` itself became an `init` caller over a `shipped` ledger (`docs/agents/
issue-tracker.md`'s ADR 0004 append flow). `tests/scope.test.js` carries the rotation's own coverage: the
fresh ledger lands at the requested entry stage, the rotated file carries the shipped ledger byte for
byte, a second same-day rotation never overwrites the first, and nothing is deleted. The
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

The `marketplace-source` check, `scanMarketplaceSource()`: `.claude-plugin/marketplace.json`'s
relative `source` for each plugin resolves to a directory that carries `.claude-plugin/plugin.json`. That
one string is what limits an install to the shipped `plugin/` tree (ADR 0032), and `claude plugin
validate .` accepts a source that names no directory at all. A renamed tree or a fat-fingered path
therefore breaks every install while `bun run test` stays green. An absent manifest is skipped, and an object
source (a remote repo) is out of scope: only a path into this repository can drift against it.

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
`## Release` section, and `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, and `skills/afk/SKILL.md` each name it.
A release is the human agreement that a written plan may be built (`references/plan-contract.md` →
*Release*), and it is expressed differently per backend — a label on Forgejo and GitHub, a label rather
than a status on Jira, and nothing at all on the local-file store, whose plans are released when written.
Both halves fail silently, which is why both are pinned: a store document without the section leaves the
consumers no signal to read, and a consumer that drops the reference builds whatever it is handed, which
is the gate gone with every command still valid prose. The consumer half matches the backticked
`` `## Release` `` rather than the bare word, since "release" recurs in ordinary prose. Absent documents
are skipped, matching every other scanner.

The same check carries ADR 0083's removal half (INV-0005), because a release signal nothing removes is
the same gate failing from the other side. A release decision covers the work that existed when it was
made, so on an append `/superdev:plan`'s §6 applies the answer in both directions: declining removes the
signal from the scope anchor, releasing applies it. Three further assertions, each silent alone. Every
store document whose signal is removable carries a `## Release` **Remove** bullet naming the concrete
call, beside **Apply** and **Read** — without it the command has nothing to invoke.
`references/issue-tracker-local.md` is exempt from the bullet and owes the opposite statement, that a
store releasing its features at write has nothing to remove, so `/superdev:plan` says so rather than
attempting a call. And `skills/plan/SKILL.md` states the both-directions rule itself, since a store
document carrying the call while §6 still reads "apply nothing" leaves the signal standing over slices
nobody released — which is exactly what `/superdev:afk` then selects.

The `doc-steps-no-suite` check, `scanDocStepsNoSuite()`: `skills/document/SKILL.md`,
`skills/submit-pr/SKILL.md`, `agents/doc-writer.md`, and `agents/final-reviewer.md` name no full-suite run of
their own (ADR 0025). That is narrower than "performs no full-suite run": `skills/document/SKILL.md` reads
`references/test-selection.md` and runs the focused command it selects over its own doc commits, and a
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

The `afk-anchor-count` contract (ADR 0040), two elements on `skills/afk/SKILL.md`'s paragraph
introducing `## Scope anchor`: it states that the section carries five things for this backend, and names
reading an anchor's own dependencies as the fifth. ADR 0040 added that fifth element to `plan-contract.md`,
every store document's own section, and this file's own `anchor-contract` write-up, but nothing
pinned this one paragraph, so it kept reading "four" and naming only the original four — the one-sided-pin
shape root `AGENTS.md`'s prompt-architecture rules name, and the reason `bun run test` stayed green over a
stale contract statement. The two elements are independent: a maintainer could fix the count without
naming the fifth thing, or name it without updating the count. `scanAfkAnchorCount()` isolates the
paragraph itself with `extractParagraph()`, narrower than `anchor-contract`'s section-wide
`extractSection()`, because the same section legitimately restates the anchor dependency again lower down
(the eligibility bullet reads it) — a section-wide match would pass on that restatement alone even after
the intro paragraph itself reverted to "four".

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
and its own stage write). `references/run-init.md`, `skills/implement/SKILL.md`, and
`skills/submit-pr/SKILL.md` carry exactly one citation each and no other mention of the section, so a
bare file-level row stays unambiguous
there. `references/implement-lite.md` carries no direct citation, one inheritance note, and sits outside
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
cause — `/superdev:ship` already removed it, or this checkout never held it at all, the case
`adopt-run-state` makes reachable on a fresh clone. A fix cycle found the sentence named only the first
cause, so `references/implement-lite.md`'s Resume step — which works "in the scopetree"
unconditionally, assuming it exists — had nothing creating that scopetree on a fresh clone; `implement-lite.md`
itself needed no change once the bullet it delegates to was broadened, because its own Branch model step
already runs `## Cutting the scope branch` in full before Resume ever reads the scopetree. Split into its
own check rather than folded into `adopt-run-state`'s table, because the two answer different questions —
which branch gets fetched, versus which scopetree gets created — and no fixture anywhere previously
distinguished "removed by ship" from "never created", so a regression narrowing the sentence back to one
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
(`scanners.js`) is the absence half, the same shape `scanAfkLockTierClaim` already takes: it asserts those
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
the branch — the same reuse the retired `run-kind` row used to describe split by tier. `## The run
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
`implement-full.md` and `document.md` already carry. More rows sit on `references/run-handoff.md` for
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
`mergeInProgress()` then reads as a deferral that gates nothing. The last row sits on `skills/afk/SKILL.md`'s
eligibility bullet: the no-lock case falls back to the ledger mtime, with no claim that a full run never
gets a lock — a fix cycle found the bullet still asserting a run lock "only ever exists for a `lite`-tier
scope" and citing `## The run lock` for that claim, a section ADR 0045 had already flipped to state the
opposite. Losing any one row independently reopens exactly the cost ADR 0045 removed: a full run parking
a second session's checkout on its own branch, a merge landing in a tree `/superdev:submit-pr` never expects, a
restated lock rule drifting from the shared one, a full run that writes no lock at all, a whole-scope
review or run-handoff full-suite pass that
writes to the wrong checkout, a merge abort that silently ungates the next merge in the scopetree, or
an unattended controller told to distrust a lock signal it can actually trust.

**This check runs a second scanner beside its table, `scanAfkLockTierClaim`.** The `skills/afk/SKILL.md` row
above is a **presence** check — it anchors on the surviving fallback rule — while its expectation
describes an **absence**: that the file no longer claims a run lock exists only for a `lite`-tier scope. A
presence row cannot assert that, so the stale claim can regrow as a sentence preceding the fallback rule
with the row still matching. The scanner is the absence half, in the `scanDocsAvoid` shape
`DOC_STEP_SILENCE_DOCS` and `DENIAL_CAP_NUMBER_SILENCE_DOCS` already use: two markers over one document,
where a **match** is the gap, matching on the parts that carry the claim (`lock`, `only`, `lite`-the-tier)
in either order rather than on one sentence shape. It joins this check rather than taking a registry id
of its own, because it asserts the other half of a row already here.

**Its selftest fixture is guarded, and that guard observes instead of declares.** `scanContract()` skips a
document it cannot read — the same convention that lets a fixture carry only the files one assertion
exercises — so a table whose fixture never names one of its documents lets that row's "every clause
present yields zero gaps" assertion pass without ever running it. That is how the `skills/afk/SKILL.md` row
above sat unexercised: the table pins eight documents and the fixture named seven. `selftest/index.js`
wraps `scanContract` for the run and records, per table, every document any call actually resolves (via
`readDoc`, so a `realRoot` call counts too); once every suite has run, it asserts each table's recorded
set covers every document the table pins, naming both the table and the document, since "a fixture is
incomplete" leaves the reader searching every row the table pins. This covers every table any suite scans, with no
per-table call and no hand-typed document list to fall out of sync with the fixtures — including a table
like `FULL_SUITE_CONTRACTS` whose fixtures are legitimately split across many small calls, since the
recorded set just accumulates across the run instead of needing one fixture to carry every document at once.

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
backend, including `references/issue-tracker-local.md`, whose rendering is a file under
`docs/plans/triage/` rather than a label, because that store has no labels at all. The same scanner then
holds every section it did find to `TRIAGE_RECORD_ELEMENTS`, whose one element is the **listing** call:
every store stated how to create a record and none stated how to read one back, so the record reached no
consumer at all until `/superdev:backlog` needed one. The element is anchored on a bullet's bolded lead-in
and requires both the listing verb and its object inside that lead-in, because
`references/issue-tracker-local.md` carries a bullet whose bold ends on "candidate listing" while stating
the opposite — that a record is invisible to `/superdev:afk` — and a bare `list` anchor would read that
document's exclusion rule as its listing contract. A second element holds every section to the same
outcome `plan-contract.md`'s own generic `## Triage record` section already promises ("No candidate
listing and no slice loader ever selects it"). The section must itself state how that backend keeps
the record out of `/superdev:afk`'s candidate listing. Otherwise the checker passed a store carrying
a create call and a list call but no exclusion clause clean. This is exactly the gap a fifth backend
seed could have walked through (issue #357). The pattern requires the literal phrase "candidate
listing" inside the section. This is the vocabulary every shipped seed's own exclusion bullet already
carries, so no seed document needed editing when this element was added. Only the checker gained
teeth. Further rows, a table
run through `scanContract()`, sit on `skills/review/SKILL.md` and `references/scope-mode.md`, the two
documents that write it. The record is what makes a deferred finding outlive the run root
`hooks/scope-prune.js` reaps and the scope anchor's own close — a commit `/superdev:submit-pr` makes on
the local plan-file store before its push, or an API call `/superdev:ship` makes after the merge on a
remote store — on the local plan-file store, only once the scope branch carrying it merges (ADR 0048) —
and before this record the only survivor was the body of a merged pull request, which appears in no
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
call but drops the "no feature label and no `ready` label" clause writes a record `/superdev:afk` then
selects as work to build, and no pattern here catches that.

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
`references/issue-tracker-local.md` carries it as `*Append\nmode*`, which a literal space would report as
drift. And a section the store legitimately does not carry yields nothing, because `extractSection()`
returns `null` and the loop moves on: the local-file store has no assignee concept and renders no
`## Assignee` at all, which is a documented choice rather than a gap. The citation test runs on the
fence-masked section, so a citation shown only inside a fenced code example does not count.

That skip is why membership alone is not a presence contract. A member a store renders nowhere is silently
clean here, which is what the store-side contracts exist to catch. `scanAnchorContract`,
`scanAppendContract`, `scanReleaseContract`, `scanTriageRecordContract`, and `scanRunStateContract` each
pin a member's own `## <Section>` heading, and none exempts a store by name. `scanAssigneeContract` pins
two halves: the `## Assignee` heading through `specialisingHeading('Assignee')`, and the
`- **Assignee:**` configuration bullet, which it forbids rather than requires, because the assignee lives
in the untracked `.superdev/info.json` (ADR 0073). It is the one that exempts a store by name, the
local-file store, which has no assignee concept and renders neither half.

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
`ponytail:` note beside `glossaryHeadingReference` in `drift/contracts.js` states that ceiling.

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

**Nothing here pins `skills/backlog/SKILL.md` against `skills/afk/SKILL.md`, deliberately.** Both read the same
store over the same anchors, which is the shape this file's other rows exist to bind — but ADR 0049
records that the two share their *facts* and not their *verdicts*: `/superdev:afk` acts unattended and
resolves every ambiguity toward deferring, while the survey reports and resolves one toward showing the
row. A row binding the two rule sets would assert a sameness that was decided against.

The `backlog-submitted-buckets` contract (#687) pins the survey's own carve-out for a run root at stage
`submitted`: afk's own routing table skips that stage entirely ("only a human moves it further"), so the
generic `in flight` act lookup — "the chain command that stage has not reached" — resolves to nothing for
it. One row pins the two buckets that stand in for it, `awaiting merge` and `merge unrecorded`, each
pointing at `/superdev:ship <scope-slug>`; the other pins the `scope.js get pr` read that tells them
apart, off the ledger's own `**PR:**` header rather than a query written into the command.

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
`/superdev:review <range>` for every scope, whatever its slice types. It is the same "always review"
fact the `afk-routing` contract pins on afk's own stage table, asserted here on the document that
actually prints the handoff, so a `run-handoff.md` that quietly re-grows the retired
`/superdev:document`-instead-of-review branch leaves the invariant's own name stated nowhere true.

The `review-submitted-handoff` contract (#687) pins the re-review ADR 0096 sends an operator to after
resolving a base-merge conflict: it enters `/superdev:review` at stage `submitted` and leaves the stage
there, but §4's own handoff and suite-record write both change shape for it. One row pins that the
printed next command becomes `/superdev:ship <scope>` once the stage reads `submitted`, in place of
`/superdev:document`. The other pins that a standing finding there — the fix declined, or the 3-strike
cap reached — invalidates the tip's suite record with `suite set none <sha>`, so `suite reusable` never
still accepts a tip a standing finding stands against.

The `commitment-capture` contract (ADR 0081) spans rows across three documents.
`skills/brainstorm/SKILL.md` still names a discovery's load-bearing commitments in the intent as a pair,
the principle and the rule it implies. `skills/plan/SKILL.md` still routes every commitment — one a
seeded intent handed over and one its own interview originated — through
`references/domain-modeling.md`'s conversion, and still covers commitments in the seeded intent's
delete-gate beside `Rejected direction`. `references/domain-modeling.md` still carries the
conversion itself, in rows of its own. Each half reads correct alone while another is gone: an
intent can name commitments nothing converts, a conversion can exist that plan never routes to, and both
can stand while the delete-gate drops a commitment that found no home.

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
branch-verifiable Definition of Done. `Reachable:` stays the one standing exception, because it names an
entrance, never a verification step. Losing the reference row leaves that exception unexplained; losing
either skill row leaves the interview free to write a criterion naming a test command, or a live-system-only
criterion with no offer to keep it out of the branch-verifiable set — the exact shape ADR 0084 observed
forcing a pre-merge deploy.

The `clean-verdict-ends-loop` contract pins rows: a clean verdict ends the scope-mode fix loop the same
way attended or unattended, findings or not, and a finding still standing when it lands is a follow-up,
never a fourth cycle. `skills/implement/SKILL.md`'s `## Invariants (both playbooks)` carries the
catalogue half; `skills/review/SKILL.md` §4's fix loop carries the acting half — the surface that
actually runs the loop when a re-review comes back clean with a finding still on the page. Either half
losing the clause, or keeping it but making it conditional on `--unattended`, or keeping the "never a
fourth cycle" prohibition while dropping what the standing finding becomes, is the drift this pins:
without it a controller reading only the surface that runs the loop has no standing instruction to stop,
and a finding a clean verdict left behind is one a controller may read as still owed a cycle.

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

The `code-management-head-branch-lookup` contract (#685, INV-0092) is a second presence table over the
same three documents: each `## Merge` section also carries a find-open-pull-requests-by-head-branch call
(Forgejo/Codeberg's `GET .../pulls?state=open` filtered client-side by `head.ref`, since neither carries a
native head filter; GitHub's `gh pr list --head <branch> --state open` or the equivalent `head=`-filtered
REST call), scoped to open pull requests only. `/superdev:ship` reads the pull request `/superdev:submit-pr`
recorded in the ledger by number, and falls back to this lookup only for a ledger predating that header —
scoping the fallback to open pull requests is what keeps a reused branch name
(`references/scope-mode.md`'s `## Cutting the scope branch`) from ever surfacing an old, merged pull
request under the same head as this run's own. The two Forgejo/Codeberg rows also pin a paging clause:
Forgejo's `pulls?state=open` list paginates (`page`/`limit`), so the two Forgejo-facing documents
(`references/code-management-forgejo.md`, `docs/agents/code-management.md`) must page through every page
before counting matches, or a match sitting on a later page reads as zero. GitHub's `head=` filter is
server-side, so `references/code-management-github.md` carries no matching clause.

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
loop the fix cycle closed: a tested commit landed after submit-pr that never reaches the PR head the
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
what catches the rest, and is the row that actually guarantees the merge lands the tested commit rather
than the push rule alone.
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
merging and refusing nothing. The header-absent row reads it as a legacy ledger a version before
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
The `document-submitted-handoff` contract (final-reviewer triage, Minor 5): `skills/document/SKILL.md`
§8's stage write only knew `shipped` as a leave-alone stage, so a `submitted` scope — one review already
handed to ship — fell into the "anything else" branch and got a `documented-unreviewed` write `scope.js`
refuses as a backward move. One row pins that `submitted` joins `shipped` in the leave-alone branch. The
other pins that the next-command bullet prints `/superdev:ship <scope>` for a `submitted` scope rather
than `/superdev:submit-pr`, which would try to re-open a pull request already open. Losing either row
reopens the stage-write refusal a doc pass on a submitted scope hits today.

## Work Guidance

- Scripts are CommonJS, like the hooks. `hooks/scope-prune.js` and `hooks/slicetree-sweep.js` both
  `require` `scope.js`, so `scope.js` must stay `require`-able under plain `node`. These are the only
  two dependencies `hooks/` has on `scripts/`.
  `scope.js` in turn `require`s `kb-patch.js` for `maskFencedLines`, so `kb-patch.js` must stay
  `require`-able under plain `node` too — the one dependency inside `plugin/scripts/` itself. `adopt`'s
  payload boundary is a pair of markers, not a heading, but a marker can still be shown inside a fenced
  illustrative example, so the marker scan needs the same fence-masking `kb-patch.js`'s
  `extractSection()` already owns.
- The shipped scripts each have a suite in `tests/`, same convention as the hooks (ADR 0059).
  `drift-check.js` is maintainer-only and keeps its inline `--selftest`. `invariant-check.js` is
  maintainer-only too, and has its suite in `tests/` like a shipped script, because it takes no part in
  drift-check's registry.
- A **shape-based prose guard that asserts an absence states its ceiling beside itself.** A pattern over
  English catches the phrasings it names and not every paraphrase, and on an absence check — the document
  must *not* say X — a missed paraphrase is a **silent pass**: the check reads the reworded instruction as
  gone and stays green while it is still there. Write the ceiling down next to the patterns for one of
  these — a `ponytail:` comment naming it is the house idiom — or every reviewer who finds one more
  evadable phrasing reports a defect, and the guard grows by discovery instead of by decision. The
  convention governs these checks of this shape, and each carries its note: `doc-steps-no-suite`,
  `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, `return-to-controller`,
  `afk-selection-neutrality`, `agent-tool-agnostic`, `agent-lens-list`, and `code-management-no-force`.
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

`bun run test` (repo root) runs each script's suite under `tests/`, then `invariant-check.js`
against this repository's register, then `drift-check.js`'s own `--selftest`, all under `node`, which
matches the production runtime.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
