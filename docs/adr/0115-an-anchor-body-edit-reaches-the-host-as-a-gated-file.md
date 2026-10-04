# 0115: An anchor body edit reaches the host as a gated file

**Status:** Accepted

## Context

Every store document told a controller to edit an issue body by piping the new body into the host's edit
call: `tea issues edit <index> --description-file -` on Forgejo, a `PATCH` whose body is a producer's
stdout on GitHub, and a `PUT` of a rebuilt description on Jira. The Definition-of-Done tick, the
`## Run state` write, the `**Depends on:**`, `**Blocked by feature:**`, and `**Deploy:**` body-appends,
and the epic amendment all use this shape.

Two defects meet at that shape. A shell pipe discards the producer's exit status, and the host takes
empty input as a new, empty body. During scope `run-lock-temp-root-collision` this replaced the body of
issue #818 with nothing. The read side has the same gap: `jq -r .body` exits 0 and prints nothing on empty
input, and prints `null` when the field is absent. A failed read therefore hands the producer an empty
anchor. The `## Run state` merge then appends its section to nothing, and the write replaces the body
with that section alone.

The Forgejo tick recipe also fed `scope.js dod-line` the JSON response of `tea issues <index> -o json`,
not the markdown body. `dod-line` found no checklist line and exited 1, so every tick on a Forgejo store
failed, and the pipe then blanked the body.

## Decision

- **Each store document states one body-edit rule**, in its **Edit an issue's body** bullet. Every
  section that edits a body cites that bullet and restates none of it.
- **The read lands in a file, gated.** The host's read call writes to a file. `jq -er .body` (or the
  store's own extraction) writes the body to a second file only when the read succeeded, and fails on a
  missing field.
- **The producer writes the new body to a file, and its exit status gates the edit.** The edit runs only
  when the producer exited 0 and the file is non-empty: `<producer> > "$f" && [ -s "$f" ] && <edit
  call naming "$f">`. A failed step stops the chain, and the anchor body stays as it was.
- **The edit call reads the body by path.** Forgejo passes `--description-file "$f"`. GitHub and Jira
  build their JSON payload into a second file with `jq --rawfile`, gated the same way, and send that
  file. Stdin from a pipe is never the body source for an edit.
- **A create keeps its heredoc stdin.** A create has no producer that can fail, and an empty create
  adds a new issue. It damages no existing body.
- **drift-check pins the rule.** A store document that edits a body from stdin, carries an edit-body
  bullet without the gate, or has a tick section that names no body extraction fails the suite.

## Considered options

- **Make `dod-line` carry the guard.** Rejected: `dod-line` already exits 1 with empty stdout on no
  match. The pipe drops that status and the host accepts empty input, so no change to the verb closes
  the gap.
- **One `scope.js` verb that fetches, edits, and writes the body.** Rejected: `dod-line` and its
  siblings make no store call (`scripts/AGENTS.md`, triage #664). It would also leave every other body edit
  unguarded.
- **Fix the Forgejo tick recipe only.** Rejected: it repairs the tick and leaves the other stdin body
  edits, and the GitHub and Jira seeds, with the same hazard.
- **`set -o pipefail` around the existing pipes.** Rejected: it catches a failed producer, but not one
  that succeeds with empty output, and it depends on the shell the controller happens to run.
- **Refuse a write that is shorter than the body it read.** Rejected: a legitimate edit can shrink a
  body, for example a resolved parked question deleted from the epic. The gate above already stops the
  failures that produced an empty or partial body.

## Consequences

- A failed read, producer, or payload build leaves the anchor body unchanged, and the write is reported
  once per run, as every best-effort anchor write already is.
- A Forgejo tick edits the matching checklist line and nothing else.
- A consumer repository picks up the rule through `/superdev:setup`'s seed gaps (ADR 0107).
