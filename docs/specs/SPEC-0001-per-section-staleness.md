---
id: SPEC-0001
title: Per-section staleness and scoped regeneration
status: in-review
owner: "@ksokolovic"
approvers: ["@<integration>", "@elasticsounds"]
issues: ["#735", "#131", "#733", "#736", "#619", "#626"]
prs: []
adr: "docs/DECISIONS.md#adr-024"
created: 2026-09-10
updated: 2026-09-21
---

<!-- Drafted by an agent from the linked issues and the codebase; edited by the owner.
     Design details are the proposal, not a promise — that is what the review is for. -->

## Problem (with evidence)

Staleness is tracked per pipeline stage. When any input to a stage changes, the whole stage is marked stale for the whole book, and the stage's invalidation path clears its data book-wide before regenerating. Three consequences are visible to partners today:

- **Editing one page invalidates every downstream page.** On a two-hundred-page book, a single caption correction marks captions, translations, easy-read and speech stale for all two hundred pages (#735). #626 documents a settings change that triggered a full re-run and a bill that blocks partner-scale use.
- **Invalidation deletes user work.** Saving a page's storyboard HTML clears the book's caption, catalog and speech-index entries — about 8,850 entries per language on the Tanzania *Mathematics STD 5* book — with nothing in the UI indicating it (#733). Hand-corrected translations are regenerated over and cannot be recovered because manual edits are never in the model cache (#736).
- **The design is disputed.** #733 was closed as "by design"; #736 calls the identical behaviour a violation of core principle 2 ("Entity-Level Versioning: NEVER overwrite entities"). Both are right because no document states the staleness contract. #131 (incremental regeneration) and #619 (re-render selected pages only) are blocked on the same decision.

Anchors (verified 2026-09-21 against `develop` at 7a8896528):

- **The stage-level stale flag.** `step_runs` holds one row per *step*, so "stale" can only be expressed by deleting that row: `clearStepRuns` at `packages/storage/src/book-storage.ts:448` (`DELETE FROM step_runs WHERE step IN (…)`, line 451). `markStoryboardChainStale` at `apps/api/src/routes/pages.ts:647` clears every step of every stage downstream of the storyboard.
- **`clearNodesByType`** at `packages/storage/src/book-storage.ts:76` deletes every version of the named node types (`node_data` and `node_current`, lines 85–86). Quiz generation is the one exception: its output is invalidated, never erased (`invalidateQuizOutput`, line 81).
- **`clearCaptionData`** at `apps/api/src/routes/pages.ts:461` (API layer, not the storage package) clears the eight node types in `IMAGE_SET_CHANGE_CLEAR_NODE_TYPES` (`packages/types/src/pipeline-effects.ts:70`) book-wide. It is called unconditionally from `saveStoryboardNode` (`apps/api/src/routes/pages.ts:682`, call at line 691) and from `clearRestoredNodeDependents` (line 486, call at line 496).
- **The stage runner's invalidation branch** is `makeBeforeRun` at `apps/api/src/routes/stages.ts:164`: `getStageRerunClearNodes` → `clearNodesByType` (line 194), then `clearStepRuns` over every step of every downstream stage (line 204). It lives in the API, not in `packages/pipeline`.
- **`PIPELINE`** at `packages/types/src/pipeline.ts:78` for the stage graph; `getStageClearOrder` / `getStageDependents` at `packages/types/src/pipeline-effects.ts:188` and `:195` derive the downstream set from it.

## Goals

- An edit invalidates only the downstream artifacts that depend on the edited section.
- A "regenerate stale only" action rebuilds exactly the stale set and nothing else.
- No user-edited entity is ever deleted by invalidation; it is marked stale and kept until the user chooses to regenerate it.
- An explicit re-render always re-renders; an unchanged re-run is a cache hit at zero cost (with #731).

## Non-goals

Binding.

- No redesign of the model-level cache or its keys.
- No change to the UI for choosing what to regenerate beyond the existing selective re-render picker (#619); the picker learns to show the stale set, nothing more.
- No general dependency graph across arbitrary entity types before 1 November. V1 beta ships section-granularity staleness for captions, translation, easy-read and speech; other entity types keep stage-level behaviour and are listed under Open questions.
- No migration of existing books' history; existing stale flags are recomputed on first open.

## Proposed design

**Option A — non-destructive stage-level staleness.** Replace the unconditional clears with mark-stale; add "regenerate stale only". ~80 lines, 4 files, plus tests. Fixes the data loss. Does not fix the bill: one edit still marks the whole book stale.

**Option B — per-section staleness keyed on input versions.** Each downstream artifact records the version of each input it was generated from (section text version, storyboard version, prompt version, provider configuration hash). An artifact is stale when any recorded input version differs from the current one. Invalidation becomes a comparison, not a delete; "regenerate stale only" is a filter over the comparison. ~350 lines, 9 files, plus tests; touches the storage schema (a versions map on each artifact) and the stage runner.

**Option C — a full dependency graph across all entity types with change propagation.** Correct in the limit; weeks of work; not before November.

**Chosen: B, with A's mark-stale semantics as the first PR**, so that data loss stops in the first week regardless of how the rest lands. If B slips past 25 September, the beta ships with A plus "regenerate stale only" and B moves to 0.9.0 (roadmap risk 1).

Decisions for the reviewer to ratify:

1. Input-version comparison as the staleness mechanism.
2. Stale artifacts are kept, never deleted, until regeneration.
3. A user-edited artifact is never regenerated implicitly — it is shown as stale and regenerated only on explicit request. This resolves #733 vs #736 in favour of #736.
4. Scope for V1 beta is captions, translation, easy-read and speech.

## Impact map

- `packages/types`: artifact schema gains an `inputVersions` map; a `Staleness` type; no change to `PIPELINE`.
- `packages/storage`: replace `clearNodesByType` / `clearCaptionData` in the invalidation path with `markStale`; add a lint rule banning new unconditional clear/delete call sites on user-touched entities (invariant registry row 2).
- `packages/pipeline`: the stage runner computes the stale set by comparison; "regenerate stale only" as a run mode; explicit re-render bypasses the cache check (#731 lands here).
- `apps/studio`: the selective re-render picker shows the stale set and offers "regenerate stale only". No new panels.
- Invariants affected: entity versioning (strengthened); staleness semantics (new — added to the registry with this spec's contract tests).
- Migration: none for data; stale flags recomputed on first open of an existing book. A book saved by the new version opens in the old one with all downstream marked stale (acceptable for the beta; noted in the support statement).
- Collides with: SPEC-0002 (manual-edit preservation completion) — shares the mark-stale primitive; SPEC-0002 lands after PR 1 of this spec. #808 (text-catalog race) is independent.

## Acceptance criteria

- [ ] AC-1 Editing one section's text marks stale only that section's captions, translation, easy-read and speech; all other sections remain current.
- [ ] AC-2 "Regenerate stale only" regenerates exactly the stale set; the harness asserts the count of regenerated artifacts equals the stale count.
- [ ] AC-3 Saving storyboard HTML for one page leaves every caption, catalog entry and speech-index entry of every other page unchanged (the #733 case).
- [ ] AC-4 A hand-edited translation is never regenerated by an implicit run; it is shown as stale after an upstream edit and regenerated only on request (#736).
- [ ] AC-5 No code path deletes a user-touched entity during invalidation; the lint rule fails CI on any new unconditional clear/delete call site.
- [ ] AC-6 An unchanged full re-run performs zero model calls and reports zero cost.
- [ ] AC-7 An explicit re-render of a current section regenerates it (with #731).
- [ ] AC-8 Concurrent edits to two sections produce two independent stale sets; regenerating one does not touch the other.
- [ ] AC-9 A book saved by the previous version opens; stale flags are recomputed; nothing is deleted.
- [ ] AC-10 On the Tanzania *Mathematics STD 5* acceptance book, a one-caption edit followed by "regenerate stale only" costs less than 1% of a full run.

## Test plan

- Contract tests (`packages/pipeline/test/staleness.contract.test.ts`): AC-1, AC-2, AC-4, AC-7, AC-8 over a three-page synthetic fixture with the model layer mocked. These become the "staleness semantics" row of the invariant registry.
- Storage tests (`packages/storage/test/invalidation.test.ts`): AC-3, AC-5, AC-9; the lint rule under `tooling/eslint-rules` with its own fixture.
- Harness (`pnpm acceptance`): AC-2 count assertion and AC-10 cost assertion on the Tanzania *Mathematics STD 5* and one Brazilian textbook; AC-6 as a zero-cost re-run on every acceptance book.
- Manual: AC-4 checked in a running Studio on the desktop build before the spec moves to `verified`.

## Rollout

- PR 1 — mark-stale instead of delete, plus the lint rule (AC-3, AC-5). Ships value alone; blocks nothing. ADR-024 merges with this PR.
- PR 2 — `inputVersions` on artifacts and the comparison-based stale set (AC-1, AC-8, AC-9).
- PR 3 — "regenerate stale only" run mode and picker integration (AC-2, AC-10).
- PR 4 — explicit re-render and zero-cost re-run with #731 (AC-6, AC-7).
- No feature flag; each PR is independently revertable.

## Open questions

- Which entity types beyond the four named join section-granularity before 1.0 (glossary, quizzes, TOC)? — **@elasticsounds, by 25 Sept.** Default: 0.9.0 via SPEC-0002.
- Does provider configuration (model, voice) belong in `inputVersions` for speech, or is a provider change always an explicit regenerate? — **@<storage>, by 16 Sept.** Default: explicit.
- Anchor check: the Impact map places `clearCaptionData` and the stage runner's invalidation branch in `packages/storage` / `packages/pipeline`, but both live in `apps/api` (`routes/pages.ts:461`, `routes/stages.ts:164`, `services/stage-runner.ts`). Does the mark-stale primitive go into `packages/storage` with the API call sites switched over, or does the invalidation logic move into `packages/pipeline` first? — **@ksokolovic, by 2026-09-24.** Default: primitive in storage, call sites stay in the API.
- Anchor check: the Test plan names `packages/pipeline/test/`, `packages/storage/test/` and `tooling/eslint-rules`; the repo keeps tests in `src/__tests__/` (e.g. `packages/storage/src/__tests__/book-storage.test.ts`) and has no `tooling/` directory. Where do the contract tests and the lint rule live? — **@ksokolovic, by 2026-09-24.** Default: `src/__tests__/` in each package; the lint rule beside the existing ESLint config.
- Anchor check: the clears are not fully unconditional today — `clearNodesByType` exempts quiz generation (`packages/storage/src/book-storage.ts:81`) and `getStageRerunClearNodes` (`packages/types/src/pipeline-effects.ts:221`) keeps glossary, quiz, TTS-normalisation and speech output inside the run range until the step rewrites it. Do these partial preservation paths fold into the mark-stale primitive or stay separate? — **@ksokolovic, by 2026-09-24.** Default: fold in; SPEC-0002 depends on the answer.
