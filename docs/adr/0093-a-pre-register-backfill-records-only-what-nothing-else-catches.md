# 0093: A pre-register backfill records only what nothing else catches

**Status:** Accepted

**Amends:** [ADR 0077](0077-invariants-live-in-one-central-register.md), which rejected a script that
parses the register. This record adds a script that validates the register and selects nothing, and it
fills the gap 0077's Consequences named: a repository that used superdev before the register existed.

**Context.** The invariant register arrived in superdev 0.48.0. A repository superdev drove before that
release holds its standing rules in `docs/adr/` and `CONTEXT.md`, and its register is empty or partial.
`/superdev:plan`'s register judgment and `final-reviewer`'s register read then pass for most of the
system, because no entry exists for them to match.

A harvest of this repository read every accepted ADR and every glossary entry. It found 134 candidate
rules. At about 750 bytes an entry, registering all of them adds about 100 KB, which `/superdev:plan` and
`final-reviewer` read whole on every run. ADR 0077 rejected a parser because "a register carries tens of
entries".

The register's own format also drifted with nothing to catch it. Six `Concepts` values in the existing
entries named no `CONTEXT.md` heading.

**Decision.**

- **The migration bar.** A backfill of a repository that predates the register records a harvested rule
  only when an existing test or drift row leaves at least part of it unpinned. A rule that a check
  catches in full gets no entry. A revision of an existing entry whose new content a check already pins
  in full is dropped in the same way. The bar is a judgment per candidate on coverage, and a phrase in
  the candidate's text never decides it.
- **The bar applies to a backfill only.** `/superdev:plan`'s normal conversion stays as
  `references/domain-modeling.md` states it (ADR 0081, INV-0002): a new rule that a check covers still
  becomes an entry naming that check.
- **Sorting a rule about superdev's own prose.** In this repository, a rule that the shipped prose
  imposes on the agents superdev runs is a system rule, because that behaviour is the product. A rule
  about how maintainers write superdev's own prose is an authoring rule and gets no entry.
- **A register validator.** `scripts/invariant-check.js` is a maintainer-only CLI. It takes the
  repository root as an argument, and `bun run test` runs it against this repository. It fails on a
  malformed entry, a `Concepts` value that no `CONTEXT.md` glossary term defines, and a `Paths`,
  `Symbols` or `Check:` path that resolves to nothing. It checks format and resolution only. It
  filters and ranks nothing, so `/superdev:plan` and `final-reviewer` still read the register whole,
  and their judgment stays the only matcher.
- **The backfill of other repositories** runs from a prompt the maintainer keeps outside this
  repository, and this CLI validates the result. Nothing ships for it.

**Why.** A check that already catches a rule stops a plan that breaks it at the green gate. The register
adds its unique value where nothing else looks. Registering only that set keeps the whole-read premise of
ADR 0077 true without a filter, and a filter was rejected there for a reason that still holds: an entry it
misses is seen by nobody, including `final-reviewer`.

The validator exists because the register is a list of rules that break silently. Its own format rules
broke silently too, as the six unresolved `Concepts` values show. The costs 0077 named — a parser, a test
suite, and a format that becomes a pinned contract — are the point here: the format is what the
validator pins. 0077's actual rejection, a script that matches entries mechanically, still stands.

The validator is a development CLI, because the only operator of the backfill is the maintainer, who has
this repository checked out. Moving it into `plugin/scripts/` is a small change if other operators need
it.

**Considered options.**

- *A shipped harvest skill, temporary or permanent.* One operator runs the backfill once in each of a
  small, known set of repositories. A prompt gives the same result without shipped prose, drift rows, or a
  removal later. General brownfield adoption, for repositories that never ran superdev, stays deferred as
  ADR 0077 left it.
- *A harvest inside `/superdev:plan`, limited to what a feature touches.* The rich sources already exist
  in each repository, and a local harvest never covers the areas no feature touches.
- *A mode of `/superdev:document`'s bootstrap.* Bootstrap runs only when the root `AGENTS.md` is absent,
  and every target repository has one.
- *Registering every harvested rule.* It breaks the whole-read premise of ADR 0077.
- *The migration bar as a general register rule.* It amends ADR 0081, removes existing entries that name
  a check, and takes early sight of pinned rules away from every plan.
