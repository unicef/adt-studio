---
id: SPEC-0001
title: Catalog-based freshness and scoped regeneration
status: in-review
owner: "@ksokolovic"
approvers: ["@elasticsounds"] # Product reviewer; non-author integration approver is still unassigned.
issues: ["#735", "#131", "#733", "#736", "#619", "#626"]
prs: ["#879"]
adr: "docs/DECISIONS.md#adr-024"
created: 2026-09-10
updated: 2026-10-22
---

## Decision under review

Implementation of the September 27 contract is prepared on this PR's branch.
The owner authorized implementation before approval; this specification and
ADR-024 remain under integration review. Elasticsounds ratified the product clarifications and remaining scope in [review Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170); this does not assign an integration approver or certify release acceptance. See the [implementation evidence and limits](../verification/spec-0001.md).
The numbered acceptance criteria retain their original scope; the clarification-to-AC map below makes subsequent normative details and ratified exceptions explicit. Narrative requirements are part of the contract, not optional guidance.

**Compare each downstream output's relevant inputs through the book's text catalog and image inventory. Preserve existing output and manual corrections. Generate only when requested, using existing caching. Let usable work continue, with Out of sync, Needs review, Warnings and Missing explaining unfinished work. Core TTS uses displayed text as an automatic fallback.**

This is a proposed amendment to the section-only design in PR #879. Freshness belongs to an output identified by its data ID and applicable language/voice. Sections remain useful for selection, status and operations that need section context, especially easy-read. They are no longer the universal freshness unit. Ordinary regeneration need not replace every output in a selected section.

The mechanism is input comparison and fixed rules for existing steps, not a general dependency-graph engine or a separate stale-flag system.

## Problem and evidence

The following describes the pre-implementation baseline; code anchors are historical, not assertions about the current branch.

Local edits originally reach book-wide clears: `saveStoryboardNode` in `apps/api/src/routes/pages.ts`, `reRenderPage`'s `finally` block in `apps/api/src/services/page-edit-service.ts`, and `makeBeforeRun` in `apps/api/src/routes/stages.ts`. Most node-type clears remove historical rows as well as current output (`packages/storage/src/book-storage.ts:76`).

The original code already had a useful foundation: `packages/pipeline/src/text-catalog.ts` gathers page text, captions, activity answers, glossary entries and quiz text. However, `TextCatalogEntry` originally recorded only `{ id, text }`; it does not prove freshness or manual ownership. Easy-read uses full-section context (`packages/pipeline/src/easy-read.ts:203`), Core TTS uses neighboring text (`packages/pipeline/src/core-tts.ts:248`), and speech writes live filenames on both generation and cache reuse (`packages/pipeline/src/speech.ts:1005`). These paths require explicit handling.

Core TTS originally stored failed preparation with null speech text and omits it from `getReadyCoreTtsEntries`. V1 deliberately changes this behavior to a visible fallback, including failed LaTeX conversion; raw notation may sound awkward. This document specifies proposed behavior, not guarantees already implemented.

## Scope and non-goals

| Included | Behavior |
|----------|----------|
| Captions | Track image inputs and existing caption consumers |
| Easy Read | Reconcile the source catalog; process affected sections while preserving protected entries |
| Translate | Catalog translation, Core TTS preparation and enabled image translation |
| Speech | Audio and enabled word timestamps, including uploaded-audio preservation |

All step names and ordering remain derived from `PIPELINE`. A deterministic whole-book catalog rebuild is acceptable; it must not cause whole-book output replacement or provider calls.

Storyboard's own freshness is excluded. Editing Sectioning and having a Storyboard run select only affected pages remains a follow-up. Changing glossary, quiz and TOC generation algorithms or adding them to catalog-scoped regeneration remains outside scope. Their input freshness notices and guarded Keep/Re-run interactions are in scope, as described below. Their saved content is retained, while edits to their existing catalog entries can affect translations and speech. This does not certify those generated source artifacts as semantically current under every source edit; their existing generation policies remain separate.

**Generator input-review compatibility (Decision C1 in the clarification log):**
Source generators remain outside catalog-scoped regeneration. Compare each
existing generator's actual inputs before and after source edits, restores,
structural changes and successful generation publication. Reset only the
changed generator's attempt, atomically with the source publication, retaining
its saved content, versions and assets. This supersedes October 13's broad
reset of all three generators on any substantive source edit:

- Glossary: the rendered page text its collector consumes.
- Quiz: selected page text, page IDs, eligibility and batch membership using
  the run's section-type filter and pages-per-quiz policy.
- TOC: first section headings and their identities, section/page membership
  and reading order; original TOC text only for extract mode.

Retained affected content shows “Generated before your latest edits,” an amber
sidebar state, an explicit Re-run action and a stage-level Keep existing
content action, presented like the catalog stages' attention panel. The
warning survives reload, skip, failed/cancelled runs and manual output edits.
It clears on successful complete publication against unchanged captured
inputs, or on Keep, which records the inputs current at that moment as the
accepted baseline under the writer lease and restores the stage's completed
status without generating anything or writing a content version. The next
source change compares against that baseline and warns again. The existing
stage Overview/Run and content editor remain reachable. Preparing a run alone
does not declare unaffected retained generators outdated.

Saving compares edited HTML against the saved rendering before propagating
real text changes into sectioning. Cosmetic renderer/source differences, such
as printed blanks rendered as inputs, must not overwrite source text. Mixed
structural and HTML drafts are saved together without automatic generation;
unrendered structural edits remain out of sync. Historical blank drift is not
silently repaired.

For legacy generators without a recorded selection policy, use saved Quiz
page IDs for text coverage and conservatively detect possible eligibility or
batch membership changes. Treat unknown TOC mode as extract until a successful
run records its mode. The warning applies prospectively: erased historical
attempts do not prove which older source changes affected a retained output.
Opening must not invent or persist historical generator selections. This restriction does not prohibit the separately ratified first-open review-metadata baseline in §6; ownership projections remain read-only.

