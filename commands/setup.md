---
disable-model-invocation: false
description: Configure this repo for superdev — choose the slice store (where plans/slices live) and the code host (where PRs go), and write docs/agents/issue-tracker.md + docs/agents/code-management.md. Run once before /superdev:plan or /superdev:implement; they auto-invoke it if config is missing.
---

# superdev setup

Write the two per-repo config docs the superdev skills read, so the workflow is backend-agnostic:

- `docs/agents/issue-tracker.md` — the **slice store** (where slices live + how to CRUD them)
- `docs/agents/code-management.md` — the **code host** (push + open PR/MR + default posture)

This is prompt-driven, not a script. **Explore, propose defaults, confirm one decision at a time, then
write.** Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

## 1. Explore

- `git remote -v` and `.git/config` — GitHub? GitLab? a self-hosted host (Forgejo/Gitea)?
- `docs/agents/` — does prior superdev config already exist? (If so, offer to update, not duplicate.)
- `CLAUDE.md` / `AGENTS.md` at root — which exists? Is there already an `## Agent skills` section?
- `docs/plans/` — sign the local-file store is already in use.

## 2. Decide (one at a time)

Assume the user may not know these terms. Each decision: a one-line explainer, the choices, the
proposed default (inferred from the remote).

**A — Slice store.** Where do slices/plans live?

- **Local file** — slices in `docs/plans/<feature>.md`. Great for solo work or no remote.
  Seed: `references/issue-tracker-local.md`.
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

## 3. Confirm, then write

Show the user a draft of both files (and the `## Agent skills` block) and let them edit before writing.

Write:

- `docs/agents/issue-tracker.md` — start from the chosen seed, fill in the specifics. For "other",
  write from the user's prose.
- `docs/agents/code-management.md` — same, from the chosen host seed.
- Add an `## Agent skills` block to whichever of `CLAUDE.md` / `AGENTS.md` already exists (edit that
  one; never create the other; never duplicate an existing block):

```markdown
## Agent skills

### Slice store
[one-line summary]. See `docs/agents/issue-tracker.md`.

### Code host
[one-line summary, incl. default PR posture]. See `docs/agents/code-management.md`.
```

If neither `CLAUDE.md` nor `AGENTS.md` exists, ask the user which to create — don't pick for them.

## 4. Done

Tell the user setup is complete and that `/superdev:plan` and `/superdev:implement` now read these
files. They can edit `docs/agents/*.md` directly later; re-run this skill only to switch backends.
Record only env-var **names** for secrets — never the token values.
