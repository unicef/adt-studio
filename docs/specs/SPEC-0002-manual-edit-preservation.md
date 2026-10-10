---
id: SPEC-0002
title: Manual-edit preservation for translation, quizzes, sectioning and TOC
status: draft
owner: "@ksokolovic"
approvers: ["@<integration>", "@elasticsounds"]
issues: ["#736", "#144"]
prs: ["#880"]
adr: ""
created: 2026-09-21
updated: 2026-10-10
---

<!-- Drafted by an agent from #736, #144, SPEC-0001 and the codebase on 2026-09-21
     (develop at 7a8896528). Not yet edited by the owner. Every path:line anchor was
     opened and checked; the design is a proposal for the owner to cut down.
     Revised 2026-09-28 for review areas 1–4: aligned with the revised SPEC-0001, Terms added,
     protection unit defined per entity, structural cases and source removal specified,
     keep / accept / replace actions defined per entity, save conflict policy, translation
     batching corrected, CLI path bounded, tests made end-to-end. -->

## Terms

- **Provenance** — who authored the *current content* of an entry. `"ai"` when a pipeline step wrote it, `"manual"` when a person saved it through an editor, absent when it was written before the field existed. Provenance decides whether an ordinary rerun may replace the entry. It says nothing about what the entry was made from.
- **Lineage** — what an entry was derived from: the shared data ID that links a translation, caption, easy-read entry or audio file to its source text or image, plus SPEC-0001's input signature, which records the exact inputs, prompt and settings used. Lineage decides whether an entry is up to date.
- Together: lineage says "this is out of date"; provenance says "replace it quietly, or keep it and ask". The codebase already uses "provenance" in both senses (`packages/types/src/image-captioning.ts:14` for authorship, `packages/types/src/reading-order.ts:9` for source identity); this spec uses it only in the first.

## Problem (with evidence)

Three entity types keep a user's hand edits across a rerun of their stage; four do not. The seven share one storage model — every write is a new `node_data` version (`packages/storage/src/book-storage.ts:348`) — so the difference is entirely in whether the step reads the prior version back and merges.

### What "preserved" looks like today (the reference implementation)

- **Glossary.** `GlossaryItem.source: "ai" | "manual"` (`packages/types/src/glossary.ts:5`) plus `pruned` for AI terms the user removed (line 10). `mergeGeneratedGlossaryWithManualItems` (`packages/pipeline/src/glossary.ts:74`) keeps every manual item and drops regenerated matches of pruned ones; `regenerateGlossaryPreservingEdits` (line 352) reads the prior node (line 355) and merges (line 361); the step calls it at `apps/api/src/services/stage-runner.ts:2218`. The `"manual"` stamp is set by the client (`apps/studio/src/components/pipeline/stages/glossary/GlossaryView.tsx:282`, `AddGlossaryDialog.tsx:243`).
- **Captions.** `source: "ai" | "manual"` on `packages/types/src/image-captioning.ts:18`, documented at lines 14–15 as "preserved wholesale when captioning is re-run". `runCaptionsStep` reads the prior page node (`stage-runner.ts:2116`) and returns the prior entry when `prior?.source === "manual"` (line 2123). Stamp set by the client (`PageCaptions.tsx:144`, `:161`); badge at `CaptionCard.tsx:38` / `:110` ("Edited manually").
- **Speech.** `SpeechFileEntry.provider` is a free string (`packages/types/src/speech.ts:312`); the upload route writes `provider: "manual"` (`apps/api/src/routes/tts.ts:683`) and `canReuseSpeechEntry` (`stage-runner.ts:656`, check at line 682) reuses such entries on rerun.
- **TTS normalisation** (not in the issue lists, but a fourth working example): `CoreTtsGenerationMode` includes `"manual"` (`packages/types/src/core-tts.ts:12`); the merge keeps manual entries (`packages/pipeline/src/core-tts.ts:213`); badge at `CoreTtsSpeechEditor.tsx:29`.

### The four entity types with no provenance and a wholesale overwrite

| Entity | Schema (no provenance field) | User-edit path | What the step does on rerun |
|---|---|---|---|
| Translation | `TextCatalogEntry = { id, text }` — `packages/types/src/text-catalog.ts:3–6` | `PUT /books/:label/text-catalog-translation/:language` (`apps/api/src/routes/text-catalog.ts:151`) writes a new version of the whole language document (line 175); body schema is `{ id, text }` (line 26); Studio sends the full entry list (`LanguageView.tsx:761`) | `runTranslateStep` never reads the prior translation node: it translates every entry (`stage-runner.ts:2546`, `:2606`) and writes one new version per language (line 2634) |
| Quizzes | `Quiz` has a stable `quizId` (`packages/types/src/quiz.ts:26`, `:35`) and no provenance | `PUT /books/:label/quizzes` (`apps/api/src/routes/quizzes.ts:122`) → `saveQuizOutput(…, "edit")` (line 137), which keeps ids | `runQuizzesStep` → `saveQuizOutput(…, "replace")` (`stage-runner.ts:1918`), which strips every id (`packages/pipeline/src/quiz-ids.ts:91`) and writes a new version (line 105). `docs/QUIZ_IDENTITY.md`: "Generate-one replacement and full-stage regeneration create new quizzes with fresh IDs." |
| Sectioning | `PageSectioningSection` has `sectionId`, `isPruned`, no provenance (`packages/types/src/page-sectioning.ts:162`) | `PUT …/pages/:pageId/sectioning` (`apps/api/src/routes/pages.ts:1518`) and the structural ops — ai-edit (`:1989`), clone (`:2179`), split (`:2297`), merge (`:2484`), cross-page merge (`:2651`), delete (`:2813`) — all end in `saveStoryboardNode` (line 682) → `putNodeData` (line 690) | `runSectioningStep` writes each page straight from the model result (`stage-runner.ts:1479`, `:1491`, translated variant `:1508`) without reading the prior page node |
| TOC | `TocEntry = { id, title, sectionId, href, chapterId, level }` (`packages/types/src/toc.ts:3–10`) | `PUT /books/:label/toc` (`apps/api/src/routes/toc.ts:71`) → `putNodeData` (line 90); the editor lets the user insert entries and change title/level (`TocView.tsx:285`, save at `:189`) | `runTocStep` → `generateToc` (`stage-runner.ts:2309`; `packages/pipeline/src/toc-generation.ts:155`) → `putNodeData` (line 2315). The only prior-node read in `toc-generation.ts` is `web-rendering` (line 87) |

