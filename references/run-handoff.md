# Run handoff

Both execution playbooks (`implement-full.md`, `implement-lite.md`) read this as their last step.

## Run handoff — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **All slices `mechanical`/`docs`? Run the full suite before writing the stage.** Such a scope skips the
  whole-scope review by design, so run handoff attempts that scope's one full-suite run itself, once, in
  place of that review, before the pull request (ADR 0025). Take the full command from
  `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run it once
  over the scope branch.
  - **No test command configured** → continue to the stage write.
  - **Green** → clear any standing `**Unresolved:**` entry (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
    `## Unresolved defects`) with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>` — a no-op when there
    is none — then continue to the stage write.
  - **Denied by the permission classifier** → `## Degraded passes`'s second shape. Its default is record
    and continue regardless of attendance; **local deviation**, because this is the only full-suite run a
    `mechanical`/`docs` scope gets and unattended would reach `/superdev:ship` with none behind it.
    **Attended** → write the `**Degraded:**` entry
    (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "<text>" --root <run-root>`) naming the
    denial, continue to the stage write. **Unattended** (`--unattended` in the arguments) → **block**,
    per that file's **Unattended** section.
  - **Red** → do **not** write the stage. Dispatch **one** `superdev:implementer` (`model: sonnet`;
    `haiku` only for a mechanical fix) with the failing output — never fix it inline: the controller only
    integrates, and lite's inline loop is that tier's own exception (ADR 0001), not run handoff's. Every
    fix opens with a RED test. Re-run the full suite; repeat until **green** (then clear `**Unresolved:**`
    as above and continue), **or three cycles without going clean** — this bullet's own 3-strike cap,
    since a scope-wide suite has no slice to block. Stop, say so, write the `**Unresolved:**` entry with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add "<text>" --root <run-root>`, leave the
    stage where it is.
- **Set the stage to `merged`:**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`. The `**Stage:**`
  line is what tells the next command, or a resumed run, that every slice is on the scope branch.
- **Leave the run standing.** Keep the worktrees and `<run-root>/run.lock` (lite tier), leave
  `<run-root>/dod.md` unticked and the anchor at `in-progress`. `/superdev:review` and
  `/superdev:document` work in the scope checkout you leave behind; `/superdev:ship` takes the run down.
- **Print the next command, resolved.** Compute `BASE = git merge-base <base> <branch>` (`<base>` from
  `docs/agents/code-management.md`, default `main`) and print `/superdev:review <BASE-sha>..<branch>` with
  the real commit substituted, plus one line on what it does (review the integrated scope against the
  DoD). **All slices `mechanical`/`docs`** → print `/superdev:document <BASE-sha>..<branch>` instead, and
  say this scope carries no whole-scope review. The full suite above left one of three outcomes:
  - **Green.**
  - **No test command configured.**
  - **A denied test command, recorded and continued attended** (ADR 0025).
- **Report** the scope branch, the slice count, and the commit range. Then stop: no review, no doc pass,
  no pull request, no DoD tick, no cleanup.
