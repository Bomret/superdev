# Slice store: Codeberg Issues (Forgejo)

Slices live as Codeberg issues in `bomret/superdev`, one slice per issue. Use the Forgejo REST API
(or the `tea` CLI if installed).

## Configuration

- **Host, owner, and repo:** `https://codeberg.org`, `bomret`, `superdev`.
- **Auth:** API token in env var `GITEA_TOKEN` (record the name, never the value). Header:
  `Authorization: token $GITEA_TOKEN`, `Content-Type: application/json`.
- **Feature label:** one label per feature scope, `<type>/<slug>` (for example `fix/chain-followups`),
  applied to the epic and its slices, so the feature's issues are listable. `<type>` is the **change
  type**, the Conventional Commits type of the work, per `references/scope-mode.md`. The label doubles
  as the scope branch name.
- **Triage label:** `triage`, the label a triage record carries (*Triage record* below), and the only
  label it carries.

## Field mapping (plan-contract to Forgejo)

- `id` maps to the issue **index** (`#<n>`). Record the mapping between slice id and `#<n>` in the run
  ledger, so `depends-on` resolves to real indexes.
- `title` maps to the issue title.
- `spec` maps to the issue body ("What to build").
- `acceptance` maps to a `- [ ]` checklist in the body.
- `test-applicability` maps to a label: `behavior`, `mechanical`, or `docs`.
- `depends-on` maps to a `**Depends on:** #<n>` line in the issue body (one per blocker). The body line is
  the source of truth `/implement` parses. This repo leaves Forgejo's native issue-dependencies unit
  unused, even though the instance enables it, so that one parse path serves every blocker relation and the
  relation renders in the issue body a reader already has open.
- **Anchor dependency** (optional) maps to a `**Blocked by feature:** #<n>` line in the **anchor's own**
  body — the epic on a multi-slice feature, the lone slice issue on a single-slice one. Distinct from the
  `**Depends on:** #<n>` line above: it names another feature's scope anchor (`plan-contract.md` → *Scope
  anchor*, ADR 0040), never a slice within this feature, and the two lines must never be confused on one
  issue.
- The global DoD maps to an **epic** issue (label `epic`) whose body holds the DoD checklist. Slices carry
  the feature label and reference the epic (`#<epic>`).
- **Parked questions** (optional) maps to a `## Parked questions` section in the epic issue body, the same
  body-text pattern as `acceptance`. Epic-only, with no equivalent on a single-slice feature's lone issue.
  Advisory only: `/implement` never reads it.
- **Non-goals** (optional) maps to a `## Non-goals` section in the epic issue body, the same body-text
  pattern as **Parked questions** above. Epic-only, with no equivalent on a single-slice feature's lone
  issue. Advisory only: `/implement` never reads it.
- **Epic visuals** (optional) maps to `## Slice graph` and `## Touch map` sections in the epic issue body.
  Codeberg renders mermaid in issue bodies, so the slice graph draws itself in the epic issue. Epic-only
  and advisory, the same as parked questions. `plan-contract.md` owns when each is written.
- `status` maps to the open or closed state plus a status label (see the status map below).

## REST conventions

- **Create an issue:** `POST /api/v1/repos/bomret/superdev/issues` with
  `{ "title": "...", "body": "<specification + acceptance checklist>", "labels": [<label ids>],
  "assignees": ["<assignee>"] }`. Omit `assignees` entirely when the assignee resolves to `none`.
  Capture the returned
  `number` as the slice's `id`. Pass `labels` and `assignees` **at creation**. The create path needs no
  separate label or assignee POST.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then fire **all
  slice creates in parallel**, then the `depends-on` body-patches in parallel once every `number` is
  known. Only the ordering of epic, then slices, then depends-on is required. Within each step the calls
  are independent, so `/plan` issues them concurrently.
- **Record a dependency (`depends-on`):** append a `**Depends on:** #<blocker>` line to the issue body.
  Never the native `POST .../issues/<index>/dependencies` endpoint, which this repo leaves unused (see the
  field mapping above).
