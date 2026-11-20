# Prior-art audit

Two checks that run before a conversation commits to building: is the requested behaviour already built, and was it
already rejected. `/superdev:brainstorm` runs them once the problem is confirmed, before it explores directions.
`/superdev:plan` runs them before its interview commits to building, beside its own triage-record check.

**Redundancy.** Applies to every requested behaviour. Search the repository for an existing implementation **by domain
concept, not the request's wording** (the glossary's terms, the code's own names), and report where you looked.

- **Found** → say so before going further. Extending the existing implementation is the direction, and no rival gets
  built.

**Prior rejection.** Applies when `.out-of-scope/` exists. Read `.out-of-scope/*.md`, and surface every entry that
resembles this request **by concept, not keyword** ("night theme" matches `dark-mode.md`).

- **A match** → a decision already made: present it, and proceed only when the user explicitly overturns it.
- `docs/agents/documentation.md` → *Rejected requests* owns the convention.
