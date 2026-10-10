---
id: SPEC-0001
title: Catalog-based freshness and scoped regeneration
status: in-review
owner: "@ksokolovic"
approvers: ["@<integration>", "@elasticsounds"]
issues: ["#735", "#131", "#733", "#736", "#619", "#626"]
prs: ["#879"]
adr: "docs/DECISIONS.md#adr-024"
created: 2026-09-10
updated: 2026-10-11
---

## Decision under review

Implementation of the September 27 contract is prepared on this PR's branch.
The owner authorized implementation before approval; this specification and
ADR-024 remain under human review. See the [implementation evidence and limits](../verification/spec-0001.md).
The acceptance criteria below are unchanged.

**Compare each downstream output's relevant inputs through the book's text catalog and image inventory. Preserve existing output and manual corrections. Generate only when requested, using existing caching. Let usable work continue, with Update needed, Warning and Missing explaining unfinished work. Core TTS uses displayed text as an automatic fallback.**

This is a proposed amendment to the section-only design in PR #879. Freshness belongs to an output identified by its data ID and applicable language/voice. Sections remain useful for selection, status and operations that need section context, especially easy-read. They are no longer the universal freshness unit. Ordinary regeneration need not replace every output in a selected section.

The mechanism is input comparison and fixed rules for existing steps, not a general dependency-graph engine or a separate stale-flag system.

## Problem and evidence

Local edits currently reach book-wide clears: `saveStoryboardNode` in `apps/api/src/routes/pages.ts`, `reRenderPage`'s `finally` block in `apps/api/src/services/page-edit-service.ts`, and `makeBeforeRun` in `apps/api/src/routes/stages.ts`. Most node-type clears remove historical rows as well as current output (`packages/storage/src/book-storage.ts:76`).

The code already has a useful foundation: `packages/pipeline/src/text-catalog.ts` gathers page text, captions, activity answers, glossary entries and quiz text. However, `TextCatalogEntry` currently records only `{ id, text }`; it does not prove freshness or manual ownership. Easy-read uses full-section context (`packages/pipeline/src/easy-read.ts:203`), Core TTS uses neighboring text (`packages/pipeline/src/core-tts.ts:248`), and speech writes live filenames on both generation and cache reuse (`packages/pipeline/src/speech.ts:1005`). These paths require explicit handling.

Core TTS currently stores failed preparation with null speech text and omits it from `getReadyCoreTtsEntries`. V1 deliberately changes this behavior to a visible fallback, including failed LaTeX conversion; raw notation may sound awkward. This document specifies proposed behavior, not guarantees already implemented.

## Scope and non-goals

| Included | Behavior |
|----------|----------|
| Captions | Track image inputs and existing caption consumers |
| Easy Read | Reconcile the source catalog; process affected sections while preserving protected entries |
| Translate | Catalog translation, Core TTS preparation and enabled image translation |
| Speech | Audio and enabled word timestamps, including uploaded-audio preservation |

All step names and ordering remain derived from `PIPELINE`. A deterministic whole-book catalog rebuild is acceptable; it must not cause whole-book output replacement or provider calls.

Storyboard's own freshness is excluded. Editing Sectioning and having a Storyboard run select only affected pages remains a follow-up. Generation of glossary, quizzes and TOC also remains outside scope: their saved content is retained, while edits to their existing catalog entries can affect translations and speech. This does not certify those generated source artifacts as semantically current under every source edit; their existing generation policies remain separate.

No automatic paid generation on save, model-cache redesign, arbitrary dependency graph, separate review application, new glossary-caption consumer, or recovery of files already lost in older versions. Reuse existing editors and lists for warnings/actions. Explicit force-fresh behavior in #731 is separate from ordinary cache-enabled regeneration.

## Proposed design

### 1. Reconcile current content by stable identity

The catalog remains derived from the latest saved authored content, not a second editable source of truth. Compare normalized content by stable data ID, recording active membership and page/section references where available. Preserve meaningful reading order and roles used by downstream steps. Catalog records must distinguish source text from derived variants such as translations and easy-read; changing one variant must not overwrite its source.

