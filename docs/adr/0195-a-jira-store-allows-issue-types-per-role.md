# 0195: A Jira store allows issue types per role

**Status:** Accepted

**Context.** The Jira seed fixed `Epic` as the scope anchor's type and one `<Story|Task>` type for both
slices and triage records. A real project holds more: WEAVER (checked 2026-10-28 through
`GET /rest/api/3/issue/createmeta/WEAVER/issuetypes`) offers Epic, Story, Task, Bug, Management, Modul, and
Sub-task, plans its slices as Stories and Tasks under one Epic, and files its triage records as Tasks and
Bugs. A seed with one slice type cannot write that, and a seed that reads every type as its own counts a
Management issue as untriaged work.

**Decision.**

- `/superdev:setup` reads the project's creatable issue types and asks, per **Issue-type role** (scope
  anchor, slice, triage record), which types superdev may use. The anchor role offers only types that
  parent other issues (`hierarchyLevel` 1), the slice and triage roles only standard types
  (`hierarchyLevel` 0); no role offers a sub-task type.
- Each allowed type carries a one-line "use for" in the operator's words. The command that creates an
  issue picks its type by those lines and falls back to the role's first type, its default.
  `/superdev:plan` shows each slice's type before it writes anything.
- A create names the type by id, so a renamed or translated type name does not break it.
- Superdev counts an issue of a type no role allows as none of its own.

**Considered options.**

- **One fixed default per role.** Superdev always creates the default; other allowed types are only
  recognised when reading. Deterministic and one question shorter at setup, but it never files a defect as
  a Bug, which is the project's own convention. Rejected.

**Consequences.** A Jira configuration written before this decision keeps its single slice type, read as
the slice and triage default, and `/superdev:setup` offers the per-role types as a seed gap (ADR 0107).
That configuration records no type id, so until the gap is applied a create and a listing name the type by
name, with `Epic` as the anchor type.