- **Record an anchor dependency:** append a `**Blocked by feature:** #<blocker-anchor>` line to the
  **anchor issue's own** body — the epic on a multi-slice feature, the lone slice issue on a single-slice
  one. Always a body-append, never the native dependencies endpoint above, so the slice-level and
  feature-level relations never collide on one issue (ADR 0040).
- **List feature slices:** `GET /api/v1/repos/bomret/superdev/issues?labels=<type>/<feature>&state=all`.
- **Read a slice:** `GET /api/v1/repos/bomret/superdev/issues/<index>`.
- **Set labels and status:** `POST .../issues/<index>/labels` (add) and
  `PATCH .../issues/<index>` with `{ "state": "closed" }` to close.

## Scope anchor

A feature's scope anchor is its root (`plan-contract.md` → *Scope anchor*). This store uses neither the
native issue-dependencies unit nor a sub-issue relation, so it expresses the root with labels rather than
natively: on a multi-slice feature the anchor is the `epic`-labelled issue carrying the feature
label, and on a single-slice feature it is the lone issue carrying that label (ADR 0017).

- **Recognise one.** Apply the rule to the **open** issues carrying a feature label first: the anchor is
  the one labelled `epic`; if none is, and exactly one open issue carries the label, that issue is the
  anchor. A closed candidate never wins over an open one this way (`plan-contract.md` → *Scope anchor*).
  Where no open issue carries the label and exactly one closed issue does, that closed issue is the
  anchor — the shape the shipped-anchor refusal reads as its own done signal (ADR 0083).
