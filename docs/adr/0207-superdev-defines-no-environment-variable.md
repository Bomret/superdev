# 0207: superdev defines no environment variable

**Status:** Accepted

**Amends:** [ADR 0069](0069-the-knowledge-base-backend-is-five-command-templates.md), whose templates take
their placeholders as one JSON file instead of environment variables;
[ADR 0130](0130-a-backend-command-runs-under-a-time-bound.md) and
[ADR 0142](0142-the-fail-to-pass-bound-has-a-floor.md), whose overrides move to the operator configuration.

## Context

superdev is a Claude Code plugin. Its shipped tree read environment variables of its own: two time
bounds (`SUPERDEV_PUBLISH_KB_TIMEOUT_MS`, `SUPERDEV_FAIL_TO_PASS_FLOOR_MS`), a
tea login (`SUPERDEV_KB_TEA_LOGIN`, read by the Forgejo knowledge-base seed), and the `SUPERDEV_KB_*`
values it passed to a knowledge-base backend command. An environment variable is invisible configuration:
nothing in the repository shows it is set, any process environment can change the plugin's behaviour, and
a plugin's install cannot document or scope it. ADR 0154 removes the overrides only a test set, `SUPERDEV_PUSH_TIMEOUT_MS`
among them. This
decision removes the rest.

## Decision

The shipped plugin reads no environment variable it defines, and passes none to a child process.

- **Every knob lives in the operator configuration**, `.superdev/info.json` of the main working tree,
  keyed by role: `code-host.pushTimeoutMs`, `verification.failToPassFloorMs`, `knowledge-base.timeoutMs`,
  and `knowledge-base.teaLogin`. A missing file, section, or key keeps the default. A value that is not a
  whole number from 1 to 2147483647 reads as absent, and the reader names its key once on stderr. A tea
  login is the operator's identifier, so it belongs in that untracked file (ADR 0073).
- **A knowledge-base backend command takes one JSON file as `$1`**: `title`, `bodyFile`, `parentId`, the
  `find` result's fields under `found`, and the `knowledge-base` section of the operator configuration
  under `operator` (`{}` when absent). The file is private to the operator and removed after the spawn,
  whatever its outcome. No value reaches the command text, so a staged title cannot inject shell code,
  and no `find` field can shadow superdev's own values or the time bound.
- **A template that still names `SUPERDEV_KB_` is refused** before any backend call, naming
  `/superdev:setup`.

## Considered options

- **Tracked `docs/agents/*.md` lines.** One team-wide value. Lost because the values depend on one
  operator's machine, wiki, and logins, and a tea login is a personal identifier ADR 0073 keeps untracked.
- **Placeholders substituted into the command text, shell-quoted.** Simpler templates. Lost because the
  command's safety would rest on the quoting being exact.
- **Keep the environment variables and document them.** Lost for the reasons in the context.

## Consequences

Every knowledge-base template reads its values through `jq`, so setup checks for `jq` whenever a
knowledge-base backend is configured. An adopter's templates written before this decision are refused
until `/superdev:setup` rewrites them. A dispatched implementer can still write `.superdev/info.json`, as it
could set an environment variable before. The suites set a knob by writing the fixture repository's
`.superdev/info.json`.
