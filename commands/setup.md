---
description: Configure this repo for superdev — choose the slice store (where plans/slices live), the code host (where PRs go), the in-repo documentation convention, the optional knowledge base (software / local file / none), and the optional test command that arms the merge green-gate, writing docs/agents/{issue-tracker,code-management,documentation,knowledge-base,verification}.md. Run once before /superdev:plan or /superdev:implement; they auto-invoke it if config is missing.
---

# superdev setup

Write the two per-repo config docs the superdev skills read, so the workflow is backend-agnostic:

- `docs/agents/issue-tracker.md` — the **slice store** (where slices live + how to CRUD them)
- `docs/agents/code-management.md` — the **code host** (push + open PR/MR + default posture)
- `docs/agents/documentation.md` — the in-repo **documentation** convention
- `docs/agents/knowledge-base.md` — the optional **knowledge base** (software / local file / none)
- `docs/agents/verification.md` — the optional **test command** that arms the merge green-gate hook

This is prompt-driven, not a script. **Explore, propose defaults, confirm one decision at a time, then
write.** Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

## 1. Explore

- `git remote -v` and `.git/config` — GitHub? GitLab? a self-hosted host (Forgejo/Gitea)?
- `docs/agents/` — does prior superdev config already exist? (If so, offer to update, not duplicate.)
- `CLAUDE.md` / `AGENTS.md` at root — which exists? Is there already an `## Agent skills` section? Is a
  `AGENTS.md` documentation hierarchy already present (child `AGENTS.md` files in subdirs)?
- `docs/plans/` — sign the local-file store is already in use.

## 2. Decide (one at a time)

Assume the user may not know these terms. Each decision: a one-line explainer, the choices, the
proposed default (inferred from the remote).

**A — Slice store.** Where do slices/plans live?

- **Local files** — a directory per feature, `docs/plans/<feature-slug>/` (`00-epic-*` = DoD + scope,
  `NN-<test-applicability>-*` = one file per slice, the number is the id). Great for solo work or no
  remote. Seed: `references/issue-tracker-local.md`.
- **Jira** — slices as Jira issues. Seed: `references/issue-tracker-jira.md`. Ask for base URL,
  project key, issue type, the "is blocked by" link type, the ready status/label, and the **env-var
  names** for the API token + email (never the secrets).
- **Other** (GitHub/GitLab Issues, Linear, …) — ask the user to describe create/read/list/update +
  the dependency-link mechanism in a paragraph; write `issue-tracker.md` from that prose.

**B — Code host.** Where does code live / where do PRs go? (Independent of A — code may be on GitHub
while slices live in Jira.)

- **GitHub** (`gh`). Seed: `references/code-management-github.md`.
- **Forgejo / self-hosted** (`tea` or REST). Seed: `references/code-management-forgejo.md`. Ask base
  URL, owner/repo, and the **env-var name** for the token.
- **Other** (GitLab, …) — describe push + open-MR + base computation in a paragraph.

For both hosts, confirm the **default PR posture** (`draft` recommended | `ready` | `push-only`) and
the **base branch** (default `main`).

**C — Documentation (in-repo).** How does the project keep durable in-repo technical docs? The default
convention is an **`AGENTS.md` hierarchy** (walk before editing; update the affected `AGENTS.md` after
meaningful changes; keep concise/current). Seed: `references/documentation.md`. Keep this convention
unless the user has a different in-repo doc convention (then capture theirs as prose).

**D — Knowledge base (optional).** Is there a **knowledge base** for durable, reader-facing docs (PRDs,
design overviews, ADR summaries)? Ask the user which of:

- **Knowledge base software available** — e.g. **Confluence**. Seed:
  `references/knowledge-base-confluence.md`. Ask base URL, space key, what to publish, optional parent
  page, and the **env-var names** for the API token + email (never the secrets). For a different wiki,
  capture its publish/find/update commands as prose ("other").
- **Local file storage** — markdown under `docs/kb/`. Seed: `references/knowledge-base-local.md`.
- **None** — no separate KB; the in-repo docs are the only record.

If a KB (software or local) is chosen, the KB is **human-consumption first, agents second** — so shape
it around its readers. Ask two more things, then propose a structure:

1. **Audience** (multi-select) — who reads it? e.g. end-users, internal developers, ops/support,
   stakeholders. Record the list.
2. **Language** — the single natural language KB prose is written in (e.g. English, German). Code and
   in-repo docs stay as they are; only KB content uses this language.

Then **do a quick repo scan** (README, top-level structure) and **propose an audience-shaped outline** —
a top-level section per audience with a few candidate topic headings under each (e.g. *User Guide →
Getting started, FAQ*; *Developer Docs → Architecture, Setup, ADR summaries*). Present it, **discuss and
adjust with the user**, and record the agreed outline in `knowledge-base.md`. It's a living skeleton —
`/superdev:plan` and `/superdev:document` fill and extend it, not reinvent it.

**E — Verification (optional).** What single command runs the repo's test suite (e.g. `npm test`,
`pytest -q`, `cargo test`)? Recorded, it **arms the green-gate**: after every controller merge, a hook
re-runs it and blocks the run if the scope suite is RED — turning implement's "re-run the suite after
merging" from a prompt into a deterministic gate. Detect a likely command from the repo (package.json
scripts, a Makefile `test` target, `pyproject.toml`) and propose it. No suite (e.g. a docs-only repo) →
skip; the gate stays inactive and nothing else changes.

## 3. Confirm, then write

Show the user a draft of both files (and the `## Agent skills` block) and let them edit before writing.

Write:

- `docs/agents/issue-tracker.md` — start from the chosen seed, fill in the specifics. For "other",
  write from the user's prose.
- `docs/agents/code-management.md` — same, from the chosen host seed.
- `docs/agents/documentation.md` — from `references/documentation.md` (or the user's in-repo doc
  convention as prose).
- `docs/agents/knowledge-base.md` — from the chosen KB seed (`knowledge-base-confluence.md` /
  `knowledge-base-local.md`) filled in, or the "other" prose. For **None**, write a one-line
  `knowledge-base.md` stating there is no separate KB (or skip the file).
- `docs/agents/verification.md` — the test command in a single fenced block (the green-gate reads the
  first fenced block). Skip the file entirely if there's no suite. Example:

  ````markdown
  # Verification

  ```sh
  npm test
  ```
  ````
- Add an `## Agent skills` block to whichever of `CLAUDE.md` / `AGENTS.md` already exists (edit that
  one; never create the other; never duplicate an existing block):

```markdown
## Agent skills

### Slice store
[one-line summary]. See `docs/agents/issue-tracker.md`.

### Code host
[one-line summary, incl. default PR posture]. See `docs/agents/code-management.md`.

### Documentation
[one-line summary — in-repo docs or the project's convention]. See `docs/agents/documentation.md`.

### Knowledge base
[one-line summary — software / local file / none]. See `docs/agents/knowledge-base.md`.

### Verification
[the test command, or "none"]. Arms the merge green-gate. See `docs/agents/verification.md`.
```

If neither `CLAUDE.md` nor `AGENTS.md` exists, ask the user which to create — don't pick for them.

## 4. Done

Tell the user setup is complete and that `/superdev:plan` and `/superdev:implement` now read these
files. They can edit `docs/agents/*.md` directly later; re-run this skill only to switch backends.
Record only env-var **names** for secrets — never the token values.
