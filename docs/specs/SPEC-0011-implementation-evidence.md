# SPEC-0011 implementation evidence

Implementation target: published SPEC-0011 in PR #887. Human review is pending;
SPEC-0011 remains `in-review`, ADR 027 remains proposed, and approvers remain empty.
The user explicitly authorized implementation before approval in the same PR and
local commits without a push. This record does not establish release verification.

## Preparation and baseline

- Refreshed develop: `737d3314`; published #887: `bb37a583` (backup ref
  `backup/spec-0011-published-20260925`). Locally rebase only the SPEC-0011 commit
  onto develop; do not carry the former documentation ancestors #884–#886.
- #644: `64770d09`, four commits by Kemal Sokolovic, is the starting implementation.
  Reuse with cherry-pick attribution and adapt to current model configuration.
  Its PR remains untouched. #629, #644 and #887 have no discussion/review comments.
- #879 (`375081fc`) and #880 (`5eeaab68`) are documentation only. No shared freshness
  implementation exists on develop. Use the specified explicit regeneration notice;
  do not introduce an independent freshness engine or automatic paid regeneration.
- The main checkout's drafts and the separate SPEC-0010 worktree remain untouched.
- References: current AGENTS, architecture, guidelines, invariants, proposed ADR 027,
  and supplied Path to 1.0 / SDD materials. Current request overrides spec-first
  sequencing only; preservation, shared mechanisms and human approval still apply.

## Acceptance map established before implementation

All entries below are planned verification, not passing claims.

| AC | Current behavior / gap | Required change | Concrete verification | Result |
|---|---|---|---|---|
| 1 | No reliable persistence/source feedback | Reuse #644 badges; explicit candidate, target and dirty state | Editor rendering and interaction | not-run |
| 2 | Writes beneath bundled prompts | Writable roots, immutable selected versions | Real filesystem, independent process reload, bundled hash | not-run |
| 3 | Model first, duplicated readers; destructive reset | One resolver for candidate resets and fallback | Reader/engine precedence table | not-run |
| 4 | Base override can be ineffective for chosen model | Show actual resolved candidate and generic-edit caveat | Bundled model vs book base UI/API fixture | not-run |
| 5 | Revisions optional/absent on mutations | Required preconditions on save/reset/restore, preserve draft | Missing/stale revision API and editor tests | not-run |
| 6 | No shared process gate; content-only revision insufficient | Filesystem writer admission plus immutable selection identity | Independent writers and A→B→A | not-run |
| 7 | Repeated writes create history | Compare after precondition; reconcile ambiguous retry by read | Version counts and stale same-content request | not-run |
| 8 | Invalid pointer can choose newest orphan | Validated selection protocol, exclusive durable versions | Inject pointer failure, corrupt/missing pointer, restart | not-run |
| 9 | Reset removes history | Publish inherit/default selections; restore without rewriting | Byte snapshots/history across save-reset-restore | not-run |
| 10 | Ad hoc validation and model folder ambiguity | Shared schemas, validated identity/containment | Invalid inputs, collisions, symlink/traversal fixtures | not-run |
| 11 | Save may clear a newer draft | Capture submitted draft; guard reset/restore/reload/navigation | Deferred save promise with continued typing/errors | not-run |
| 12 | API, agents and CLI roots differ | Shared resolver/root injection, retain inspectable calls | Generation path and CLI tests with stub transport | not-run |
| 13 | Cache uses rendered messages; freshness unavailable | Preserve rendered template/include identity; explicit notice | Transport call counts, include edits, no generation on save | not-run |
| 14 | Legacy files live with resources | Idempotent non-destructive migration, conflict detection | Different bytes, interrupted retry, newer target selection | not-run |
| 15 | Bundled deployment roots may be read-only | Reuse #644 Docker/Desktop wiring | Packaging/restart smoke and read-only defaults | not-run |
| 16 | Templates derive from bundled prompt parent | Keep that derivation independent of overrides | Custom override root + bundled template read/render | not-run |
| 17 | Book overrides/provenance must travel | Verify archive/import includes prompts and actual call log | Moved archive on host with changed globals | not-run |
| 18 | UI strings need five locales | Extract/translate all changes; no new dependency | Lingui catalogs, lint, lockfile review | not-run |

## Narrative constraints

No DB/session persistence, permission model, prompt output-schema change, provider
redesign, destructive render-template edits, cache deletion, automatic regeneration,
or claim of identical results with different host globals. Retain all old versions,
selection history and source migration data. New-format missing/corrupt pointers
fail explicitly. Same-root concurrency includes independent processes. Failed
publication never activates an orphan. Rollback retains roots/history and requires
an explicit compatible reader; old destructive reset is not a rollback path.

## Verification log

Pending baseline and implementation checks. Development evidence must be separated
from packaged runtime, representative-book, CI and release evidence.