- *A validator that filters entries by `Concepts`, or builds an index to read instead.* A missed entry is
  never seen, and a `final-reviewer` using the same filter fails the same way. An index is deferred, not
  rejected: it is the next step if a register outgrows a whole read after the bar.
- *A bar of "a plausible future change could break this".* An external grader scored all 134 candidates
  between 0.73 and 0.86 on it. For an invariant the question is close to tautological.
- *Applying the bar by phrase.* A filter that kept a candidate only when its text said `Check: none` or
  "partial Check" excluded 14 candidates whose text described an unpinned half in other words.
- *A published CLI.* It adds the shipped-executable rules for an operator population of one.
- *A validator run by the doc pass.* The doc pass reports a stale `Paths` or `Symbols` value and never
  gates on it, and a development CLI is not available to a consuming repository's doc pass.

**Consequences.** Register coverage of a rule depends on when it was written. A rule from before 0.48.0
that a check catches in full has no entry, so `final-reviewer`'s register read does not flag a plan that
breaks it. Only that rule's own test or drift row catches the break.

One harvested rule has no entry because the shipped prose does not state it: "the implementer never
writes or loosens the criteria it is judged by" (ADR 0002). `plugin/agents/implementer.md` holds no such
clause. An entry would claim a rule the system does not hold (ADR 0087).

The entry for the validator's own rule lands in the slice that ships the validator, because an entry
states a rule the system holds now.

**Excluded by the migration bar.** Each harvested rule below is caught in full by the check named, and has
no register entry for that reason.

