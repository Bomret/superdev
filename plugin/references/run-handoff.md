# Run handoff

Both execution playbooks (`implement-full.md`, `implement-lite.md`) read this as their last step.

## Run handoff — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **Gate the scope branch on the full suite, in the scope checkout, and record the result.** Every scope
  gets this one full-suite gate from implement, whatever its slice types (ADR 0091). A reusable record or a
  carry (below) meets it without a full run; otherwise the full command runs once — find the scope checkout
  per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope checkout`, take the full command
  from `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`, and run it
  once **in that checkout**, over the scope branch, through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`.
  A suite longer than the Bash tool's time limit runs through the runner in the background, and you wait for
  its end before acting on it (every full and focused run below runs the same way). Record the outcome and the commit it ran on with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <sha> --root <run-root>`
  (`<sha>` is `git rev-parse HEAD` in that checkout) — a record `/superdev:review` reuses instead of
  running the suite again when it is still `green` and `scope.js suite reusable` calls the branch's
  current tip reusable against it (INV-0017): an exact match, a Markdown-only range since it, needing no test run at the tip (ADR 0128, ADR 0189), a
  focused-selector carry, alone or followed by Markdown-only commits (ADR 0175, ADR 0189), a recorded rerun, alone or followed by Markdown-only commits (ADR 0172, ADR 0189), or a passing full run at the tip itself (ADR 0182).
  Where the record is not reusable, take the carry before the full command, per
  `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## The carry run`: a carried tip runs no full command and
  writes no record, and a failing carry run is this run's **Red** result, recorded `red` at the tip. A failed full
  run takes `## The recorded rerun` of the same file before it stands as **Red**: the triage record quoting the
  failure first, then the rerun record, the file alone, and the focused run; an unattributable failure stays **Red**.
  - **No test command configured** → record `none` and continue to the handoff pass.
  - **Green** → record `green`, clear any standing `**Unresolved:**` entry
    (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unresolved defects`) with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>` — a no-op when there
    is none — then continue to the handoff pass.
  - **Denied by the permission classifier** → record `denied`, then `## Degraded passes`'s second shape.
    Its default is record and continue regardless of attendance; **local deviation**, because an
    unattended run would otherwise reach `/superdev:review` with no suite result behind it for this
    commit. Write the `**Degraded:**` entry either way naming the denial, then publish the snapshot before
    deciding which branch below applies — per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since the block
    branch reaches no later write in this run. **Attended** → continue to the handoff pass. **Unattended**
    (`--unattended` in the arguments) → **block**, per that file's **Unattended** section.
  - **Red** → record `red`, and do **not** write the stage. Enter the fix loop below.
- **The fix loop.** One cycle at a time, until the full suite comes back clean or the loop caps out:
  - Dispatch **one** `superdev:implementer` (`model: sonnet`; `haiku` only when every failure in the
    failing output is a mechanical finding, one whose fix changes no stated rule or behaviour, and any
    other failure keeps the whole dispatch on `sonnet`) with
    the failing output — never fix it inline: the controller only integrates, and lite's inline loop is
    that tier's own exception (ADR 0001), not run handoff's. Hand it the scope checkout as its working
    directory: this is where its fix commits must land. A red suite names failing behaviour, so each fix
    opens with a RED test (the conditional rule of `/superdev:implement`'s shared invariants). **Every
    sibling surface is reconciled**: tell the implementer to search its own checkout for every other
    place that states the rule or behaviour the fix changes — for a red suite, the rule is the behaviour
    the failing test pins — bring each one into agreement, and report each place it checked and each it
    changed, reporting a place outside its checkout unedited. Tell it to report the `AGENTS.md` hierarchy
    and the knowledge base unedited too, since the doc pass owns them (INV-0120). A fix report that omits
    the checked-and-changed list is a report defect, sent back to the implementer before the full re-run.
    Tell the implementer to run only the tests that verify its fix, each through `scope.js test`
    (`test focused <changed paths>` with at least one path, or `test -- <command>` for one test file), and its
    fail-to-pass run, and never `test full`, `test whole`, or a `test focused` with no path, since you own every
    full-suite run. Tell it to run a suite longer than the Bash tool's time limit through the runner in the
    background and wait for its end, and to edit files through the edit tools, never through a script.
    Before the full re-run, grep the checkout for the key phrase of the rule the fix changed, in its old
    wording and its new, and compare the hits with the report's checked list. A hit in a file the list
    does not name is a missed sibling surface: send the report back to the implementer, naming the hit,
    in the same cycle. A hit in the `AGENTS.md` hierarchy or the knowledge base is named in your report
    instead. A hit in `CHANGELOG.md` is release history and needs no change.
    Verifying the fix observes; it changes no system outside the repository (ADR 0084, INV-0006). This
    dispatch is a listed-lines case of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate:
    hand it the `dod.md` **path** plus the `scope`-tagged Definition-of-Done lines this red suite blocks
    — there may be none — and it reports back one line per listed line, the same three shapes an
    implementer's report always takes.
  - **The cycle's fail-to-pass run comes from its implementer** (ADR 0134, ADR 0182, INV-0138). Before each fix
    dispatch, record the scope tip, `git -C <run-root>/scopetree rev-parse HEAD`, as the cycle's `<cycle-base>`, and
    name it in the dispatch. The implementer runs its fail-to-pass run over `<cycle-base>..HEAD` before its report,
    where its commits change both a test-path file (`docs/agents/verification.md`'s `## Test paths`, the defaults where
    it has none) and another file. The trace line names `scope`, because the range matches no ledger row and no slice is
    in progress. A report whose range needs an outcome line and has none is a report defect, sent back in the same
    cycle. The fix dispatch names no `slicetrees/<id>` path and no `reports/<id>/` path, so the run trace attributes the
    dispatch to `scope`, and `final-reviewer` finds the cycle by that `implementer` `dispatch` of `scope`. This loop has
    no re-review of its own, so `final-reviewer` reads the outcome lines at `/superdev:review` and raises
    **Pass-to-pass** and **Missing fail-to-pass run** from them.
  - **Inside each cycle, run no test.** The implementer's own runs and its fail-to-pass run cover its fix; a full
    re-run inside every cycle is the cost ADR 0075's own loop shape exists to avoid.
  - **When a cycle's report says the failing tests pass, re-run the full suite once** in the scope
    checkout and record it the same way as above, taking the carry first, per that file's `## The carry run`. **Green** → clear `**Unresolved:**` as above and
    continue to the handoff pass. **A red re-run counts toward this loop's own 3-strike cap** — this
    bullet's own cap, since a scope-wide suite has no slice to block — the same shape as a cycle exposing
    a defect elsewhere, so the loop needs no bound of its own.
  - **A cycle that landed commits clears the inline-doc-pass record**, on the green path and the cap path
    alike, with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`, and publishes
    the snapshot, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section:
    this loop's fix commits landed after a `lite` run's own doc pass, so the next `/superdev:document`
    must run the full writer rather than the reader alone. The cap path's one publish, below, covers this
    write too.
  - **Three cycles without going clean** → stop, say so, write the `**Unresolved:**` entry with a quoted
    heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>` — the sole word
    `-` reads the bullet text from stdin rather than a shell-interpolated argument
    (`references/dod-ticks.md`, triage #680) — leave the
    stage where it is, and publish the snapshot before stopping — per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since no later
    stage write in this run will do it: the run root stands unresolved until a human resumes it, and
    `scope-prune` reaps it in seven days.
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect
  the failing output shows, or one the implementer's own report surfaces, that no slice of this scope
  covers and the scope did not cause gets a triage record from you, the controller, right here — never
  folded into the fix loop above and never held until the handoff at the end of the chain.
- **The handoff pass.** Reached only once the suite record is `green`, `none`, or `denied` — the fix
  loop's own 3-strike cap stops the run before this pass, when three cycles never bring a `red` suite
  clean, and this pass ticks nothing in that case. Inline, right here — no dispatch, on both tiers. Read
  `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`, then, over `<run-root>/dod.md`. Verifying a criterion
  observes; it changes no system outside the repository (ADR 0084, INV-0006):
  - **Leave every `docs`-tagged criterion unjudged** — no tick and no note: the doc pass settles it after
    the scope review (ADR 0161, `dod-ticks.md`).
  - **Settle every `scope`-tagged criterion, every untagged line on a multi-slice `dod.md`, and every
    line on a `dod.md` with no tags at all when the ledger lists more than one slice** — `dod-ticks.md`'s
    mapping gate settles each of the latter two as if it read `scope`, since no slice's dispatch ever
    listed it. **Also settle every joint criterion — tagged with several slices — that an earlier tagged
    slice's genuine `not met:` or `ceiling:` note left unticked** — `dod-ticks.md`'s mapping gate hands
    this pass exactly those lines, alongside the ones above. Judge each against the integrated scope
    branch and tick, leave unticked with a `not met:`/`ceiling:` note, or leave it as it stands if you
    cannot yet judge it — the same three shapes, the note rule (INV-0014), and the controller-only,
    one-at-a-time discipline (INV-0015) that `dod-ticks.md` states. **Leave a line already noted
    `accepted:` exactly as it stands** — that decision is an attended operator's alone (ADR 0095), and
    this pass never writes one itself or overwrites one already there; the stage gate treats it as
    settled the same way a `ceiling:` line already is (INV-0016).
  - **Re-check every earlier tick against the integrated branch** — a tick a slice's own report earned may
    have held at that slice's merge and broken at a later one (preservation claims do exactly this). A
    tick that no longer holds comes back off, with a `not met:` note naming what broke.
  - **Settle any claim an implementer noted on an unmapped criterion during implement** — the mapping
    gate above sent those claims to `dod.md` as notes rather than ticking them; judge them here the same
    way.
  - **An unmet result leaves the line unticked with its reason, and never blocks this handoff** — review
    is the gate (INV-0016), not this pass.
- **Set the stage to `merged`:**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`. The `**Stage:**`
  line is what tells the next command, or a resumed run, that every slice is on the scope branch. Publish
  the snapshot afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state`
  section.
- **Leave the run standing.** Keep the scopetree and `<run-root>/run.lock`, leave
  the anchor at `in-progress` — `dod.md` now carries whatever the handoff pass above settled, never a
  fully ticked checklist: review is still the gate (INV-0016). `/superdev:review`, `/superdev:document`,
  and `/superdev:submit-pr` work in the scope checkout you leave behind; `/superdev:wrap-up` takes the run
  down.
- **Report** the scope branch, the slice count, the commit range, and the suite record above left behind
  (**Green.**, **No test command configured.**, **A denied test command, recorded and continued
  attended.**, or **Green after the fix loop.**), and each slice merged at the fix cap with only
  **Pass-to-pass** or **Missing fail-to-pass run** left, named with each finding (ADR 0125, ADR 0134). Then **say the conversation is
  disposable**: the ledger, `dod.md`, `interfaces.md`, and the per-slice progress logs now hold
  everything `/superdev:review` needs, so a `/clear` before it costs nothing — a fresh-context review
  reads the run state cold, which is the least anchored shape a reviewer can start in.
- **Print the next command, resolved.** Compute `BASE`, the scope's range base, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`
  (`scope.js base resolve --branch <branch> --base <base> --root <run-root>`; `<base>` from
  `docs/agents/code-management.md`, default `main`) and print `/superdev:review <BASE-sha>..<branch>` with
  the real commit substituted, plus one line on what it does (review the integrated scope against the
  DoD) — **every scope**, whatever its slice types: this handoff's own full-suite run above is a fix loop
  and an early record, never a stand-in for review (ADR 0091). An attended run first makes the offer in
  `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section for that command, and a
  started review leaves this command nothing to print. This line fills the Next block that closes the message,
  so it comes last. Then stop: no review, no doc pass, no pull request, no cleanup.
