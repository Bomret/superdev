# Slice store plan writes: Forgejo / Codeberg Issues

The calls `/superdev:plan` makes on Forgejo / Codeberg Issues and no other command makes: creating a plan's
issues, writing the anchor lines, and extending a feature. `/superdev:setup` writes this seed to
`docs/agents/issue-tracker-plan.md`, filled in with the values of `docs/agents/issue-tracker.md`, whose
calls and *tea conventions* (**Edit an issue's body**, **Read a slice**, **Create a missing label**, label
ids, **Read every label write back**) this document uses.

## Plan-only fields

- **Parked questions**, **Non-goals**, and **Epic visuals** (all optional) ↔ `## Parked questions`,
  `## Non-goals`, and `## Slice graph`/`## Touch map` sections in the epic issue body, the same body-text
  pattern as `acceptance`. They are epic-only and advisory: `/implement` never reads them, and a
  single-slice feature's lone issue has no equivalent. Forgejo renders mermaid in issue bodies.
  `plan-authoring.md` owns their shape and when each is written.

## Creating issues

- **Labels exist first.** Before adding a label to an issue, resolve its id from the paged label listing,
  running **Create a missing label** for a name the listing lacks.
- **Create an issue:** `tea issues create -t "$title" --description-file - -a <assignee>`, the
  specification and acceptance checklist on stdin. Set `title` first from a quoted heredoc
  (`title=$(cat <<'SUPERDEV_TEXT_EOF' … SUPERDEV_TEXT_EOF)`), so a backtick or `$(` in it stays literal.
  Omit `-a` when the assignee resolves to `none`, and pass no `-L`. Capture the new issue's `<n>` from the
  URL `tea` prints, which ends in `/issues/<n>`, as the slice's `id`. Then add its labels by id and read
  them back.
- **Record a dependency (`depends-on`):** use the native
  `tea api -i -X POST '/repos/{owner}/{repo}/issues/<index>/dependencies'` when the dependencies unit is
  enabled. When it answers 404 (unit disabled), append a `**Depends on:** #<blocker>` line to the issue
  body through **Edit an issue's body**.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then all slice
  creates in parallel, then the labels and the `depends-on` writes in parallel once every `<n>` is known.

## Anchor lines

Each is a body edit of the **anchor issue's own** body through **Edit an issue's body**, never the native
dependencies endpoint, so the slice-level and feature-level relations never collide on one issue.

- **Record an anchor dependency:** append `**Blocked by feature:** #<blocker-anchor>`.
- **Record the deploy line:** append `**Deploy:** <target>[, <target>]` (in the operator's answer order)
  or `**Deploy:** none`, revising the line in place on an append that re-answers the deploy question.
- **Record the Repairs line:** append `**Repairs:** #<original-anchor>` when `/superdev:plan` creates a
  repair, and never edit it afterwards. Nothing is written to the original anchor.
- **Record the Absorbs line:** append `**Absorbs:** #<n>[, #<n>]` (every absorbed record's reference),
  revising the line in place on an append that absorbs more.
- **Record the Intent line:** append `**Intent:** #<n>[, #<n>]` (every seeding intent record's
  reference), revising the line in place on an append seeded from another one.

## Assignee

Operator configuration, not a slice field (`assignee.md` → *Assignee*). The identifier is a Forgejo
**login**, read from `.superdev/info.json` under `issue-tracker.assignee`, and applied to the **epic and
every slice** in `tea issues create`'s `-a`, never a follow-up pass.

```json
{
  "issue-tracker": { "assignee": "<login>" }
}
```

- `tea issues create -a` takes a comma-separated list: pass the single configured login as `-a <login>`.
- **No file, no `issue-tracker` key, or no `assignee`** → use the resolved login's `user` field from
  `tea login list -o json`.
- **`"assignee": "none"`** → omit `-a` entirely. No warning, no error.
- **A login that does not exist or is not a collaborator rejects the whole create**: `422 Assignee does
  not exist` or `422 canBeAssigned` (`ErrUserDoesNotHaveAccessToRepo`). Retry that one create with `-a`
  omitted, and report it once per run.
- **A token without issue-write access silently drops the assignment**: the create succeeds, but
  `tea issues <index> -o json` shows `assignees` empty. Read it back after the create; when it is empty
  while an assignee was configured, report it once per run.
- Nothing is retried more than that one time or rolled back.

## Definition of Done tags

`/superdev:plan` §6 writes each criterion's tag in `plan-contract.md`'s own notation (a slice `id`,
`scope`, or `docs`) when it creates the epic. Once every slice issue exists, the controller rewrites each
slice-id tag into `#<n>`, in the same parallel step as **Record a dependency**, each rewrite a body edit
through **Edit an issue's body** whose producer is
`node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js dod-tags --map-file <path>`, the map file holding one
`<id> #<n>` pair per slice. A tag naming several slices becomes `#<n>, #<m>`, never bracketed. The
controller types no store tag itself. `dod-tags` refuses, printing nothing, on any unjudged line whose tag
`dod-line` cannot read or whose slice id the map lacks, so the gate stops the edit.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-authoring.md` → *Append mode*).

- **Create only new records; never edit, close, or delete a merged slice.** Append creates issues for the
  new slices alone. It never edits or closes an issue a prior run merged, and never rewrites its labels or
  body. A merged issue's index is a satisfied `depends-on` root for a new one.
- **Create the epic first when none exists.** A feature whose lone issue carries the feature label with no
  `epic`-labelled sibling has no epic yet. Append creates the epic issue first, its body holding the lone
  slice's `acceptance` checklist as the global DoD, then references it (`#<epic>`) from every new slice
  issue. The lone issue is never edited, with one exception: its `**Blocked by feature:**`, `**Deploy:**`,
  `**Repairs:**`, `**Absorbs:**`, and `**Intent:**` lines **migrate to the new epic's own body** and are
  removed from the lone issue, since the epic is the anchor now.
- **Amend the epic's own body, the one sanctioned edit.** One edit through **Edit an issue's body** folds
  the interview's new criteria into the epic's Definition of Done in place, and deletes a resolved parked
  question's line from its `## Parked questions` section.

The issue index is server-assigned, unique, and stable, so append names no continuation rule for `id`.

## When a skill says "write slices to the store"

**≥2 slices**: create the epic first (global DoD), then one issue per slice, then write each slice's
`depends-on` (**Record a dependency**) once every index is known. **Exactly one slice**: skip the epic,
create only the slice issue with the global DoD folded into its `acceptance` checklist, and skip the
depends-on step. Either way, when the interview named a prerequisite feature, write the anchor dependency on
the anchor: the epic, or the lone slice issue.
