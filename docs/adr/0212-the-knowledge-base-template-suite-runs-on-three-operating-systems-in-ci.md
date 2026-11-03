# 0212: The knowledge-base template suite runs on three operating systems in CI

**Status:** Accepted

## Context

A knowledge-base seed's command templates run as `sh -c` on the adopter's machine: macOS, Linux, or
Windows under Git Bash (ADR 0150). The maintainer runs the suites on macOS only. A template that uses a
GNU-only or a BSD-only flag passes there and fails for an adopter on another system. The GitHub repo wiki
seed adds five such templates.

## Decision

A GitHub Actions workflow runs `tests/publish-kb-templates.test.js` on macOS, Linux, and Windows for
every pull request. A failure on any of them shows on the pull request. The full suite stays a local run.

## Considered options

- **A manual smoke checklist in `docs/known-issues.md`.** Rejected: it proves a system only when someone
  runs it, and the Windows checklist has never run.
- **The full suite on all three systems.** Rejected for now: the full suite has never run on Linux or
  Windows, and the templates are the part an adopter's shell runs.

## Consequences

The repository gains its first CI workflow. A template change that breaks one system fails its pull
request. Other suites carry no cross-system proof.
