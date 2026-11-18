# 0258: The doc pass reconciles comments in files the scope changed

**Status:** Accepted

## Context

No rule said whether the doc pass may edit a non-Markdown file. In one 0.108 run a doc writer rewrote comments
in a `.java` and a `.py` file that stated a rule the scope had changed. Nothing in the contract allowed it or
forbade it, so the next writer may do it again or may leave such a comment stale.

## Decision

The doc pass reconciles comments and docstrings in the non-Markdown files the scope's range changes, and edits no
code token in them. A comment that is stale in a file outside the range is named in the doc pass's report and
left unedited. `/superdev:document` still runs no test (ADR 0189). Ship takes the full-suite evidence on the head
it merges (ADR 0255), so a doc commit to a non-Markdown file needs no run of its own.

## Considered options

- *Markdown only, and a stale comment goes to a triage record.* Rejected: the comment ships stale although the
  pass that found it could fix it.
- *Any file in the repository.* Rejected: doc commits outside the scope's diff are hard to review against it.

## Consequences

A comment edit that breaks the code, such as a doctest, surfaces at ship's full-suite evidence.