- Changed content under an existing ID: reconsider outputs consuming it.
- New ID: its applicable outputs are missing.
- Removed ID: deactivate dependent output if no active references remain; preserve history and manual work.
- Unchanged content: do not invalidate merely because a save or entity version changed.

Moves retain identity; new or cloned elements receive new IDs. Reject conflicting duplicate IDs. Positional activity IDs currently minted during catalog extraction must be made stable before relying on them for correction preservation. Reconcile a complete snapshot or an explicit source contribution; never treat a partial-page response as a complete catalog and retire unseen entries.

Keep an image inventory alongside the text catalog using existing book image storage. It records active image IDs, asset content identity and references from Storyboard/glossary. An image must be discoverable before a caption exists. Image pixels/crops affect captioning; displayed size and CSS do not. Caption text uses the authoritative caption store; HTML alt edits must update that same source rather than an unused competing value.

### 2. Store the inputs used by each output

Conceptual identity: `(output kind, data ID or context group, language, voice slot)` where applicable. Retain the published output/version, its input signature, source-version references needed for inspection, and provenance/protection. Record explicit review acceptance separately from generation authorship. Warning resolutions refer to the relevant inputs and output reviewed, not a permanent dismissed flag.

The signature covers normalized input content, effective prompt/model/settings and the context the step requires. Exclude timestamps, irrelevant styles and raw save-version increments. Canonical ordering must be deterministic. Hashing is an implementation choice; equality of relevant inputs is the contract.

| Output | Required input basis |
|--------|----------------------|
| Caption | Image asset, required page/image context, language and caption settings |
| Translation | Source entry, source/target language, prompt/model/settings and any explicitly required context |
| Easy-read | Full eligible section text, IDs/order, section type and settings |
| Core TTS | Display text, relevant source-language context, required neighboring text and preparation settings |
| Audio | Effective speech text (prepared, manual or fallback), voice/provider/settings and required neighboring speech context |
| Timestamps | Actual audio identity, matching text and alignment settings |
| Image translation | Source image identity, target language and effective generation settings |

V1 catalog translation is entry-based: batch membership is a transport choice, not a reason to replace every entry in that batch. If a translation prompt requires wider semantic context, that context must be explicit in its input basis and affected outputs must be expanded accordingly. For existing context-dependent steps such as easy-read and Core TTS, do not pretend unchanged neighboring text guarantees unchanged inputs. Reordering or inserting an entry can change those inputs too.

Captioning may similarly expand to its actual page/image context. Shared assets have one authoritative output with multiple consumers, not conflicting copies assigned to arbitrary sections. Glossary and Quizzes are selection groups for their existing IDs, not synthetic section identities.

### 3. Use three macro labels and plain explanations

| Condition | Display and ordinary action |
|-----------|-----------------------------|
| Generated output exists but relevant inputs changed | **Update needed**; regenerate affected output |
| Protected content needs review, legacy freshness is unknown, or a usable fallback needs checking | **Warning** with a reason; preserve usable content and continue |
| Applicable output has no usable result, including never generated, failed or skipped items | **Missing** with a reason; generate when selected and usable inputs exist |
| Inputs match a valid generation/fallback or review baseline and upstream freshness is resolved | Current; no additional badge |
| Disabled, pruned or genuinely no eligible input | Excluded/not applicable; not unfinished work |

Manual content has a **Manual edit** label; the edit itself is not a warning. Running, failed, cancelled and skipped describe attempts, not replacement rules. An unsuccessful attempt may leave valid current output intact. Missing means no usable output for that output kind: playable fallback audio is not missing just because normalization failed.

Derive page/section/group/stage summaries, including glossary/quiz IDs. Show counts such as “5 updates needed · 2 warnings · 1 missing”; the stage warning icon opens affected items. Count each output once per category. Warning can accompany Missing or Update needed and must not hide either. Excluded entries do not contribute outstanding counts.

A section/stage is current when every included, applicable output has valid matching input evidence or a review baseline, and upstream freshness is resolved. A declared Core TTS fallback satisfies the speech-input requirement and can be current while carrying a quality warning. Unreviewed protected/legacy inputs or stale translations cannot be certified current merely because dependent generation finished. Usable and current are distinct internally; no extra user-facing status vocabulary is required.

