---
id: SPEC-0003
title: Sectioning modes — B1 lifecycle and persisted-output safety
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#708"]
prs: []
adr: "docs/DECISIONS.md#025-sectioning-mode-changes-preserve-content-and-gate-rendering"
created: 2026-09-22
updated: 2026-09-22
---

## Decision under review

A change between Dynamic and By Page invalidates Sectioning and its consumers without deleting content. Storyboard must reject incompatible persisted Sectioning before clearing or writing rendered output. The rule applies to Studio, API, queued execution and CLI/DAG runs.

The roadmap and the [scaffolding index](https://github.com/unicef/adt-studio/blob/dd8e931bb52d2b5113b1595a3aa6b6b84ed57bfc/docs/specs/INDEX.md) reserve SPEC-0003 for three sectioning modes and cross-page merge. This document uses that reserved identity for its **B1 increment, #708 only**. It does not approve the broader B2 design or close #337/#627. Expand this same spec through review when that scope is designed; do not create a competing sectioning-mode contract. The narrowed title and B1/B2 split need ratification at spec review.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

This spec requires non-destructive admission and protection for manual or unknown-origin Sectioning output. The current preservation draft has an unresolved legacy-provenance policy; reconcile it before implementation. Mode invalidation does not silently grant replacement permission.

## Problem (with evidence)

[#708](https://github.com/unicef/adt-studio/issues/708) already defines 21 acceptance criteria. Its generation-time predecessor, #692, rejects newly generated or cached multi-section responses in By Page mode. That cannot repair an existing book created in Dynamic mode or imported with historical multi-section data.

Checked against [develop `7a88965284faebcc0beb2e357a5adda9fbfbda45`](https://github.com/unicef/adt-studio/tree/7a88965284faebcc0beb2e357a5adda9fbfbda45), 2026-09-22:

| Evidence | Consequence |
|---|---|
| `apps/api/src/routes/books.ts:320`; `services/book-service.ts:388` | Configuration is written to YAML without mode-specific invalidation or an active-run guard. |
| `packages/pipeline/src/page-sectioning.ts:377` | The exactly-one-section validator operates during generation, not when historical output is read. |
| `apps/api/src/routes/stages.ts:164` | `makeBeforeRun` can clear outputs before a runner gets a chance to reject input. A validator inside rendering alone is too late. |
| `packages/pipeline/src/pipeline-dag.ts:608`; `apps/api/src/services/stage-runner.ts:1641` | Both execution paths have distinct fixed-layout and reflowable branches. A guard in just one branch leaves a bypass. |
| `apps/api/src/routes/pages.ts:662`; `services/task-service.ts` | Persisted running step rows and live tasks are separate sources of concurrency state. |

This is spec work because it changes the configuration-to-pipeline lifecycle and crosses an entity-preservation invariant. The supplied SDD companion explicitly uses #708 as its acceptance-criteria example.

## Goals

- Make effective mode and completion state agree after saves, failures and restart.
- Preserve Extract output, all entity versions, stable identities and referenced media.
- Reject all invalid pages in one actionable preflight before any Storyboard mutation.
- Keep mode changes deliberate and generation explicit.

## Non-goals

- New modes, automatic cross-page merge, transformations from many sections to one, or redefining manual structural editing.
- Automatically rerunning Sectioning, replacing the #692 validator, or a new cache-busting mechanism.
- Implementing the per-section freshness engine in [SPEC-0001](https://github.com/unicef/adt-studio/pull/879) or editorial protection in [SPEC-0002](https://github.com/unicef/adt-studio/pull/880).
- Treating old rendering as current merely because its section count is valid.

## Proposed design

### Options and chosen scope

| Option | Relative cost | Decision |
|---|---|---|
| Hide or warn in the selector only | Small UI change | Insufficient for API, imported books and CLI. |
| Non-destructive invalidation plus a shared persisted-data preflight | Moderate cross-layer change and recovery tests | Recommended B1 contract. |
| Convert historical section trees on mode change | Large identity, content and preservation surface | Deferred; requires the broader B2 design. |

### Effective mode and affected work

Compare the effective configuration before and after the entire proposed override update, using the same resolver as execution. An absent effective mode defaults to `dynamic`. Removing a book override may reveal a global value; comparing raw JSON fields is insufficient. Reject an invalid mode through a Zod contract in `@adt/types` before any write.

Both `dynamic → page` and `page → dynamic` invalidate the entire Sectioning stage, including its `translation` step, plus every consuming downstream stage. Derive the closure and step names from `PIPELINE` and its shared helpers. Preserve Extract completion and data. Unchanged effective mode and unrelated configuration edits perform no mode invalidation.

For this B1 increment, clearing affected completion records represents stale work; it must not call an entity-clear function. When SPEC-0001 provides richer freshness metadata, use its shared invalidation primitive with this same scope. Absence of a completion record must not be interpreted by a reader as proof that retained content is fresh.

The configuration transition creates no section, rendering, translation or media versions. Subsequent reruns obey SPEC-0002, including protection of manual and unknown-origin content. The transition itself is not authorization to overwrite those outputs.

### Mutation ordering and concurrency

Use one book writer gate for the mode check, configuration publication and invalidation. The gate must be shared with stage admission, page mutations and targeted tasks, and must protect supported CLI/API access to the same directory. Checking `step_runs` and then writing without serialization is not sufficient.

Reject a mode transition with `409 BOOK_BUSY` if any pipeline or conflicting live task is active. No configuration, step state, content or asset changes may survive the rejection. Pending jobs may remain queued, but must load the effective mode and revalidate input when they actually start. They may not retain a configuration snapshot from before the transition.

Configuration YAML and SQLite cannot participate in a single native transaction. The proposed implementation uses a small book-local transition journal: record old/new configuration hashes and affected completion records before publication; use an atomic YAML replacement and transactional status invalidation; acknowledge success only after both complete. Recovery under the writer gate finishes a transition whose new configuration was published, or restores the prior state if it was not. Reads/runners encountering an unfinished transition must reconcile it or return an actionable busy/error result, never show new mode with old successful completion. Synchronous failures before publication restore the old state. An ambiguous client timeout is resolved by re-reading authoritative configuration, not by assuming failure.

The journal is application metadata, not a second content database. Its exact representation and retention are an implementation design review item. Use existing filesystem/SQLite primitives and no new dependency.

### Storyboard preflight

Provide one pure validator receiving the effective mode, the active source-page set and latest Sectioning values. Return structured failures `{pageId, pageNumber, reason}` with reasons `missing`, `empty`, `multiple`, or `invalid-data`. Do not mutate storage, renumber IDs or normalize the content into compliance.

For By Page, require a valid latest `page-sectioning` value with exactly one section for **every active source page**. A tombstone/null, unreadable value, zero sections or multiple sections fails. Use the extracted page set and a part's actual page window, not every page number in the original PDF or an inferred contiguous sequence. Historical and imported books follow the same rule.

Dynamic mode retains its existing behavior, including multiple sections. Layout strategy is independent of mode: By Page validation applies before either fixed-layout or reflowable Storyboard execution. A fixed-layout branch may not silently bypass the semantic-mode contract.

Collect all failures first. The API reports the total and up to 20 representative page identities; Studio/CLI show a bounded, translated summary directing the user to rerun Sectioning. Preserve structured details for inspection without dumping book text.

For a Storyboard-only run, preflight happens before `makeBeforeRun` clears/retirements/debug cleanup or any task is admitted to write. For a run that regenerates Sectioning first, retain the old Storyboard while Sectioning runs, then preflight the newly committed Sectioning snapshot before Storyboard begins. A queue-admission check is helpful but never replaces the execution-time check.

Targeted rerenders use the same book-wide By Page prerequisite. Revalidate the captured configuration and Sectioning versions before publishing any resulting rendering. A concurrent change produces a conflict/stale attempt, not a partial overwrite. Preflight failure starts no rendering/provider call and changes no rendering, active media, section identity or downstream content. An execution error record is allowed; it is not successful completion.

### Studio behavior

If Sectioning or any downstream output exists, selecting a different effective mode opens the existing confirmation pattern: “Sectioning and later stages will need to run again. Saved versions are kept.” Detect retained output as well as completed step rows. Cancel sends no update request. A new book with no such output needs no confirmation.

Disable the selector while saving or while known conflicting work is active. Server enforcement remains authoritative. On rejection, retain/refetch the persisted selection and show the reason; do not leave the proposed mode selected. On success, refresh book config, effective/debug config, step status and affected page/stage indicators. Existing retained output stays inspectable with stale status. All new copy uses Lingui and translations for `en`, `pt-BR`, `es`, `fr`, `sq`.

### Cache and historical data

The required Sectioning rerun uses the existing generation validator. An invalid cached By Page response is revalidated, evicted and retried with validation feedback as #692 specifies. Do not truncate cached sections or randomize request keys. Unchanged valid requests remain reusable.

Opening a historical book does not silently migrate its trees. The preflight provides a safety boundary even where no mode transition was observed. An externally edited YAML file cannot be trusted solely because completion rows say “done”; execution must compare its effective mode with the persisted lifecycle/freshness record and fail safe if that provenance is unknown.

## Impact map

| Area | Expected change / coordination |
|---|---|
| Types and pipeline | Zod failure/transition contracts; pure preflight; DAG-derived invalidation. |
| API and storage | Configuration service, writer admission, journal/recovery, stage and targeted-render preflight ordering. |
| Studio | Selector confirmation, authoritative rollback, stale-state query refresh and translations. |
| SPEC-0001/0002 | Consume their invalidation/protection policies; no duplicate freshness or provenance implementation. |
| SPEC-0010 | CLI extraction/resume admission must lead into this same preflight. |
| SPEC-0012 | Text synchronization cannot declare an incompatible By Page tree current. |
| B2 SPEC-0003 expansion | Decide new modes/merge policy later; preserve this B1 lifecycle boundary. |

The proposed decision is recorded in [ADR 025](../DECISIONS.md#025-sectioning-mode-changes-preserve-content-and-gate-rendering). It remains proposed until this spec's blocking review questions are resolved. No new runtime enforcement is claimed by this documentation PR.

## Acceptance criteria

The first 21 criteria preserve the subjects and order of #708's checklist.

- [ ] AC-1 Dynamic to By Page invalidates Sectioning and every downstream step.
- [ ] AC-2 By Page to Dynamic invalidates the same dependency closure.
- [ ] AC-3 Extract completion and extracted data remain unchanged.
- [ ] AC-4 Every existing content version and referenced media byte survives a mode change.
- [ ] AC-5 Saving an unchanged effective mode causes no invalidation.
- [ ] AC-6 An unrelated config edit causes no mode invalidation.
- [ ] AC-7 A mode transition during active/conflicting work returns 409 with no mutation.
- [ ] AC-8 Studio confirms a transition when retained or completed downstream output exists.
- [ ] AC-9 Cancel leaves configuration unchanged and sends no mutation request.
- [ ] AC-10 A failed update restores/refetches the persisted selection and surfaces the error.
- [ ] AC-11 Successful transitions refresh config, debug config, step and relevant page/stage state.
- [ ] AC-12 By Page preflight rejects a missing latest Sectioning result.
- [ ] AC-13 By Page preflight rejects zero sections.
- [ ] AC-14 By Page preflight rejects multiple sections.
- [ ] AC-15 Any preflight failure preserves all rendering versions and starts no rendering call.
- [ ] AC-16 Exactly one valid section per source page permits Storyboard subject to other prerequisites.
- [ ] AC-17 Dynamic mode continues to accept multiple sections.
- [ ] AC-18 Historical/imported inconsistencies are caught without an observed config transition.
- [ ] AC-19 API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout.
- [ ] AC-20 All new UI copy is translated in the five supported locales.
- [ ] AC-21 The implementation adds no dependencies.
- [ ] AC-22 Effective override removal/default resolution is correct; invalid modes change nothing.
- [ ] AC-23 Injected file/DB failures and restart at each journal boundary never expose new mode with old current status.
- [ ] AC-24 Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions.
- [ ] AC-25 Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results.
- [ ] AC-26 Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible.

## Test plan

| Coverage | Criteria | Required evidence |
|---|---|---|
| Config API + real book storage | AC-1–7, AC-22 | Both transitions; global inheritance; multi-version entities; preserved Extract and media hashes; busy TaskService and step-row cases. |
| Pure preflight + runner integration | AC-12–19, AC-25 | Mixed four-page fixture with missing/empty/multiple/valid results, malformed values, a non-contiguous part window, fixed layout, historical import and zero renderer calls on failure. |
| Failure/concurrency integration | AC-15, AC-23–24 | Fault injection before/after journal, YAML and status publication; queued Sectioning→Storyboard run; targeted render racing a save; restart reconciliation. |
| Studio component/browser | AC-8–11, AC-20 | Confirm/cancel/error/pending states, return to an already-stale book and translated messages. |
| Existing validator/cache regressions | AC-26 | Invalid cached output eviction and valid response reuse through production callers. |
| Dependency/diff review | AC-21 | No package/lockfile additions. |

Run focused Vitest suites, typecheck, relevant lint/i18n checks and an acceptance book through API and CLI on the integrated implementation head. These are future implementation checks, not results of this draft.

## Rollout

Land the shared validator and state-transition tests first, then guarded config publication, then runner ordering and Studio UX. Do not enable the selector behavior without server enforcement. Keep any legacy destructive pre-run clear outside this path until replaced by preservation-safe behavior. If richer freshness work is unavailable, retain the conservative completion invalidation and fail closed at unsafe execution paths.

Rollback may disable mode changes or rendering, but must retain journal recovery and content history. Do not downgrade into a writer that ignores an unfinished transition. No automatic content conversion or release commitment is part of this spec.

## Open questions

All are approval questions, not permission to begin implementation.

| Question | Owner | Resolve by |
|---|---|---|
| Ratify use of reserved SPEC-0003 for this B1 increment while its B2 mode/merge scope stays deferred. | @ksokolovic, coordinating product/integration review | 2026-09-25, before spec approval |
| Ratify journal representation and the shared writer gate, including supported cross-process CLI/API access. | @ksokolovic, obtaining a storage maintainer review | 2026-09-25, before spec approval |