Fixed-layout content remains readable until a successful per-page reflow
publication atomically retires that page's positioned source. Failed or
cancelled runs retain the old pair. A legacy positioned tree requires semantic
Sectioning before switching to reflow; a partial re-render must not mix layout
strategies. Existing spread extraction can retain an earlier page addition if
later recording preservation fails; only generators affected by the committed
addition are reset. This does not change Extract's page-retirement policy.
See the [Note 3 evidence](../verification/spec-0001-note3.md).

No automatic paid generation on save, model-cache redesign, arbitrary dependency graph, separate review application, new glossary-caption consumer, or recovery of files already lost in older versions. Reuse existing editors and lists for warnings/actions. Explicit force-fresh behavior in #731 is separate from ordinary cache-enabled regeneration.

## Proposed design

### 1. Reconcile current content by stable identity

The catalog remains derived from the latest saved authored content, not a second editable source of truth. Compare normalized content by stable data ID, recording active membership and page/section references where available. Preserve meaningful reading order and roles used by downstream steps. Catalog records must distinguish source text from derived variants such as translations and easy-read; changing one variant must not overwrite its source.

- Changed content under an existing ID: reconsider outputs consuming it.
- New ID: its applicable outputs are missing.
- Removed ID: deactivate dependent output if no active references remain; preserve history and manual work.
- Unchanged content: do not invalidate merely because a save or entity version changed.

Moves retain identity; new or cloned elements receive new IDs. Reject new or changed conflicting duplicate IDs on save with HTTP 409 and the ID. Reads of legacy conflicts keep the first value in reading order and report one source-conflict warning per ID in the attention panel. An unchanged legacy conflict does not block unrelated or cosmetic saves; resolving it must not reassign retained corrections to a different ID. Positional activity IDs currently minted during catalog extraction must be made stable before relying on them for correction preservation. Reconcile a complete snapshot or an explicit source contribution; never treat a partial-page response as a complete catalog and retire unseen entries.

**Legacy glossary identity (Decision C2):** legacy glossary
IDs are projected without writes or writer admission on GET and materialized on
the next successful write. A version-bound projection signature identifies the
IDs shown to the editor; stale projections are rejected without applying a draft. Where explicit and positional IDs collide,
the first catalog owner keeps its ID; later terms receive unused IDs without
moving the first owner's translations or recordings. Divergent retained
translations display their first copy. For divergent legacy Easy Read copies,
the displayed authority is the first manual copy, otherwise the first protected
copy, otherwise the first copy. This preserves an authored correction when its
original section disappears. Raw copies/history remain intact, ordinary
generation preserves the conflict, and a warning requires an actual edit or
explicit replacement. Keep cannot certify conflicting copies. Replacement is
bound to every retained copy, including values not displayed. Current source
membership alone controls Preview/export inclusion. This Easy Read authority
rule is a ratified compatibility assumption; integration approval remains separate.

Keep an image inventory alongside the text catalog using existing book image storage. It records active image IDs, physical availability and references from Storyboard/glossary. An image must be discoverable before a caption exists. Image freshness is ID-based: in-app crops and generated replacements mint new image IDs; displayed size and CSS do not affect freshness. Per elasticsounds’ October 13 review decision, changed pixels under the same ID (including re-extraction or external file edits) do not invalidate captions or image translations in this revision; detecting that case is deferred. Decision (October 16): the caption store is the only source of an image description. The HTML `alt` attribute is derived from that store at export and in the reader and is not an authoring input; Storyboard saves never read it into captions, and export writes the stored description regardless of the renderer's attribute. Descriptions are edited through catalog editors: the Captions stage today, a Storyboard panel field with the Pipeline UI work later.

### 2. Store the inputs used by each output

Conceptual identity: `(output kind, data ID or context group, language, voice slot)` where applicable. Retain the published output/version, its input signature, source-version references needed for inspection, and provenance/protection. Record explicit review acceptance separately from generation authorship. Warning resolutions refer to the relevant inputs and output reviewed, not a permanent dismissed flag.

The signature covers normalized input content, effective prompt/model/settings and the context the step requires. Exclude timestamps, irrelevant styles and raw save-version increments. Canonical ordering must be deterministic. Hashing is an implementation choice; equality of relevant inputs is the contract.

| Output | Required input basis |
|--------|----------------------|
| Caption | Stable image ID, language, summary and caption prompt/model/settings; page/image bytes are generation context, not freshness inputs |
| Translation | Source entry, source/target language, prompt/model/settings and any explicitly required context |
| Easy-read | Full eligible section text, IDs/order, section type and settings |
| Core TTS | Display text, relevant source-language context, required neighboring text and preparation settings |
| Audio | Effective speech text (prepared, manual or fallback), voice/provider/settings and required neighboring speech context |
| Timestamps | Actual audio identity, matching text and alignment settings |
| Image translation | Source image identity, target language and effective generation settings |

V1 catalog translation is entry-based: batch membership is a transport choice, not a reason to replace every entry in that batch. If a translation prompt requires wider semantic context, that context must be explicit in its input basis and affected outputs must be expanded accordingly. For existing context-dependent steps such as easy-read and Core TTS, do not pretend unchanged neighboring text guarantees unchanged inputs. Reordering or inserting an entry can change those inputs too.

Captioning may similarly expand to its actual page/image context. Shared assets have one authoritative output with multiple consumers, not conflicting copies assigned to arbitrary sections. Glossary and Quizzes are selection groups for their existing IDs, not synthetic section identities.

### 3. Use four labels and plain explanations