- **List the candidates.** The feature labels themselves: `GET /api/v1/repos/bomret/superdev/labels`
  (paginated), keeping the names whose first segment is a change type (`references/scope-mode.md` lists
  them). Per feature label:
  `GET /api/v1/repos/bomret/superdev/issues?labels=<type>%2F<feature>&state=all&type=issues` (URL-encode
  the label's `/`), then apply the rule above to the result. `state=all`, not `state=open`: a shipped
  feature's epic is closed, and a `state=open` listing would drop it from the candidates a picked feature
  resolves against, so `/superdev:plan`'s shipped-anchor refusal (ADR 0083) never sees it. `type=issues`
  excludes pull requests at the server, the same exclusion **List them** below states — without it, a
  closed feature-labelled pull request would sit as a permanent extra candidate once the listing spans
  every state, not the transient one the untriaged listing already guards against.
- **List the slices beneath it.** Use the **List feature slices** call above (`state=all`), not the
  candidate listing. A merged slice is closed, and closing the epic is best-effort. An anchor left open
  with every slice closed therefore still has slices beneath it, and a `state=open` listing presents it as
  never decomposed. On a multi-slice feature the slices are every issue in that response that is not the
  `epic`. A single-slice feature's anchor has none beneath it.
- **Tell an anchor that is itself a slice.** It carries a `test-applicability` label: `behavior`,
  `mechanical`, or `docs`. The epic issue never does. That is what separates a single-slice feature, whose
  lone slice is its own anchor and is real work, from an epic created and never decomposed, which is not.
- **Read an anchor's dependencies.** The `**Blocked by feature:** #<n>` body line the field mapping
  defines, read off the **anchor's own** body — never the `**Depends on:** #<n>` line above, which carries
  slice-level `depends-on` within this feature and names nothing outside it. It names another feature's
  scope anchor (`plan-contract.md` → *Scope anchor*, ADR 0040). The candidate listing already returned the
  body; fetch it with `GET /api/v1/repos/bomret/superdev/issues/<index>` when it did not. No such line
  means no dependency. **Resolve `#<n>` to that anchor's own record** with the same `GET
  /api/v1/repos/bomret/superdev/issues/<n>` call — its `labels` array is the blocker's own feature label,
  and its `state` is open or closed — because a consumer holds the dependency against the blocker's own
  label and state, not the label of the record carrying this line. `/superdev:plan` writes one through the
  same **Record an anchor dependency** body-append above.
- **Ambiguous.** No `epic`-labelled open issue and two or more open issues carrying the same feature
  label. A closed candidate never makes the shape ambiguous by itself — a label reused after retirement
  stays a single, resolvable anchor at every point (`plan-contract.md` → *Scope anchor*, ADR 0083). This
  store has no parent relation to fall back on, so an ambiguous shape cannot be resolved: `/superdev:plan`
  never writes it, there is no single Definition of Done to build against, and a consumer reports it
  instead of choosing.

## Assignee

Operator configuration, not a slice field (`plan-contract.md` → *Assignee*; ADR 0010, ADR 0073). The
identifier is a Codeberg **login**, read from `.superdev/info.json` under `issue-tracker.assignee`. The
create call applies it to the **epic and every slice**, never a follow-up pass. The file is untracked,
so this repository records no maintainer's account. The two failure shapes below make the general
*Assignee* recovery rule (`plan-contract.md`) concrete for Forgejo.

```json
{
  "issue-tracker": { "assignee": "<your Codeberg login>" }
}
```

- Forgejo's `CreateIssueOption.assignees` is an **array**, so the single configured login is sent as a
  one-element `["<assignee>"]`. `EditIssueOption.assignees` is the same shape if an issue ever needs it
  later.
- **No file, no `issue-tracker` key, or no `assignee`**: resolve the token's own identity with
  `GET /api/v1/user` and use its `login`.
- **`"assignee": "none"`**: omit `assignees` entirely. No warning, no error.
- **A login that does not exist or is not a collaborator rejects the whole create**: `422 Assignee does not
  exist` or `422 canBeAssigned` (`ErrUserDoesNotHaveAccessToRepo`). Retry that one create with
  `assignees` omitted, and report it once per run.
- **A token without issue-write access silently drops the assignment** (and `labels` with it). The
  create succeeds, but the returned `assignees` is empty or `null`. Read it back from the create response.
  When it is empty while an assignee was configured, report it once per run.
- Either way the issue is created and nothing is retried more than that one time or rolled back.
- **A leftover `Assignee:` bullet** in this file is configuration nothing reads. Report it once per run,
  naming the file and the move to `.superdev/info.json`.

## Release

`plan-contract.md` → *Release*. The signal is the label **`released`** on the scope anchor — the
`epic`-labelled issue, or a single-slice feature's lone issue. Not the `ready` label below: the dispatch
swaps that one to `in-progress`.

- **Apply** (`/superdev:plan`, on a release): `POST /api/v1/repos/bomret/superdev/issues/<index>/labels`.
  Labels go by id, so resolve `released` through `GET /api/v1/repos/bomret/superdev/labels` first.
- **Read** (`/superdev:implement`, `/superdev:afk`): the anchor's own `labels` array, already returned by
  the issue listing that found it.
- **Remove** (`/superdev:plan`, on an append the user declines):
  `DELETE /api/v1/repos/bomret/superdev/issues/<index>/labels/<released label id>`, resolving the id
  through the same `GET /api/v1/repos/bomret/superdev/labels` call **Apply** makes. An anchor that does
  not carry the label is already unreleased, so a `404` there is the wanted state, not a failure.
- An anchor without the label is unreleased: `/superdev:implement` asks before building it, and
  `/superdev:afk` passes over it.

## Triage record

`plan-contract.md` → *Triage record*. `/superdev:review` creates one the moment it defers a finding; the
controller creates one the same way the moment it meets an observation
(`references/scope-mode.md`'s `## Observations` section).
Here it is an ordinary Codeberg issue carrying the label **`triage`** and nothing else.

- **Create it:** `POST /api/v1/repos/bomret/superdev/issues` with
  `{ "title": "<the finding, one line>", "body": "<the finding, why it needed a record — for a deferred
  finding, why no Definition of Done criterion covered it; for an observation, that no slice of the scope
  covers it and the scope did not cause it — the date, the feature label, the scope branch, the scope
  anchor's `#<n>`, and a copy-pasteable /superdev:plan \"<the finding>\" line>", "labels": [<the `triage`
  label id>] }`. Omit
  `assignees` entirely, whatever the operator configuration names: nobody has picked the work up.
  Capture the
  returned `number` as the record's reference: **the deferred trigger** is what `/superdev:review` puts
  in the ledger bullet; **an observation** instead reports that reference to the operator and writes no
  ledger bullet of its own, since the record is its own identity (`references/scope-mode.md`'s
  `## Observations` section).