Unresolved-input warnings propagate to actual dependents and link to their source. Resolving the source rechecks dependents; unchanged actual speech inputs allow reuse. Do not require separate acceptance of the same translation warning on every dependent audio item. Job completion and export do not establish freshness. Determine expected work from included source inputs, not only successful results, so failed/omitted phrases remain visible.

### 4. Save, execute and publish

1. Save the source edit and reconcile its catalog/inventory contribution consistently. Keep previous outputs; make no provider calls. Reconcile again before planning work so every mutation path, including restores and generation, is covered.
2. A page, section, group or stage action selects candidate outputs. Update eligible changed generated output and fill missing output. Preserve protected content. Use available inputs even if they carry upstream warnings; show the reason and retain the unresolved freshness. Missing usable input prevents only the affected operation, not other runnable work. A context operation requires its whole usable input group.
3. Expand work where a step requires a context group. Easy-read regenerates an affected section's eligible generated entries. Existing request batching may compute additional results, but cannot publish outputs outside the affected selection or replace protected work. Display shared/context-driven scope expansion before running.
4. Reuse the existing LLM cache. Only identical complete requests with valid cache entries avoid provider calls. A changed batch can miss the cache even if some entries are unchanged. Per-output freshness and request-level caching are different checks.
5. Read/merge/write new versions of page/book/language collections. Validate captured inputs and target version/protection/selection before publication. Pre-existing warnings may remain; an input change or conflicting edit during execution rejects obsolete publication. Retain previous output on failure, cancellation or rejection. Concurrent partial runs must not overwrite each other's results.
6. Reconcile changed published output before dependent execution. Later steps in an explicitly requested stage range may consume successful earlier results. Speech alone does not silently start Translate or other upstream provider calls; it can resolve the deterministic fallback below.

If the actual chosen input signature already has a valid output, reuse it even while an upstream warning remains. Do not repeatedly generate identical audio merely because its translation awaits review. Retaining old rows must not make runners incorrectly skip actual input changes.

### 5. Core TTS fallback, skipping and exclusion

When preparation is requested, use the existing bounded retry policy. On failure, or when Speech encounters missing/outdated generated preparation, use the current selected display text in the requested language. Record that fallback's input basis and the reason; do not falsely record successful normalization. Preserve usable manually edited speech text even when its source changes, with a review warning. Intentionally disabled normalization uses displayed text without a failure warning.

Successful fallback audio shows “Text preparation failed. Audio uses the original text,” or the corresponding missing/outdated-preparation reason. Ordinary runs reuse the fallback for unchanged preparation inputs and reuse audio when its actual speech inputs match. **Retry preparation** explicitly attempts normalization again; relevant input changes make preparation eligible again when requested. If new preparation produces identical speech inputs, reuse audio. Fallback never substitutes a different language or creates missing text/audio. A synthesis failure retains previous audio; without usable audio, Speech is Missing even though speech text exists.

**Skip this run** makes no further attempt for the selected operation in that run; it does not exclude content or erase existing output. The next explicit run retries selected unfinished eligible work, preserving protected content. Skip/cancel must not commit a late result for that abandoned operation. **Prune/exclude** persists until restored, using existing scope: excluding speech does not delete source text. Source exclusion removes only affected active references; shared consumers remain. Restoring inclusion rechecks retained output rather than automatically regenerating it.

### 6. Resolve warnings beside the content

Attach review actions directly to the warning; use the existing content editor for edits. Acceptance is an action, not a permanent checkbox or a new badge.

| Action | Resolution and protection |
|--------|---------------------------|
| **Keep my edit** (or **Keep existing content** for legacy output) | Confirm valid existing content against the inputs shown; clear that review warning, preserve authorship and protection |
| **Edit and Save** | Store a new manual version against reviewed inputs; clear that review warning and recheck dependents |
| **Regenerate and replace my edit** | Explicitly authorize replacement; successful publication creates generated content and retains the old manual version in history |
| **Mark checked** on a fallback warning | Accept this fallback for the reviewed inputs/output; clear only that warning, retain failure history, and do not invent successful normalization or manual authorship |
| **Retry preparation** | Successful preparation resolves its warning; failure retains fallback and a visible reason |