| Condition | Display and ordinary action |
|-----------|-----------------------------|
| Generated output exists but relevant inputs changed | **Out of sync**; regenerate affected output |
| Protected content needs a keep/edit/replace decision | **Needs review**; preserve it until the decision |
| Usable fallback needs checking or another informational warning remains | **Warnings** with a reason; usable work can continue |
| Applicable output has no usable result, including never generated, failed or skipped items | **Missing** with a reason; generate when selected and usable inputs exist |
| Inputs match valid generation/fallback or review evidence and upstream freshness is resolved | Current; no additional badge |
| Disabled, pruned or genuinely no eligible input | Excluded/not applicable; not unfinished work |

Manual content has a **Manual edit** label; the edit itself is not a warning. Running, failed, cancelled and skipped describe attempts, not replacement rules. An unsuccessful attempt may leave valid current output intact. Missing means no usable output for that output kind: playable fallback audio is not missing just because normalization failed.

Derive page/section/group/stage summaries, including glossary/quiz IDs. Show counts such as “5 out of sync · 2 needs review · 1 warning · 1 missing”; the stage warning icon opens affected items. Count each output once under its primary issue: Missing first, then Out of sync, then Needs review, then Warnings. Details retain all reasons. Excluded entries do not contribute outstanding counts. Before a stage's first attempt (no completed or failed run and no saved output), its never-generated output is expected work, not attention: hide Missing from that stage's badge, counts and item indicators until then. Other issues are unaffected, and preview/export disclosure still lists the missing output.

A section/stage is current when every included, applicable output has valid matching input evidence or a review baseline, and upstream freshness is resolved. A declared Core TTS fallback satisfies the speech-input requirement and can be current while carrying a quality warning. Unreviewed protected/legacy inputs or stale translations cannot be certified current merely because dependent generation finished. Usable and current are distinct internally; no extra user-facing status vocabulary is required.

Unresolved-input warnings propagate to actual dependents and link to their source. Resolving the source rechecks dependents; unchanged actual speech inputs allow reuse. Do not require separate acceptance of the same translation warning on every dependent audio item. Job completion and export do not establish freshness. Determine expected work from included source inputs, not only successful results, so failed/omitted phrases remain visible.

### 4. Save, execute and publish

1. Save the source edit and reconcile its catalog/inventory contribution consistently. Keep previous outputs; make no provider calls. Reconcile again before planning work so every mutation path, including restores and generation, is covered.
2. A page, section, group or stage action selects candidate outputs. Update eligible changed generated output and fill missing output. Preserve protected content. Use available inputs even if they carry upstream warnings; show the reason and retain the unresolved freshness. Missing usable input prevents only the affected operation, not other runnable work. A context operation requires its whole usable input group.
3. Expand work where a step requires a context group. Easy-read regenerates an affected section's eligible generated entries. Existing request batching may compute additional results, but cannot publish outputs outside the affected selection or replace protected work. Display shared/context-driven scope expansion before running.
4. Reuse the existing LLM cache. Only identical complete requests with valid cache entries avoid provider calls. A changed batch can miss the cache even if some entries are unchanged. Per-output freshness and request-level caching are different checks.
5. Read/merge/write new versions of page/book/language collections. Validate captured inputs and target version/protection/selection before publication. Pre-existing warnings may remain; an input change or conflicting edit during execution rejects obsolete publication. Retain previous output on failure, cancellation or rejection. Concurrent partial runs must not overwrite each other's results.

6. Reconcile changed published output before dependent execution. Later steps in an explicitly requested stage range may consume successful earlier results. Speech alone does not silently start Translate or other upstream provider calls; it can resolve the deterministic fallback below.

Cancellation cleanup is part of the admitted writer's operation. Clear its running
step records before releasing that same admission; a cancelled queued job must
not clear records belonging to a subsequently admitted writer. Failure to acquire
admission does not authorize cleanup of another writer's state.

If the actual chosen input signature already has a valid output, reuse it even while an upstream warning remains. Do not repeatedly generate identical audio merely because its translation awaits review. Retaining old rows must not make runners incorrectly skip actual input changes.

### 5. Core TTS fallback, skipping and exclusion

When preparation is requested, use the existing bounded retry policy. On failure, or when Speech encounters missing/outdated generated preparation, use the current selected display text in the requested language. Record that fallback's input basis and the reason; do not falsely record successful normalization. Preserve usable manually edited speech text even when its source changes, with a review warning. Intentionally disabled normalization uses displayed text without a failure warning.

Successful fallback audio shows “Text preparation failed. Audio uses the original text,” or the corresponding missing/outdated-preparation reason. Ordinary runs reuse a failed attempt's fallback for unchanged preparation inputs and reuse audio when its actual speech inputs match. A fallback recorded without an attempt (missing or outdated preparation) keeps that reason and is prepared on the next requested preparation run, unless it was checked for the same inputs and text. **Retry preparation** explicitly attempts normalization again; relevant input changes make preparation eligible again when requested. If new preparation produces identical speech inputs, reuse audio. Fallback never substitutes a different language or creates missing text/audio. A synthesis failure retains previous audio; without usable audio, Speech is Missing even though speech text exists.

**Fallback input basis (Decision C4):** A failed preparation describes its
recorded input basis, not every later fallback with the same display text.
If prompt, model, profile or required context changes, Speech records an
outdated, not-yet-attempted fallback for the new basis. The next requested
Language run may prepare it; Speech itself makes no preparation call. Matching
failed inputs and checked fallbacks are reused, manual speech remains protected,
and the old attempt/review remains in entity history. This clarifies AC-14,
without broadening the deferred provider-failure classifier.

