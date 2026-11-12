# Slice store plan writes: GitHub Issues

The calls `/superdev:plan` makes on `Bomret/superdev` and no other command makes. It uses the calls of
`docs/agents/issue-tracker.md` (**Edit an issue's body**, **Read a slice**, **Create a missing label**,
**Read every label write back**).

## Plan-only fields

- **Parked questions**, **Non-goals**, and **Epic visuals** (all optional) map to `## Parked questions`,
  `## Non-goals`, and `## Slice graph`/`## Touch map` sections in the epic issue body, the same body-text
  pattern as `acceptance`. They are epic-only and advisory: `/implement` never reads them, and a
  single-slice feature's lone issue has no equivalent. GitHub renders mermaid in issue bodies.
  `plan-authoring.md` owns their shape and when each is written.

## Creating issues

- **Labels exist first.** The status labels (`ready`, `in-progress`, `in-review`, `blocked`), the
  `behavior`/`mechanical`/`docs` set, `epic`, `released`, `triage`, and `intent` exist in the repository.
  Run **Create a missing label** for a new feature label before the first issue that carries it.
- **Create an issue:** `gh issue create --repo Bomret/superdev --title "$title" --body-file - --label
  "<labels>" --assignee <assignee>`, the specification and acceptance checklist on stdin. Set `title`
  first from a quoted heredoc (`title=$(cat <<'SUPERDEV_TEXT_EOF' … SUPERDEV_TEXT_EOF)`), so a backtick or
  `$(` in it stays literal. Omit `--assignee` when the assignee resolves to `none`. Capture the new
  issue's `<n>` from the URL `gh` prints, which ends in `/issues/<n>`, as the slice's `id`. Then read its
  labels back. A create keeps its heredoc stdin, because nothing upstream of it can fail.
- **Record a dependency (`depends-on`):** append a `**Depends on:** #<blocker>` line to the issue body
  through **Edit an issue's body**. Never the native `dependencies/blocked_by` endpoint.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then all slice
  creates in parallel, then the `depends-on` body edits in parallel once every `<n>` is known.

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

Operator configuration, not a slice field (`assignee.md` → *Assignee*). The identifier is a GitHub
**login**, read from `.superdev/info.json` under `issue-tracker.assignee`. The create call applies it to
the **epic and every slice**, never a follow-up pass. The file is untracked, so this repository records no
maintainer's account.

```json
{
  "issue-tracker": { "assignee": "<your GitHub login>" }
}
```

- `gh issue create --assignee` takes a comma-separated list, so the single configured login is passed as
  `--assignee <login>`.
- **No file, no `issue-tracker` key, or no `assignee`**: use the authenticated login,
  `gh api user --jq .login`.
- **`"assignee": "none"`**: omit `--assignee` entirely. No warning, no error.
- **A login `gh` cannot resolve rejects the whole create** before the issue exists. Retry that one create
  with `--assignee` omitted, and report it once per run.
- **A login without push access is silently dropped**: the create succeeds, but **Read a slice** shows
  `assignees` empty. Read it back after the create; when it is empty while an assignee was configured,
  report it once per run.
- Either way the issue is created, and nothing is retried more than that one time or rolled back.

## Definition of Done tags

`/superdev:plan` §6 writes each criterion's tag in `plan-contract.md`'s own notation (a slice `id`,
`scope`, or `docs`) when it creates the epic. Once every slice issue exists, the controller rewrites each
slice-id tag into `#<n>`, in the same parallel body-edit step **Record a dependency** uses, each rewrite a
body edit through **Edit an issue's body** whose producer is
`node plugin/scripts/scope.js dod-tags --map-file <path>`, the map file holding one `<id> #<n>` pair per
slice. A tag naming several slices becomes `#<n>, #<m>`, never bracketed. The controller types no store
tag itself. `dod-tags` refuses, printing nothing, on any unjudged line whose tag `dod-line` cannot read or
whose slice id the map lacks, so the gate stops the edit.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-authoring.md` → *Append mode*).

- **Create only new records. Never edit, close, or delete a merged slice.** Append creates issues for the
  new slices alone. It never edits or closes an issue a prior run merged, and never rewrites its labels
  or body. A merged issue's number is a satisfied `depends-on` root for a new one.
- **Create the epic first when none exists.** A feature whose lone issue carries the feature label with no
  `epic`-labelled sibling has no epic yet. Append creates the epic issue first, its body holding the lone
  slice's `acceptance` checklist as the global DoD, then references it (`#<epic>`) from every new slice
  issue. The lone issue is never edited, with one exception: its `**Blocked by feature:**`,
  `**Deploy:**`, `**Repairs:**`, `**Absorbs:**`, and `**Intent:**` lines **migrate to the new epic's own
  body** and are removed from the lone issue, since the epic is the anchor now.
- **Amend the epic's own body, the one sanctioned edit.** One edit through **Edit an issue's body** folds
  the interview's new criteria into the epic's Definition of Done in place, and deletes a resolved parked
  question's line from its `## Parked questions` section.

The issue number is server-assigned, unique, and stable, so append names no continuation rule for `id`.

## When a skill says "write slices to the store"

**≥2 slices**: create the epic first (global DoD), then one issue per slice, then append each slice's
`**Depends on:** #<n>` body lines once every number is known. **Exactly one slice**: skip the epic, create
only the slice issue with the global DoD folded into its `acceptance` checklist, and skip the depends-on
step. Either way, when the interview named a prerequisite feature, write the anchor dependency on the
anchor: the epic, or the lone slice issue.

## Seed deviations

- Seed deviation: the native `blocked_by` dependencies and sub-issues (*Two identifiers per issue*, "Link a slice to its epic", the REST "Record a dependency", and the sub-issue steps of *Append mode* and "write slices to the store") — this repository leaves both unused, so the `**Depends on:**` body line is the one parse path for every blocker relation (2026-11-02)
- Seed deviation: the REST path and the token env var (*Create an issue*, *Assignee*) — this repository reaches GitHub through the `gh` CLI and its own login only (2026-11-02)
- Seed deviation: the `scope.js` path in the `dod-tags` producer (`node plugin/scripts/scope.js`, not `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js`) — this repository dogfoods its own checkout's `scope.js` (2026-09-30)