Show “Source changed. Your edit has been kept” for protected translations, easy-read or speech text. In easy-read, a changed section context warns on affected manual entries; even full-section computation must preserve them when publishing. Ordinary regeneration never removes manual protection. An explicit replacement becomes generated content only after success; failure/cancellation keeps the manual version active.

When a user edits, show Save/Cancel instead of acceptance until the draft is resolved. A small regenerate icon must expose “Regenerate and replace my edit” as an explicit inline choice before replacing protected content. An already explicit replacement action needs no additional modal. Bulk replacement identifies affected manual items and is off by default. Support bulk review within existing selected lists; do not add popups to ordinary runs.

Resolve warnings only against the reviewed output and relevant inputs; reject acceptance if they changed during review. The stage count updates and its warning icon disappears when no active warnings remain. A new relevant input change reassesses the item. Checking fallback audio cannot approve an upstream translation warning, invent missing files, clear a required audio update or bypass validation. Saving corrected speech text can clear preparation review while audio becomes Update needed.

**Protected correction walkthrough:** English changes beneath edited French. Keep French with a warning. Speech may use it and inherits the warning, without repeatedly regenerating matching audio. Keep my edit confirms French against the new source and rechecks speech; unchanged speech inputs reuse audio. Edit/replace changes only actual consumers and retains history.

**Legacy walkthrough:** Open a book with audio/translation but no trustworthy input evidence. Keep usable content with a warning and preserve known provenance; unknown authorship is protected. Keep existing content establishes a review baseline, not fabricated generation history. Missing/invalid files remain Missing. Opening the book performs no generation or deletion; metadata migration is allowed. Downgrade support is not assumed.

Preview/export may include usable stale or review-needed content under existing eligibility rules. Show outdated content included, missing content omitted, and actual fallback use. Warnings introduce no extra approval popup or freshness gate; exporting does not clear them. Disabled/excluded features do not warn about work not included. Apart from Core TTS fallback, this spec adds no new export fallback.

### 7. Preserve physical assets

Audio, uploaded recordings and their matching timing data must remain restorable, not just their database rows. Generate into unpublished storage; publication must preserve files referenced by retained history. Cache hits obey the same rule. History must not depend on a disposable LLM cache. Scope also includes preserving replaced image-translation variants where retained output versions reference them.

Failure before a scope publishes keeps its previous playable output intact; other scopes already published successfully need not roll back. Page-batched generation cannot overwrite neighboring live assets. Preview/export resolve the active manifest's files, and published asset changes invalidate cached packages. Preserve legacy files before the first modifying operation; do not promise recovery of already-overwritten historical bytes.

## Four worked examples

All examples describe saving first, then a separately requested regeneration. Existing outputs and history remain available. Unrelated global settings are unchanged.

### Example 1 — Layout only in Storyboard

**Edit:** Change text color, spacing and displayed image size. Keep text, IDs, semantic roles, reading order and actual image content unchanged.

**On save:** Relevant catalog/inventory inputs are equal. Captions, easy-read, translations, preparation, audio and timestamps remain current. Manual corrections are untouched. No provider calls occur.

**Next action:** No downstream regeneration is required. Repackage when the user wants the new layout in an export; packaging freshness is distinct from content freshness.

### Example 2 — Change one Storyboard text string

**Edit:** Change `pg012_tx003` from “Pick three apples” to “Pick five apples.” Its French translation was manually corrected. The section has easy-read, captions and speech.

**On save:** Generated translations show Update needed; manual French is kept with a Warning. Easy-read depends on the whole section: affected generated entries need updating, while manual entries remain protected with a warning. Source speech inputs and required neighboring context are rechecked. Captions remain current if their image/context inputs are unchanged. Glossary, quizzes and TOC generation is not triggered.

**Next action:** Generate eligible work explicitly. French speech may use retained French with the linked warning. Review French beside the changed source: Keep my edit preserves protection and rechecks dependents; unchanged speech inputs reuse audio. Edit/replace changes actual consumers. If preparation fails, generate from displayed text with a fallback warning; Listen and Mark checked can resolve that warning. Unchanged regenerated easy-read similarly permits downstream reuse once upstream freshness is resolved.