**Legacy preparation recovery (Decision C5):** A pre-evidence preparation explicitly
recorded as a failed non-manual attempt with no usable speech (a failed generation,
or a preparation the pre-evidence code invalidated as `unchanged`) is unfinished
work, not protected authored speech. It may be prepared on a requested Language run or
Retry; subsequent attempts obey the normal evidence-based retry rules. An absent
physical audio file likewise permits requested synthesis unless its row declares
manual origin (including `provider: manual`). Usable unknown-origin content and
manual output remain protected. Recovery appends versions and preserves the old
failure/recording metadata and surviving assets; it does not infer provenance for
usable content or certify freshness from ownership alone. This deliberately
cannot recover a missing historical recording's bytes.

**Skip this run** makes no further attempt for the selected operation in that run; it does not exclude content or erase existing output. The next explicit run retries selected unfinished eligible work, preserving protected content. Skip/cancel must not commit a late result for that abandoned operation. **Prune/exclude** persists until restored, using existing scope: excluding speech does not delete source text. Source exclusion removes only affected active references; shared consumers remain. Restoring inclusion rechecks retained output rather than automatically regenerating it.

For single-item Gemini generation with page batching preferred, no alignment key and highlighting
disabled, synthesize only the requested item and record the actual per-item basis.
Reuse that audio for unchanged item inputs, even if an alignment key later becomes
available. Actual page batches retain ordered page context and alignment needs;
highlighting retains its separate timing requirement. This restores Gemini-only
item use without treating an item request as a completed page batch.

### 6. Resolve warnings beside the content

Attach review actions directly to the warning; use the existing content editor for edits. Acceptance is an action, not a permanent checkbox or a new badge.

In Language, Captions and Easy Read, keep these controls compact: show a small amber **Manual edit** pill with a text-input icon for a draft or saved manual edit, with its saved/unsaved state in the accessible label and tooltip. Clicking the indicator reveals details and actions; regeneration must not dominate the content. Existing prepared speech remains visible and unchanged after a display-text edit, with a small out-of-sync indicator when its saved inputs differ. A pass-through copy is not separately prepared speech: changing display text must not reveal that old copy as a new speech area. Absent preparation stays absent. Optional preparation does not count as unfinished translation work in the Language summary. Speech follows the same first-attempt rule (§3). After a completed or failed run, missing audio appears as a neutral **No audio** action in the item header; full warnings and generation controls remain available on click. Current audio or recorded failures keep these indicators available if a later text edit resets the stage status. Deleting all speech returns to the pre-run presentation: empty current versions must not enable missing-audio indicators merely because restorable history exists. Suppress missing-output indicators while speech is queued or running. Place the speech-edit pencil at the bottom right in normal layout flow so it cannot overlap text.

| Action | Resolution and protection |
|--------|---------------------------|
| **Keep my edit** (or **Keep existing content** for legacy output) | Confirm valid existing content against the inputs shown; clear that review warning, preserve authorship and protection |
| **Edit and Save** | Store a new manual version against reviewed inputs; clear that review warning and recheck dependents |
| **Regenerate and replace my edit** | Explicitly authorize replacement; successful publication creates generated content and retains the old manual version in history |
| **Mark checked** on a fallback warning | Accept this fallback for the reviewed inputs/output; clear only that warning, retain failure history, and do not invent successful normalization or manual authorship |
| **Retry preparation** | Successful preparation resolves its warning; failure retains fallback and a visible reason |

Show “Source changed. Your edit has been kept” for protected translations, easy-read or speech text. In easy-read, a changed section context warns on affected manual entries; even full-section computation must preserve them when publishing. Ordinary regeneration never removes manual protection. An explicit replacement becomes generated content only after success; failure/cancellation keeps the manual version active.

When a user edits, show Save/Cancel instead of acceptance until the draft is resolved. A small regenerate icon must expose “Regenerate and replace my edit” as an explicit inline choice before replacing protected content. An already explicit replacement action needs no additional modal. Bulk replacement identifies affected manual items and is off by default. Do not add popups to ordinary runs.

A Save response acknowledges only the submitted draft. Edits made while it is
pending, including in the same UI batch as its response, stay unsaved and
recoverable. A follow-up save advances to that response's own version and
identity evidence, never a later writer's refreshed version. “Save & leave”
waits for persistence and stays on the editor after rejection, while another
save is pending, or while a newer draft remains. An open caption textarea is
part of that draft even before its local commit button is pressed. These rules
also apply to internal selectors: language switching waits for translation or
speech drafts to settle, and caption filtering keeps an unsaved/saving editor
and its navigation guard visible. A response from an earlier book or language
cannot acknowledge or rebase the current editor's draft. These rules use the
existing navigation guard and save/version mechanisms; stale authored
source-screen guards remain the explicitly coordinated SPEC-0002 Decision 10
work, not a guarantee supplied by writer serialization alone.

Restoring a version temporarily disables edits in that owning editor until the
restore and its refresh settle, including controls rendered in a header or
portal. A successful restore acknowledges only its original owner; failure
keeps the prior draft. An older completion cannot clear a different book, page
or language. Editors that disable input during saves must keep the same gate
through persistence and refresh, release it after failure, and retain the draft
for retry. This is an interaction safeguard, not a second writer lock.

Prepared speech is edited per output even though its storage version belongs
to a language catalog. Two independently opened speech entries may save in
sequence without making the second editor adopt an arbitrary refreshed
baseline: a stale collection version may merge only when the complete target
entry is identical in the requested historical version and the current
version, and its source/exclusion receipt still matches. Merge into the current
collection, preserving every other entry and unknown retained metadata. Missing,
malformed or ambiguous historical evidence fails closed. The receipt identifies
the actual locale storage namespace as well as its inputs; equal version numbers
in legacy and canonical locale namespaces are not interchangeable. Manual saves
retain that namespace and its history. Same-entry conflicts remain rejected.

