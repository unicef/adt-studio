---
id: SPEC-0002
title: Manual-edit preservation for translation, quizzes, sectioning and TOC
status: draft
owner: "@ksokolovic"
approvers: ["@<integration>", "@elasticsounds"]
issues: ["#736", "#144"]
prs: []
adr: ""
created: 2026-09-21
updated: 2026-09-21
---

<!-- Drafted by an agent from #736, #144, SPEC-0001 and the codebase on 2026-09-21
     (develop at 7a8896528). Not yet edited by the owner. Every path:line anchor was
     opened and checked; the design is a proposal for the owner to cut down. -->

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

So the caption merge at `stage-runner.ts:2116–2123` runs after its input has been deleted whenever the rerun comes through the route. The test that proves caption preservation (`apps/api/src/services/stage-runner.test.ts:640`) calls the runner directly and never exercises `makeBeforeRun`. The caption merge (48015cc1c, 2026-05-31) predates the exemption list (c78338086, 2026-07-07), which was added for the glossary. `packages/types/src/__tests__/pipeline-effects.test.ts:40–42` asserts the glossary exemption; no equivalent assertion exists for captions, translate, toc or sectioning. SPEC-0001 owns this clear (its PR 1 replaces it with mark-stale); it is recorded here because it decides whether anything this spec adds is reachable from the UI.

### What the user sees

- No "edited" indicator exists for translation, quizzes, sectioning or TOC; `source === "manual"` is read only in the glossary, captions and TTS-normalisation views (`GlossaryView.tsx:691–693`, `CaptionCard.tsx:38`, `CoreTtsSpeechEditor.tsx:29`).
- The rerun confirmation (`LandingPageShell.tsx:78–81`, `CascadeResetDialog.tsx:32`) lists the downstream stages that will be reset; it never mentions the rerun stage's own hand edits.
- Copy promises otherwise: "experimenting is safe — nothing is ever overwritten" (`BookView.tsx:755`); "Every edit and re-run is saved as a new version, so you can always roll back" (`EasyReadLandingPage.tsx:95`). After a clear, the version picker (`VersionPicker.tsx:162`; restore route `pages.ts:1683`) has no versions to offer.

### Scale

