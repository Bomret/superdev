# Run handoff

Both execution playbooks (`implement-full.md`, `implement-lite.md`) read this as their last step.

## Run handoff — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **The run-state ref.** A step end that changes state (`scope.js step clear`, `scope.js step block`, or a
  `scope.js stage set` that closes the standing step, except `stage set closed`) sends the run root's
  `trace.log`, `reports/`, `interfaces.md`, and `dod.md` to `refs/superdev/<scope>` of the remote that the `**Remote:**` line of
  `docs/agents/code-management.md` names. A clear that changes nothing sends nothing. A send prints one `run-state:` line. The send is
  best-effort: no remote, an unreachable remote, or a remote ref this machine has not seen refuses it
  with that line as the note, and the step end stands. Read the line and continue. `/superdev:wrap-up`
  deletes the ref.
- **Run no test suite here**. `/superdev:ship` takes the scope's full-suite evidence, and it
  verifies the integrated scope branch, implement's base merge included. A failing test a slice did not cause,
  named in an implementer's report or met in your own loop, goes to the scope review's fix loop.
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section and follow it: a defect an
  implementer's report surfaces, or one you meet yourself, that no slice of this scope covers and the scope did
  not cause gets a triage record from you, the controller, right here — never held until the handoff at the end
  of the chain.
- **The handoff pass.** Inline, right here — no dispatch, on both tiers, and no wait on a suite record. Read
  `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`, then, over `<run-root>/dod.md` alone: this pass writes
  no anchor line, and the scope review copies `dod.md` onto the anchor. Verifying a criterion
  observes; it changes no system outside the repository:
  - **Leave every `docs`-tagged criterion unjudged** — no tick and no note: the doc pass settles it after
    the scope review (`dod-ticks.md`).
  - **Settle every `scope`-tagged criterion, every untagged line on a multi-slice `dod.md`, and every
    line on a `dod.md` with no tags at all when the ledger lists more than one slice** — `dod-ticks.md`'s
    mapping gate settles each of the latter two as if it read `scope`, since no slice's dispatch ever
    listed it. **Also settle every joint criterion — tagged with several slices — that an earlier tagged
    slice's genuine `not met:` or `ceiling:` note left an open line** — `dod-ticks.md`'s mapping gate hands
    this pass exactly those lines, alongside the ones above. Judge each against the integrated scope
    branch and tick, leave unticked with a `not met:`/`ceiling:` note, or leave it as it stands if you
    cannot yet judge it — the same three shapes, the note rule, and the controller-only,
    one-at-a-time discipline that `dod-ticks.md` states. **Leave a line already noted
    `accepted:` exactly as it stands** — that decision is an attended operator's alone, and
    this pass never writes one itself or overwrites one already there; like a `ceiling:` line, it holds
    no stage at the gate.
  - **Re-check every earlier tick against the integrated branch** — a tick a slice's own report earned may
    have held at that slice's merge and broken at a later one (preservation claims do exactly this). A
    tick that no longer holds comes back off, with a `not met:` note naming what broke.
  - **Settle any claim an implementer noted on an unmapped criterion during implement** — the mapping
    gate above sent those claims to `dod.md` as notes rather than ticking them; judge them here the same
    way.
  - **An unmet result leaves the line unticked with its reason, and never blocks this handoff** — review
    is the gate, not this pass.
- **Set the stage to `merged`:**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`. The `**Stage:**`
  line is what tells the next command, or a resumed run, that every slice is on the scope branch. This
  stage write is the run's closer: publish the snapshot now, the run's one publish, per
  `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section.
- **Leave the run standing.** Keep the scopetree and `<run-root>/run.lock`, leave
  the anchor at `in-progress` — `dod.md` now carries whatever the handoff pass above settled, never a
  fully ticked checklist: review is still the gate. `/superdev:review`, `/superdev:document`,
  and `/superdev:submit-pr` work in the scope checkout you leave behind; `/superdev:wrap-up` takes the run
  down.
- **Report** the scope branch, the slice count, the commit range, each failing test a slice named as
  inherited, and each slice merged at the fix cap with only
  **Pass-to-pass** or **Missing fail-to-pass run** left, named with each finding, and each
  unclosable **Pass-to-pass** finding a slice or the Minor sweep took the early escape with, or a lite slice merged
  on, named with its slice or range, its case, and its reason.
- **Resolve the next command.** Compute `BASE`, the scope's range base, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`
  (`scope.js base resolve --branch <branch> --base <base> --root <run-root>`; `<base>` from
  `docs/agents/code-management.md`, default `main`). The next command is `/superdev:review <BASE-sha>..<branch>`
  with the real commit substituted — **every scope**, whatever its slice types.
- **Start the review.** Once every slice is on the scope branch and this handoff's closer and publish ran,
  start that command per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The chain start`. A
  started review leaves this command nothing to print.
- **Print the next command.** Applies to every exit that starts no review, a failed start included. Print the
  resolved command, plus one line on what it does (review the integrated scope against the DoD; `/superdev:ship`
  takes the scope's full-suite evidence). This line fills the Next block that closes the message, so it comes last. The
  exit stops there: no review, no doc pass, no pull request, no cleanup.