The stage summary is a neutral, compact panel with one count of affected items across the book, not a checklist of every output. Offer **Update all** and **Keep all existing content** directly when applicable. Update regenerates eligible outdated/missing output and retries preparation fallbacks, preserving protected content. Keep acknowledges existing protected content or usable preparation fallbacks using the existing guarded review actions; it does not accept missing output or ordinary outdated generated output. Resolve inherited warnings at their linked sources, deduplicating shared sources and naming any source stages affected by the bulk actions. Queue source updates before their selected consumers, using the pipeline's stage order. **Replace edits…** separately lists the protected content before an explicit replacement action.

Show compact, clickable counts for **Out of sync**, **Needs review**, **Warnings** and **Missing** beside the summary. Each item has one primary issue (missing first, then outdated generated content, then protected content needing a keep/replace decision, then other warnings); details retain every warning reason. These counts reflect the selected content, language, page and section, so switching the issue filter remains possible. Style **Update all** as a small amber button with a refresh icon, matching the stage warning icon, with text meeting WCAG AA contrast. While updates run it reads “Updating…”, stays focusable and reports that it is busy. When the stage rail is collapsed, the stage icon carries the same amber attention badge.

**Review items** expands one bounded list containing only affected output, with readable text and optional per-item details/actions. Every collapsed row shows its content category and data ID alongside the output kind and language, so glossary, page text and other content can be identified without opening details. Category labels match the content filter. Content, language, page, section and status filters consistently narrow the list, total count and bulk actions; filtered actions are labeled explicitly, including while the list is collapsed. Page and section filters use catalog location metadata, including all locations of shared output. Choosing a page narrows section choices and clears the previous section selection. No checkbox selection is required. Block bulk mutations during unsaved drafts (including local speech edits) and active book runs; refresh after partial failures so successful actions are retained and stale review guards remain effective. Preview/export uses the same compact disclosure list without bulk mutation controls.

Resolve warnings only against the reviewed output and relevant inputs; reject acceptance if they changed during review. The stage count updates and its warning icon disappears when no active warnings remain. A new relevant input change reassesses the item. Checking fallback audio cannot approve an upstream translation warning, invent missing files, clear a required audio update or bypass validation. Saving corrected speech text can clear preparation review while audio becomes Out of sync.

**Protected correction walkthrough:** English changes beneath edited French. Retain French with Needs review. Speech may use it and inherits a linked Warning, without repeatedly regenerating matching audio. Keep my edit confirms French against the new source and rechecks speech; unchanged speech inputs reuse audio. Edit/replace changes only actual consumers and retains history.

**Legacy walkthrough (Decision C3):** On first open through the sidebar-summary read, accept existing usable, included outputs with neither input evidence nor review as an initial Keep baseline, preserving provenance and protection; perform this metadata migration under the shared writer lease, skip quietly if busy and retry on the next sidebar-summary read, create at most one new version per changed node/item, and do not force an audio snapshot. This is a compatibility assumption: older versions deleted downstream output on source changes, so surviving legacy content is treated as initially consistent. It is not fabricated generation history. A one-time book receipt prevents a later restore from silently accepting old content against new inputs. Existing evidence (including older speech input signatures), conflicting copies and malformed collections are not overwritten or automatically accepted. Missing/invalid files remain Missing; omitted or excluded content is not certified. A later relevant source change warns again. Opening performs no provider calls, content deletion or media-byte hashing. The first verified physical snapshot carries matching reviews and timing evidence through a representation-only filename change; stale evidence stays stale. Downgrade support is not assumed.

**Legacy ownership compatibility assumption (Decision C2):** When both the saved
`sectionId` and HTML `data-section-id` are absent, a legacy rendering may inherit
a same-page section of the same type if that section is unclaimed, has at least
one content leaf, and every leaf's exact `data-id` appears as an HTML attribute.
Synthetic container IDs do not participate. There must be exactly one qualifying
section and no other unowned rendering may qualify for it, including renderings
that themselves have multiple candidates. Never match by array position or
override contradictory explicit ownership. Supported historical fixed-layout
outputs retain the dedicated positioned-tree and older single positioned
`page-sectioning` fallback.

This narrow fallback is a compatibility assumption, not historical proof. Moving
an entire content tree can yield a misleading match; the reviewer explicitly
accepts that limitation. Historical reconstruction, migration tracking and a
repair screen are deferred. The former root/receipt lookup and ownership repair
workflow are superseded. A pre-edit snapshot supplies ownership for structural
changes, re-rendering and assistant edits. Ownership read projections do not rewrite books. The separate first-open baseline migration above changes review metadata only.
Successful edits persist resolved ownership in a new version, preserving existing
IDs, HTML/scripts, answers, translations and history except changes explicitly
requested by the edit itself. Resolving ownership does not certify freshness or
trigger generation. Existing explicit Split/Merge/Delete behavior and warnings
still apply to the selected content; compatibility recovery does not promise to
partition arbitrary custom scripts or retain deliberately deleted active content.
Unrelated content and prior versions remain protected.

If no unique match exists, retain the rendering/history and its omission warning
without assigning an owner. The editor projection gives unmatched renderings no
selectable live section index; the page exposes structural drift through the
shared SPEC-0012 synchronization response shape. Restoring a source owner
realigns it by stable identity, never by the retained index. Preview/export remain read-only and add no approval
popup. De-codable pg006 acceptance remains assigned to elasticsounds under Decision C3; the
implementation ledger must keep that verification pending until reported.

**Ownership projection and ID preservation (Decision C4):** Omission also excludes that
rendering's contributions from the active text catalog and image inventory,
before deduplication or first-open baseline acceptance. Retained HTML cannot
supply a live section's text merely by preceding it with the same data ID.
Independently owned active references still contribute shared text and images.
Within each page, catalog and Easy Read traversal follows the reader's ascending
section index, not incidental saved-array order; reads preserve the raw rows.
This applies the existing ownership/reading-order contract, without adding an
ownership repair or migration framework.

