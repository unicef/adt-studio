---
id: SPEC-0000
title: <short, specific title>
status: draft # draft | in-review | approved | in-progress | implemented | verified | superseded
owner: "@handle" # exactly one human owner
approvers: [] # ≥1 maintainer; + product sign-off when user-facing scope changes
issues: [] # e.g. ["#735"]
prs: [] # filled in as implementation lands
adr: "" # link to the ADR in docs/DECISIONS.md when a standing decision changes
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

<!--
How to use this template (see docs/SPEC_DRIVEN_DEVELOPMENT.md §5):
- Copy to docs/specs/SPEC-NNNN-short-slug.md (next number from docs/specs/INDEX.md).
- A draft is cheap: generate it with an agent from the issue + codebase, then edit.
- Open a PR adding this file; review of that PR IS the spec review (3-working-day time box).
- Once approved, the spec is the shared context every implementing session loads.
- Keep it as short as the change allows. Delete sections that genuinely don't apply.
-->

## Problem (with evidence)

<!-- Symptoms, not solutions. Link issues, quote error output, cite file:line anchors,
     include measurements ("on Mathematics STD 5 that is ~8,850 entries per language").
     A reader should finish this section convinced the problem is real and scoped. -->

## Goals

<!-- What will be true when this is done. Short bullets. -->

## Non-goals

<!-- Binding. What this change deliberately does NOT do, so reviewers and agents
     don't expand scope and adjacent work isn't blocked waiting for it. -->

## Proposed design

<!-- Options considered with rough cost (the pattern from #731: "Option A — ~5 lines,
     1 file" vs "Option B — ~60 lines, ~6 files + tests"), the chosen option, and why.
     Name the explicit design decisions a reviewer must ratify. -->

## Impact map

<!-- - Packages/files touched (expected)
     - Invariants affected (entity versioning, stable IDs, staleness, layer rules, prompt contracts)
     - Data/schema migration needs
     - Concurrent work this collides with (check docs/specs/INDEX.md and open PRs) -->

## Acceptance criteria

<!-- Testable checkboxes. The implementation review checks these boxes, not vibes.
     Model: #708 (21 checkboxes incl. concurrency rules and i18n requirements). -->

- [ ] ...

## Test plan

<!-- Which tests, at which level (unit / API / e2e over the fixture corpus), where they
     live, what fixtures they need. Every acceptance criterion maps to at least one test. -->

## Rollout

<!-- Config/flags, data migration, ordering vs other specs, revert story. -->

## Open questions

<!-- Each assigned to a person, with a date. An approved spec has none blocking. -->