### Example 3 — Edit a glossary string and attach one image

**Edit:** Change `gl001_def` under its existing ID and attach a new image to that glossary entry. Storyboard text is unchanged.

**On save:** The definition's generated translations need updating; protected translations are kept with a Warning. Actual speech inputs and required neighboring context are rechecked. Speech can use retained translations with the upstream warning. The image inventory discovers the new asset before caption text exists; its caption is Missing. Unrelated Storyboard easy-read remains unchanged. Selecting an existing image reuses its caption if actual inputs match.

**Next action:** Generate the affected caption and text-derived outputs when requested. Image translation is applicable only if enabled and the image is selected for it. A glossary-only image currently has no caption consumer in the glossary export, so generating its caption does not invent caption translation/audio there. If the same image is used by Storyboard or another existing catalog consumer, its caption enters that consumer's normal translation/speech path. The caption adapter must discover glossary images independently of their appearance in rendered HTML. No glossary generation is triggered.

### Example 4 — Delete text, add text and add an image in Storyboard

**Edit:** Remove `pg012_tx003`; add a new text element `pg012_tx009` and new image `pg012_im007`. New content receives new IDs.

**On save:** If the removed ID has no remaining active references, retire its active translations, easy-read entries, audio and timestamps through versioned reconciliation; do not destroy historical corrections/files or offer the retired ID for regeneration. New text has missing applicable translation/preparation/audio. The image has a missing caption unless valid output already exists. The changed section's easy-read needs regeneration; neighboring-context consumers are rechecked. Unaffected output elsewhere is preserved.

**Next action:** Generate the new text's eligible outputs and the image caption. Applicable caption translation/speech remains Missing while no usable caption text exists; other work continues. Once the caption exists, its actual consumers can generate. Generate selected image translation only when applicable. New IDs cannot inherit deleted IDs' corrections or recordings. Restoring the old source can reactivate retained output only after rechecking input signatures. Pruned content remains excluded until explicitly restored.

## Acceptance criteria and test mapping

| ID | Required assertion | Test level |
|----|--------------------|------------|
| AC-1 | Example 1: cosmetic saves preserve downstream freshness/content and make no provider calls | Canonical-input unit tests + API save test |
| AC-2 | Example 2: changed ID, easy-read section and required context are affected; manual French and easy-read entries survive ordinary/full-section runs; reviewed unchanged French reuses audio | Pipeline/API integration + review UI walkthrough |
| AC-3 | Example 3: changed glossary definition and new image work without a Storyboard edit; actual caption consumers only; unrelated outputs preserved | Catalog/caption API integration |
| AC-4 | Example 4: additions, retirement, shared references, stable IDs and restore retain history and never reassign corrections by index | Storage + API integration |
| AC-5 | Effective prompt/model/voice/context changes affect consuming output; incidental cosmetic/version changes do not | Input-signature unit tests |
| AC-6 | Stale/review-needed but usable inputs permit work with inherited warnings; missing usable input affects only dependent work; all expected phrases remain counted; existing matching audio is reused despite an upstream warning | Runner/API integration |
| AC-7 | Protected and legacy walkthroughs preserve provenance/history; keep/edit/explicit replacement have the stated effects; unknown authorship stays protected; no generation/deletion on open; changed-during-review acceptance is rejected | Storage/API tests + Studio walkthrough |
| AC-8 | No-op ordinary run skips current output; identical requests with a valid cache make zero provider calls; batch misses and actual cost remain visible | Recording-provider integration + representative-book measurement |
| AC-9 | Page/section/stage actions share a selector; concurrent input edits, target edits and exclusion changes cannot overwrite unrelated/protected work or publish obsolete results; valid pre-existing warnings are allowed | API integration with concurrent edits |
| AC-10 | Failure/cancellation/rejected publication after audio production preserves previous playable files, timings and active references; selected-section page batches leave neighbors unchanged, including cache hits | Filesystem/API failure injection |
| AC-11 | Restore recovers generated/uploaded audio and matching timing data after cache cleanup; active asset changes invalidate packaging reuse | Storage/filesystem/packaging integration |
| AC-12 | Preview/export permits usable stale/review-needed output within existing gates, discloses included/omitted/fallback output, adds no warning-approval popup and changes no review/freshness evidence | Packaging/API tests + Studio walkthrough |
| AC-13 | Missing/outdated/failed generated Core TTS preparation uses requested-language display text; disabled normalization does not warn; manual speech text stays protected; bounded failures including batch/provider errors never silently omit phrases; no text means no language substitution | Pipeline/runner integration with preparation failure injection |
| AC-14 | Unchanged fallback avoids repeated preparation and reuses matching audio; explicit retry or changed inputs permit preparation when requested; success with identical speech text reuses audio; synthesis failure preserves old audio or remains Missing | Recording-provider + API integration |
| AC-15 | Warning actions appear beside content; stage icon/count tracks affected outputs; keep/edit/replace/check clears only resolved reasons; inherited warnings resolve at source; checked fallback can warn again after relevant change | Status unit/API tests + Studio walkthrough |
| AC-16 | Skip retries selected unfinished work on a later run without replacing manual edits; skip/cancel cannot publish late results; pruning persists across runs/input edits; restore rechecks retained output; disabled/not-applicable work is not Missing | Runner/storage/API integration |