The same pre-edit ownership snapshot applies when restoring a sectioning
version. Freeze an inferred owner in a new rendering version before moving the
source pointer, within one transaction. A failed restore rolls both back; a
successful restore may omit the retained rendering until its actual owner is
present again. Never re-infer it as a different owner from the restored tree.

New activities, both custom and templated, cannot copy a section owner or
active/historical text ID. Templated creation checks the supplied tree before
rendering and the returned HTML before publication. Assistant section edits
retain local IDs but reject newly introduced reused IDs and new or changed
catalog conflicts, with the same transactional conflict rule as editor saves.
Unchanged legacy conflicts remain editable cosmetically; shared images are
allowed. Rejecting an edit publishes neither source nor rendering changes.
The tool rejects these inputs before writing and requests a corrected retry;
it does not rewrite arbitrary JavaScript selectors. It stamps the corrected
activity's server-allocated owner, preserving local DOM/activity keys and shared
image IDs. A cloned non-catalog wrapper retains its local `data-id` alias so a
legacy script can still locate it; cloned catalog leaves receive fresh IDs.

ID reservation is book-wide across source kinds and retained output history,
including legacy glossary/quiz IDs and source-less translations, speech, captions
and answers. Reserve deterministic Easy Read slots before generation as well as
afterward. Reject a draft introducing both a source ID and its derived slot, in
either order. This is a preservation rule, not evidence of historical ownership:
existing local IDs, explicit moves and restores retain their identities, and
unchanged legacy collisions remain editable. Cosmetic saves do not require an
additional history scan when they introduce no IDs. No media bytes are read or
hashed for these checks.

New text identities must also be nonblank: reject newly introduced empty or
whitespace-only IDs before publishing an editor or assistant change. Preserve
an unchanged malformed legacy ID and its retained corrections; this is not an
automatic repair of historical blank drift. Cloning that content allocates a
fresh ID and stamps it consistently in the copied source and HTML, while its
old corrections remain attached only to the original identity.

Preview/export may include usable stale or review-needed content under existing eligibility rules. Show outdated content included, missing content omitted, and actual fallback use. Warnings introduce no extra approval popup or freshness gate; exporting does not clear them. Disabled/excluded features do not warn about work not included. Apart from Core TTS fallback, this spec adds no new export fallback.

### 7. Preserve physical assets

Audio, uploaded recordings and their matching timing data must remain restorable, not just their database rows. Generate into unpublished storage; publication must preserve files referenced by retained history. Cache hits obey the same rule. History must not depend on a disposable LLM cache. Read-only status, ordinary reuse and packaging cache checks use recorded immutable hashes/filenames and contained, readable, nonempty-file existence checks. They do not rehash retained media. External same-name corruption is an accepted read-time detection gap; publication and explicit restore still verify bytes. Scope also includes preserving replaced image-translation variants where retained output versions reference them.

Failure before a scope publishes keeps its previous playable output intact; other scopes already published successfully need not roll back. Page-batched generation cannot overwrite neighboring live assets. Preview/export resolve the active manifest's files, and published asset changes invalidate cached packages. Preserve legacy files before the first modifying operation; do not promise recovery of already-overwritten historical bytes.

## Four worked examples

All examples describe saving first, then a separately requested regeneration. Existing outputs and history remain available. Unrelated global settings are unchanged.

### Example 1 — Layout only in Storyboard

**Edit:** Change text color, spacing and displayed image size. Keep text, IDs, semantic roles, reading order and actual image content unchanged.

**On save:** Relevant catalog/inventory inputs are equal. Captions, easy-read, translations, preparation, audio and timestamps remain current. Manual corrections are untouched. No provider calls occur.

**Next action:** No downstream regeneration is required. Repackage when the user wants the new layout in an export; packaging freshness is distinct from content freshness.

### Example 2 — Change one Storyboard text string

**Edit:** Change `pg012_tx003` from “Pick three apples” to “Pick five apples.” Its French translation was manually corrected. The section has easy-read, captions and speech.

**On save:** Generated translations show Out of sync; manual French is retained with Needs review. Easy-read depends on the whole section: affected generated entries need updating, while manual entries remain protected with Needs review. Source speech inputs and required neighboring context are rechecked. Captions remain current if their image/context inputs are unchanged. Glossary, quizzes and TOC generation is not triggered.

**Next action:** Generate eligible work explicitly. French speech may use retained French with the linked warning. Review French beside the changed source: Keep my edit preserves protection and rechecks dependents; unchanged speech inputs reuse audio. Edit/replace changes actual consumers. If preparation fails, generate from displayed text with a fallback warning; Listen and Mark checked can resolve that warning. Unchanged regenerated easy-read similarly permits downstream reuse once upstream freshness is resolved.

### Example 3 — Edit a glossary string and attach one image

**Edit:** Change `gl001_def` under its existing ID and attach a new image to that glossary entry. Storyboard text is unchanged.

**On save:** The definition's generated translations need updating; protected translations are retained with Needs review. Actual speech inputs and required neighboring context are rechecked. Speech can use retained translations with the upstream warning. The image inventory discovers the new asset before caption text exists; its caption is Missing. Unrelated Storyboard easy-read remains unchanged. Selecting an existing image reuses its caption if actual inputs match.

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
| AC-14 | An unchanged failed-attempt fallback avoids repeated preparation and reuses matching audio; a never-attempted fallback is prepared on the next requested run unless checked for the same inputs; explicit retry or changed inputs permit preparation when requested; success with identical speech text reuses audio; synthesis failure preserves old audio or remains Missing | Recording-provider + API integration |
| AC-15 | Warning actions appear beside content; stage icon/count tracks affected outputs; keep/edit/replace/check clears only resolved reasons; inherited warnings resolve at source; checked fallback can warn again after relevant change | Status unit/API tests + Studio walkthrough |
| AC-16 | Skip retries selected unfinished work on a later run without replacing manual edits; skip/cancel cannot publish late results; pruning persists across runs/input edits; restore rechecks retained output; disabled/not-applicable work is not Missing | Runner/storage/API integration |

