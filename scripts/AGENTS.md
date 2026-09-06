# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`. Five executables.
Three shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js`
(the knowledge-base section merge, ADR 0027), and `adapter.js` (the OpenCode harness adapter, issue
#375). Two maintainer-only ones live here in `scripts/`:
`eval-run.js` (the eval runner, ADR 0024) and `drift-check.js` (the cross-document contract checks).
This doc owns all five regardless of which of the two dirs each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack, the working rules, and the release flow.

## Local Contracts

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the ledger's schema and is the only `ledger.md` read and write path in the chain:
`init`, `stage set`, `slice`, `degraded add|add-denial|reset-denials`, `unresolved add|clear`,
`deferred add`,
`docs set <value>|clear`, `get stage|branch|anchor|slices|unresolved|degraded|deferred|denials|docs`,
`status` (which renders the whole `/superdev:status` report), `publish`, and `adopt`. `degraded
add-denial` prefixes its bullet `denied: `, which is what separates a denied verification dispatch from
the other degraded shape sharing that line, and `get denials` counts those prefixed bullets — the number
an unattended run caps at two (ADR 0041). `degraded reset-denials` appends a bullet prefixed
`denials reset: `, and the count runs from the last such marker, so a human who addressed the cause
returns the whole budget while every recorded denial stays on the line (ADR 0044). Both prefixes are
structural, so plain `degraded add` refuses a text beginning with either and names the subcommand that
owns it. `get degraded` prints every bullet whatever its prefix, prefixes intact.
It also exports `readLedgerHeader` as a module
API. This per-header ledger-line reader is what `hooks/scope-prune.js` and `hooks/worktree-sweep.js`
both use instead of carrying their own regex. The API guards its CLI entry with
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
`hooks/ledger-guard.js` denies every other write path. Its selftest carries the retired drift
assertions along with its own behavior: the stage machine, the ledger schema and header lines, a
pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`,
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

### adapter.js, the OpenCode harness adapter (issue #375)

`adapter.js` is the third shipped CLI, and the one no command in the chain invokes: it renders the
shipped prompt surfaces into another harness's on-disk layout, so a superdev install there carries
the same chain. The only harness is `opencode`, named by `--harness`. Skills render from
`plugin/skills/<name>/SKILL.md` to `.opencode/commands/superdev/<name>.md` — the skill `afk` is
skipped, since it drives the chain through Claude Code's Skill tool, and the skill `upgrade` is
skipped, since its body only drives Claude Code's own `claude plugin update`, which has no OpenCode
equivalent — and agents from
`plugin/agents/<name>.md` to `.opencode/agents/<name>.md`. The rendered command frontmatter carries
the `description`, the skill's `model:` alias resolved
through the same `--model-map` (a missing alias refuses nonzero and names the alias and the
command), and the skill's `allowed-tools:` carried verbatim — OpenCode command frontmatter has no
permission key, so the field is preserved rather than dropped silently. The rendered agent
frontmatter carries
`description`, `mode: subagent`, a `tools:` map — a leading `"*": false` denying every OpenCode
tool (`permission:` overlays an allow-by-default baseline, so listing only the allowed tools there
restricts nothing; OpenCode's `tools:` map is last-match-wins, so the wildcard must lead) followed by `true` for
exactly what the Claude `tools:` allowlist names (`Read`→`read`, `Edit`→`edit`, `Write`→`write`,
`Glob`→`glob`, `Grep`→`grep`, `Bash`→`bash`, `WebFetch`→`webfetch`, `Task`→`task`, `Skill`→`skill`,
`Question`→`question`, `TodoWrite`→`todowrite`; an entry the table does not know — `WebSearch` has
no OpenCode builtin equivalent — contributes no key, so `doc-reader` and `implementer` lose web
search under OpenCode), plus an always-`true` `invalid` regardless of the allowlist. `invalid` is
OpenCode's tool-call repair sink (`experimental_repairToolCall`'s landing slot for a hallucinated or
malformed call), excluded from the model's own tool schema by construction, so denying it buys no
security and only trades the repair tool's recoverable result for the executor's own "Unknown tool"
error — and
`model` resolved from the agent's alias through the
repeatable `--model-map <alias>=<provider/model>` — a missing alias refuses nonzero and names the
alias and the agent. Every rendered string scalar (`description`, `allowed-tools`) is emitted
JSON-quoted, so a description carrying `: ` stays valid YAML, and the plugin root is normalized —
a trailing slash included — before substitution, so no rendered path carries `//`. Every rendered
file then gets three deterministic prose rewrites:
`${CLAUDE_PLUGIN_ROOT}` becomes the `--plugin-root` value, `/superdev:<cmd>` becomes
`/superdev/<cmd>`, and a bare `superdev:<agent>` becomes the bare agent name. Both name rewrites
are restricted to the skills and agents discovered under `--plugin-root` (default: the adapter's own
`..`), so a lookalike token — an HTML comment marker, a longer word sharing a name's prefix — is
 never mangled. A render is idempotent: it removes `.opencode/commands/superdev/` wholesale and its
generated bridge file by name, and, in the shared `.opencode/agents/` directory, only the files whose
**frontmatter block** carries its own marker comment from a past render, before writing — touching
nothing else under `--dest`. A consumer's own plugin beside the bridge survives. A consumer's own
agent file beside the rendered ones survives. A foreign file that merely quotes the marker sentence
in its body, rather than carrying it in frontmatter, survives too.

