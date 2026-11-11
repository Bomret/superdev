# superdev

An agent left alone will ship with confidence — whether or not anyone agreed what "done" means, whether
or not its own tests prove anything, whether or not the diff ever got a second look.

superdev makes it stop and check first.

superdev is a Claude Code plugin that takes a feature from a rough idea to a verified deploy: brainstorm,
plan, implement, review, document, pull request, ship, verify, and wrap-up. Alongside that chain it
audits your tests, sweeps a whole repository for problems, reports the state of every run, and publishes
docs to a knowledge base. It needs no other plugin.

- `/superdev:plan` interviews you until the **Definition of Done** is checkable. Then it cuts the work into
  small **vertical slices**, each one green on its own.
- `/superdev:implement` builds the slices. A plan of 3 slices or fewer runs test-first, inline. A larger
  plan runs in parallel, one isolated git worktree per slice, and a separate reviewer subagent checks each
  slice before it merges.
- `/superdev:review` reviews the whole scope against the Definition of Done and runs the full suite once.
- The chain continues through docs, pull request, merge, deploy, and verification. Each command names the
  next one and offers to start it.
- Deterministic hooks hold the rules a prompt cannot: a subagent cannot merge or push, an implementer
  cannot write outside its own worktree. `scope.js` reports an outside edit of a run's ledger or trace, and
  the review grades an untraced write.
- Backends are pluggable. Slices live in GitHub Issues, Jira, Forgejo or Codeberg Issues, or a tracker you
  describe. Docs can go to a knowledge base such as a GitHub Wiki or Confluence.

Full documentation: the [superdev wiki](https://github.com/Bomret/superdev/wiki).

## Commands

```
/superdev:setup        → configure backends in docs/agents/*.md (once per repo)
/superdev:brainstorm   → (optional) turn a vague idea into a plan-ready intent
/superdev:plan         → interview + slice a feature into the slice store
/superdev:implement    → drive the slices to merge onto the scope branch
/superdev:review       → whole-scope review against the Definition of Done, with a fix loop
/superdev:document     → reconcile in-repo docs + knowledge base with the code
/superdev:submit-pr    → push the scope branch and open the PR
/superdev:ship         → merge the reviewed PR and deploy per the repo's posture
/superdev:verify-ship  → check the Definition of Done on the deployed system
/superdev:wrap-up      → close the scope and take the run down
/superdev:status       → read-only: every run's progress and what to do next
/superdev:publish-kb   → send staged knowledge-base pages to the configured backend
/superdev:review-tests → read-only audit of test cost and test gaps
/superdev:sweep        → read-only review of code, docs, tests, and config in one report
/superdev:upgrade      → install the latest release
```

```mermaid
flowchart LR
  brainstorm["brainstorm (optional)"] --> plan --> implement --> review --> document --> submit["submit-pr"]
  submit --> ship
  ship --> verify["verify-ship"] --> wrapup["wrap-up"]
  ship --> wrapup
```

`/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` start only when you type the command,
ask for it, or agree to an offer. When verify-ship settles every Definition-of-Done line, it starts
`/superdev:wrap-up` itself in the same turn, so a fully verified scope closes without another prompt.
Wrap-up still runs every check and asks every question it asks when you type it.

## Install

Prerequisites: Claude Code, and `node` on PATH. superdev runs on macOS, Linux, WSL, and native Windows with
Git Bash. Some backends also need `jq`, `gh`, `tea`, or an API token.

```
/plugin marketplace add https://github.com/Bomret/superdev.git
/plugin install superdev@superdev
```

The install pins the latest release tag. Both commands write to your **user** settings, so run them once
per machine. A repository cannot enable the plugin for you.

Then, in each repo, run `/superdev:setup` once, then `/superdev:plan` and `/superdev:implement`.

To update, run `/superdev:upgrade`, then `/reload-plugins`.

To hack on superdev itself, load a clone's working tree:

```
git clone https://github.com/Bomret/superdev.git
cd superdev
claude --plugin-dir ./plugin
```

## Learn more

- [Install and configure](https://github.com/Bomret/superdev/wiki/Guide:-Install-and-configure)
- [Plan a feature](https://github.com/Bomret/superdev/wiki/Guide:-Plan-a-feature)
- [Ship and wrap up](https://github.com/Bomret/superdev/wiki/Guide:-Ship-and-wrap-up)
- [Command chain](https://github.com/Bomret/superdev/wiki/How-it-works:-Command-chain)
- [Concepts](https://github.com/Bomret/superdev/wiki/Concepts)
- Every guide and mechanism page: the [wiki home](https://github.com/Bomret/superdev/wiki)
- Why it is built this way: [`docs/adr/`](docs/adr/)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md). Releases: [`RELEASING.md`](RELEASING.md)

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. The writing standard draws on
ASD-STE100 (© ASD) and cites the tekom Praxisleitfaden as prior art. See `NOTICE`.

## License

MIT. See `LICENSE`.