- **List the records:** `GET /api/v1/repos/bomret/superdev/issues?labels=triage&state=open` (paginated).
  It returns every open triage record with its `number`, `title`, and `body`, which is the whole record —
  a triage record carries no other state. No `triage` label existing yet means no record has ever been
  written, which reads as an empty list rather than an error.
- **Resolve the label by id, and create it when it is missing.**
  `GET /api/v1/repos/bomret/superdev/labels` first (paginated). No `triage` there → create it with
  `POST /api/v1/repos/bomret/superdev/labels` (`{ "name": "triage", "color": "#ededed" }`), then pass the
  new id on the create above. **A create that reports the name as already taken means the label is
  there** — a page after the first read missed it — so re-read the list for its id and carry on. A
  label-less record is invisible to the query that is the point of writing it.
- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate listing and
  `/superdev:implement`'s slice loading select on, so a record carrying either would be built as work.
- **No pull-request URL.** Every trigger — a deferred finding or an observation — runs before
  `/superdev:ship` opens one, so none exists yet.

## Untriaged item

`CONTEXT.md`'s **Untriaged item** glossary entry: an open issue this repo's own tooling never wrote — it
carries neither a feature label nor the `triage` label.

- **Recognise one.** An open issue whose `labels` array carries no label matching `<type>/<slug>` and no
  `triage` label.
- **List them.** `GET /api/v1/repos/bomret/superdev/issues?state=open&type=issues&sort=oldest` (paginated),
  then keep only the issues whose `labels` array matches the rule above. `type=issues` excludes pull
  requests at the server — Forgejo's issue endpoint otherwise returns them alongside issues, each carrying
  a `pull_request` field naming the pull request. `sort=oldest` pages the open-issue set oldest first, the
  order `/superdev:backlog`'s cap wants, so the survey pages the full open-issue set and the oldest-first
  order makes picking the 5 oldest and counting the total cheap once it has.
- **Read its age.** The issue's own `created_at` field.

## Run state

`plan-contract.md` → *Run state*. The snapshot lives in the anchor's own body, beside the DoD checklist and
every other body section — the `epic`-labelled issue on a multi-slice feature, the lone slice issue on a
single-slice one (`## Scope anchor` above).

- **Write** (after any ledger write the snapshot would show): `PATCH /api/v1/repos/bomret/superdev/issues/<index>` with
  `{ "body": "<anchor body with the ## Run state section folded in>" }` — the same call and body shape the
  epic amendment under *Append mode* below already uses. **Best-effort:** a failed write is reported once
  per run and the run continues; the ledger stays authoritative.
- **Read** (every publish, including run init and adopting a run): `GET /api/v1/repos/bomret/superdev/issues/<index>` — the same call
  **Read a slice** above already names — and take the body back out of the response.
- **The section is machine-owned.** A deeper subsection an operator adds under `## Run state` — a
  `### Operator notes` heading, say — is replaced along with the rest on the next publish. Keep an
  operator note outside the section.

## Definition of Done ticks

`plan-contract.md` → *Definition of Done ticks*. The checklist lives in the anchor's own body, beside the
`## Run state` section above — ticking is independent of that section: it lands the same way whether or
not this store carries a snapshot.