### Clarification-to-acceptance map

These subcases make the existing criteria testable; they neither waive their narrative
requirements nor pull the ratified follow-ups into this PR. Test paths are relative to
the repository root. Results and pending acceptance live in the [verification ledger](../verification/spec-0001.md).

| Normative clarification | ACs | Concrete verification and limits |
|---|---|---|
| Generator stale-input notices, Keep/Re-run, first-attempt reset and captured-input guards | AC-5, AC-9, AC-15 | `apps/api/src/routes/pages.test.ts`, `apps/api/src/routes/stages.test.ts`, `apps/api/src/services/output-review-run.integration.test.ts`; change source, retain generated content, Keep only the shown input basis and reject changed-during-review requests. Generator algorithms remain outside scope. |
| Reject new/changed duplicate IDs with 409; reserve historical and derived IDs; reject new blank IDs; preserve unchanged legacy collisions | AC-4, AC-7, AC-9 | `apps/api/src/routes/pages.test.ts`, `apps/api/src/routes/rendered-ownership.integration.test.ts`, `packages/pipeline/src/__tests__/rendered-identity.test.ts`; assert atomic rejection and preserved corrections/history, including assistant and clone paths. Positional-ID carry-over and historical blank repair remain deferred. |
| Edits during a pending save remain recoverable; only the save's acknowledgement advances their guard; restore blocks editing and retains failed drafts | AC-7, AC-9 | Studio `LanguageView.save.test.tsx`, `components/WordTimestampViewer.test.tsx`, `EasyReadEditor.test.tsx`, `EasyReadEditor.restore.test.tsx`, `VersionPicker.restore.test.tsx`; delayed success, later-writer refetch, conflict, navigation and restore failure. |
| Speech entry merges across collection versions and actual locale namespaces | AC-7, AC-9 | `apps/api/src/routes/speech-freshness.integration.test.ts`, `apps/api/src/services/scoped-speech.integration.test.ts`; accept only unchanged target/source receipts, preserve other entries, and reject ambiguous or stale target evidence. |
| Legacy timing edits without an audio hash | AC-7, AC-9, AC-11 | `apps/api/src/routes/tts.test.ts`; GET issues a metadata-only identity without media reads/writes, PUT validates that identity and timing version, uses existing physical preservation, and returns its own persisted receipt. Changed/missing audio rejects the write; retained audio and prior timings remain restorable. First modifying saves may snapshot; merely opening does not. |
| First-open accepted baseline, writer admission and one-time receipt | AC-7, AC-9, AC-11 | `apps/api/src/services/legacy-output-baseline.integration.test.ts`, `packages/storage/src/__tests__/speech-history.test.ts`; idempotent metadata-only migration, busy-writer retry, no provider/media reads, and no silent acceptance after restore. |
| Failed legacy preparation recovery and unchanged fallback/audio reuse | AC-6, AC-7, AC-13, AC-14 | `packages/pipeline/src/__tests__/core-tts.test.ts`, `apps/api/src/services/catalog-preparation.integration.test.ts`; recover known nonmanual failures (including pre-evidence invalidated `unchanged` entries), preserve manual/unknown content, and count transport calls for reuse/retry. |
| Mutually unique legacy ownership, pre-edit snapshot and read-only projections | AC-4, AC-7, AC-12 | `packages/pipeline/src/__tests__/legacy-rendering-ownership.test.ts`, `apps/api/src/routes/rendered-ownership.integration.test.ts`; Preview/export and structural/assistant edits share ownership, retain history and fixed-layout compatibility. Ambiguous/pruned-leaf cases keep omission disclosure; historical repair and De-codable acceptance are not certified by fixtures. |

## Impact, storage and rollout

`packages/types` defines Zod schemas for input basis, provenance, fallback and review evidence; storage stays inside each book. Pipeline code derives canonical inputs and scoped work. API paths reconcile changes and publish safely. Studio uses existing selection/editing surfaces with translated warnings/actions. Align SPEC-0002's manual-edit preservation with this contract. ADR-024, invariant row 5 and the spec index accompany the same proposed contract.

Do not copy whole source documents into every output record. Store signatures and references to retained versions. As an illustration, 50,000 records with one 64-character hexadecimal hash each contain about 3.2 MB of raw hashes in total, not per row or per page; IDs/indexes/history add overhead. Compute/read inputs on demand rather than holding all history in RAM. Measure representative-book metadata, memory and run cost; retained media/history is a separate growth concern. No fixed savings percentage is promised.

1. **Preservation foundation:** establish version/protection/legacy storage and physical-file publication/restore. Guarantees no loss on replacement and restorable artifacts: storage portions of AC-7 plus AC-10 and AC-11. Review UI is completed in slice 4.
2. **Catalog/signature reconciliation:** establish stable identity, canonical inputs and derived freshness. Guarantees cosmetic saves leave output current and membership/context changes are detected: AC-1, AC-4 and AC-5; status derivation in AC-15.
3. **Scoped execution and fallback:** preserve protected/unselected output, merge safely, continue usable work, and implement fallback/retry/exclusion. Guarantees selective safe execution with complete accounting: AC-2, AC-3, AC-6, AC-8, AC-9, AC-13, AC-14 and AC-16.
4. **Review/status/export UI:** complete AC-7, AC-12 and AC-15 with inline warning actions, stage counts and disclosure; walk through all four examples before declaring V1 complete.

A whole-stage execution fallback broadens selection only; disclose it and apply the same manual protection, usable-input/fallback rules, warning accounting and physical publication/restore guarantees. It cannot silently expand a section request or claim per-ID precision or measured cost savings. This execution fallback is distinct from Core TTS's text fallback. Slices describe implementation ordering, not permission to expose operations before their safeguards exist. No calendar or line-count estimate is asserted.