## Impact, storage and rollout

`packages/types` defines Zod schemas for input basis, provenance, fallback and review evidence; storage stays inside each book. Pipeline code derives canonical inputs and scoped work. API paths reconcile changes and publish safely. Studio uses existing selection/editing surfaces with translated warnings/actions. Align SPEC-0002's manual-edit preservation with this contract. ADR-024, invariant row 5 and the spec index accompany the same proposed contract.

Do not copy whole source documents into every output record. Store signatures and references to retained versions. As an illustration, 50,000 records with one 64-character hexadecimal hash each contain about 3.2 MB of raw hashes in total, not per row or per page; IDs/indexes/history add overhead. Compute/read inputs on demand rather than holding all history in RAM. Measure representative-book metadata, memory and run cost; retained media/history is a separate growth concern. No fixed savings percentage is promised.

1. **Preservation foundation:** establish version/protection/legacy storage and physical-file publication/restore. Guarantees no loss on replacement and restorable artifacts: storage portions of AC-7 plus AC-10 and AC-11. Review UI is completed in slice 4.
2. **Catalog/signature reconciliation:** establish stable identity, canonical inputs and derived freshness. Guarantees cosmetic saves leave output current and membership/context changes are detected: AC-1, AC-4 and AC-5; status derivation in AC-15.
3. **Scoped execution and fallback:** preserve protected/unselected output, merge safely, continue usable work, and implement fallback/retry/exclusion. Guarantees selective safe execution with complete accounting: AC-2, AC-3, AC-6, AC-8, AC-9, AC-13, AC-14 and AC-16.
4. **Review/status/export UI:** complete AC-7, AC-12 and AC-15 with inline warning actions, stage counts and disclosure; walk through all four examples before declaring V1 complete.

A whole-stage execution fallback broadens selection only; disclose it and apply the same manual protection, usable-input/fallback rules, warning accounting and physical publication/restore guarantees. It cannot silently expand a section request or claim per-ID precision or measured cost savings. This execution fallback is distinct from Core TTS's text fallback. Slices describe implementation ordering, not permission to expose operations before their safeguards exist. No calendar or line-count estimate is asserted.

## Review and issue coverage

Owner @ksokolovic and product reviewer @elasticsounds should ratify the change from section-only freshness to per-output signatures, the fixed input rules, review/export behavior and rollout gates. The integration approver remains unassigned. Hash representation and physical-file publication mechanism are implementation choices, subject to these criteria.

#735 is partially addressed; Storyboard/Sectioning freshness remains deferred. #131's inline regeneration is not delivered: saving is free of paid generation and regeneration is explicit. #619 and #626 are background/deferred requirements. The preservation contract addresses #733/#736, but a documentation-only PR closes none of these implementation issues.