The render also emits the **OpenCode hook bridge** (issue #376) at `.opencode/plugins/superdev.js`:
a generated CommonJS OpenCode plugin that forwards OpenCode's plugin events to the eight shipped
hooks, spawning each as `node <plugin-root>/hooks/<hook>.js` with the plugin root baked in at
render time and passed to the child env as `CLAUDE_PLUGIN_ROOT`. The event map, dated and verified
against opencode.ai's plugins and agents docs in the adapter's own comment: `tool.execute.before`
on a shell tool runs merge-guard, run-lock, and ledger-guard; on a file-editing tool,
ledger-guard, resolving the edited path from the tool's own `filePath` argument or, for OpenAI's
`apply_patch` tool (which carries no `filePath`, only `{ callId, operation: { type, path, diff } }`),
from `operation.path` instead; on the `task` dispatch tool, model-explicit; `tool.execute.after` on a shell tool
runs green-gate; `session.created` runs update-check; `session.idle` and `session.deleted` run
worktree-sweep and scope-prune. The stdin payload is Claude-shaped — `hook_event_name`,
`tool_name` mapped back to the Claude name (`Bash`, `Edit`/`Write`, `Agent`), snake_case
`tool_input`, top-level `cwd`, and `agent_id` when the calling session has a parent — because that
is the shape the hook scripts parse. OpenCode's `task` tool takes no `model` argument, so the
bridge resolves model-explicit's `tool_input.model` from the rendered agent's own frontmatter
(`.opencode/agents/<type>.md`), where the adapter already pinned it. Block semantics mirror
Claude's: a child exiting 2, or a stdout JSON `hookSpecificOutput.permissionDecision: 'deny'`,
throws so the deny reaches the model; a spawn error, a killed child, or a plain-text notice (an
update-check newer-version line) never blocks. The bridge's four helpers are serialized into the
generated file via `Function.prototype.toString`, so the selftest exercises the same code the
bridge ships. Refusals exit nonzero with a one-line stderr reason and cover an unknown
`--harness` (default `opencode`), a missing `--dest`, a malformed `--model-map`, a skills or agents
directory absent under `--plugin-root`, and a skill directory carrying no `SKILL.md`. The module
guards its CLI entry with `require.main === module` — including its `--selftest`, so a `require`
from the drift-check suite runs no CLI code — and exports `render`.

The committed golden render lives under `scripts/drift/fixtures/opencode/`, regenerated with
`bun run render-fixtures` (`node scripts/drift/opencode-fixtures.js --write`). The fixtures render
with one fixed model map and the plugin root normalised to `<plugin-root>` — the bridge file
bakes that root into its `PLUGIN_ROOT` constant, so the same normalisation keeps the fixture
machine-independent; the sixty-fifth check below diffs a fresh render against them.

### eval-run.js, the eval runner (ADR 0024)

`eval-run.js` runs every `evals/` case as two arms on a Claude subscription instead of a metered
API key. The plugin arm loads superdev through `claude -p --plugin-dir`. The baseline arm loads
nothing. It scores each arm's diff and transcript against the case's `graders/*.md`. It refuses to
start without `CLAUDE_CODE_OAUTH_TOKEN` and never falls back to a billed `ANTHROPIC_API_KEY`. It
exits non-zero in three cases. A case scores nothing. The ablation looks broken: the plugin arm
shows no superdev marker in any of its runs, or the baseline arm shows one. An arm's transcript
shows a mutating tool call, but the captured diff stays empty. It reports that capture failure as
an error, never as a silent zero. `claude plugin eval` still reads the same `case.yaml` and
`graders/*.md` files, unchanged, for a key-funded cross-check.

Its selftest covers:

- the case-YAML reader
- the child-environment scrub
- the two arms' argument difference
- the run classifier
- the diff-capture failure paths (an empty scaffold, work committed off HEAD, a nested repository
  tracked as a gitlink)
- the two shapes a `scaffold_script` may leave behind. A scaffold that writes files and stops, and a
  scaffold that runs `git init` and commits its own tree, both yield a base commit carrying the
  scaffold's files. `scaffold()` measures an empty scaffold with `git ls-files`, so a workspace with
  nothing staged is scaffolded rather than failed.
- the grader and judge machinery, including a grader that cannot be evaluated at all (an unknown
  focus, a judge that never returns a verdict, or `regex` criteria that will not compile), reported as
  a grader error and left out of the score, never as a fail and never as a thrown `SyntaxError` that
  ends the run
- the symmetry of that exclusion. A grader that errored on one arm is dropped from **both** arms'
  scores, computed in `aggregate()` where both arms of a run are in hand. `scoreArm` runs per arm and
  cannot see the other one, so an exclusion left to it scores the arms over different weight totals
  and turns the delta into arithmetic about which grader failed to run. The per-grader row still
  reports the arm that could not be judged, so the exclusion stays visible.
- aggregation across runs
- the missing-token exit

### drift-check.js, the cross-document contract checks

`drift-check.js` is the entry point only: it walks the check registry and reports. The checks themselves
live beside it, in `scripts/drift/`.

| File | Owns |
|------|------|
| `drift-check.js` | the CLI: `main()`, the ok line, the exit code, and the `--selftest` handoff |
| `drift/checks.js` | the **registry**, one entry per check: `id`, `run`, its `ok` phrase, and how one gap prints. Its array order is the order this narrative numbers them |
| `drift/contracts.js` | the contract tables and patterns. Data only |
| `drift/scanners.js` | the bespoke scanners, every check whose assertion is more than one pattern over one document |
| `drift/lib.js` | what they share: `maskFences`, `extractSection`, the frontmatter readers, `readDoc`, `storeDocuments`, and `scanContract` |
| `drift/opencode-fixtures.js` | the golden-fixture half of the `opencode-render` check: the one normalised render both the check and `bun run render-fixtures` use |
| `drift/selftest/` | `index.js` (the `fixture` helper, `realRoot`, temp-dir cleanup) plus one suite per area: `scanners`, `chain`, `kb-plan`, `opencode` |

The checks named below are the exceptions, and every other one is a **drift assertion**: it compares a
restated fact against its source. `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, and
`return-to-controller` are **negative** assertions. Each reports a document that still says something,
rather than one that stopped saying it. `eval-shape` and `adr-status` compare a document against a
**schema**. `pinned-paths` and `marketplace-source` are plain **existence** assertions.

The exceptions are named and the rule covers the rest, deliberately. This sentence used to enumerate
every drift assertion by id, and it fell behind at five separate additions, because a list of forty is
maintained by hand at the moment its author is thinking about code. Naming the exceptions cannot drift
when a new check lands.

`drift-check.js` guards sixty-nine things, in the order `drift/checks.js` registers them. First, the
`reference` contract: every `references/*.md` path named in `skills/`, `agents/`, or `references/`
itself resolves to a file that exists. A reference cites another reference, as both execution
playbooks point at `scope-mode.md`, so a rename there dangles like any other. Second, the
`run-root` contract: `skills/implement/SKILL.md`, `skills/review/SKILL.md`, `skills/document/SKILL.md`,
`skills/ship/SKILL.md`, `skills/publish-kb/SKILL.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, `references/run-handoff.md`,
`references/scope-mode.md`, `agents/implementer.md`, `agents/slice-reviewer.md`,
`agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
run-root artifacts by absolute `<run-root>/…` path. Third, the `assignee` contract: every
issue-backend document carries both halves of it, and each is reported apart. One half is the
`**Assignee` config bullet, which is what a backend is actually configured with. The other is the
`## Assignee` section, the store side of the generic contract, which `Assignee` shares with every other
member of the specialising family. The section is found through `specialisingHeading('Assignee')` rather
than a second copy of the pattern, so the family's heading anchoring reaches this check too. Both halves
read fence-masked text, defensively: no store document renders either inside a fenced example today, and
the seeds' habit of showing headings inside fenced examples elsewhere makes one plausible. The filename
alone triggers the check, with no content gate on how the doc phrases issue creation.
`references/issue-tracker-local.md` is exempt from both halves through one set, because it has no
assignee concept and renders neither. Presence is all either half claims; what the section must say for
its backend stays a review's job. Coverage is automatic — `storeDocuments()` picks up a
`references/issue-tracker-*.md` seed added later with no scanner edit — but exemption is not: a backend
with no assignee concept must be added to `ASSIGNEE_EXEMPT` by name, or it reports two gaps on a suite
that was never wrong. The `run-state-contract` check (sixty-sixth, below) resolves the same shape the
other way, exempting no store and letting a snapshot-less backend declare itself snapshot-less inside its
own section instead. Fourth, the
`anchor-contract`: every slice-store document (every `references/issue-tracker-*.md` plus this
repo's own `docs/agents/issue-tracker.md`) carries a `## Scope anchor` section stating all five of
its elements: how to recognise an anchor, list its candidates, list the slices beneath one, tell
that an anchor is itself a slice (ADR 0017), and read an anchor's own dependencies (ADR 0040). Each
element is matched on a bullet's bolded lead-in
(`- **Recognise one.**` style, `-` or `*`, American or British spelling) rather than anywhere in the
section, so intro prose that merely lists the five concepts satisfies none of them. The lead-in
anchoring carries extra weight on the dependency element: two store documents open the section by
noting that a native issue-dependencies unit is disabled, which states no way to read the relation.
Fifth, the
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
isolates the text of one heading's section before either scans its body. Sixth, the
`writing-standard` contract: `references/documentation.md` still offers a `## Writing standard`
section (ADR 0012). Seventh, the `content-types` contract: `references/doc-pass.md` and
`agents/doc-reader.md` each still instruct themselves to read `references/content-types.md` (ADR
0014). The writing side moved off `agents/doc-writer.md` and onto the reference with the rest of the
pass's prose (ADR 0031). Eighth, the `command-resolution` contract: every `/superdev:<name>` reference in `skills/`
or `agents/` resolves to a `skills/<name>/SKILL.md` file, so a chain handoff never points the reader at
a command that does not exist. Ninth, the `chain-handoff` contract: `skills/implement/SKILL.md`,
`skills/review/SKILL.md`, and `skills/document/SKILL.md` each name their successor in the chain.
`skills/ship/SKILL.md` ends the chain and is deliberately outside that check.

The tenth, eleventh, thirteenth, fourteenth, fifteenth, sixteenth, seventeenth, and eighteenth checks
share one scanner, `drift/lib.js`'s `scanContract()`, run over
a table of `[document, pattern, expectation]` rows in `drift/contracts.js` instead of one function each.
It reads every
document a table names and reports the rows whose pattern that document no longer matches. Tenth, the
`feature-label-argument` contract: `skills/implement/SKILL.md` declares an `argument-hint` naming a feature
label and resolves `$ARGUMENTS`, and `skills/plan/SKILL.md` names `/superdev:implement <label>` as its
resolved successor, in a backtick-delimited invocation. That pins the contract only, never the label's
shape (ADR 0019). Eleventh, the
`unattended-token` contract: `references/scope-mode.md`
carries the `## Unattended` section (ADR 0016), and `skills/implement/SKILL.md`, `skills/review/SKILL.md`,
`skills/document/SKILL.md`, `skills/ship/SKILL.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, and `references/run-handoff.md` each name
`--unattended` and carry an instruction to read and apply that section. Twelfth, the `afk-invocation` contract: `skills/afk/SKILL.md`'s stage table invokes all
four chain commands and carries `--unattended` on every one of those rows. `scanAfkInvocations()`
checks this row by row: a
whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
unnoticed. Thirteenth, the `change-type` contract:
`references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
`CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone,
and gone is one of the two conditions that make a scope prunable (ADR 0007). The hook then reaps a
shipped run's root that is still in progress, silently: the Stop hook that runs it reports nothing. The
glossary is the copy most likely to drift, because nothing executes it. Fourteenth, the `degraded-pass`
contract:
`references/scope-mode.md` carries the `## Degraded passes` section, and `skills/implement/SKILL.md`,
`skills/review/SKILL.md`, `skills/document/SKILL.md`, `skills/ship/SKILL.md`, `skills/status/SKILL.md`,
`references/implement-full.md`, `references/implement-lite.md`, and `references/run-handoff.md` each
name the `**Degraded:**` ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
never got, such as a pull request claiming a review that was its author reading their own work. The
section also states that a denied-dispatch bullet quotes the classifier's refusal text, which is what
tells a genuine safety block from one of auto mode's documented false positives (ADR 0039). Fifteenth,
the `derived-criteria` contract: `skills/review/SKILL.md` hands `final-reviewer` the **path**
`<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
`## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
because a prompt arrives at once. DoD text inlined in the dispatch is already read by the time the
instruction asks for a derivation. Losing either half degrades the derivation into theater: references
still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
Sixteenth, the `label-validation` contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `skills/implement/SKILL.md`
and `skills/afk/SKILL.md` each point at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does. A rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. Seventeenth, the
`green-gate-timeout` contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
same 600s ceiling and identifies it as Claude Code's own default for a `command` hook. Green-gate
re-runs the scope suite synchronously inside the hook, so a suite slower than the configured timeout
is killed mid-run and the gate silently does not fire. The explicit entry states the ceiling where the
suite runs and holds it if that platform default ever moves, so the check pins both the value and the
comment's account of it: a comment naming a wrong default sends a consumer whose suite is too slow to
the wrong knob, and the suite stays green until a run happens to exceed the ceiling.
Eighteenth, the `verb-pointer` contract (ADR 0022): every ledger touchpoint in the chain invokes its
`scope.js` verb, as `references/run-init.md` does `init`, `references/run-handoff.md` `stage set merged`,
`unresolved add`, and `unresolved clear`, `skills/review/SKILL.md` `stage set`, `get anchor`, `unresolved add`,
and `unresolved clear`, `skills/document/SKILL.md` `stage set`, `skills/ship/SKILL.md` `get stage`,
`stage set shipped`, `get unresolved` (for the unresolved-defect record its §3 gate and §5 body
read), and `get degraded` (for the degrade record its §5 body reads),
`skills/status/SKILL.md` `status`, `skills/afk/SKILL.md` `get stage`,
`skills/publish-kb/SKILL.md` `get branch` for its merge check, `skills/plan/SKILL.md` `get branch --root` (for
the refusal signal its §0 reads before extending a feature), both execution
playbooks `slice`, `references/scope-mode.md` `degraded add`, `references/implement-lite.md` `docs set`
(the inline-doc-pass record, ADR 0031), `skills/document/SKILL.md` `get docs` (read before it decides whether
to dispatch a `doc-writer`), and `skills/review/SKILL.md` `docs clear` (when its fix loop lands commits). A
document that drops its verb goes
back to hand-editing or hand-parsing the ledger, which the `ledger-guard` hook only catches as a tool
call at runtime, never as prose.
Nineteenth and twentieth, the ADR 0023 knowledge-base contracts, checked in two halves because either
alone passes while the invariant is gone. Nineteenth, the `kb-staging` half: `skills/plan/SKILL.md`,
`skills/document/SKILL.md`, and `references/doc-pass.md` each name `.superdev/kb-pending/` as the place a
remote backend's page goes instead of a live call. The third row moved from `agents/doc-writer.md`
onto the reference with the rest of the pass's prose (ADR 0031). Twentieth, the `kb-no-backend-call`
half, `scanKbNoBackendCall()`: none of those three, nor `agents/doc-writer.md`, carries a
backend-directed verb. The staging-path mention moved off `doc-writer.md`, but the check keeps that
document in this list, because the agent still dispatches the knowledge-base pass, and a regression
could add a backend call to its own framing without touching the reference at all. The verb checked is
publish, create, update, or upsert, in any morphology, so a passive "is published to" or a gerund
"updating the wiki page" counts too. An HTTP `POST`, `PUT`, or `DELETE` counts as well. The verb must
be aimed at a page, wiki, space, or backend object.
`skills/publish-kb/SKILL.md` is exempt, because reaching the backend is its job. The check reads the
instruction's shape rather than a backend's literal endpoint or credential name, because
**Backends are pluggable** already forbids these four documents from naming a backend at all, so a
literal-only marker would catch almost nothing.
Twenty-first, the `no-second-reader` contract (ADR 0022), `scanHookLedgerParsers()` scans every
`hooks/*.js` file for a literal `**…:**`-shaped header regex. This pattern marks whether a hook grows a
ledger-header reader of its own instead of `require`ing `scope.js`'s `readLedgerHeader`. It reads the
pattern's shape rather than running the hooks, because the same drift happened to `scope-prune.js`'s own
copy. A second reader can diverge on anchoring, capture width, newline handling, or markup normalisation
silently, and prose alone would not have caught it.
Twenty-second, the `test-selection-wiring` contract (ADR 0025): `agents/implementer.md`,
`references/implement-lite.md`, `agents/slice-reviewer.md`, and `skills/document/SKILL.md` each still instruct
themselves to read `references/test-selection.md` **and run the command it selects**. The row is anchored
on that clause, not the bare mention, so a document that keeps the path in a passing aside but drops the
run instruction still fails. The fourth consumer is the odd one out: the other three narrow a run inside
the implement loop, before the review's one full-suite run, while `skills/document/SKILL.md` runs after it —
a doc commit lands on the scope branch once the review has already passed, and nothing else re-verifies
it before the pull request, so the documentation step judges just what it changed with the same focused
command, never the full suite (ADR 0025). Twenty-third, the `full-suite` contract (ADR 0025), seven rows. `skills/review/SKILL.md` still
runs the full suite itself, before dispatching `final-reviewer`. It states that a `fail` there is itself
a Critical finding folded into the fix loop. It states that the stage does **not** advance while a
full-suite fail, or a Critical or Important finding, stands. That last clause is the one that blocks a
red scope, distinct from the finding merely being named. `agents/final-reviewer.md` still reviews a live
scope against the result the controller hands it, running no suite of its own, and states that
`Full-suite run: fail` makes the verdict `Ready to merge? No` on its own. Its ad-hoc branch keeps its own
re-run, which is the only verification a range with no controller behind it gets. The `skills/review/SKILL.md`
dispatch row pins that command's own dispatch sentence — the prose that reaches `final-reviewer` at
runtime alongside the agent body — so it hands the result and tells the reviewer to review against it,
running no suite of its own, never that its own re-run "stays optional." That sentence is the live path: a
leak there reopens the duplicate run regardless of what `agents/final-reviewer.md` itself still says. The
`references/run-handoff.md` row covers the other end: its run handoff still runs the scope's one full
suite itself, in place of the review an all-`mechanical` or all-`docs` scope skips. It is the one
full-suite run no other row covers, and the routing check below sends such a scope past `/superdev:review`
on the strength of it. Losing any one row quietly reopens the gap ADR 0025 closed.
Twenty-fourth, the `entries-standing-gate` contract (ADR 0026), `scanShipGateContract()`: `skills/ship/SKILL.md`
§3's own "Entries standing." paragraph asks once whether to ship a standing unresolved defect, and refuses
outright under `--unattended`. §3 also carries an unrelated, pre-existing gate (the warning about a
missing review or document step) using the identical ask-once and refuse-under-`--unattended` phrasing
for a different question. Both halves are therefore matched inside the "Entries standing." paragraph
alone, extracted with the same `extractSection()` helper `scanAnchorContract()` uses, anchored on the
paragraph's bolded lead-in rather than a markdown heading. A whole-file match lets the unrelated gate
satisfy either half after the entries-standing gate's own clause is deleted. A consumer that keeps §5's
`## Unresolved defects` pull-request heading and loses either half still reads right and ships a broken
branch, the exact failure every other contract in this file exists to catch. Twenty-fifth, the `unresolved-glossary` contract
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
Twenty-sixth, the `afk-routing` contract (ADR 0025), three rows: `skills/afk/SKILL.md`'s stage table reads each
slice's `type` off the ledger and routes an all-`mechanical` or all-`docs` scope from `merged` to
`/superdev:document ... --unattended` and from `documented-unreviewed` to `/superdev:ship ...
--unattended`, and `skills/ship/SKILL.md` drops `/superdev:review` from its own missing-step warning for that
same scope. Such a scope skips the whole-scope review by design, because there is no Definition-of-Done
judgment to attach one to. A table that routes it into the review therefore strands the feature: the
review has nothing to judge, and `/superdev:ship --unattended` still refuses a scope whose review never
ran, which no sweep can clear. Each afk.md row also requires `--unattended` past the command name: this
paragraph is prose, not a stage-table row, so `scanAfkInvocations`'s row scan never reaches it, and a row
that drops the token strands an unattended sweep at an interactive question with nothing reported. Both
documents are pinned because either alone reads correct while the pair disagrees, which is how the defect
reached `main` in the first place. Twenty-seventh, the `arg-token` contract: `hooks/merge-guard.js`,
`hooks/green-gate.js`, and `hooks/ledger-guard.js` each carry the canonical `const ARG = …` shell-word
token **verbatim**. The three parse the same shape out of a Bash command line by hand, and nothing links
the copies, so this pins the literal rather than testing mutual equality. A token that narrows in one
hook reopens the quoted-argument bypass there (`git -C "my repo" merge` walking past the guard), and a
deliberate improvement is meant to reach all three files and this pin in one commit. Same shape as the
scope-slug charset assertion in `scripts/scope.js --selftest`.
Twenty-eighth, the `audit-set` contract: `skills/setup/SKILL.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `skills/document/SKILL.md` still reads that
section back with its stated fallback for when it is absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. Three documents agree on the section only in
prose, the same shape as the afk-routing and arg-token pairs above. A renamed heading or a dropped
fallback clause leaves the section unreachable in every repo that carries it, unnoticed, until a doc
audit runs on one and finds nothing there.
Twenty-ninth, the `aggregate-page` contract (ADR 0027), four rows. `references/doc-pass.md` and
`skills/plan/SKILL.md`, the two stagers, each stage `action: patch` carrying one section for an outline
entry marked aggregate. `skills/publish-kb/SKILL.md` applies it by merging through `scripts/kb-patch.js`,
and `references/knowledge-base-confluence.md` documents the `(aggregate)` marker that decides which
pages get one. The `publish-kb` row is anchored on
the **call**, not on the word `patch`: a document that names the action and then merges the page in its
own prose puts a model back in charge of rewriting a reader-facing page, which is exactly what moving the
merge into a script prevented. The marker row is the quietest to lose. Every other document still reads
correct, the doc pass never marks a page, and it stages `upsert` forever, replacing an aggregate
page with the one section a scope can see. That is the state that left this repository's own
`ADR summaries` page four decisions stale.
Thirtieth,
the `read-path` contract (ADR 0027), two rows: `skills/publish-kb/SKILL.md` reads a
`patch`'s live body through the call the config document documents, and splits the outcome into two
branches. **Positive absence**, where the find call does not list the title, creates the page. **Any
other outcome** is a **read failure**, not absence, and must leave the file staged: no documented read,
a transport or authorisation failure, the read itself reporting the page absent for a listed title, or
an empty body for a listed title. The row is anchored on that branch, not on the word "read": a document
that mentions reading the live page and then creates it on *any* missing body passes a keyword search
while destroying a published page on the very failure the branch exists to catch, which is the defect
that reached a whole-scope review before ADR 0027 pinned it. `docs/agents/knowledge-base.md`'s row is
conditional rather than a bare pattern: it documents a call returning the page body only when it marks
some outline entry `(aggregate)`, so a config document that marks none owes no read, and the row is
implemented as a `test()` function rather than a literal `RegExp` to express that. Thirty-first,
the `pinned-paths` contract, `scanPinnedPaths()`: every document a contract table pins still exists.
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
`/superdev:afk` — was already false when it was written: nine plugin documents name the command, and
`skills/implement/SKILL.md` is one of them, so the eighth check (`command-resolution`) already resolves
`/superdev:afk` there and already catches the file's deletion. Three contract tables also pin
`skills/afk/SKILL.md` directly, so the general rule covers it a second way, and the special case went — in
place rather than appended, because appending would have renumbered every ordinal below.
Thirty-second, the `eval-shape` contract: every
`evals/*/graders/*.md` declares a known `type` and a positive `weight`, an `llm` or `regex`
grader also declares a `focus` or `target`, and every case's `scaffold_script` resolves. Nothing
else validates a grader, so without this a typo surfaces part-way through a run that costs real API
spend. Thirty-third, the `adr-status` contract: every `docs/adr/*.md` states a `**Status:**` line
carrying one of `Accepted`,
`Proposed`, `Superseded`, or `Rejected`. An ADR with no status line reads as accepted whether or not
anything implements it, which is how a decision reaches the glossary and the command bodies while the
code has none of it. The value's capitalization is pinned with the set, so one ADR does not sort and
grep apart from the rest. Thirty-fourth, the `append-mode` contract (ADR 0004): every slice-store document
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
its own. Thirty-fifth, the
`status-seed` contract (ADR 0004), two rows against `references/run-init.md`: it carries a `"status"` field
in the JSON its run init pipes into `scope.js init`, and it states that a slice the store reports as merged
seeds `merged` and is never dispatched. Append mode never renumbers or re-merges a slice already shipped,
so a second run over an appended feature must seed each loaded slice's real status rather than defaulting
every row to `todo`, and skip every row already seeded `merged` rather than re-dispatching it. A document
that drops the field, or drops the never-dispatched clause while keeping the field, silently re-dispatches
a merged slice either way, so the two rows fail independently.
Thirty-sixth, the `plan-append` contract (ADR 0004), seven rows: six against
`skills/plan/SKILL.md` and one against `references/plan-contract.md`. Its §0 asks whether the feature is new or extended before the interview begins, and
states that answering "new" makes no store call. It states the store refusal signal (a slice
`in-progress`, `in-review`, or `blocked` elsewhere) as one row. It states the ledger refusal signal's two
clauses as two further independent rows: a run root whose stage is other than `shipped`, and a `shipped`
stage whose scope branch is neither merged into the base nor gone. Losing any one of the three therefore
fails on its own rather than only in aggregate. It states the single-slice epic-promotion clause,
including that the lone slice is left untouched. The last two rows pin ADR 0043's exception to that
byte-identical rule. A promoted lone slice's anchor-dependency line migrates to the new epic. Each row
falls on one of the two documents `scanAppendContract` cannot reach, since neither is a store document:
`references/plan-contract.md`, which states the generic contract every store specialises, and
`skills/plan/SKILL.md`, which performs the promotion. Without them the five store documents would be pinned
around a hole.
Each ledger-signal row is anchored on the refusal condition's own wording, not on the rationale sentence
that explains the branch test a few lines below it, so a document that keeps the rationale but loses the
condition still fails. Thirty-seventh, the `rotate-on-shipped` contract (ADR 0004, ADR 0007):
`references/run-init.md` states that run init reads a present ledger's stage before choosing between
resume and init, that stage `shipped` rotates `ledger.md` to `ledger-shipped-<date>.md` and then runs
`init` again, that every other stage (`implementing`, `merged`, `reviewed`, `documented`,
`documented-unreviewed`) keeps the existing resume path, and that nothing is deleted, so
`scope-prune`'s seven-day post-merge reap still runs on its own terms. A fourth clause states that the
rotation never overwrites an existing `ledger-shipped-<date>.md`, so a scope that ships twice in one
calendar day keeps both trails instead of the second rotation clobbering the first. `scope-prune` keeps
a shipped run root on disk past merge, so a second `/superdev:implement` run over an appended feature
can land while that ledger is still there. A document that goes back to treating any present ledger as
an in-progress resume re-dispatches a finished run instead of beginning the new one. Thirty-eighth, the
`parked-questions` contract (ADR 0004, ADR 0005), two rows against `skills/plan/SKILL.md`. It surfaces an
epic's `## Parked questions` the moment §0 loads it, before the interview diverges into new ground. A
question the interview resolves has its line deleted from that section, with the new slice's `spec`
and `acceptance` standing as the sole record, because `references/domain-modeling.md`'s revise-in-place
rule forbids holding both. Losing either row independently: a document that keeps surfacing questions but
stops deleting a resolved one's line leaves two records of the same decision, and one that stops
surfacing them silently strands a load-bearing decision no later interview ever revisits. Thirty-ninth, the
`run-kind` contract (ADR 0028, ADR 0045), four rows against `references/scope-mode.md`. Its
`## Cutting the scope branch` section specifies the branch step for each of the three run kinds. `fresh`
cuts one from `<base>` and stops, cutting nothing, when a scope-prune reap left a same-named branch
standing. `appended` decides on the same merged-or-gone test `hooks/scope-prune.js` and
`skills/plan/SKILL.md` already run (ADR 0007) rather than a bare `git merge-base --is-ancestor`, which exits
128 on a branch a squash-merging host already deleted. `resumed` runs no ancestor test and cuts nothing.
`fresh` gets two rows because it carries two independent clauses; `appended` and `resumed` get one each.
The rows sit against that one document rather than the two playbooks, which hold a pointer plus their own
tier's command: pinning a pointer's prose goes red on a
reflow while catching no revert. Losing any row independently: a document that stops specifying one
clause leaves that run's branch step to whatever a reader infers, which is the gap three consecutive
review fix cycles kept re-opening. This table used to carry a fifth row, pinning `appended`'s contained-reuse
clause when it split by tier ("the `full` tier switches the invoking checkout … the `lite` tier works in
its existing scope worktree"). ADR 0045 retired both the clause and the row: reuse now means working in
the one scope worktree both tiers share, which the `scope-worktree` check (fifty-ninth, below) pins
instead.
Fortieth, the `forcing-branch-flag` contract (ADR 0028), `scanForcingBranchFlag()`: neither execution
playbook names a forcing branch flag, in any of its spellings.
`git switch -C` and `--force-create`, `git checkout -B`, and `git worktree add … -B` and
`--force-create` all reset an existing branch instead of failing on it. `git switch -C` prints
`Reset branch` and exits 0
while leaving every slice already merged into that branch unreachable from any ref, and the ledger still
records those slices as `merged`, so nothing in the run rebuilds what it lost. Every spelling is pinned,
not just the two the playbooks happen to use, because the flag a hurried edit reaches for is whichever
one it already knows. It is a **negative** check, asserting that a document no longer matches a pattern
where most assert that one still does, which is why it is a scanner rather than a contract-table row.
`return-to-controller` below is the other.
Forty-first, the `source-sections` contract: each canonical reference still carries the sections its readers
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
already pinned this way, by the eleventh and fourteenth checks' heading rows. This check gives the same
treatment to the five sources that never got it.
Forty-second, the return-to-controller contract (ADR 0029), `scanReturnToController()`: neither execution
playbook, nor `references/run-init.md`, nor `references/run-handoff.md` instructs a return to the command
body. The run is one-directional: it opens at run-init.md and ends at run-handoff.md. Nothing guarded that
shape until this check, so a later edit could reintroduce "return to the controller",
"resume at `skills/implement/SKILL.md`", or any of the other verb and target pairings `contracts.js`
enumerates, with the suite staying green throughout. A bare mention of the controller, the command body,
or `/superdev:implement` is legitimate prose on its own. Only a directional verb paired with one of those
targets is a gap.
Forty-third, the `playbook-edges` contract (ADR 0029), four rows: both execution playbooks still name
`references/run-init.md` as their opening step and `references/run-handoff.md` as their closing one. The
return-to-controller check above is the negative half of the run's one-directional shape, an instruction
to go back. This is the positive half, that a playbook still points forward at all. Deleting "read
run-handoff.md as your last step" from a playbook leaves every other check green, because the reference
still resolves and nothing points back to the controller either. The run then ends with no
`scope.js stage set merged` write and, on an all-`mechanical` or all-`docs` scope, with no full-suite run
anywhere in the chain.

Forty-fourth, the `doc-pass` contract (ADR 0031), three rows. `agents/doc-writer.md` and
`references/implement-lite.md` each read `references/doc-pass.md`, the file that states the documentation
pass they perform. The pass has two callers, the dispatched writer and the `lite` execution playbook's
controller working in its own context, so it is stated once and read by both. A caller that drops the
read keeps performing a pass it
no longer holds the rules for, and nothing else notices: `reference` above only resolves paths that are
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

Forty-fifth, the `narrative-coverage` contract, `scanNarrativeCoverage()`: every check registered in
`drift/checks.js` is written up in this file by its backticked `id`, and both documents that count the
checks in prose, this one and the root `AGENTS.md`, state the number the registry holds. The Work
Guidance below already required the write-up. Nothing enforced it, and it was skipped twice, for two
checks whose only account was their own code. The count drifted on the same edits, reading forty-one
against a registry of forty-three. Both halves are prose a maintainer updates by hand at the moment they
are thinking about code, which is exactly when they get forgotten. A check the classification sentence
above names by `id` needs no other write-up. For every other check the write-up is the only
mention, and this is what holds it in place. The check is otherwise deliberately shallow: it pins that
each check is described **somewhere** and that the counts agree, never that a description is accurate or
that the classification sentence files a check under the right kind. Those stay human judgment, and no
check can replace them.

Forty-sixth, the `marketplace-source` check, `scanMarketplaceSource()`: `.claude-plugin/marketplace.json`'s
relative `source` for each plugin resolves to a directory that carries `.claude-plugin/plugin.json`. That
one string is what limits an install to the shipped `plugin/` tree (ADR 0032), and `claude plugin
validate .` accepts a source that names no directory at all. A renamed tree or a fat-fingered path
therefore breaks every install while `bun run test` stays green. An absent manifest is skipped, and an object
source (a remote repo) is out of scope: only a path into this repository can drift against it.

Forty-seventh, the `readme-commands` check, `scanReadmeCommands()`: `README.md` and `skills/` name the
same command set: every `skills/<name>/SKILL.md` is mentioned in the README as `/superdev:<name>`, and
every `/superdev:<name>` the README names has a command file. The README is the user-facing map of the
commands, and nothing else cross-checks it: the eighth check resolves command names in `skills/` and
`agents/` prose only. A command added without a README section, or a README still routing users to a
renamed command, stayed green before this check landed. Either half is skipped when its side is absent, matching
every other scanner's fixture rule.

Forty-eighth, the `audit-set-globs` check, `scanAuditSetGlobs()`: every pattern listed under `## Audit
set` in this repo's own `docs/agents/documentation.md` resolves to at least one file. The twenty-eighth
check pins that the section exists and that `skills/setup/SKILL.md`, `skills/document/SKILL.md`, and the seed
still agree about it. Nothing there expands a pattern. A pattern matching no file is the one drift the
reader cannot see, because `/superdev:document audit` reads zero files for it and reports the same clean
pass as a real audit. That is the state this repo shipped in when the plugin tree moved under `plugin/`
(ADR 0032) and three globs kept their old repo-root prefixes. Patterns are repo-relative by the section's
own rule, so they resolve against the repo root and never through `docPath()`'s `plugin/` fallback. A
plain path is checked for existence and a `*` in the final segment is expanded by reading that directory. An
absent `docs/agents/documentation.md`, or one carrying no such section, is skipped.

Forty-ninth, the `release-contract` check, `scanReleaseContract()`: every slice-store document carries a
`## Release` section, and `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, and `skills/afk/SKILL.md` each name it.
A release is the human agreement that a written plan may be built (`references/plan-contract.md` →
*Release*), and it is expressed differently per backend — a label on Forgejo and GitHub, a label rather
than a status on Jira, and nothing at all on the local-file store, whose plans are released when written.
Both halves fail silently, which is why both are pinned: a store document without the section leaves the
consumers no signal to read, and a consumer that drops the reference builds whatever it is handed, which
is the gate gone with every command still valid prose. The consumer half matches the backticked
`` `## Release` `` rather than the bare word, since "release" recurs in ordinary prose. Absent documents
are skipped, matching every other scanner.

Fiftieth, the `doc-steps-no-suite` check, `scanDocStepsNoSuite()`: `skills/document/SKILL.md`,
`skills/ship/SKILL.md`, `agents/doc-writer.md`, and `agents/final-reviewer.md` name no full-suite run of
their own (ADR 0025). That is narrower than "performs no full-suite run": `skills/document/SKILL.md` reads
`references/test-selection.md` and runs the focused command it selects over its own doc commits, and that
rule falls back to the full command wherever a repository configures no second fenced block — the same
fallback this repository dogfoods for every other focused caller. What this check forbids is a document
*instructing* a full run in its own prose; the fallback producing one at runtime is `test-selection.md`'s
contract, not a gap this check would catch or should. `/superdev:review`'s scope mode owns the scope's one
**review** run, so an instruction named in any of the first three is a second pass over a tree the review
already verified — and on a slow suite that is minutes per scope, spent proving what was just proved.
`agents/final-reviewer.md` joins the list for a
different reason: it already carries the presence row in `full-suite` above stating it reviews against
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
lookbehind for "has"/"have"/"had", up to two more words, then "run" is what lets `skills/ship/SKILL.md`'s "the
run handoff *has* already *run* the full suite" stay silent — the same `(?:\s+\w+){0,2}` gap
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

Fifty-first, the `fix-boundary` contract (ADR 0035), three rows on `skills/review/SKILL.md`. §4's fix loop
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

Fifty-second, the `denial-authorship` contract (ADR 0039), seven rows. Three sit on
`references/scope-mode.md`: the rule names the **verification dispatch**es it governs, keys the unattended
stop on whether the controller authored what the denied pass verifies, and derives the tier from the
ledger's slice rows. The other four sit on `skills/review/SKILL.md`, `skills/document/SKILL.md`,
`skills/implement/SKILL.md`, and `references/implement-full.md`, the documents that dispatch one of those passes. A dispatch is the later,
more specific instruction, so a call site still reading "unattended → block" wins the conflict and the
central rule becomes prose nothing executes — the one-sided pin ADR 0035 names, which is why the call
sites are pinned on the condition itself rather than on a pointer to the section.
`references/run-handoff.md` is deliberately outside the table: its denial case is the full-suite Bash
command, and the only dispatch it makes is an implementer on a red suite, so nothing there can contradict
the rule. This is a shape-based prose guard, and it carries the same ceiling as its siblings: it catches
the phrasings above, not every paraphrase.

Fifty-third, the `denial-cap` check (ADR 0041), the sibling of the one above from the other side. That
rule decides what a *single* denial costs; this one bounds how many an unattended run absorbs. It runs two
scans under one id: `DENIAL_CAP_CONTRACTS`, sixteen rows of presence checks, and `scanDenialCapNumberSilence`,
an absence check over the same four call sites. Three of the sixteen rows sit on
`references/scope-mode.md`: the cap itself (an unattended run blocks on its **second denied verification
dispatch**), the recording verb `degraded add-denial`, and the read `get denials`. Eight more are two rows
each on `skills/review/SKILL.md`, `skills/document/SKILL.md`, `skills/implement/SKILL.md`, and
`references/implement-full.md` — the same four documents the table above pins, because a document that
dispatches a verification pass is exactly one that records its denial. Each carries both halves, and each
half fails on its own: a call site recording with plain `degraded add` writes a bullet the count cannot
see, and one that never reads `get denials` continues inline on every denial. Either leaves the cap stated
centrally and executed nowhere, so the run rides on to Claude Code's own three-denial kill — which
terminates a headless sweep outright, with no `blocked` label, no comment, and a stranded run root. The
presence check on `add-denial` is deliberate where an absence check on `degraded add` would be wrong: the
plain verb stays correct for the other degraded shape, and `references/implement-lite.md` legitimately
uses it for a knowledge-base pass it could not stage. Same shape-based ceiling as its siblings. The last
five rows tie the plain verb to an *authoring* dispatch by name on `skills/review/SKILL.md`,
`skills/document/SKILL.md`, `skills/implement/SKILL.md`, and `references/implement-full.md` (a document that
dispatches both an authoring pass and a verification one has to say which is which, or every denial in
that breath reads as the classifier's, and the plain-verb branch goes dead), plus one narrowing
`references/implement-full.md`'s cap to `slice-reviewer` alone — it alone also dispatches the advisory
`simplicity-reviewer`, outside the closed set of counted verification dispatches. `scanDenialCapNumberSilence`
closes what the presence rows cannot: none of the four call sites may restate the cap's own number,
because a call site that does can drift to a different one — "three or more" — while every presence row
above still matches it. A call site defers to `references/scope-mode.md`'s `## Degraded passes` section by
name instead, so the number lives once.

Fifty-fourth, the `afk-anchor-count` contract (ADR 0040), two elements on `skills/afk/SKILL.md`'s paragraph
introducing `## Scope anchor`: it states that the section carries five things for this backend, and names
reading an anchor's own dependencies as the fifth. ADR 0040 added that fifth element to `plan-contract.md`,
every store document's own section, and this file's own `anchor-contract` write-up above, but nothing
pinned this one paragraph, so it kept reading "four" and naming only the original four — the one-sided-pin
shape root `AGENTS.md`'s prompt-architecture rules name, and the reason `bun run test` stayed green over a
stale contract statement. The two elements are independent: a maintainer could fix the count without
naming the fifth thing, or name it without updating the count. `scanAfkAnchorCount()` isolates the
paragraph itself with `extractParagraph()`, narrower than `anchor-contract`'s section-wide
`extractSection()`, because the same section legitimately restates the anchor dependency again lower down
(the eligibility bullet reads it) — a section-wide match would pass on that restatement alone even after
the intro paragraph itself reverted to "four".

Fifty-fifth, the `publish-run-state` contract (ADR 0042), twenty-one rows. `references/scope-mode.md`
carries the `## Publishing run state` section, stating that publishing follows any ledger write the
snapshot would show — not `stage set` alone — with one exception, a slice-row move, and stating the
criterion for which write cites the section *directly*, in its own "Which sites cite this directly"
paragraph: a write whose own instruction can end the command — a block, a stop, a refusal — before any
later write in the same run reaches a site that already cites the section gets a direct citation at the
write; every other write relies on its defining section's own citation instead, since the run is guaranteed
to reach a citing site regardless of which branch it takes. Four more rows sit on that same file: its
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
sat uncited with the check green throughout. The remaining fifteen rows are the sites that write one of
those ledger lines, each anchored on text unique to its own write wherever its file carries more than one
citation, not merely the repeated section name: six on `skills/review/SKILL.md` (a denied `final-reviewer`
dispatch, a denied full-suite dispatch in its own scope-mode fix loop, the "Declined" stop, the 3-strike-cap
stop, a denied fix-implementer dispatch, and the clean-verdict writes together), three on
`references/run-handoff.md` (a denied full-suite dispatch, the 3-strike red-cap stop, and its own
`stage set merged` write), and two on `skills/document/SKILL.md` (a denied `doc-writer`/`doc-reader` dispatch,
and its own stage write). `references/run-init.md`, `skills/implement/SKILL.md`, and `skills/ship/SKILL.md` carry
exactly one citation each and no other mention of the section, so a bare file-level row stays unambiguous
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

Fifty-sixth, the `adopt-run-state` contract (ADR 0042), the mirror image of the check above: where
publishing writes the ledger onto the anchor, adopting reads it back. Six rows sit on
`references/run-init.md`'s `## Run init` step: that a missing local ledger triggers a check of the scope
anchor for a snapshot to adopt, skipping straight to `init` on a store that declares itself
snapshot-less; that a failed anchor read falls through to `init` too, reported once rather than treated as
a stop; that a `shipped` stage or a section-less anchor is not adopted, also falling through to `init`;
that adopting writes `<run-root>/dod.md` from the anchor body before piping it to `scope.js adopt`, the
ordering ADR 0042 states explicitly; that the adopted slice table gates no re-dispatch on its own, because
the playbook's own Resume reconciliation against `git log` decides that instead; and that the run kind for
an adopted ledger is named `resumed`, beside a ledger already on disk. Three more rows sit on
`references/scope-mode.md`'s `resumed` branch bullet: that a name which does not verify locally is fetched
from the remote `docs/agents/code-management.md` names before the stop, since a fresh clone or a
just-adopted ledger holds no scope branch until that runs; that the post-fetch check re-verifies the
fetch's own remote-tracking ref (`git rev-parse --verify <remote>/<branch>`), never the bare name a second
time — `git fetch <remote> <branch>` only ever populates `refs/remotes/<remote>/<branch>`, never a local
`refs/heads/<branch>`, so a bare re-verify always fails, the Critical defect a fix cycle found and fixed
after two review passes read the wrong-ref sentence as correct; and that the stop itself, once the fetch
finds nothing either, still names the branch it looked for and blocks rather than asks under
`--unattended`.

Fifty-seventh, the `resumed-worktree-trigger` contract (ADR 0042, ADR 0045), one row: `references/scope-mode.md`'s action in
that same `resumed` branch bullet creates or reattaches the scope worktree, at both tiers, whenever it is absent for either
cause — `/superdev:ship` already removed it, or this checkout never held it at all, the case
`adopt-run-state` makes reachable on a fresh clone. A fix cycle found the sentence named only the first
cause, so `references/implement-lite.md`'s Resume step — which works "in the scope worktree"
unconditionally, assuming it exists — had nothing creating that worktree on a fresh clone; `implement-lite.md`
itself needed no change once the bullet it delegates to was broadened, because its own Branch model step
already runs `## Cutting the scope branch` in full before Resume ever reads the worktree. Split into its
own check rather than folded into `adopt-run-state`'s table, because the two answer different questions —
which branch gets fetched, versus which worktree gets created — and no fixture anywhere previously
distinguished "removed by ship" from "never created", so a regression narrowing the sentence back to one
cause would have passed silently.

Fifty-eighth, the `agent-tool-agnostic` contract: no `agents/*.md` names a concrete package-manager or
test-runner command. The test command is `references/test-selection.md`'s to select from the consumer
repo's own configuration, and the shipped briefs execute in consumer repos, so a literal command there
is this repo's toolchain leaking into another repo's dispatch — `bun run test` shipped exactly that way,
as a pipe example in three agent briefs, inviting an agent to pattern-match a maintainer-only command in
a repo that uses another runner. The doc list is the `agents/` directory read at scan time, not a pinned
table, so a new agent is covered the day its file lands. `skills/setup/SKILL.md` and `skills/document/SKILL.md`
name such commands legitimately, as interview and focused-command examples, which is why the scan covers
`agents/` alone.

Fifty-ninth, the `scope-worktree` contract (ADR 0045), twenty-one rows: the `full` tier cuts its scope
branch into the same dedicated scope worktree the `lite` tier uses, `.superdev/scopes/<scope>/worktree`,
and does every merge there — the invoking checkout is never switched, at either tier. Five rows sit on
`references/scope-mode.md`. `## The scope checkout` resolves to that one location for both tiers, states
the `git worktree add .superdev/scopes/<scope>/worktree <branch>` call that recreates an absent one,
states that a `run-lock` refusal met while recreating is this run's own lock rather than a competing
session's and names the remedy (remove and retry) — a fix cycle otherwise found the recreate path
unreachable inside a live run, since the same run's own lock, refreshed by every earlier command in the
chain, is what blocks it — and names a stop, writing nothing, when a different working tree already holds
the branch — the same reuse the retired `run-kind` row above used to describe split by tier. `## The run
lock` states that both tiers write `<run-root>/run.lock`, and only once `## Cutting the scope branch` has
already cut the worktree, or the `run-lock` hook's own guard on `git worktree add` would block the run
making that very call. Six more rows sit on `references/implement-full.md`, the tier ADR 0045 actually
changed: its Branch model states that every later command in the file — every merge — addresses the scope
worktree with `git -C` rather than the invoking checkout, once the cutting/reuse command itself has run
from that checkout the way any `git worktree add` does; its DAG loop's merge step addresses that worktree
with `git -C`; its integration-branch bullet keeps `integration/<scope>` there too, and the
integrate-and-verify slice switches that same worktree, never the invoking checkout, for the final merge;
its Resume step finds the worktree — present, recreated, or a named stop — before reading anything out of
it; its own `## Run lock` section reads scope-mode.md's `## The run lock` — a fix cycle otherwise found
this file with no lock section at all while two other documents still claimed the lock was lite tier only;
and a sixth row states that Resume checks the run lock once the worktree is found already present, naming
the worktree-present/absent qualifier that distinguishes this check from the recreate path's own fresh-lock
reading — a fix cycle otherwise found a second full-tier `/superdev:implement` of a live scope reading no
lock at all in its `resumed`-worktree-already-there path, so the Definition of Done's "refused by name, on
the `full` tier as well as `lite`" went unmet. One more row sits on `references/implement-lite.md`: its
`## Run lock` section reads scope-mode.md's `## The run lock` rather than restating who writes the lock
and when, now that the rule covers both tiers there — the same caller-reads-the-rule shape the `doc-pass`
contract already uses. Two more rows sit on `references/run-init.md` and `references/run-handoff.md`: each
lists `run.lock` with no `lite tier only`/`(lite tier)` qualifier, since a qualifier is the later, more
specific instruction and silences scope-mode.md's shared rule for the full tier. Three more rows sit on
`skills/review/SKILL.md` — a fix cycle found this chain-tail command naming no working directory anywhere, so
its §4 tested the controller's own invoking checkout against `<type>/<scope>` instead of the scope
checkout, ran the full suite nowhere in particular, and could hand a fix-cycle implementer no working
directory at all, landing commits on the base branch in the operator's own clone. The rows pin its
scope-checkout branch test, its full-suite run in the scope checkout, and its fix-implementer dispatch
handing over the scope checkout as a working directory — the same working-directory statement
`implement-full.md` and `document.md` already carry. Two more rows sit on `references/run-handoff.md` for
the same class of gap on its own only full-suite run: a scope of all `mechanical`/`docs` slices reaches no
other verification before `/superdev:ship`, so its full-suite run and its Red-branch fix dispatch each
naming no working directory reached the invoking checkout on the full tier — sitting on the base branch by
then — reading `docs/agents/verification.md` off base, running the suite over base's tree, and landing any
fix commit on base in the operator's own clone; the rows pin the full suite running in the scope checkout
and the fix implementer taking that same checkout as its working directory. The last row sits on
`references/merge-conflicts.md`: its winner-picking-overlap abort names the scope worktree with `git -C`,
not a bare `git merge --abort` — this file is read after `implement-full.md` delegates the whole
conflict-resolution step to it, so its own unqualified abort used to win the conflict, exiting 128 in the
invoking checkout and leaving the scope worktree sitting on `MERGE_HEAD`, which `hooks/green-gate.js`'s
`mergeInProgress()` then reads as a deferral that gates nothing. The last row sits on `skills/afk/SKILL.md`'s
eligibility bullet: the no-lock case falls back to the ledger mtime, with no claim that a full run never
gets a lock — a fix cycle found the bullet still asserting a run lock "only ever exists for a `lite`-tier
scope" and citing `## The run lock` for that claim, a section ADR 0045 had already flipped to state the
opposite. Losing any one row independently reopens exactly the cost ADR 0045 removed: a full run parking
a second session's checkout on its own branch, a merge landing in a tree `/superdev:ship` never expects, a
restated lock rule drifting from the shared one, a full run that writes no lock at all, a second full-tier
run never meeting its own fresh-lock refusal, a whole-scope review or run-handoff full-suite pass that
writes to the wrong checkout, a merge abort that silently ungates the next merge in the scope worktree, or
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
incomplete" leaves the reader searching twenty-one rows. This covers every table any suite scans, with no
per-table call and no hand-typed document list to fall out of sync with the fixtures — including a table
like `FULL_SUITE_CONTRACTS` whose fixtures are legitimately split across many small calls, since the
recorded set just accumulates across the run instead of needing one fixture to carry every document at once.

Sixtieth, the `denial-reset` contract (ADR 0044), four rows, all on `references/scope-mode.md`: the cap
the fifty-third check pins has a way back, and it is only reachable where two of that file's sections
state it.
Three rows sit on `## Degraded passes` — the reset command with its required reason
(`degraded reset-denials '<reason>'`), what it does to the count and to the record (the count runs from
the last reset marker, so every recorded denial survives), and that a reset is a human act no command in
the chain performs. The fourth sits on `## Unattended`'s block procedure, which names the reset command in
the comment a capped run leaves on the anchor. The two halves fail independently and for different
reasons. A section that drops the reset leaves the cap append-only, which is the state ADR 0044 amends:
the maintainer adds the denied dispatch to `permissions.allow`, resumes, and the resumed run reads the
same bullets and blocks on the next denial from any cause. A block that stops naming the command leaves
the reset stated in a document nobody reaching that block is reading — the quoted refusal is in the
comment, and the way back is a section away. The fourth row's pattern spans from `comment on the anchor`
to `reset-denials`, so it matches inside the block procedure rather than anywhere the file happens to say
both words.

Sixty-first, the `triage-record` contract (ADR 0046): a scanner plus two rows. `scanTriageRecordContract`
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
document's exclusion rule as its listing contract. Two more rows, a table
run through `scanContract()`, sit on `skills/review/SKILL.md` and `references/scope-mode.md`, the two
documents that write it. The record is what makes a deferred finding outlive the run root
`hooks/scope-prune.js` reaps and the scope anchor `/superdev:ship` closes — on the local plan-file
store, only once the scope branch carrying it merges (ADR 0048) — and before this record the only
survivor was the body of a merged pull request, which appears in no backlog and no query.
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

Sixty-second, the `specialising-citations` contract: every store document cites the generic contract each
section it carries specialises. `scanSpecialisingCitations` (`scripts/drift/scanners.js`) walks the same
`storeDocuments()` candidate list the six presence contracts above walk, and for each member of the
**specialising family** reports a section that no longer names `` `plan-contract.md` → *<section>* ``
anywhere inside itself.

**`SPECIALISING_SECTIONS` is the family's one membership list**, and three sides follow from it with no
second edit: the generic-side row in `SOURCE_SECTION_CONTRACTS` (built by `specialisingGenericRows()`),
this citation assertion, and the heading each is found by (`specialisingHeading()`). The store-side
presence contract is the one side that stays per-section, because each has its own elements to assert.
The list holds six names: `Scope anchor`, `Release`, `Run state`, `Append mode`, `Triage record`, and
`Assignee`.

**The membership rule:** a section is a member when `plan-contract.md` states its generic contract **and
at least one store document renders it as its own section**. `Assignee` passes — four of the five store
documents carry a `## Assignee` section and all four cite it — and was the cost of the two lists this
one replaced. Its store side was pinned by `scanAssigneeContract` while nothing pinned its generic side
and nothing pinned those four citations, because the rows were written out by hand beside the list rather
than derived from it. Root `AGENTS.md`'s reference table names one more: it includes `## Feature label`,
which fails the rule's second half. That table describes what `plan-contract.md` owns rather than what
this list checks, and stays prose.

`Feature label` keeps a hand-written row instead of joining the list, beside `Fields`,
`Slice lifecycle & status` and `Epic visuals` — the four sections cited by name that no store renders as a
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
clean here, which is what the six store-side contracts above exist to catch. `scanAnchorContract`,
`scanAppendContract`, `scanReleaseContract`, `scanTriageRecordContract`, and `scanRunStateContract` each
pin a member's own `## <Section>` heading, and none exempts a store by name. `scanAssigneeContract` pins
two halves: the `- **Assignee:**` configuration bullet, which is what a backend is actually configured
with, and the `## Assignee` heading through `specialisingHeading('Assignee')`. It is the one that exempts
a store by name, the local-file store, which has no assignee concept and renders neither half.

One notation is pinned, not an alternation. Accepting `` `plan-contract.md`, *Section* `` beside the arrow
would make both forms true forever and leave a new seed's author guessing which to copy, so every
comma-form citation this repo's own `docs/agents/issue-tracker.md` carried was normalised to the arrow
instead of widened into the pattern. Its `## Assignee` section is held to the same one notation, as a
member of the family like any other.

Sixty-third, the `glossary-specialising-citations` contract: every `CONTEXT.md` glossary entry cites the
generic contract the member it names specialises — the same citation the check above already pins on the
store side. `scanGlossarySpecialisingCitations` reads `CONTEXT.md` alone and, for each member of the
**specialising family** that `GLOSSARY_ENTRY_TITLES` maps to a glossary entry, reports an entry that no
longer names `` `plan-contract.md` → *<section>* `` anywhere inside itself, on the fence-masked entry text,
matching the check above's own fence rule. `Append mode` has no glossary entry and is mapped to `null` in
`GLOSSARY_ENTRY_TITLES` — an explicit, deliberate absence — so it costs nothing, the same permissive skip
a store document that carries no matching section already gets; the `scanGlossarySpecialisingCitations`
selftest confirms `Object.keys(GLOSSARY_ENTRY_TITLES)` matches `SPECIALISING_SECTIONS` exactly (see the
assertion in `scripts/drift/selftest/scanners.test.js`). `Run state`'s entry is titled **Published snapshot**, the one name the map translates.
`extractParagraph()` finds the entry from its bold term to the next blank line, narrower than
`extractSection()`'s heading-to-heading span, because a glossary entry is a paragraph, not a section.

Sixty-fourth, the `backlog-survey` contract (ADR 0049): four rows on `skills/backlog/SKILL.md`, the read-only
survey that reports every open scope anchor, every triage record, and every stranded run root by the
action it needs. Two rows pin
the coupling that matters — the command names `` `## Scope anchor` `` and `` `## Triage record` ``, so the
candidate listing and the triage listing both resolve through whichever `docs/agents/issue-tracker.md` is
active rather than through a query written into the command. A third pins `scope.js get stage`, the same
ledger read `/superdev:status` reports from, so the two commands agree about a scope by construction
instead of by coincidence; a stage derived from git state disagrees with no error anywhere. The fourth
pins the read-only clause, anchored on a bolded run that opens its own line rather than the bare words.
A fix cycle found the prior anchor spanning newlines between two unrelated bold runs and matching a
document that asserted the opposite. That opposite assertion was: "it mostly writes nothing, though a
label update is fine". Unbolded hedging prose sat unmatched in between. "Writes nothing" is exactly the phrase that recurs in passing
prose about some other command, and a passing mention is not the contract.

Each of the four fails silently on its own, which is why they are pinned rather than reviewed. A survey
that has quietly started writing looks identical in its own output. One that has learned a backend's own
query works perfectly on this repo and reports an empty backlog on every other. One reading the wrong
stage contradicts `/superdev:status` about the same run with both commands exiting zero.

**Nothing here pins `skills/backlog/SKILL.md` against `skills/afk/SKILL.md`, deliberately.** Both read the same
store over the same anchors, which is the shape this file's other rows exist to bind — but ADR 0049
records that the two share their *facts* and not their *verdicts*: `/superdev:afk` acts unattended and
resolves every ambiguity toward deferring, while the survey reports and resolves one toward showing the
row. A row binding the two rule sets would assert a sameness that was decided against.

Sixty-fifth, the `opencode-render` check, `scanOpencodeFixtures()`: the committed golden render under
`scripts/drift/fixtures/opencode/` still matches a fresh render of the shipped plugin tree. The scanner
renders through `drift/opencode-fixtures.js`'s `renderNormalized()` — the same function
`bun run render-fixtures` regenerates the fixtures with, so the check and the regeneration can never
drift on the model map or the `<plugin-root>` normalisation — into a temp dir, and diffs the two trees
file by file: a fixture with no fresh render, a rendered file the fixtures do not carry, and a file
whose content no longer matches are each one gap, named by path. Without it, a skills, agents, or
hook-bridge edit that changes the OpenCode render — a renamed skill, a new `tools:` entry, a
`/superdev:` token in new prose, a changed event-map constant — ships while the fixtures a
consumer's render is judged against quietly describe the old tree.
The adapter module is required from the real plugin tree rather than from the scanned root, so a
fixture root in the selftest carries only the plugin's skills and agents plus the fixture tree, and
either side absent skips the check, matching every other scanner's fixture rule.

Sixty-sixth, the `run-state-contract` check, `scanRunStateContract()`: every store document carries its
own `## Run state` section (`plan-contract.md` → *Run state*, ADR 0042). It walks the same
`storeDocuments()` candidate list the anchor, append, release and triage-record contracts walk, so a
backend seed added later and this repo's own dogfooded `docs/agents/issue-tracker.md` are both covered
without either being named. Without it, deleting a whole `## Run state` section from a store document
leaves the suite green — the citation check reads a section that is present, and `extractSection()`
returning `null` is the same branch that correctly skips a store rendering none. All six specialising
sections carry a store-side presence contract this way. `Assignee`'s lives inside
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
already took, so changing the anchoring in one place can never diverge from any of them. Three of the
other four store-side presence contracts (`scanAnchorContract`, `scanAppendContract`,
`scanTriageRecordContract`) still anchor their own pattern to end-of-line. Each also feeds
`extractSection()` for element checks a word boundary would not serve.
`scanReleaseContract` anchors the same way, but tests raw text for presence alone: `RELEASE_PATTERN`
carries no elements to extract.

The presence of a section is all this check claims. What that section must *say* for its backend — which
call writes the snapshot, which reads it, that the section is machine-owned — stays a review's job, the
same ceiling the release contract carries.

Sixty-seventh, the `untriaged-item` check, `scanUntriagedContract()`: every store document carries a
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

**Beside the sixty-nine checks, one selftest with no ordinal of its own** (`scripts/drift/selftest/scanners.test.js`,
right after its `scanGlossarySpecialisingCitations` suite): store-side presence coverage for the whole
specialising family. Each of the six members has its own store-side scanner, pinned in this file wherever
that check's own ordinal sits — `anchor-contract`, `append-mode`, `release-contract`, `triage-record`, and
`run-state-contract` above, `assignee-contract` back at the third check — and that per-member shape is
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

Sixty-eighth, the `tier-skip` contract (ADR 0037), three rows. Two sit one per end of a dependency between
two documents. `skills/review/SKILL.md` skips `superdev:simplicity-reviewer` on a `full`-tier scope, and that
skip is sound only because `references/implement-full.md` dispatches the same reviewer per `behavior`
slice and applies its cuts before each slice merges — a `mechanical`/`docs` slice gets no per-slice pass
either way, and the skip's own report line says so rather than claiming blanket coverage. Pinning
`review/SKILL.md` alone would be a one-sided pin in the
direction that matters least: a `review/SKILL.md` that loses the skip costs one redundant pass. The costly
direction is the other one, so the second row sits on `implement-full.md`'s per-slice dispatch — remove it
and a `full` run has no over-engineering pass anywhere, while `review/SKILL.md` goes on skipping on the
strength of a pass that no longer happens, every check green and the coverage gone. The `lite` tier needs
no row: it dispatches nobody, so its whole-scope pass has nothing to be redundant against, and the
`review/SKILL.md` row names the tier it fires on rather than the tiers it does not. The third row pins the
`behavior` qualifier itself, anchored to the bullet that states the skip rather than to any occurrence of
the phrase in the document: the prose already drifted once, to an unqualified "covered per slice", and a
whole-document presence test would have stayed green as long as a copy of the qualified phrase survived
anywhere else in the file — an assessment-template example, say — which is exactly the shape the drift
took. This is a presence table, so a paraphrase it does not recognise fails loudly rather than silently,
and it carries no ceiling note for the same reason its sibling presence tables carry none.

Sixty-ninth, the `scaffold-ledger` check, three assertions. An eval case that exercises scope mode has to
hand its arms a run root, and a scaffold script is plain shell with no access to the plugin, so it writes
the ledger by hand against a schema `scope.js` owns. Nothing else couples the two. The failure this
catches is quiet: `scope.js` moves, the scaffold keeps writing the old shape, no command recognises the
run root, and the case stops entering scope mode — while still running, still scoring, and still returning
a number that reads like a result, because the arms simply review an ordinary branch instead. The check
runs `scope.js`'s **own** `readLedgerHeader` over the scaffold text rather than a pattern of its own: the
heredoc lines sit in the file verbatim, so the reader finds them where it would find them in a real
ledger, and what is pinned is the reader itself instead of a copy of what the reader accepts today. Its
third assertion is unrelated to the ledger schema: a scaffold that ends by returning to the base branch
(`git checkout`/`switch main`/`master`) strands the scope branch's own setup commits outside `HEAD`, which
fails every arm's diff capture and scores nothing while spending a full run. It fires only on a scaffold
naming `.superdev/scopes/`, so the plan and implement cases are untouched. This is a shape-based guard,
and its ceiling is written beside the code: the three headers, the column row, and the branch-return
guard's own literal shape. A scaffold that writes a well-formed ledger, stays on its own branch, and then
corrupts either in a later command passes here and fails at run time.

The first and seventh checks are opposites. The first catches a reference to a file that does not exist.
The seventh catches an agent that drops its wire to a file which still exists. That drift leaves the
reference resolvable and the suite green, and the lens then does nothing in any dispatch.

The first and eighth checks are the same check at two levels: one resolves a `references/` path, the
other a command name. The eighth and ninth are opposites in the same way as the first and seventh: the
eighth catches a handoff that points at a command with no file, the ninth a command that names no
successor at all.

## Work Guidance

- Scripts are CommonJS, like the hooks. `hooks/scope-prune.js` and `hooks/worktree-sweep.js` both
  `require` `scope.js`, so `scope.js` must stay `require`-able under plain `node`. These are the only
  two dependencies `hooks/` has on `scripts/`.
  `scope.js` in turn `require`s `kb-patch.js` for `maskFencedLines`, so `kb-patch.js` must stay
  `require`-able under plain `node` too — the one dependency inside `plugin/scripts/` itself. `adopt`'s
  payload boundary is a pair of markers, not a heading, but a marker can still be shown inside a fenced
  illustrative example, so the marker scan needs the same fence-masking `kb-patch.js`'s
  `extractSection()` already owns.
- Every script ships a `--selftest`, same convention as the hooks.
- A **shape-based prose guard that asserts an absence states its ceiling beside itself.** A pattern over
  English catches the phrasings it names and not every paraphrase, and on an absence check — the document
  must *not* say X — a missed paraphrase is a **silent pass**: the check reads the reworded instruction as
  gone and stays green while it is still there. Write the ceiling down next to the patterns for one of
  these — a `ponytail:` comment naming it is the house idiom — or every reviewer who finds one more
  evadable phrasing reports a defect, and the guard grows by discovery instead of by decision. The
  convention governs seven checks of this shape, and all seven carry their note: `doc-steps-no-suite`,
  `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, `return-to-controller`,
  `afk-selection-neutrality`, and `agent-tool-agnostic`. An eighth of this shape adds its own. `no-second-reader`'s reads differently
  from the rest on purpose: its gap is closed by an orphan test in `hooks/scope-prune.js --selftest`
  rather than left open, and the note says so instead of claiming a ceiling it does not have. A **presence table** — the document must say X, one row per
  `[document, pattern, expectation]` — needs no such note: a paraphrase it doesn't recognize fails
  *loudly*, the row goes red until the pattern catches up, so the presence tables in `drift/contracts.js`
  (`FIX_BOUNDARY_CONTRACTS` among them) carry none.
- A new drift-check contract is one entry appended at the end of the `drift/checks.js` registry, plus
  its section in the sixty-nine-check narrative above and its selftest in the matching
  `drift/selftest/*.test.js` suite. Append rather than insert unless the check belongs earlier for a
  reason, because every ordinal after an insertion point has to be rewritten by hand. The forty-fifth check,
  `narrative-coverage`, enforces two pieces of this by itself: the new id must appear backticked
  somewhere in this file, and this file's and the root `AGENTS.md`'s check-count prose must both state
  the new total. It does not enforce the selftest, or that the write-up is accurate or files the check
  under the right kind. Those stay a review's job.

## Verification

`bun run test` (repo root) runs every script's `--selftest` under `node`, which matches the
production runtime.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
