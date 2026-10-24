# Prior-art audit

Two cheap checks that run before a conversation commits to building: is the requested behaviour already
built, and was it already rejected. `/superdev:brainstorm` runs them once the problem is confirmed, before
it explores directions. `/superdev:plan` runs them before its interview commits to building, alongside its
own triage-record check.

- **Redundancy** — search the repo for an existing implementation of the requested behaviour **by domain
  concept, not the request's wording** (the glossary's terms, the code's own names), and report where
  you looked. Found → say so before going further: extending the existing implementation is the
  direction, not building a rival.
- **Prior rejection** — read `.out-of-scope/*.md`, when the directory exists, and surface any entry that
  resembles this request **by concept, not keyword** ("night theme" matches `dark-mode.md`). A match is
  a decision already made: present it, and proceed only when the user explicitly overturns it.
  (`docs/agents/documentation.md` → *Rejected requests* owns the convention.)
