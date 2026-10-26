# Run handoff

Both execution playbooks (`implement-full.md`, `implement-lite.md`) read this as their last step.

## Run handoff — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **Run no test suite here** (ADR 0191). The scope review's exit run is the scope's one full-suite run, and it
  verifies the integrated scope branch, implement's base merge included. A failing test a slice did not cause,
  named in an implementer's report or met in your own loop, goes to the scope review's fix loop (INV-0157).
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect an
  implementer's report surfaces, or one you meet yourself, that no slice of this scope covers and the scope did
  not cause gets a triage record from you, the controller, right here — never held until the handoff at the end
  of the chain.
- **The handoff pass.** Inline, right here — no dispatch, on both tiers, and no wait on a suite record. Read
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
- **Report** the scope branch, the slice count, the commit range, each failing test a slice named as
  inherited, and each slice merged at the fix cap with only
  **Pass-to-pass** or **Missing fail-to-pass run** left, named with each finding (ADR 0125, ADR 0134). Then **say the conversation is
  disposable**: the ledger, `dod.md`, `interfaces.md`, and the per-slice progress logs now hold
  everything `/superdev:review` needs, so a `/clear` before it costs nothing — a fresh-context review
  reads the run state cold, which is the least anchored shape a reviewer can start in.
- **Print the next command, resolved.** Compute `BASE`, the scope's range base, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`
  (`scope.js base resolve --branch <branch> --base <base> --root <run-root>`; `<base>` from
  `docs/agents/code-management.md`, default `main`) and print `/superdev:review <BASE-sha>..<branch>` with
  the real commit substituted, plus one line on what it does (review the integrated scope against the
  DoD and run the scope's one full-suite run) — **every scope**, whatever its slice types (ADR 0091,
  ADR 0191). An attended run first makes the offer in
  `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section for that command, and a
  started review leaves this command nothing to print. This line fills the Next block that closes the message,
  so it comes last. Then stop: no review, no doc pass, no pull request, no cleanup.
