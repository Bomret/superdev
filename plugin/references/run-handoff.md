# Run handoff

Both execution playbooks (`implement-full.md`, `implement-lite.md`) read this as their last step.

## Run handoff — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **Run the full suite once, in the scope checkout, and record the result.** Every scope gets exactly
  this one full-suite run from implement, whatever its slice types (ADR 0091) — find the scope checkout
  per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope checkout`, take the full command
  from `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`, and run it
  once **in that checkout**, over the scope branch. Record the outcome and the commit it ran on with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <sha> --root <run-root>`
  (`<sha>` is `git rev-parse HEAD` in that checkout) — a record `/superdev:review` reuses instead of
  running the suite again when it is still `green` and `scope.js suite reusable` calls the branch's
  current tip reusable against it (INV-0017): an exact match, or a diff confined to the active store's
  own plan files since the recorded commit.
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
  - Dispatch **one** `superdev:implementer` (`model: sonnet`; `haiku` only for a mechanical fix) with the
    failing output — never fix it inline: the controller only integrates, and lite's inline loop is that
    tier's own exception (ADR 0001), not run handoff's. Hand it the scope checkout as its working
    directory: this is where its fix commits must land. Every fix opens with a RED test. Verifying the fix
    observes; it changes no system outside the repository (ADR 0084, INV-0006). This dispatch is a
    listed-lines case of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate: hand it the
    `dod.md` **path** plus the `scope`-tagged Definition-of-Done lines this red suite blocks — there may
    be none — and it reports back one line per listed line, the same three shapes an implementer's report
    always takes.
  - **Inside each cycle, run only the focused command** — per
    `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`, over the commits that cycle's implementer just
    landed — never the full suite; a full re-run inside every cycle is the cost ADR 0075's own loop shape
    exists to avoid.
  - **When a cycle's focused run first comes back clean, re-run the full suite once** in the scope
    checkout and record it the same way as above. **Green** → clear `**Unresolved:**` as above and
    continue to the handoff pass. **A red re-run counts toward this loop's own 3-strike cap** — this
    bullet's own cap, since a scope-wide suite has no slice to block — the same shape as a cycle exposing a
    defect elsewhere, so the loop needs no bound of its own.
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
  fully ticked checklist: review is still the gate (INV-0016). `/superdev:review` and
  `/superdev:document` work in the scope checkout you leave behind; `/superdev:ship` takes the run down.
- **Print the next command, resolved.** Compute `BASE = git merge-base <base> <branch>` (`<base>` from
  `docs/agents/code-management.md`, default `main`) and print `/superdev:review <BASE-sha>..<branch>` with
  the real commit substituted, plus one line on what it does (review the integrated scope against the
  DoD) — **every scope**, whatever its slice types: this handoff's own full-suite run above is a fix loop
  and an early record, never a stand-in for review (ADR 0091). Name the suite record above left behind:
  **Green.**, **No test command configured.**, **A denied test command, recorded and continued
  attended.**, or **Green after the fix loop.**
- **Report** the scope branch, the slice count, and the commit range, and **say the conversation is
  disposable**: the ledger, `dod.md`, `interfaces.md`, and the per-slice progress logs now hold
  everything `/superdev:review` needs, so a `/clear` before it costs nothing — a fresh-context review
  reads the run state cold, which is the least anchored shape a reviewer can start in. Then stop: no
  review, no doc pass, no pull request, no cleanup.