- The invoking checkout is never switched. Caught by: `scripts/drift-check.js` `scopetree`
- A fresh run lock blocks a second scopetree for that scope. Caught by: `tests/run-lock.test.js` (worktree add on the scopetree path, a stale lock allows, a fresh lock blocks, a non-scopetree path allowed, `worktree remove` allowed); `scripts/drift-check.js` `scopetree` (the rows stating the lock is written at both tiers)
- A merged slice is immutable, except the anchor-dependency migration. Caught by: `scripts/drift-check.js` `append-mode` (the never-edit, epic-first, sanctioned-edit and migration clauses) and `plan-append` (the "migrates to the new epic" rows)
- Run init seeds each slice from the store's real status. Caught by: `scripts/drift-check.js` `status-seed`
- `/superdev:plan` never infers the feature to extend [D1]. Caught by: `scripts/drift-check.js` `plan-append` (the new-versus-extend row)
- Revision of INV-0004: the append refusal window. Caught by: `scripts/drift-check.js` `plan-append` (both store refusal signals)
- The prune removes a run root only when every gate holds. Caught by: `tests/scope-prune.test.js` (the merged-and-stale and merged-and-fresh cases, a `reviewed` stage not pruned, the counted-call ordering test, `#reap-both-refs`, `#reap-needs-a-ledger-named-branch`, `#reap-failure-keeps-the-run-root`, `#no-fetch-on-any-path`)
- Each chain command names the next. Caught by: `scripts/drift-check.js` `chain-handoff`
- The stage never encodes degradation. Caught by: `tests/scope.test.js` (`stage set` refuses an unknown value); `scripts/drift-check.js` `degraded-pass`
- final-reviewer derives its criteria before it reads the DoD. Caught by: `scripts/drift-check.js` `derived-criteria`
- One change-type set, owned by scope-mode.md. Caught by: `scripts/drift-check.js` `change-type`
- The prune's fallback recognises only a `<type>/<slug>` branch. Caught by: `tests/scope-prune.test.js` (`shapeScanBranch` returns null for `wip/exports` and `slice/exports/03`)
- `scope.js` is the only ledger write path. Caught by: `tests/ledger-guard.test.js` (Edit, Write, Bash redirect and append, and `apply_patch` cases); `scripts/drift-check.js` `verb-pointer`
- There is one ledger-header reader. Caught by: `scripts/drift-check.js` `no-second-reader`; `tests/scope-prune.test.js` and `tests/slicetree-sweep.test.js` `#reader-unavailable`
- The stage only moves forward. Caught by: `tests/scope.test.js` ("backwards move refused", unknown value refused, "implementing → planned refused")
- Header normalisation depends on the value's kind. Caught by: `tests/scope.test.js` ("Anchor keeps its internal colon and its trailing period")
- Only `/superdev:publish-kb` reaches a remote knowledge base. Caught by: `scripts/drift-check.js` `kb-no-backend-call`, `kb-staging`, `publish-kb-invocation`
- A staged page leaves staging only once its call lands. Caught by: `tests/publish-kb.test.js` (find, launch and read failures each leave the page staged)
- The scope review owns the full-suite runs, entering and leaving. Caught by: `scripts/drift-check.js` `full-suite`
- Ship and the doc step run no full suite. Caught by: `scripts/drift-check.js` `doc-steps-no-suite`
- Every run inside the loop is focused. Caught by: `scripts/drift-check.js` `test-selection-wiring`; `tests/green-gate.test.js`
- An empty changed-path set never runs `{paths}` over nothing. Caught by: `tests/green-gate.test.js` ("empty changed-path set falls back to the full command", "empty changed-path set keeps a {paths}-less focused command"); `scripts/drift-check.js` `paths-derivation`
- Setup derives `{paths}` only for a runner that maps sources to tests. Caught by: `scripts/drift-check.js` `paths-derivation`, `unmapped-paths-form`
- A mechanical-only or docs-only scope gets its full suite at handoff. Caught by: `scripts/drift-check.js` `full-suite` (the run-handoff row) and `afk-routing`
- An unresolved defect is its own record, written only on give-up. Caught by: `scripts/drift-check.js` `unresolved-glossary` and `verb-pointer` (the `unresolved add` and `unresolved clear` rows); `tests/scope.test.js` (unresolved add and clear)
- Ship gates on a standing unresolved defect. Caught by: `scripts/drift-check.js` `entries-standing-gate`
- An older ledger still parses. Caught by: `tests/scope.test.js` (a pre-CLI ledger with no Branch, Anchor, Degraded or Unresolved lines parses unchanged)
- Only positive absence creates a page. Caught by: `tests/publish-kb.test.js` ("exit 3 is the only absence outcome; any other nonzero leaves the page staged"; the upsert and patch create-on-exit-3 cases; the not-JSON and array cases)
- An aggregate page is patched by section, idempotently. Caught by: `tests/kb-patch.test.js` ("a second identical merge is a no-op, byte for byte"); `scripts/drift-check.js` `aggregate-page`
- No forcing branch flag; `reset --hard` only on proven containment. Caught by: `scripts/drift-check.js` `forcing-branch-flag` and `run-kind`
- Control never returns from a playbook. Caught by: `scripts/drift-check.js` `return-to-controller` and `playbook-edges`
- The green gate defers only on an `integration/` branch. Caught by: `tests/green-gate.test.js` ("a merge on an integration/* branch is deferred, suite not run"; "the integrate-and-verify merge into the scope branch is gated")
- A review fix changes how, never what. Caught by: `scripts/drift-check.js` `fix-boundary`; `verb-pointer` (`deferred add` in review, `get deferred` in ship)
- A denied verification blocks only where the controller authored the work. Caught by: `scripts/drift-check.js` `denial-authorship` and `degraded-pass`
- An unattended run blocks on its second denial; a reset keeps the record. Caught by: `tests/scope.test.js` (the count, a marker returning the budget, counting from the later marker, `degraded add` refusing both prefixes, reset-denials refusing an empty reason); `scripts/drift-check.js` `denial-cap` and `denial-reset`
- Adopt reads only between the run-state markers. Caught by: `tests/scope.test.js` (byte-for-byte round-trips, headings inside the payload, missing, reversed and duplicate markers, "adopt with a shipped snapshot refused"); `scripts/drift-check.js` `adopt-run-state`
- Review creates the triage record at the moment it defers. Caught by: `scripts/drift-check.js` `triage-record`
- Nothing automated selects a triage record. Caught by: `scripts/drift-check.js` `triage-record` (every store document's `## Triage record` section carries the candidate-listing exclusion)
- The green gate verifies the merge's own working tree. Caught by: `tests/green-gate.test.js` (the `resolveMergeCwd` cases: `-C`, relative `-C`, quoted and escaped paths, `--work-tree` forms, `merge -C` after the verb ignored)
- Every render is derived reproducibly from one canonical source. Caught by: `scripts/drift-check.js` `opencode-render`, `codex-render`
- A rendered agent's effective tool access equals its canonical allowlist. Caught by: `tests/adapter.test.js` (the `tools:` map assertions; `sandbox_mode` read-only and workspace-write)
- A harness-mechanics surface is synthesized, never copied from a Claude-only body. Caught by: `tests/adapter.test.js` (the upgrade render "carries no Claude-Code-only command"; afk carries none of Claude Code's own Skill-tool sentence)
- Revision of INV-0003: one test, refetch before not-contained, bounded by commit count. Caught by: `scripts/drift-check.js` `containment-delegation`, `containment-refetch` and `containment-probe`; `tests/scope-prune.test.js` `#no-fetch-on-any-path`
- Every OpenCode agent render keeps the `.env` read guard. Caught by: `tests/adapter.test.js` ("the .env read guard is restored after the tools: map")
- A re-render touches only files the adapter wrote. Caught by: `tests/adapter.test.js` (consumer and foreign files survive; a foreign `.codex/hooks.json` refuses and stays byte-identical)
- Every Codex agent pins a concrete model. Caught by: `tests/adapter.test.js` ("model is the mapped provider model, never the Claude alias"; the refusal "writes nothing under .codex")
- A payload with no subagent identity is gated as the controller's. Caught by: `tests/green-gate.test.js` ("subagent ignored" for an `agent_id` payload; the no-`agent_id` red-suite cases block)
- A misaligned render is refused, never overlaid. Caught by: `scripts/drift/selftest/opencode.test.js` (the alignment-refusal case, run inside `opencode-render`)
- Every DoD carries a `Reachable:` criterion. Caught by: `scripts/drift-check.js` `reachable-criterion`
- A review lens sits only where its reader can judge it. Caught by: `scripts/drift-check.js` `orphan-lens-placement`, `test-cost-lens-placement`, `agent-lens-list`
- An empty scoped diff on a real path resolves to standing code. Caught by: `scripts/drift-check.js` `review-range-shapes`
- A sweep writes one intent, and every leg writes nothing. Caught by: `scripts/drift-check.js` `sweep-chained-legs`, `chained-code-review`, `chained-doc-audit`, `chained-test-audit`, `setup-check`
- Backend verbs resolve by heading, and values travel as environment. Caught by: `tests/publish-kb.test.js` ("parseCommandsTemplates: resolution by heading name, never by position"; a title with a quote, a `$`, a backtick and a newline publishes unchanged)
- No `## Commands` section, no publish. Caught by: `tests/publish-kb.test.js` (no `## Commands` section: nothing published, refusal names `/superdev:setup`); `scripts/drift-check.js` `publish-kb-invocation`
- A matched register entry reaches the feature twice, and final-reviewer reads the register. Caught by: `scripts/drift-check.js` `invariant-compliance` and `invariant-register-doc-pass`
- The register has one home. Caught by: `scripts/drift-check.js` `invariant-register-path` and `setup-check-claude-rules`
- Only `scope.js init` writes `planned`. Caught by: `tests/scope.test.js` ("init writes stage planned", "implementing → planned refused", init over a planned ledger overwrites); `scripts/drift-check.js` `planned-handoff`
- Every plan run leaves a `planned` run root. Caught by: `scripts/drift-check.js` `planned-handoff`
- Plan reads the lock before its first write, and writes it only after its cut. Caught by: `scripts/drift-check.js` `planned-handoff` (the lock-write-after-cut and lock-read-before-write rows)
- A standing same-named branch is reused only when contained. Caught by: `scripts/drift-check.js` `run-kind`, `rotate-on-shipped`, `resumed-scopetree-trigger`, `forcing-branch-flag`
- A run root lives in the main working tree. Caught by: `tests/scope.test.js` (`root` from the main repo and from a linked worktree, the no-git and bad-slug cases); `scripts/drift-check.js` `run-root` and `scopetree-run-root`
- A spawn that never started is answered per surface, with a stated reason. Caught by: `tests/green-gate.test.js` ("a spawn that never started is not 'killed'"; a missing cwd blocks rather than failing open); `tests/adapter.test.js` (the bridge lets a never-started hook through with a once-per-hook notice); `scripts/drift-check.js` `spawn-failure-answers`
- Both renders take their hook ceiling from `hooks.json`. Caught by: `tests/adapter.test.js` ("the bridge's ceiling is the manifest's own green-gate entry, not a second literal"; the Codex timeout derived from `BRIDGE_HOOK_TIMEOUT_MS`)
- Revision of INV-0010: the triage record is the only artifact. Caught by: `scripts/drift-check.js` `observation-capture`
- Every subagent dispatch names an explicit model. Caught by: `tests/model-explicit.test.js`
- Only the controller merges. Caught by: `tests/merge-guard.test.js`
