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

## Decision under review

**The unit of freshness and regeneration is a section. Cosmetic changes do not
invalidate downstream content. A relevant content change makes the affected
section stale. When regeneration is requested, each affected downstream step
runs in full for that section, processing all its eligible assets through the
existing LLM cache. V1 does not select individual changed elements for
regeneration.**

V1 covers captions, translation, easy-read and speech. Storyboard's own freshness
remains outside scope. A page action is a selection of its sections; a stage
action is a selection of sections needing work in that stage. Both must use the
same downstream regeneration path.

This revision replaces the attached draft's proposal to determine freshness
solely from input version numbers. A new Storyboard version is evidence of a
save, not necessarily a change to the content downstream features consume.

## Problem and current implementation

The original issue reports describe local edits causing book-wide invalidation,
unexpected regeneration costs, and loss of manual corrections (#735, #626,
#733, #736). Current code has several paths that must be addressed together:

- `apps/api/src/routes/pages.ts`: Storyboard saves clear downstream node types
  across the book.
- `apps/api/src/services/page-edit-service.ts`: even a section re-render clears
  downstream node types in `finally`, including on failure.
- `apps/api/src/routes/stages.ts`: `makeBeforeRun` clears node types before a
  stage run. Changing the editor save path alone cannot preserve user work.
- `packages/storage/src/book-storage.ts`: `clearNodesByType` deletes current and
  historical rows for most node types.
- `apps/api/src/services/stage-runner.ts`: translations and speech are stored in
  per-language collections; easy-read is stored for the book; captions are
  stored per page. Scoped work must merge into these collections safely.

Anchors (verified 2026-09-21 against `develop` at 7a8896528):

- **The stage-level stale flag.** `step_runs` holds one row per *step*, so "stale" can only be expressed by deleting that row: `clearStepRuns` at `packages/storage/src/book-storage.ts:448` (`DELETE FROM step_runs WHERE step IN (…)`, line 451). `markStoryboardChainStale` at `apps/api/src/routes/pages.ts:647` clears every step of every stage downstream of the storyboard.
- **`clearNodesByType`** at `packages/storage/src/book-storage.ts:76` deletes every version of the named node types (`node_data` and `node_current`, lines 85–86). Quiz generation is the one exception: its output is invalidated, never erased (`invalidateQuizOutput`, line 81).
- **`clearCaptionData`** at `apps/api/src/routes/pages.ts:461` (API layer, not the storage package) clears the eight node types in `IMAGE_SET_CHANGE_CLEAR_NODE_TYPES` (`packages/types/src/pipeline-effects.ts:70`) book-wide. It is called unconditionally from `saveStoryboardNode` (`apps/api/src/routes/pages.ts:682`, call at line 691) and from `clearRestoredNodeDependents` (line 486, call at line 496).
- **The stage runner's invalidation branch** is `makeBeforeRun` at `apps/api/src/routes/stages.ts:164`: `getStageRerunClearNodes` → `clearNodesByType` (line 194), then `clearStepRuns` over every step of every downstream stage (line 204). It lives in the API, not in `packages/pipeline`.
- **`PIPELINE`** at `packages/types/src/pipeline.ts:78` for the stage graph; `getStageClearOrder` / `getStageDependents` at `packages/types/src/pipeline-effects.ts:188` and `:195` derive the downstream set from it.

## Goals

- Cosmetic edits cause no regeneration of the four downstream outputs.
- Content edits invalidate affected sections without deleting existing outputs.
- Regenerating a section preserves unrelated sections and all version history.
- Stage regeneration uses the same logic as selected-section regeneration.
- Manual corrections survive ordinary regeneration, including cache hits.
- Users can distinguish completed work, remaining stale sections and protected
  corrections requiring review.

## Non-goals

- Per-element freshness records or a scheduler choosing individual changed IDs.
- A general dependency graph across arbitrary entity types.
- Section-level freshness for Storyboard, glossary, quizzes or TOC in V1.
- Redesigning model cache keys or guaranteeing a fresh model response on every
  regeneration. Storyboard's explicit re-render/cache-bypass work in #731 remains
  a separate behavior to reconcile before implementation.
- Reconstructing missing historical input provenance for existing books.
- New panels. Extend existing selection and status UI only as needed to show
  stale sections and protected work. All new Studio text follows Lingui rules.

## What counts as a content change

Build a deterministic downstream-content snapshot for each stable `sectionId`.
Compare the section snapshot after a save with its previous snapshot. This is
one section-level comparison, not per-element dependency tracking.

The snapshot includes the ordered text IDs and normalized text consumed by the
pipeline, relevant section/element roles and activity answers, active image IDs
and image asset identity, authoritative caption values and decorative state,
and section participation/pruning. Include reading order and other context
actually used by these features. Compare data extracted from saved content;
do not trust the editor's description of an action as "layout only."

Exclude purely visual styles, such as text color, spacing and displayed image
dimensions. Do not include raw HTML, save timestamps or the page's Storyboard
version in the content comparison. A crop or replacement that changes the
image supplied to captioning is content, even if its image ID is unchanged.

| Edit | V1 behavior |
|------|-------------|
| Change text color, font size, spacing or displayed image size; relevant content is unchanged | Keep the four downstream outputs current |
| Change text, add/remove text, change relevant roles or reading order | Mark the section's downstream outputs stale; regenerate at section scope |
| Add, remove, replace or crop an image | Mark affected sections stale; removed content leaves active output on reconciliation, with history retained |
| Edit an authoritative caption/alt-text value or decorative state | Preserve the edited value as manual work; mark consuming downstream section outputs stale |
| Edit a translation | Preserve that translation; invalidate dependent speech for the section and language |
| Add a section | Its applicable downstream outputs are missing and need generation |
| Remove or prune a section | Exclude it from active output; preserve its output history and manual work |
| Change a shared prompt, effective model, voice or other generation input | Mark every section consuming that changed input stale; selection remains explicit |

Cosmetic changes can still require repackaging the book. This spec's exemption
applies to captions, translation, easy-read and speech, not the exported layout.

The current text catalog reads image captions from `image-captioning`, not raw
HTML `alt`. Implementation must establish a single authoritative edit path for
caption/alt values and test it. A save must not silently change an unused `alt`
attribute while leaving the catalog's caption unchanged.

## Section freshness and execution contract

Persist freshness against stable section identity and the affected output,
including language/voice scope where applicable. Existing IDs inside sections
are still needed to attach and merge outputs; they do not get independent
freshness records. Array indexes are not persistent section identity.

For each output, retain the section input snapshot/signature used by the last
successful generation or review, together with effective generation settings
and relevant shared context. Version references may be retained for inspection,
but a version increment alone does not make an output stale.

Use fixed, documented input rules for the four features. For a source-content
change, conservative invalidation of all four within the section is acceptable;
the cache can reuse unchanged requests. Edits to a generated output invalidate
its consumers, not the edited output itself. Shared images or shared context
can affect multiple sections: all consuming sections must be included. A
section boundary is not a promise that genuine shared dependencies disappear.

1. A page/section save records changed content and freshness atomically. It does
   not start paid generation or clear downstream history.
2. Regenerating a Storyboard page repairs that page's Storyboard only. Compare
   the resulting section content and mark changed downstream sections stale.
   An identical or purely cosmetic result creates no new downstream work.
3. "Regenerate stale only" selects applicable missing/stale sections in the
   requested stage. Run each affected downstream step in full for those sections,
   processing all eligible assets, including assets whose inputs are unchanged.
   Identical requests reuse cached responses; cache misses invoke the provider.
   Keep protected manual entries intact. The selection is which sections to
   process, not which individual assets within a section changed.
4. Merge successful results into current page/book/language collections using
   section ownership. Never replace unrelated sections with a partial result.
5. Publish new versions and clear the corresponding stale state only after
   successful persistence. Failure or cancellation keeps previous outputs and
   leaves unfinished work stale. Writes must not overwrite concurrent work.
6. If inputs change during a run, its result cannot establish freshness for the
   newer inputs. Serialize conflicting edits or verify the captured inputs
   before publishing; regenerating one section cannot clear another's state.
7. A successful job does not imply that the whole stage is current. Derive
   in-scope stage freshness from remaining stale, missing and review-needed
   sections. Storyboard's own aggregate status is not redesigned here.

Splits, merges and moves must use existing stable-identity/retirement rules and
reconcile all affected sections. Remove obsolete entries from active manifests
through new versions, never by destroying history. Do not reattach a manual
correction to a new element solely because it occupies the same index.

## Manual work

"Regenerate stale only" does not authorize replacing manual corrections. If a
section contains generated and manual entries, regenerate its eligible generated
content, preserve the manual entries, and report any upstream-affected manual
work as needing review. Reusing a cached AI response is not permission to replace
a user's correction. This rule applies to every regeneration entry point.

Protected work requires recorded provenance. Captions and uploaded speech
already have some provenance; translation and easy-read need equivalent support.
For legacy entries with unknown provenance, do not assume they are safe to
replace. Preserve and surface the uncertainty until the user makes a choice.

The exact review action (accept an existing correction as valid versus explicitly
regenerate it), downstream behavior while review is pending, and export policy
remain review questions below. Do not silently declare the whole chain current
merely because protected text did not change.

## Cache and batching contract

Freshness determines which sections need work. The existing LLM cache determines
whether each generation request needs a provider call. These are separate roles.

**Running a whole step for a selected section does not mean making a fresh paid
call for every asset.** The step processes the section's complete eligible input
set, and caching supplies responses for identical requests. For example, editing
one paragraph schedules the section's full translation step, not a special
translation operation for that paragraph alone. Unchanged requests can hit the
cache; any request whose batch or context changed can miss it. Other sections
remain outside the regeneration scope unless they share an affected dependency.

An identical complete request with a valid local cached response reuses that
response without a new provider call or new provider charge. Matching text alone
is insufficient: prompt, ordered context, model/provider configuration, schema
and other cache-key inputs must also match. Missing/unreadable cache entries can
require paid calls. No guarantee is made that old cached requests survive a
change in batching or request construction.

Use deterministic request construction and batching. Do not inject raw cosmetic
HTML, save versions or timestamps into downstream prompts. Current translation
batches span up to 50 entries, captions are generated per page, and speech can
batch a page. These adapters need explicit section ownership and scoped merging.
For V1, a call may compute a larger batch where required by an existing provider
path, but it must not replace outputs outside the selected scope. Such extra
computation must be visible in call logs and cost measurements.

Changing one item in a batch can invalidate the whole call's cache entry. Easy-
read also uses the section's full text as context. Therefore this spec promises
section-level selection and output preservation, not one model call per changed
element, an exact regenerated-artifact count, or a fixed percentage of full-book
cost. Ordinary downstream regeneration permits cache hits; "force fresh" is a
separate policy, not the default in this spec.

## Impact and compatibility

- `packages/types`: Zod schemas for section content snapshots, freshness and
  provenance; keep stage/step definitions derived from `PIPELINE`.
- `packages/storage`: additive per-book state; non-destructive invalidation and
  versioned collection updates. Existing readers must not treat retained stale
  data as current solely because a row exists.
- `packages/pipeline`: canonical content extraction, stable section ownership,
  deterministic request construction and scoped result handling.
- `apps/api`: integrate saves, restores, section/page re-renders and stage runs;
  the execution/clearing paths currently live here as well as in packages.
- `apps/studio`: section selection, freshness and protected-work summaries.

Existing books open without deletion or paid generation. Missing snapshots mean
unknown freshness; snapshotting current inputs cannot prove that old outputs
were generated from them. Preserve old outputs and require reconciliation/review.
Do not claim old application versions understand the new freshness metadata;
downgrade support needs verification before any compatibility promise.

## Acceptance criteria

- [ ] AC-1 Changing only text color, spacing or displayed image dimensions leaves
  downstream freshness unchanged and triggers no downstream generation.
- [ ] AC-2 A section content change marks affected section outputs stale without
  modifying unrelated outputs or deleting history. Shared dependencies are
  covered by an explicit multi-section fixture.
- [ ] AC-3 Selected-section and stale-stage actions use the same regeneration
  path. The stage action selects exactly eligible missing/stale sections;
  protected entries remain unchanged and outstanding review is reported.
- [ ] AC-4 A one-page Storyboard save/re-render preserves every other page's
  outputs and history. A failed render does not clear downstream data.
- [ ] AC-5 Manual captions, translations, easy-read edits and uploaded audio
  survive ordinary runs and cache hits. Unknown legacy provenance is preserved.
- [ ] AC-6 Repeating a run with identical complete requests and a populated valid
  cache makes zero new provider calls. Cosmetic edits require no such run.
- [ ] AC-7 Changed section inputs execute the affected stage when requested,
  even when old outputs exist. Each affected step processes the selected
  section's complete eligible input set, including unchanged assets, rather than
  filtering to changed IDs. Identical cached requests make no new provider calls.
- [ ] AC-8 Partial failure, cancellation and edits during generation cannot mark
  unfinished/newer inputs current or overwrite unrelated successful work.
- [ ] AC-9 Existing books open without deleting data or making provider calls;
  missing provenance/freshness is not fabricated.
- [ ] AC-10 Additions, deletions, image replacements, caption edits, pruning,
  splits/merges and restores update active output correctly while preserving
  history. Cosmetic image resizing is distinguished from changing image content.
- [ ] AC-11 Prompt/model/voice changes invalidate their consuming sections;
  unchanged sections/languages/settings are not broadened without a dependency.
- [ ] AC-12 Fixture and representative-book runs report selected sections, cache
  hits, actual provider calls and cost, including any larger batch computation.
  No unmeasured "less than 1%" cost claim is a release guarantee.

## Test plan and rollout

Use fixtures with multiple pages, multiple sections on a page, generated and
manual entries, shared images, multiple languages and section-level easy-read
context. Test canonical extraction separately from end-to-end save/run/merge
behavior. Cover every API invalidation entry point, including failure paths.
Assert active outputs and retained history, not just a count of generated rows.
Run a manual Studio review on a representative book before marking verified.

1. Stop destructive invalidation across save and run paths. Ensure retained stale
   outputs do not cause runners to skip required work. Add preservation tests.
2. Add canonical section snapshots, freshness/provenance and legacy handling.
   Cover cosmetic/content distinctions and all mutation entry points.
3. Implement shared scoped execution, collection merging and cache/batch tests.
4. Connect existing selection/status UI and validate representative-book costs.

The original ~350-line estimate is withdrawn pending an implementation review of
these paths. If section scope misses the original 25 September checkpoint,
non-destructive whole-stage marking can ship only with accurate scope reporting;
it must not be presented as section-scoped regeneration or a small-cost run.

## Remaining review questions

Review owner: @ksokolovic; product decisions: @elasticsounds. Review checkpoint:
2026-09-24. The integration approver remains to be assigned. Coordinate provenance
and preservation behavior with SPEC-0002 (#880).

- How does a user resolve protected stale work: accept as valid, edit, or
  explicitly request replacement? What happens to dependent speech meanwhile?
- May export use retained stale/review-needed outputs, and how is that disclosed?
- Which current batching paths can preserve section scope without generating
  larger batches? Measure the exceptions before committing to a cost target.
- Confirm the authoritative caption/alt edit path and resolve positional
  activity IDs before relying on them to preserve corrections during merges.
- Reconcile #731's fresh Storyboard re-render intent with ordinary downstream
  regeneration's explicit cache reuse. No cache-key redesign is included here.
