# SPEC-0001 shared implementation reuse

The book writer admission protocol and process-level regression tests are adapted
from the published SPEC-0010 PR #886 (`876cc2ae`, initially `7d5cec5f`), which itself
attributes applicable writer work to SPEC-0003 PR #884 (`e3737abe`). These use one
book-local `.book-writer.json` lease, nested async ownership, exclusive creation
and fail-closed recovery. SPEC-0001 retains the stricter #884 refusal when a dead
owner left an anonymous SQLite mutex. SQLite journal/WAL recovery data is never
deleted by startup cleanup.

Only the shared writer module, its owner schema, startup cleanup integration and
applicable tests are adapted. No specification, acceptance claim, extraction
manifest subsystem or Sectioning lifecycle implementation from those PRs is
copied. The published dependency PRs and their checkouts are not modified.

Merged PR #737's Storyboard save policy and the current section/quiz identity
factories remain the starting implementation. Catalog freshness supersedes
destructive downstream clearing, not their identity allocation rules.