Easy-read is named in #736's title, has a user-edit route (`apps/api/src/routes/easy-read.ts:174`) and an entry schema without provenance (`packages/types/src/easy-read.ts:3–11`), but is not in the companion's list of four (see Open questions).

### The pre-run clear makes even the "preserved" three conditional

`makeBeforeRun` (`apps/api/src/routes/stages.ts:164`) runs before every stage run started through the API (`:268`, `:288`) and deletes every version of the nodes returned by `getStageRerunClearNodes` (line 192 → `clearNodesByType`, line 194; `DELETE FROM node_data` / `node_current` at `packages/storage/src/book-storage.ts:85–86`). The only exemptions are `STAGES_PRESERVING_OWN_OUTPUT = ["glossary", "quizzes"]` (`packages/types/src/pipeline-effects.ts:217`) plus `core-tts-catalog` (line 238) and `tts` (line 257) when their stage is inside the run range.

Evaluated on `develop` at 7a8896528 with the built `@adt/types` (Studio's "Re-run" sends `fromStage === toStage`, e.g. `CaptionsLandingPage.tsx:77`):

| Rerun | Nodes deleted before the step runs |
|---|---|
| captions → captions | `image-captioning`, `text-catalog-translation`, `tts`, … |
| translate → translate | `text-catalog-translation`, `tts`, … |
| toc → toc | `toc-generation`, `text-catalog-translation`, `tts`, … |
| sectioning → sectioning | `page-sectioning`, `glossary`, `image-captioning`, `toc-generation`, `text-catalog-translation`, `tts`, … (`quiz-generation` is invalidated, not erased — `book-storage.ts:81`) |

So the caption merge at `stage-runner.ts:2116–2123` runs after its input has been deleted whenever the rerun comes through the route. The test that proves caption preservation (`apps/api/src/services/stage-runner.test.ts:640`) calls the runner directly and never exercises `makeBeforeRun`. The caption merge (48015cc1c, 2026-05-31) predates the exemption list (c78338086, 2026-07-07), which was added for the glossary. `packages/types/src/__tests__/pipeline-effects.test.ts:40–42` asserts the glossary exemption; no equivalent assertion exists for captions, translate, toc or sectioning. SPEC-0001 owns this clear (its slice 1, *Preservation foundation*, makes it non-destructive); it is recorded here because it decides whether anything this spec adds is reachable from the UI.

### What the user sees

- No "edited" indicator exists for translation, quizzes, sectioning or TOC; `source === "manual"` is read only in the glossary, captions and TTS-normalisation views (`GlossaryView.tsx:691–693`, `CaptionCard.tsx:38`, `CoreTtsSpeechEditor.tsx:29`).
- The rerun confirmation (`LandingPageShell.tsx:78–81`, `CascadeResetDialog.tsx:32`) lists the downstream stages that will be reset; it never mentions the rerun stage's own hand edits.
- Copy promises otherwise: "experimenting is safe — nothing is ever overwritten" (`BookView.tsx:755`); "Every edit and re-run is saved as a new version, so you can always roll back" (`EasyReadLandingPage.tsx:95`). After a clear, the version picker (`VersionPicker.tsx:162`; restore route `pages.ts:1683`) has no versions to offer.

### Scale

Mathematics STD 5 has about 8,850 catalog entries per language (#733). One corrected translation among them is regenerated over by the next translate run, and the correction was never a model output, so it is not in the cache (#736: "A hand-corrected caption or translation was never an LLM output, so it is not in the cache. The delete removes it and the subsequent re-run regenerates the model's version over the top."). #144's status update (2026-08-04) lists the remaining work as translation, quiz, sectioning, TOC and the storyboard full rerun, and adds: "Also missing: 'edits will be replaced/lost' warnings for sectioning, quiz, translation, and TOC".

## Goals

- A hand-edited translation entry, quiz or page's sectioning survives a rerun of its own stage, and a hand-edited TOC is never replaced without an explicit confirmation; once SPEC-0001 slice 1 lands, all four survive any upstream rerun too.
- Manual entries are excluded from the model request on rerun, so a rerun after a correction is cheaper as well as safe.
- Each of the four views shows which entries are manual, using the badge the captions view already has.
- One shared helper and one shared test shape, so the next entity type costs less than this one.

## Non-goals

Binding.

- No change to freshness semantics: the clear lists, `makeBeforeRun`, `step_runs`, input signatures, the Update needed / Warning / Missing labels, scoped regeneration. SPEC-0001 owns them; this spec uses its terms and never redefines them.
- No new panels, routes or dialogs. Each of the four views gains the "Edited manually" indicator; existing confirmations gain at most one sentence and one opt-in (the TOC line of decision 5, the sectioning choice of decision 9); the quiz *Replace* placement gains one label. The Warning on a preserved entry whose lineage changed, and the keep / edit / replace actions that resolve it, come from SPEC-0001 section 6, not from here.
- No per-page or per-section regenerate in this version. The product direction is that a user can go to one page or one section and regenerate just that, including a page they edited by hand; it arrives with page-scoped runs (#619) as a follow-up, for every stage at once rather than for sectioning alone. Until then a single manual page is replaced by restoring its last `ai` version in the version picker and rerunning.
- No storyboard (`web-rendering`) full-rerun preservation. #144 marks it "partial" and needing its own design decision.
- No change to quiz identity allocation (`docs/QUIZ_IDENTITY.md`) beyond documenting that preserved manual quizzes keep their ids.
- No three-way merge that re-applies a user's delta onto fresh model output.
- No retrofit of server-side stamping onto glossary, captions or speech; they keep working as they do.
- No data migration; a stored entry without `source` has unknown authorship and is protected, as required by Decision 4 and AC-11. Absence never authorizes ordinary replacement.
- No change to the restored content/version selection or that version's authorship. The save/restore admission guards in Decision 10 and AC-18 still apply.
- No per-user identity, timestamps or model keys on entries. Provenance is one value, `ai` or `manual`; that is all the preservation rule reads. Which model wrote an entry is already in the LLM log and in SPEC-0001's input signature; "when" belongs on the stored version, not the entry. Because the field is optional, a later spec can add `author` and `at` beside it without migration, exactly as `source` is added now.
- No preservation on the CLI/DAG runner. `packages/pipeline/src/pipeline-dag.ts` persists through its own code, and #810 shows a CLI run starts by wiping all node data. The guarantee of this spec covers the API path: Studio and any HTTP caller. The DAG writers stamp `ai` on the four nodes (AC-19) so a book produced by the CLI is not perpetually legacy when opened in Studio; nothing else changes on that path until #810 is resolved, and this spec does not claim it does.

## Proposed design

**Option A — a `source` tag plus merge on rerun (the glossary/captions pattern), stamped server-side.** Optional `source: "ai" | "manual"` on four schemas (≈20 lines, 4 files in `packages/types`); each PUT route stamps what the user changed (≈80 lines, 4 files in `apps/api/src/routes`); the translation and quiz steps read the prior node, keep manual entries wholesale and send only the rest to the model, the sectioning step skips manual pages, the TOC step is unchanged (≈120 lines across `stage-runner.ts`, `quiz-ids.ts`); one shared helper module (≈80 lines, `packages/pipeline`); a badge in four views and one line in the existing rerun confirmation, plus five catalogs (≈90 lines); tests ≈350 lines. The original estimates were about 750 lines over ≈20 files. Under the owner-authorized workflow these are coherent commits in PR #880, not five new PRs; estimates do not bound the required safety work.

**Option B — node-level "user-owned" flag, no schema change.** A user PUT marks the whole node (a language's translation, the book's quizzes or TOC, a page's sectioning) user-owned; the step skips user-owned nodes. ≈120 lines, 5 files. Coarse: one corrected entry freezes a language's 8,850 entries, and new source entries never get translated unless the user regenerates explicitly — which then loses the edits. Reintroduces the problem at a different grain.

**Option C — three-way merge on rerun** (prior AI output, prior current, new AI output; re-apply the user's deltas). ≈500+ lines; undefined for sectioning, where a re-partition has no stable diff base; not before November.

**Chosen: Option A under one rule — protect the unit the model regenerates in one call.** Translation entries and quizzes are regenerated per entry and have stable identities (the data ID shared with the source; the never-reused `quizId`), so they get a per-entry tag and an entry-level merge. A page's sectioning and the TOC are regenerated whole — sections partition a page and are re-divided on every run, TOC ids are positional — so they get one tag on the whole record: the page's sectioning node, the single TOC document. No per-section tags, no TOC entry merge, no id matching or allocation, no `pruned` flag. The rule is mode-independent: a future chapter-level or transformed sectioning mode protects whatever record one generation call replaces.

Decisions for the reviewer to ratify:

1. **Stamping is done by the API, against the version the editor loaded.** Each PUT carries `baseVersion`; the API compares the incoming document with that version (decision 10 guarantees it is the current one) and sets `source: "manual"` on entries whose content changed or that are new; untouched entries keep their prior `source`. Glossary and captions stamp in Studio today and are left alone. Rationale: the API is the one path every caller shares (layer rule in AGENTS.md), so any future caller is honest by construction.
2. **Manual entries are kept wholesale and excluded from the model request.** They are never regenerated implicitly (SPEC-0001 section 4); the only way to replace one is SPEC-0001's explicit *Regenerate and replace my edit* action (section 6).
3. **Sectioning is protected per page, stamped in one place.** `saveStoryboardNode` (`pages.ts:682`), which every sectioning edit already passes through (PUT, clone, split, merge, cross-page merge, delete, ai-edit), stamps the page's sectioning record `manual`; the sectioning step stamps `ai`. An ordinary rerun skips a manual page: no model call, record not rewritten, section ids not retired. The structural cases follow by construction: deleting an AI section, or the last section, leaves a manual page the rerun does not refill; a cross-page merge saves both pages, so both are manual and the moved content is not regenerated on the source. Section ids keep their factory, their shape and their retirement rules; the only change to retirement is that manual pages are skipped. Replacing a manual page is only possible through the explicit action defined under open question 6.
4. **Only `ai` is replaceable.** An ordinary rerun replaces an entry only when a pipeline step stamped it `ai`. `manual` and absent provenance are both protected: an absent value means the entry predates the field and could be either, and SPEC-0001's legacy walkthrough governs it (kept, reported with a provenance warning, resolved by *Keep existing content* or an explicit regenerate, in bulk where needed). Every step stamps `ai` on what it writes (captions and glossary already do); PUTs stamp changed/new authored content `manual` while untouched entries retain their prior source (Decision 1). No migration: the first rerun after upgrading regenerates nothing it cannot vouch for and still fills missing output.
5. **The TOC is protected as one document, and its stage rerun is the explicit replacement.** `PUT /books/:label/toc` stamps the document `manual`; the TOC step stamps `ai`. Rerunning the TOC stage on a manual TOC is never silent: the existing rerun confirmation (`LandingPageShell.tsx:78–81`, `CascadeResetDialog.tsx:32`) gains one line — "Your table of contents was edited by hand. Regenerating replaces it; the edited version stays in history." Confirming makes the rerun the explicit replacement of decision 2; cancelling leaves the TOC untouched. Entries can be edited, re-pointed, re-levelled, inserted and deleted in the editor; a deleted entry is simply absent from the saved document. No entry-level merge, no `pruned` flag, no id matching. Retirement still drops entries whose section is gone (`section-ids.ts:372`); that system edit keeps hrefs valid and does not change provenance.
6. **Survival is tested through the HTTP run route**, so the pre-run clear is exercised and a regression in SPEC-0001's non-destructive invalidation fails this spec's tests too.
7. **History is always kept; being active follows the source.** Protection guards against replacement, never against source removal. A manual translation whose source entry disappears leaves the active document on the next run and stays in version history, restorable. A TOC entry whose section is retired is dropped the same way. Quizzes have no source-removal path and stay active.
8. **Quizzes merge by `quizId`, with no page skipping and no reordering.** A rerun keeps every manual quiz with its id, generates fresh-id AI quizzes for every eligible page even when a manual quiz already covers it (the user deletes what they do not want), drops prior AI quizzes, and orders the result by `afterPageId`; an explicit reading order is untouched.
9. **Replacement is explicit, per entity, and never silent.** Translation uses SPEC-0001's inline *Regenerate and replace my edit*. Quizzes use the existing *Replace* placement. The TOC uses its stage rerun after the confirmation line. Sectioning uses its stage rerun with an opt-in in the existing confirmation, off by default, that replaces the listed hand-edited pages too. A replacement becomes `ai` only when its new version is published; failure or cancellation leaves the manual version current.
10. **A save is guarded twice, so a stale screen can never stamp stale text as manual.** ADT Studio is one desktop app, but the Studio screen and the local API that owns the book database are separate processes, and the screen can hold a version the API has since moved past — a run finished, a version was restored, a second window saved. So each of the four PUTs requires `baseVersion`, the version the screen loaded; if it is not the current version the API answers 409 with the current version and writes nothing, and Studio reloads and re-applies the pending edits (it already keeps pending entries apart from the loaded document). Second guard: a PUT or a restore while the step that writes that node is running answers 409, as `assertQuizzesIdle` (`quizzes.ts:51`) and `assertNoActivePipelineRun` (`pages.ts:666`) already do; translation and TOC gain the same guard. Without the first guard, one save from a screen opened before a translate run would stamp every entry that run changed as manual.
11. **Translation batches keep their windows; eligibility is decided first by SPEC-0001.** The ordered source list is partitioned into fixed windows of fifty (`catalog-translation.ts`; `runTranslateStep`), then protected and ineligible entries are removed from each request body. Empty windows are skipped. Changing protection within one window must not shift later windows. Request-level cache identity still uses the complete index-plus-text body and effective prompt/model/settings. Current output is skipped before the adapter: it is not a cache hit. A wider request never authorizes wider publication. See the explicitly proposed AC-2 amendment below; no paid generation is required merely because a person corrected a translation.

### Keeping, accepting and replacing protected work

Three verbs. **Keep** needs no action anywhere: ordinary reruns skip protected content (decisions 2–5). **Accept as valid after an upstream change** exists only where a lineage warning exists, which in this version means translation (SPEC-0001 section 6, *Keep my edit*). Sectioning, quiz and TOC generation are outside SPEC-0001's scope, carry no lineage warning, and show only the existing stage-level "needs run" state, so there is nothing to accept and the spec says so rather than implying it. **Replace** is explicit and per entity:

| Entity | Explicit replacement | Owner and dependency |
|---|---|---|
| Translation | the small inline icon exposing *Regenerate and replace my edit* beside the entry | SPEC-0001 section 6; ships with its slice 4. Until then *Edit and Save* is available and wholesale replacement of one manual entry is not |
| Quizzes | the existing Add Quiz → *Replace* placement (`AddQuizDialog.tsx:283`; `quizzes.ts:152`), which drops the quiz at that position and generates a fresh-id one. When that quiz is manual, the dialog's existing sentence (`AddQuizDialog.tsx:159`) says it was edited by hand. An already explicit action needs no extra modal (SPEC-0001) | this spec |
| TOC | the stage rerun after the one-line confirmation (decision 5) | this spec |
| Sectioning | the stage rerun keeps manual pages by default. The existing confirmation (`LandingPageShell.tsx:78–81`, `CascadeResetDialog.tsx:32`) lists them — "3 pages were edited by hand (4, 9, 12) and will be kept" — and offers one opt-in, unticked on every open: "Also replace the hand-edited pages". The run request carries the choice (`replaceManual`, default false); the sectioning step honours it. This is SPEC-0001's "bulk replacement, off by default, naming the affected items" applied to pages. A single manual page is replaced today by restoring its last `ai` version and rerunning; per-page regenerate is a follow-up (non-goals) | this spec |

Provenance transitions:

| Action | On success | On failure or cancel |
|---|---|---|
| Save through an editor | `manual`, new version | no version written |
| Ordinary rerun | `ai` entries regenerated; `manual` untouched | manual untouched |
| Explicit replace (any entity) | `ai`, new version; the manual version stays in history | manual version stays current; nothing published |
| *Keep my edit* (translation, SPEC-0001) | stays `manual`; warning cleared | unchanged |
| Restore a version | that version's tags | unchanged |

One ordering requirement follows for sectioning: when a manual page is explicitly replaced, its section ids are retired when the new page is published, not in the pre-run clear; otherwise a failed page would carry retired ids under a still-active manual record. SPEC-0001 slice 1 already moves reconciliation to publication time, so this is a constraint on that work, not new machinery.

### Per-entity policy

| Entity | Identity | Protection unit | What counts as an edit | Deletion | Source removed | Restore |
|---|---|---|---|---|---|---|
| Translation | data ID shared with the source, per language | entry | a PUT that changes an entry's text | not possible from the editor | entry leaves the active document, kept in history | version restore; tags intact; SPEC-0001 rechecks lineage |
| Quizzes | `quizId`, never reused | quiz | a PUT that changes a quiz or adds one | removed from the active set; id retired per QUIZ_IDENTITY | none today; stays active | per QUIZ_IDENTITY; tags intact |
| Sectioning | page ID; sections keep factory ids | page record | any write through `saveStoryboardNode` | section removed; page manual; empty page allowed | page node removed with the page | version restore; page provenance intact |
| TOC | the single document | document | any PUT | entry absent from the saved document | entry dropped by retirement; provenance unchanged | version restore |

## Impact map

- `packages/types`: `text-catalog.ts` (`TextCatalogEntry.source`), `quiz.ts` (`Quiz.source`), `page-sectioning.ts` (`PageSectioningOutput.source`, on the page record, not on sections), `toc.ts` (`TocGenerationOutput.source`, on the document, not on entries). All optional. No change to `PIPELINE` or to `pipeline-effects.ts`.
- `packages/pipeline`: new `manual-edits.ts` — `stampManualEdits(prev, next, keyOf, isEqual)` and `mergePreservingManual(generated, existing, keyOf)`, extracted from the glossary pattern at `glossary.ts:74`; used by translation and quizzes only; `quiz-ids.ts:82–107` (`"replace"` must keep the ids of preserved manual quizzes); `catalog-translation.ts` (skip list); `section-ids.ts:359` and `apps/api/src/routes/stages.ts:46` (retirement must skip manual pages — PR 5); `pipeline-dag.ts` stamps `ai` where it writes the four nodes (`:568`, `:597`, `:734`, `:840`, `:933`). `toc-generation.ts` is untouched.
- `apps/api`: `routes/text-catalog.ts:151`, `routes/quizzes.ts:122`, `routes/toc.ts:71`, `routes/pages.ts:682` (`saveStoryboardNode`, which every sectioning edit passes through) — each gains `baseVersion` and the running-step guard; `routes/pages.ts:1683` (restore gains the running-step guard); `routes/stages.ts:29` (run body gains `replaceManual`, default false); `services/stage-runner.ts` at `runTranslateStep` (2546–2634, window bodies per decision 11), `runQuizzesStep` (1918–1931), `runTocStep` (2309–2315), `runSectioningStep` (1479–1508, honours `replaceManual`).
- `apps/studio`: `LanguageView.tsx`, `QuizzesView.tsx`, `TocView.tsx`, `SectioningPageDetail.tsx` — badge only, copied from `CaptionCard.tsx:38–110`; `LandingPageShell.tsx` / `CascadeResetDialog.tsx` — one line for a manual TOC, one sentence and one opt-in for manual sectioning pages; `AddQuizDialog.tsx:159` — one label when the replaced quiz is manual; the four save calls in `api/client.ts` (`:1297`, `:1770`, `:1826`, `:1853`) pass the loaded version and their views reload and re-apply pending edits on 409; `src/locales/{en,es,fr,pt-BR,sq}.po`.
- Docs: `docs/QUIZ_IDENTITY.md` gains one sentence (preserved manual quizzes keep their ids across full regeneration); `docs/INVARIANTS.md` gains a row (below). `docs/ARCHITECTURE.md` unchanged.
- Invariants: **entity versioning** (core principle 2) — every write stays a new version; nothing is mutated in place. Registry row 2 (no unconditional clear of user-touched entities) is strengthened in intent; its checker belongs to SPEC-0001. Row 3 (ids only via the factories) — preserved sections and quizzes keep their ids; nothing new is minted outside the factories. New row: "manual entries survive a rerun of their stage" — the route-level survival tests each slice adds.
- Schema/migration: none. Zod object schemas strip unknown keys, so an older app reads a newer book without error; an older app's rerun still overwrites (accepted for the beta; noted in the support statement alongside SPEC-0001's equivalent). Entries without `source` are protected (decision 4), so upgrading never regenerates over an existing correction.
- Collisions: **SPEC-0001 slice 1** (*Preservation foundation*: the pre-run clear stops deleting node data) is the prerequisite for every behavioural slice here (slices 2–5) and for AC-9; **SPEC-0001 slices 2–4** supply lineage, the Warning on a preserved entry whose inputs changed, and the keep / edit / replace actions; **SPEC-0003** (sectioning modes) — a mode change must not silently keep a page sectioned under the old mode; coordinate with SPEC-0003 before integration; **SPEC-0008** / the #784–#787 stack — section-id retirement; #808 (text-catalog race) and #830 (TTS editor) are independent.

## Corrections and implementation status — 2026-10-10

The owner authorized local implementation in this same PR before human approval,
without pushing. The spec stays `draft`, and every acceptance checkbox stays open.
[Implementation evidence and AC map](SPEC-0002-implementation-evidence.md) records
the refreshed baseline, dependencies, delivered slice and verification limits.

- **Authorship correction (requested by the owner):** the old non-goal saying
  absent `source` meant AI conflicted with Decision 4 and AC-11. It now says
  unknown and protected. This changes no accepted rule. Unknown authorship stays
  separate from lineage/freshness and explicit review acceptance. References to
  manual preservation below also require preserving unknown content; unknown
  work must be identified as such when requesting explicit replacement.
- **AC-2 amendment proposed for review:** the previous AC required every AI entry
  to be regenerated and every window to be submitted on an ordinary rerun, with
  one provider call after a lone correction. That contradicts SPEC-0001 section 4
  and AC-8, which skip current output. It can bill a user for unrelated current
  translations solely because they corrected one word. AC-2 and Decision 11 now
  separate ordinary eligibility from the controlled full-eligibility cache test.
  The former submits zero translation requests after that correction when all
  other translations are current. The latter retains the original fixed-window
  and one-changed-window cache experiment, explicitly at the adapter boundary.
  No new full-recompute UI or cache bypass is introduced. Retry counts and cache
  validity preclude a universal one-provider-call promise. This amendment remains
  subject to human review; it is not an implemented cost guarantee.
- **Dependency correction:** published #879 contains documentation only. Its
  local foundation commit `7d974c28` now supplies shared authorship metadata,
  admission and storage primitives; this branch is based on that exact commit
  and reuses them. The real HTTP run route still deletes saved output/history
  before generation. Only the documented schema/helper slice is delivered.
  Runtime translation, TOC, quiz and Sectioning integration must use the complete
  shared admission/freshness/publication foundation once implemented and tested.
  The omission of `baseVersion` from current routes cannot be papered over by a helper.
- **AC-9 versus AC-6:** AC-9's TOC survival case uses an ordinary HTTP run without
  explicit protected-work replacement. AC-6 separately exercises the named,
  confirmed TOC replacement. An upstream run or generic rerun is not confirmation.
- **AC-18 conflict handling:** re-applying a draft after reloading must retain the
  draft and expose overlapping edits for resolution, not automatically save a
  stale full document or relabel another writer's content as manual. Admission
  must cover queued execution and recheck captured versions at publication.

## Acceptance criteria

- [ ] AC-1 Saving a translation document through `PUT …/text-catalog-translation/:language` stamps `source: "manual"` on exactly the entries whose `text` differs from the current version; every other entry keeps its prior `source`; the response version increments.
- [ ] AC-2 **Amendment proposed 2026-10-10; human review pending (see below).** An ordinary translate rerun keeps every protected entry byte-for-byte while its source remains active, skips current AI output, regenerates selected changed AI output and fills missing output under SPEC-0001, and removes entries whose source ID is no longer active while retaining history. Build fixed windows over the complete ordered source list before filtering each request body; never compact the full list around protected or ineligible entries. Send only non-empty eligible windows. At the adapter boundary, assert protected entries are absent. Measure adapter requests, cache hits, actual provider calls (including retries) and provider cost separately; a skipped current window is not a cache hit. With all other output current, saving one correction causes zero translation requests/calls on both subsequent ordinary runs. Separately, in a controlled full-eligibility adapter/cache test with valid warmed caches and no retries, excluding one corrected entry changes only its window: the first pass incurs one provider call and other windows hit cache; the identical second pass incurs none. Empty/protected-only windows submit no request. These controlled adapter passes do not authorize publishing current or protected entries or add a force-fresh action.
- [ ] AC-3 Saving quizzes through `PUT …/quizzes` stamps `source: "manual"` on quizzes whose content changed or that are new; ids are preserved exactly as `saveQuizOutput(…, "edit")` does today.
- [ ] AC-4 A full quiz rerun keeps every manual quiz with its `quizId` (so `${quizId}_que` / `_o<n>` catalog entries, translations and audio still resolve), generates fresh-id AI quizzes for every eligible page including pages a manual quiz already covers, drops prior AI quizzes, orders by `afterPageId` leaving an explicit reading order untouched, and the "no eligible pages" run keeps the manual quizzes instead of saving an empty set.
- [ ] AC-5 Saving a TOC through `PUT …/toc` stamps the document `source: "manual"`; the TOC step stamps `ai`.
- [ ] AC-6 Rerunning the TOC stage on a manual TOC shows the existing rerun confirmation with the one-line manual-edit notice; confirming replaces the document with fresh `ai` output and keeps the manual version in history; cancelling leaves it untouched.
- [ ] AC-7 `PUT …/pages/:pageId/sectioning` and each structural op (clone, split, merge, cross-page merge, delete, ai-edit) stamp the page record `source: "manual"` through `saveStoryboardNode`; the sectioning step stamps `ai`; section ids are minted and retired exactly as today.
- [ ] AC-8 A sectioning rerun skips every manual page — no model call, record not rewritten, section ids not retired — and regenerates every `ai` page as today.
- [ ] AC-9 The full chain, with the model mocked: save through the real route → `POST /books/:label/stages/run` → read the node → read its version history (the manual version is listed) → preview and export (AC-17). One manual unit of each of the six types (translation entry, quiz, TOC document, page's sectioning, caption, glossary term) survives (a) a rerun of its own stage and (b) a rerun from `sectioning`. Both cases run after SPEC-0001 slice 1; see Rollout.
- [ ] AC-10 Each of the four views shows "Edited manually" on manual entries using the captions badge pattern; the string exists in `en`, `es`, `fr`, `pt-BR` and `sq`, and `pnpm lint` passes.
- [ ] AC-11 A stored node without `source` is never regenerated by an ordinary rerun: its entries are kept, missing entries are still filled, the node is reported as legacy per SPEC-0001's walkthrough, nothing is migrated, and a build without this change reads a book saved with it.
- [ ] AC-12 Restoring an older version keeps that version's `source` tags, and the next rerun honours them.
- [ ] AC-13 The structural cases hold: deleting an AI section leaves a manual page the rerun does not refill; deleting the last section leaves an empty manual page that stays empty; a cross-page merge leaves both pages manual and the rerun regenerates neither, so the moved content appears exactly once.
- [ ] AC-14 Source removal keeps history but not activeness: when a source catalog entry disappears, its manual translation leaves the active document on the next run and remains restorable from version history; when a section is retired, its TOC entry is dropped from the active TOC, the document's provenance is unchanged, and the previous version remains restorable.
- [ ] AC-15 The Sectioning rerun confirmation lists the manual pages by number and keeps them unless the opt-in is ticked; the opt-in is unticked on every open; with it ticked, every listed page is regenerated as `ai` and its manual version remains in history; a run without the opt-in never rewrites a manual page.
- [ ] AC-16 Explicit replacement is all-or-nothing per unit: on failure or cancellation the manual version stays current and nothing is published; a replaced manual page's section ids are retired only when its new version is published; the quiz *Replace* placement on a manual quiz names the hand edit, writes an `ai` quiz with a fresh id, and leaves the manual quiz in history.
- [ ] AC-17 After AC-9's chain, the preview and the web export contain the manual text for each of the four entities, read from the current versions as `packaging/web.ts:317`, `:356` and `:691` do today, and a manual page's sections render as saved.
- [ ] AC-18 Each of the four PUTs requires `baseVersion`. A PUT whose `baseVersion` is not the current version returns 409 carrying the current version and writes nothing. A PUT or a restore while the step that writes that node is running returns 409. A PUT with a matching `baseVersion` stamps exactly the entries that differ from that version. Studio handles 409 by reloading and re-applying pending edits.
- [ ] AC-19 The DAG runner stamps `ai` on the four nodes it writes, so a book produced by the CLI opens in Studio with those entries `ai`, not legacy. No preservation is asserted on the CLI path (non-goals).

## Test plan

- **API tests** (`apps/api/src/routes/*.test.ts`, in-memory storage as today): `text-catalog.test.ts` (extend the describe at line 124) — AC-1, AC-11 for translation; `quizzes.test.ts` — AC-3 and the quiz half of AC-16 (generate-one with `placement: "replace"` on a manual quiz); new `toc.test.ts` — AC-5, AC-14 (TOC); `pages.test.ts` — AC-7 and AC-13 for the PUT and each structural op, and the restore guard of AC-18; `stages.test.ts` — the `replaceManual` flag is parsed and defaults to false. AC-18 in each of the four route files: stale `baseVersion` → 409 and no version written; missing `baseVersion` → 400; save while the writing step is running → 409; matching `baseVersion` → exact stamping.
- **Runner tests** (`apps/api/src/services/stage-runner.test.ts`, model mocked exactly as the captions tests at lines 548–696): AC-2, AC-4, AC-8, AC-11, AC-12, AC-13, AC-14 (translation), AC-15 (the flag replaces listed pages and only them), the sectioning half of AC-16 with failure injected on the replaced page (manual record still current, ids not retired), and the `ai` stamp and history halves of AC-6. AC-2 is asserted at the adapter boundary by spying on `translateCatalogBatch` through the existing `vi.mock("@adt/pipeline")` (line 41), and its four numbers are read from `llm_log`; the "no model call" half of AC-8 is asserted the same way.
- **Unit tests** (`packages/pipeline/src/__tests__/manual-edits.test.ts`, new): `stampManualEdits` and `mergePreservingManual` over each key function, including the property "every manual entry in the input appears unchanged in the output"; `quiz-ids` id retention in `"replace"` mode (extend `apps/api/src/routes/quiz-id-lifecycle.test.ts`).
- **Route-level survival** (new `apps/api/src/routes/manual-edit-survival.test.ts`, driving the run route through `app.request` as `books.test.ts` does, with `@adt/llm` mocked as `stage-runner.test.ts:55` does): AC-9 and AC-17, one case per entity type, added by the slice that ships that entity, over a three-page synthetic fixture under `packages/pipeline/src/__tests__/fixtures/` with one translation language, two quizzes, three TOC entries and one manual page. Preview is asserted through the `adt-preview.test.ts` pattern; export through the web packaging. This file is the invariant-registry row's checker.
- **DAG parity** (`packages/pipeline/src/__tests__/`): AC-19, the `ai` stamp on each of the four nodes the DAG runner writes; nothing more is asserted on that path.
- **Studio**: AC-10, the confirmation halves of AC-6 and AC-15, and the quiz label of AC-16 via the CI `i18n` job (extract + lint) and a check in a running Studio before the spec moves to `verified`; a component test is optional (76 exist under `apps/studio/src`).
- **Harness** (`pnpm acceptance`, SPEC-0005): on Mathematics STD 5, edit one translation entry, rerun translate twice, and assert AC-2's four numbers at scale: the entry survives; ordinary runs skip current output; controlled full-eligibility adapter/cache passes meet the amended AC-2 accounting without claiming those passes are ordinary reruns.
- Fixtures: `tests/fixtures/raven.pdf` is the only committed book; the synthetic fixture above is enough for every AC except the harness row.

## Rollout

The original PR slices below are **commit slices in existing PR #880** under the
owner's authorization. Approval-before-implementation sequencing is overridden
for this task; the runtime dependency gates and pending human review are not.

- **Dependency, stated once:** every behavioural slice (slices 2–5) lands after SPEC-0001 slice 1, *Preservation foundation*, because until then the pre-run clear deletes the very node each merge must read. Each slice carries its own route-level survival test (AC-9) for its entity. Slice 1 has no dependency.
- **Slice 1** — the four optional schema fields and `packages/pipeline/src/manual-edits.ts` with unit tests. No behaviour change. Enables everything; closes nothing. ≈150 lines.
- **Slice 2** — translation: stamp in the PUT, merge and skip in `runTranslateStep`, badge, catalogs. Also the restore guard and the survival test harness. Closes AC-1, AC-2, AC-10 (translation), AC-11, AC-12, AC-14 (translation), AC-17, AC-18 and AC-19 for translation, and AC-9 for translation plus the two already-preserving types (captions, glossary) that share its harness. ≈340 lines.
- **Slice 3** — TOC: stamp in the PUT, `ai` stamp in the step, badge, one line in the rerun confirmation. Closes AC-5, AC-6, AC-10 (TOC), AC-14 (TOC), AC-9, AC-17, AC-18 and AC-19 for TOC. ≈150 lines.
- **Slice 4** — quizzes: closes AC-3, AC-4, AC-10 (quizzes), AC-9, AC-17, AC-18 and AC-19 for quizzes, the quiz half of AC-16; the `QUIZ_IDENTITY.md` sentence. ≈300 lines.
- **Slice 5** — sectioning (retirement interplay at `stages.ts:46` / `section-ids.ts:359`): closes AC-7, AC-8, AC-13, AC-15, the sectioning half of AC-16, AC-10 (sectioning), AC-9, AC-17, AC-18 and AC-19 for sectioning. ≈360 lines.
- Order: 1 → {2, 3, 4} in any order → 5. The invariant-registry row lands with slice 2. No feature flag. Every slice is independently revertable: the fields are optional and the merges additive, so reverting one returns that entity to overwrite-on-rerun and leaves stored `source` tags inert.

## Open questions

None of these defaults. Each stays open until its owner resolves it in review, and a deferral is recorded as a filed, linked issue before the spec is approved.

1. Easy-read: in #736's title, has a PUT route (`easy-read.ts:174`) and no provenance (`packages/types/src/easy-read.ts:3–11`), absent from the companion's four, and treated as protected by the revised SPEC-0001. Fifth entity in this spec (translation pattern, ≈150 lines), or a separate fast-lane issue filed and linked here? — **owner: @ksokolovic.**
2. No ADR is attached: quiz identity rules are unchanged and non-destructive invalidation belongs to ADR-024 as amended in #879. Confirm that no standing decision changes. — **owner: @ksokolovic.**
3. Storyboard full-rerun preservation (#144 "partial") stays out. Which follow-up carries it: its own spec, or an issue filed and linked here first? — **owner: @ksokolovic.**
