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

The October 12 feedback follow-up also adapts the absent-book admission guard
from #886 at `3a7ad4a33b18db8aac851c093712ce4d5112ec4d`. The local regression
showed that merely calling the next handler was insufficient: the rendering
handler itself opens creating storage. This adapter returns 404 before either
admission or the handler can recreate a deleted book. Collection import routes
keep their existing exemption. No other #886 code or history is imported.

The completion pass applies SPEC-0012 PR #888's strict rendered-owner rule from
`sectioning-sync.ts` at `d9dac25357dd971e4c970ebf19edc778468fb976`: retained HTML
is associated by its stable root identity, never a new source array position.
The existing `render-sectioning.ts` resolver now shares this rule with catalog,
image inventory, Easy Read and reading order/packaging. New rendering producers
also record that owner explicitly. This is identity metadata, not synchronization
proof or generated provenance; #888's evidence/schema subsystem is not copied.
Unverifiable legacy ownership stays retained with omission disclosure. No
subsystem or history from the descendant is merged into #879.