## Review and issue coverage

Implementation proceeds in the existing PR; product reviewer @elasticsounds ratified the clarifications and scope decisions in [Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170). Integration approval and the final historical-book product pass remain pending. The integration approver remains unassigned. Hash representation and physical-file publication mechanism are implementation choices, subject to these criteria.

#735 is partially addressed; Storyboard/Sectioning freshness remains deferred. #131's inline regeneration is not delivered: saving is free of paid generation and regeneration is explicit. #619 and #626 are background/deferred requirements. The preservation contract addresses #733/#736, but this combined specification/implementation PR does not by itself close those wider issues.


## Ratified compatibility limits and follow-up ownership

The following are explicit October 16 Note 7 decisions, not claims that the
original promises were all verified. They must remain visible in acceptance and
release reporting:

- **Positional activity IDs:** carry-over for old sorting/multi-select labels is
  deferred. Those books need Language and Speech runs after upgrade; old manual
  output and history remain retained, but automatic reattachment across the
  changed IDs is not delivered. Matching by page/text/uniqueness is follow-up work.
- **Speech publication order:** previous playable output is preserved, but newly
  synthesized audio is still published after Word Highlighting. Until the staged
  publication follow-up lands, cancelling during Word Highlighting can discard
  the new unpublished audio; previous playable output remains preserved. This is
  the explicit Note 7 release limitation, not a request to disable cancellation.
  Track the staged-publication issue at merge time as Note 7 requires and link its
  owner here. [#958](https://github.com/unicef/adt-studio/pull/958) is coordination
  for Gemini failure recovery, not evidence that this fix is implemented or assigned;
  [#966](https://github.com/unicef/adt-studio/pull/966) owns no-key highlighting and
  timestamp retention on that path. Neither subsumes manual timing-edit guards.
- **Provider-wide preparation failures:** distinguishing authentication/quota
  failure from content fallback depends on SPEC-0013/#889's classifier.
- **Legacy ownership:** ambiguous or pruned-leaf custom activities remain retained
  with omission disclosure. Ownership-claim UI/history reconstruction is deferred;
  the doctor finding these on a real book triggers that follow-up. Books older
  than schema 14 and already-saved historical blank drift are not certified here.
- **Other follow-ups:** bulk review; projection caching after a 100-page measure;
  no-op Storyboard-save short-circuit; listing unassigned sign-language videos;
  a server-computed quiz plan; Storyboard caption field/preview mirroring with
  Pipeline UI; lease parsing/release-lock with SPEC-0010/#886; and selecting only
  out-of-sync Storyboard pages with #619/SPEC-0012. Quiz remainder grouping stays.

Before field release, run the read-only doctor over the Tanzania sample and
verify a clean Docker `app` image. Elasticsounds owns the final Frankenstein and
De-codable spot checks. Product ratification does not replace those checks or the
unassigned integration maintainer's approval. No release verification is inferred
from development tests.

## Clarification log and acceptance fixtures

Dated discussion is recorded here; the operative rules remain in their design
sections and the acceptance map. Product ratification and implementation evidence
are distinct from non-author integration approval.

| Decision | Record | Effect |
|---|---|---|
| C1 — Generator input review | [Note 4](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5524868514), ratified in [October 16 Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) | Retain source generators; expose their input warnings and guarded review actions without catalog-scoped generator replacement. |
| C2 — Legacy ownership and identity | [Note 6](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5551228504) and Note 7 | Accept the narrow mutually unique leaf-ID assumption and fixed-layout fallback; defer ownership repair and positional-ID carry-over. |
| C3 — Initial legacy review baseline and scope limits | Note 7, sections A–F | Permit first-open review-metadata versions without forced audio snapshots. Keep the four-label vocabulary, explicit follow-ups and historical-book acceptance assignments. |
| C4 — Input basis, omission and stable-ID implementation details | [October 20–21 verification records](../verification/spec-0001.md) and the acceptance map above | Make the existing freshness, ownership, pending-save, restore and preservation rules explicit; no additional release certification. |
| C5 — Pre-evidence preparation recovery | [Published implementation revision](https://github.com/unicef/adt-studio/commit/c8553add731ef6338b8b747e96fa30047ce04ab7), §5 and AC-13/14 | Recover known nonmanual failure states without replacing protected speech or repeatedly retrying unchanged failed input. |
| C6 — October 22 timing/editor regression correction | [Recorded findings](https://github.com/unicef/adt-studio/pull/879#issuecomment-6332386481), [rechkunov's review](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) | The PR owner requested these three specific findings be fixed before merging, superseding their initial later-follow-up disposition. Older Note 7 and performance follow-ups (#995, #996, #997) remain deferred. Integration review remains pending. |

**Doctor** means the existing read-only CLI command
`pnpm pipeline doctor [books-dir] [--label <label>] [--json]`, implemented in
`packages/pipeline/src/book-doctor.ts`. It reports schema/lock conditions, unresolved
ownership, duplicate identities and positional re-keying; it does not migrate or
repair books. See the [doctor review record](https://github.com/unicef/adt-studio/pull/879#issuecomment-6221112256).

**Frankenstein** is the reviewer-owned 14-page, schema-14 composite book described
in Note 6, generated on develop `0b5474083`: mixed text/activity types, a custom
activity, three quizzes, glossary, TOC, Easy Read, French translation and audio in
two languages. **De-codable pg006** is the reviewer-owned historical custom-activity
spot check from the legacy ownership review. **Tanzania sample** is the field book
collection assigned to the pre-release doctor pass in Note 7. These are acceptance
data, not aliases for the synthetic test fixtures. Record the exact supplied copy,
revision and result when each is exercised; this spec does not assert those private
copies are available locally or that their pending acceptance has passed.