- **Tick a criterion:** write the criterion text and the judgment's note each to their own file, through
  a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) rather than as a shell-interpolated argument — either may carry a quote, a
  backtick, or a `$(` (`references/dod-ticks.md`, triage #680). `GET /api/v1/repos/bomret/superdev/issues/<index>` (the same call *Run state*'s
  own read above uses) for the anchor body, pipe it through
  `node plugin/scripts/scope.js dod-line --match-file <path> --verdict met|not-met|ceiling|accepted
  --note-file <path>` on stdin, then `PATCH /api/v1/repos/bomret/superdev/issues/<index>` with
  `{ "body": "<dod-line's stdout>" }` — the same call shape the *Run state* write above already uses.
  **Best-effort:** a failed write is reported once per run and never stops the run; `dod.md` stays
  authoritative.
- **A criterion's tag renders as `#<n>`** (the slice issue's index). `/superdev:plan` §6 writes the tag
  in `plan-contract.md`'s own notation (a slice `id`, or `scope`) when it creates the epic, before any
  slice issue exists. Once every slice issue is created, the controller rewrites each slice-id tag into
  `#<n>`, in the same parallel body-patch step **Record a dependency** above uses to write
  `**Depends on:** #<n>` — both need the same resolved indexes and both wait on the same event; a `scope`
  tag is left as `scope`.

## Status workflow

Forgejo carries open and closed states plus labels, and no custom states. `/implement` moves each issue at
every lifecycle point (see the plan-contract's *Slice lifecycle*):

| Canonical | Forgejo state | How |
|---|---|---|
| `todo` | open + label `ready` | on create |
| `in-progress` | open + label `in-progress` | swap `ready` to `in-progress` on dispatch |
| `in-review` | open + label `in-review` | swap label when per-slice review starts (behavior only) |
| `blocked` | open + label `blocked` | swap label while stuck |
| `merged` (done) | **closed** | `PATCH { "state": "closed" }` after merge |

The **epic** issue takes the label `in-progress` when the run starts, and is **closed** once every slice
issue is closed. A **single-slice feature has no epic**: its lone issue is the scope anchor, so the anchor
rule wins. It keeps the `in-progress` label through the merge, and closes once, when `/superdev:ship` runs.
All of this is best-effort, because the run ledger drives control flow. When a label call or a close call
fails, log it and continue.

**Lite execution tier** (3 slices or fewer, see `plan-contract.md`) skips `in-review` for every slice
regardless of `test-applicability`. Go straight from `in-progress` to closed once the slice's commit lands
on the scope branch.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-contract.md` → *Append mode*,
ADR 0004).

- **Create only new records. Never edit, close, or delete a merged slice.** Append fires new
  `POST /api/v1/repos/bomret/superdev/issues` calls for the new slices alone. It never `PATCH`es or
  closes an issue a prior run already merged, and never rewrites its labels or body — except the
  anchor-dependency line, which migrates to the new epic issue when append promotes a single-slice
  feature (below). A merged issue's index is a satisfied `depends-on` root for a newly created one,
  nothing more.
- **Create the epic first when none exists.** A feature whose lone issue carries the feature label with no
  `epic`-labeled sibling has no epic yet (the single-slice shape, `## Scope anchor` above). Append
  creates the epic issue first, with `body` holding the lone slice's `acceptance` checklist as the global
  DoD, then references it (`#<epic>`) from every new slice issue. The lone existing issue itself is never
  edited: no epic body copies onto it, no label changes, and no `#<epic>` reference added to it. **One
  exception:** when the lone issue carries an anchor dependency (a `**Blocked by feature:** #<n>` line), it
  **migrates to the new epic issue's own body** and is removed from the lone issue — the epic is the anchor
  now. Nothing else about the lone issue changes.
- **Amend the epic's own body, the one sanctioned edit.** `PATCH
  /api/v1/repos/bomret/superdev/issues/<epic index>` with `{ "body": "<amended body>" }` folds the
  interview's new criteria into the epic's Definition of Done in place. The same call deletes a
  resolved parked question's line from the epic's `## Parked questions` section. Both are edits to the
  epic issue's own body, never to a merged slice's issue. The never-edit rule above still holds for every
  slice.

The issue index is server-assigned at creation, already unique and stable, so append names no
continuation rule for `id`.