Mathematics STD 5 has about 8,850 catalog entries per language (#733). One corrected translation among them is regenerated over by the next translate run, and the correction was never a model output, so it is not in the cache (#736: "A hand-corrected caption or translation was never an LLM output, so it is not in the cache. The delete removes it and the subsequent re-run regenerates the model's version over the top."). #144's status update (2026-08-04) lists the remaining work as translation, quiz, sectioning, TOC and the storyboard full rerun, and adds: "Also missing: 'edits will be replaced/lost' warnings for sectioning, quiz, translation, and TOC".

## Goals

- A hand-edited translation entry, quiz, TOC entry or page section survives a rerun of its own stage; once SPEC-0001 PR 1 lands, it survives any upstream rerun too.
- Manual entries are excluded from the model request on rerun, so a rerun after a correction is cheaper as well as safe.
- Each of the four views shows which entries are manual, using the badge the captions view already has.
- One shared helper and one shared test shape, so the next entity type costs less than this one.

## Non-goals

Binding.

- No change to staleness semantics: the clear lists, `makeBeforeRun`, `step_runs`, `inputVersions`, "regenerate stale only". SPEC-0001 owns them. (Open question 8 asks SPEC-0001's owner for one exemption; it is not done here.)
- No new UI beyond an "Edited manually" indicator per entry in the four views. No per-entity "N edits will be lost" dialog, no bulk "reset to AI" action, no new panels. The stale indicator on a preserved entry comes from SPEC-0001 PR 2, not from here.
- No storyboard (`web-rendering`) full-rerun preservation. #144 marks it "partial" and needing its own design decision.
- No change to quiz identity allocation (`docs/QUIZ_IDENTITY.md`) beyond documenting that preserved manual quizzes keep their ids.
- No three-way merge that re-applies a user's delta onto fresh model output.
- No retrofit of server-side stamping onto glossary, captions or speech; they keep working as they do.
- No data migration; a stored entry without `source` is treated as AI-generated.
- No change to the version picker or the restore contract.

## Proposed design

**Option A — per-entry `source` tag plus merge on rerun (the glossary/captions pattern), stamped server-side.** Optional `source: "ai" | "manual"` on the four entry schemas (≈20 lines, 4 files in `packages/types`); each PUT route diffs the incoming document against the current version and stamps changed or added entries (≈100 lines, 4 files in `apps/api/src/routes`); each `run<Step>Step` reads the prior node, keeps manual entries wholesale, and sends only the rest to the model (≈180 lines across `stage-runner.ts`, `quiz-ids.ts`, `toc-generation.ts`); one shared helper module (≈80 lines, `packages/pipeline`); a badge in four views plus five catalogs (≈80 lines); tests ≈350 lines. About 800 lines over ≈20 files, in six PRs.

**Option B — node-level "user-owned" flag, no schema change.** A user PUT marks the whole node (a language's translation, the book's quizzes or TOC, a page's sectioning) user-owned; the step skips user-owned nodes. ≈120 lines, 5 files. Coarse: one corrected entry freezes a language's 8,850 entries, and new source entries never get translated unless the user regenerates explicitly — which then loses the edits. Reintroduces the problem at a different grain.

**Option C — three-way merge on rerun** (prior AI output, prior current, new AI output; re-apply the user's deltas). ≈500+ lines; undefined for sectioning, where a re-partition has no stable diff base; not before November.

**Chosen: A for translation, quizzes and TOC; A's tag with page-granular preservation for sectioning.** A page's sections partition its content and cannot be merged entry-wise, so a page that contains any manual section is kept whole and skipped by the model — Option B's grain, applied only where entry-level merge is undefined. The `source` tag is still stamped per section so the indicator and a later section-level merge (SPEC-0003 territory) have the data.

Decisions for the reviewer to ratify:

1. **Stamping is server-side.** Each PUT route compares the incoming document with the current version and sets `source: "manual"` on entries whose content changed or that are new; untouched entries keep their prior `source`. Glossary and captions stamp on the client today and are left alone. Rationale: the API is the one path every client shares (layer rule in AGENTS.md), so the CLI and any future client are honest by construction.
2. **Manual entries are kept wholesale and excluded from the model request.** They are never regenerated implicitly (SPEC-0001 decision 3); an explicit per-entry regenerate is the only way to replace one.
3. **Sectioning preservation is page-granular.** A page with at least one manual section is not sent to the model, its node is not rewritten, and its section ids are not retired.
4. **Absence of `source` means `"ai"`.** No migration; existing books behave as today until the user edits something.
5. **TOC records user deletions** with `pruned: true` (as `packages/types/src/glossary.ts:10` does) so a rerun does not re-add a heading the user removed. Translation needs no such record (entries follow the source catalog); quizzes need none (a deleted quiz is replaced by a fresh-id quiz by design).
6. **Survival is tested through the HTTP run route**, so the pre-run clear is exercised and a regression in SPEC-0001's mark-stale primitive fails this spec's tests too.

## Impact map

- `packages/types`: `text-catalog.ts` (`TextCatalogEntry.source`), `quiz.ts` (`Quiz.source`), `page-sectioning.ts` (`PageSectioningSection.source`), `toc.ts` (`TocEntry.source`, `TocEntry.pruned`). All optional. No change to `PIPELINE` or to `pipeline-effects.ts` (unless open question 8 is answered "now").
- `packages/pipeline`: new `manual-edits.ts` — `stampManualEdits(prev, next, keyOf, isEqual)` and `mergePreservingManual(generated, existing, keyOf)`, extracted from the glossary pattern at `glossary.ts:74`; `quiz-ids.ts:82–107` (`"replace"` must keep the ids of preserved manual quizzes); `toc-generation.ts:155` (accept prior entries, skip covered sections); `catalog-translation.ts` (skip list); `section-ids.ts:359` and `apps/api/src/routes/stages.ts:46` (retirement must skip preserved pages — PR 5, after SPEC-0001 PR 1).
- `apps/api`: `routes/text-catalog.ts:151`, `routes/quizzes.ts:122`, `routes/toc.ts:71`, `routes/pages.ts:682` (`saveStoryboardNode`, which every sectioning edit passes through); `services/stage-runner.ts` at `runTranslateStep` (2546–2634), `runQuizzesStep` (1918–1931), `runTocStep` (2309–2315), `runSectioningStep` (1479–1508).
- `apps/studio`: `LanguageView.tsx`, `QuizzesView.tsx`, `TocView.tsx`, `SectioningPageDetail.tsx` — badge only, copied from `CaptionCard.tsx:38–110`; `src/locales/{en,es,fr,pt-BR,sq}.po`.
- Docs: `docs/QUIZ_IDENTITY.md` gains one sentence (preserved manual quizzes keep their ids across full regeneration); `docs/INVARIANTS.md` gains a row (below). `docs/ARCHITECTURE.md` unchanged.
- Invariants: **entity versioning** (core principle 2) — every write stays a new version; nothing is mutated in place. Registry row 2 (no unconditional clear of user-touched entities) is strengthened in intent; its checker belongs to SPEC-0001. Row 3 (ids only via the factories) — preserved sections and quizzes keep their ids; nothing new is minted outside the factories. New row: "manual entries survive a rerun of their stage" — contract test from PR 6.
- Schema/migration: none. Zod object schemas strip unknown keys, so an older app reads a newer book without error; an older app's rerun still overwrites (accepted for the beta; noted in the support statement alongside SPEC-0001's equivalent).
- Collisions: **SPEC-0001 PR 1** (mark-stale instead of delete) is the prerequisite for AC-9(b) and PR 5; **SPEC-0001 PR 2** (`inputVersions`) supplies "stale" on a preserved entry whose input changed; **SPEC-0003** (sectioning modes) — a mode change must not silently keep a page sectioned under the old mode (open question 2); **SPEC-0008** / the #784–#787 stack — section-id retirement; #808 (text-catalog race) and #830 (TTS editor) are independent.

## Acceptance criteria

- [ ] AC-1 Saving a translation document through `PUT …/text-catalog-translation/:language` stamps `source: "manual"` on exactly the entries whose `text` differs from the current version; every other entry keeps its prior `source`; the response version increments.
- [ ] AC-2 A translate rerun keeps every manual entry byte-for-byte, regenerates every AI entry, drops entries whose id has left the source catalog, and issues no model request that contains a manual entry's id.
- [ ] AC-3 Saving quizzes through `PUT …/quizzes` stamps `source: "manual"` on quizzes whose content changed or that are new; ids are preserved exactly as `saveQuizOutput(…, "edit")` does today.
- [ ] AC-4 A full quiz rerun keeps every manual quiz with its `quizId` (so `${quizId}_que` / `_o<n>` catalog entries, translations and audio still resolve), generates AI quizzes with fresh ids, drops prior AI quizzes, and the "no eligible pages" run keeps the manual quizzes instead of saving an empty set.
- [ ] AC-5 Saving a TOC through `PUT …/toc` stamps `source: "manual"` on changed or added entries and records user-removed AI entries as `pruned`.
- [ ] AC-6 A TOC rerun keeps every manual entry, does not re-add pruned entries, adds AI entries only for sections not covered by a manual entry, and orders the result by reading order.
- [ ] AC-7 `PUT …/pages/:pageId/sectioning` and each structural op (clone, split, merge, cross-page merge, delete, ai-edit) stamp `source: "manual"` on the sections they create or change and on no other section.
- [ ] AC-8 A sectioning rerun skips every page that contains a manual section — no model call, node not rewritten, section ids not retired — and regenerates every other page as today.
- [ ] AC-9 Through `POST /books/:label/stages/run` with the model mocked, one manual entry of each of the six types (translation, quiz, TOC entry, section, caption, glossary term) survives (a) a rerun of its own stage and (b) a rerun from `sectioning`. (b) depends on SPEC-0001 PR 1 and is `test.todo` until it lands.
- [ ] AC-10 Each of the four views shows "Edited manually" on manual entries using the captions badge pattern; the string exists in `en`, `es`, `fr`, `pt-BR` and `sq`, and `pnpm lint` passes.
- [ ] AC-11 A stored node without `source` behaves as all-AI: a rerun regenerates it fully, nothing is migrated, and a build without this change reads a book saved with it.
- [ ] AC-12 Restoring an older version keeps that version's `source` tags, and the next rerun honours them.

## Test plan

- **API tests** (`apps/api/src/routes/*.test.ts`, in-memory storage as today): `text-catalog.test.ts` (extend the describe at line 124) — AC-1, AC-11 for translation; `quizzes.test.ts` — AC-3; new `toc.test.ts` — AC-5; `pages.test.ts` — AC-7 for the PUT and each structural op.
- **Runner tests** (`apps/api/src/services/stage-runner.test.ts`, model mocked exactly as the captions tests at lines 548–696): AC-2, AC-4, AC-6, AC-8, AC-11, AC-12. Assertions on the mocked model's request bodies prove the "no request contains a manual entry" half of AC-2 and the "no model call" half of AC-8.
- **Unit tests** (`packages/pipeline/src/__tests__/manual-edits.test.ts`, new): `stampManualEdits` and `mergePreservingManual` over each key function, including the property "every manual entry in the input appears unchanged in the output"; `quiz-ids` id retention in `"replace"` mode (extend `apps/api/src/routes/quiz-id-lifecycle.test.ts`).
- **Route-level survival** (`apps/api/src/routes/stages.test.ts`, which already pins the retirement/clear boundary via the exported `makeBeforeRun`): AC-9 over a three-page synthetic fixture under `packages/pipeline/src/__tests__/fixtures/` — the SPEC-0001 fixture extended with one translation language, two quizzes, three TOC entries and one manual section on page 2. This file is the invariant-registry row's checker.
- **Studio**: AC-10 via the CI `i18n` job (extract + lint) and a check in a running Studio before the spec moves to `verified`; a component test is optional (76 exist under `apps/studio/src`).
- **Harness** (`pnpm acceptance`, SPEC-0005): on Mathematics STD 5, edit one translation entry, rerun translate, assert the entry survives and the model request count equals entries − 1 (AC-2 at scale).
- Fixtures: `tests/fixtures/raven.pdf` is the only committed book; the synthetic fixture above is enough for every AC except the harness row.

## Rollout

- **PR 1** — the four optional schema fields and `packages/pipeline/src/manual-edits.ts` with unit tests. No behaviour change. Enables everything; closes nothing. ≈150 lines.
- **PR 2** — translation: stamp in the PUT, merge and skip in `runTranslateStep`, badge, catalogs. Closes AC-1, AC-2, AC-10 (translation), AC-11. ≈250 lines.
- **PR 3** — TOC: closes AC-5, AC-6, AC-10 (TOC). ≈200 lines.
- **PR 4** — quizzes: closes AC-3, AC-4, AC-10 (quizzes); the `QUIZ_IDENTITY.md` sentence. ≈250 lines.
- **PR 5** — sectioning, after SPEC-0001 PR 1 (retirement interplay at `stages.ts:46` / `section-ids.ts:359`): closes AC-7, AC-8, AC-10 (sectioning). ≈300 lines.
- **PR 6** — route-level survival tests for the six types and the invariant-registry row, after SPEC-0001 PR 1: closes AC-9, AC-12. ≈250 lines.
- Order: 1 → {2, 3, 4} in any order → 5 → 6. No feature flag. Every PR is independently revertable: the fields are optional and the merges additive, so reverting one returns that entity to overwrite-on-rerun and leaves stored `source` tags inert.

## Open questions

Each defaults to the stated answer if unanswered by the date.

1. Server-side stamping by diff (decision 1) or client-side as glossary and captions do today? — **owner: @ksokolovic, due: 2026-09-25.** Default: server-side.
2. Sectioning: page-granular preservation (decision 3) or a section-level merge? And what happens to a preserved page when SPEC-0003 changes the sectioning mode? — **owner: @ksokolovic, due: 2026-09-25.** Default: page-granular; a mode change marks preserved pages stale (SPEC-0001) and does not rewrite them.
3. Does an ai-edit (`pages.ts:1989`, the user directs the model to change one section) count as manual? — **owner: @ksokolovic, due: 2026-09-25.** Default: yes.
4. Quizzes: should regeneration skip pages already covered by a manual quiz? — **owner: @ksokolovic, due: 2026-09-25.** Default: no; the user deletes what they do not want.
5. Ordering after a merge: where do preserved manual quizzes and TOC entries sit relative to new AI ones? — **owner: @ksokolovic, due: 2026-09-25.** Default: TOC by section order; quizzes by `afterPageId`; an explicit reading order is untouched.
6. A manual translation whose source text later changes is kept and, until SPEC-0001 PR 2 lands, shown without a stale mark. Accept the gap for the beta? — **owner: @ksokolovic, due: 2026-09-25.** Default: accept.
7. Easy-read: in #736's title, has a PUT route and no provenance, absent from the companion's four. Fifth entity in this spec (translation pattern, ≈150 lines) or a separate fast-lane issue? — **owner: @ksokolovic, due: 2026-09-25.** Default: separate issue using the same helper.
8. The pre-run clear deletes `image-captioning` on a captions rerun and `tts` on a translate rerun (table above). One-line fast-lane exemptions in `pipeline-effects.ts:217` now, with assertions mirroring `pipeline-effects.test.ts:40`, or wait for SPEC-0001 PR 1? — **owner: @ksokolovic (with SPEC-0001's owner), due: 2026-09-25.** Default: fast-lane now, cross-referenced from both specs.
9. No ADR is attached: quiz identity rules are unchanged and mark-stale is ADR-024's. Confirm that no standing decision changes. — **owner: @ksokolovic, due: 2026-09-25.** Default: no ADR.
10. Storyboard full-rerun preservation (#144 "partial") stays out. Own spec, or an issue first? — **owner: @ksokolovic, due: 2026-09-25.** Default: issue first.
11. #144 asks for "edits will be lost" warnings on the four views. Once edits survive, the warning is moot; the existing cascade dialog stays as is. Confirm dropping the warnings. — **owner: @ksokolovic, due: 2026-09-25.** Default: drop.
