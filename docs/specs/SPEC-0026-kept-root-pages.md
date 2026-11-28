---
id: SPEC-0026
title: Keep an imported book's root pages outside the reading order
status: in-review
owner: "@gbergengruen"
approvers: []
issues: ["#1154"]
prs: []
adr: ""
created: 2026-11-25
updated: 2026-11-25
---

## Problem (with evidence)

A delivered ADT can include HTML pages at the archive root that are not in the reading
order (`content/pages.json`) and are not edited in ADT Studio, but still ship with the
book. Two kinds are known from #1154:

- **Pages the Ministry of Education (MoE) review or the schools need:** credits, legal
  and authorship information, teacher notes. The Spanish workbook in #1154 has
  `creditos.html`, a standalone credits page linked from the cover that doesn't use the
  reader runtime.
- **Pages taken out of the reading order for later use:** the same workbook has
  `pg025_sec002.html`, an activity removed from the reading order.

ADT Studio can't import such a bundle without losing these pages:

- Import treats each one as a blocking problem. `collectAdtImportIssues` reports a root
  `.html` that isn't in `pages.json` as `unlisted-root-page`
  (`apps/api/src/services/adt-import/compatibility.ts:85`, added by #1178), the
  archive is `supported: false` (`:292`), and `importAdtProject` refuses it
  (`project-import.ts:122`).
- The only way through is to remove the pages. The repair request tells the AI
  assistant to save them in a restore kit and remove them
  (`repair-guide.ts:52`). After every export the author must put them back by hand or
  with a script. The team in #1154 does that today with a packaging script, and nothing
  in the bundle records that the pages exist.
- Export can't carry them either. The step that restores an imported book's
  presentation copies the original bundle's files into the export but skips every
  `.html` file (`presentation.ts:301`). Two packaging checks then reject any root `.html`
  outside the reading order: `packageFilesAvailable`
  (`packages/pipeline/src/packaging/bundle-files.ts:288`) and the ownership receipt
  (`bundle-ownership.ts:78`). A download then fails with `PACKAGE_FILES_INCOMPLETE`.
- Preview has no route for them. `/:filename.html` maps only to sections in the reading
  order and answers 404 otherwise (`apps/api/src/routes/adt-preview.ts:1205`, `:1211`),
  so the cover's link to the credits page is broken in Preview.

## Goals

- An imported ADT whose only structural finding is root pages outside the reading order
  imports without repair.
- Those pages, and the local files only they reference, are stored in the book
  directory, byte for byte, and versioned like any other book data.
- Every export of the book contains them at their original paths, byte for byte, and the
  exported bundle passes Studio's own package checks.
- Preview serves them, so links to them work, without running their scripts with
  Studio's privileges.
- The import review tells the author which pages are kept as-is and that Studio doesn't
  edit or check them.

## Non-goals

- **PDF-born books.** Adding standalone pages to a book that wasn't imported (an upload
  or management UI) is out of scope. The storage format must not prevent it later.
- **Editing kept pages in Studio**, or listing them in Storyboard, Sectioning or the
  page list. A kept page is opaque content.
- **Managing kept pages after import.** No add, remove or replace in Studio. To change
  the set, the author re-imports an ADT with the pages they want.
- **Translation, speech, Easy Read, glossary or TOC for kept pages.** They aren't text
  Studio extracted, so no stage reads them.
- **Checking kept pages.** Accessibility assessment, reviewer validation and the
  `unsupported-script` policy for reading-order pages don't apply to them. Studio says so
  instead of reporting them as passing.
- **Keeping kept pages working after a runtime change.** A kept page that loads the
  reader runtime (like the out-of-order activity) gets whatever runtime the export
  ships. Studio doesn't adapt or test it.
- **Adding a kept page to the reading order.** Turning a kept page into a normal
  editable page is separate work. Today the author does it before import, as the repair
  request already explains.
- **Other unexpected entries.** Folders and non-HTML files outside the canonical
  structure stay `unexpected-bundle-entry`, and nested pages stay `nested-page`, with
  their current handling.
- **The page shell and presentation of reading-order pages.** That is #1051 and the
  other "imported content survives export" specs (#1049, #1054). This spec only adds
  whole pages next to them.

## Proposed design

### Options considered

- **Option A: read the pages from the stored source ZIP at export.** Every import keeps
  its ZIP verbatim at `.adt-imports/<publicationId>-<sha12>/source.zip`
  (`source.ts:91`). Export would copy root pages from it, as presentation restore does
  for non-HTML files. About 150 lines in ~6 files plus tests. The pages are then tied to
  whichever import is current, their presence isn't a versioned record, and a reader of
  the book directory can't see them without opening the ZIP.
- **Option B: copy them into the book directory at import (chosen).** Import writes each
  kept page, and the local files only it references, into `kept-pages/` in the book
  directory, and records the set as a versioned entity. Export, Preview and the package
  checks read that record. About 450–600 lines in ~14 files, tests included, with no
  database schema change: the record is a new node type.

Option B is chosen because it keeps the book's own content in the book directory
(principle 1), versions it (principle 2), survives a later re-import that changes the
set, and gives Export, Preview and the checks one record to read.

### Decisions to ratify

1. **D1. Root pages outside the reading order are kept, not reported as a problem.**
   `unlisted-root-page` moves from the blocking issue list to a separate,
   non-blocking list. The repair request stops including it.
2. **D2. Storage.** The files live in `kept-pages/` in the book directory, stored by
   content (`kept-pages/<sha256>`), with no path inside the book directory taken from
   the archive. A `kept-root-pages` node holds the set as
   `{ files: [{ path, sha256, bytes, kind: "page" | "dependency" }] }`, where `path` is
   the archive-relative path. Each import that changes the set writes a new version.
   Old versions stay readable, because their blobs are never deleted.
3. **D3. Dependencies.** A kept page's local references (`link`, `script`, `img`,
   `source`, `audio`, `video`, the elements import already inspects at
   `packages/pipeline/src/adt-round-trip/html.ts:249-284`) that resolve inside the
   archive, aren't `content/**` and aren't a reading-order page are kept as
   `dependency` entries. References that leave the archive or don't exist are listed in
   the review as missing, not fixed.
4. **D4. Export.** After the bundle is built, each kept file is copied to its `path` if
   nothing exists there. Export's own files win for dependencies. A kept **page** whose
   name is already taken by a generated file fails packaging with
   `KEPT_PAGE_PATH_TAKEN`, naming the page, so a shipped page is never silently
   dropped.
5. **D5. Package checks.** `packageFilesAvailable` and the ownership receipt accept a
   root `.html` that is in the current `kept-root-pages` version with matching bytes.
   `imsmanifest.xml` lists kept pages as files. The packaging input hash includes the
   `kept-root-pages` version (it already covers node versions through
   `getNodeVersionFingerprint`, `web.ts:242`), so a re-import that changes the set
   rebuilds the package.
6. **D6. Preview isolation.** Preview serves a kept page at its path, with
   `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms` and no
   `allow-same-origin`. Its scripts run in an opaque origin: they can't read Studio's
   storage or call the API with Studio's origin. Preview's iframe itself is unchanged.
   The exported bundle ships the page verbatim, as the author delivered it.
7. **D7. Re-import.** Projection replay treats `kept-root-pages` like the other replayed
   nodes (`projection.ts:86`). A re-import of a newer ADT writes the new set as a new
   version, and a page missing from the new ADT is no longer exported. Its earlier
   version stays in history.

### Import review

The review gets a non-blocking group, "Kept as-is", listing each kept page with this
text: "This page isn't in the reading order. ADT Studio keeps it unchanged and includes
it in every export, but doesn't edit or check it." Missing dependencies (D3) are listed
under the page. All strings go through Lingui in all five locales.

### Studio-side visibility after import

None beyond Preview serving the pages (non-goal: managing them). The accessibility
assessment report says "N pages kept as-is weren't checked" when the set is non-empty.

## Impact map

- **Types:** `packages/types/src/adt-round-trip.ts`: a `keptRootPages` list on the import
  preview, beside `compatibility.issues`; a `KeptRootPages` schema for the node.
- **Import:** `compatibility.ts` (D1), `bundle-reader.ts` (read kept pages and their
  references), the import seed (write blobs and node), `projection.ts` (D7),
  `repair-guide.ts` (drop the `unlisted-root-page` fix text and restore-kit wording for it).
- **Export:** `apps/api/src/services/adt-import/presentation.ts` or a sibling step on the
  same `finalizePresentation` hook (`export-service.ts:181`, `routes/package.ts:360`),
  `packages/pipeline/src/packaging/bundle-files.ts`, `bundle-ownership.ts`, `web.ts`
  (`imsmanifest.xml` at `:2876`).
- **Preview:** `apps/api/src/routes/adt-preview.ts` (kept-page route with the sandbox
  header).
- **Accessibility report:** `packages/pipeline/src/accessibility-assessment-shared.ts`
  (the "not checked" count).
- **Studio:** the import review (`ImportReview`, `use-review-model.ts`), catalogs.
- **Docs:** `docs/ARCHITECTURE.md#book-directory-structure` gains the `kept-pages/` row.
- **Invariants:** entity versioning (D2, D7). `kept-pages/` blobs are never deleted, as
  invariant 2 already requires of user-touched entities. No new invariant row.
- **Extraction admission:** none. Only imported books get `kept-pages/`, and imported
  books never run a first extraction. If a later spec adds kept pages to PDF books, it
  adds `kept-pages` to `assertInitialDestination`.
- **Concurrent work:** #1051, #1049 and #1054 (Eliezir) also change export of imported
  books. They touch the page shell and content, not root files. The `finalizePresentation`
  hook is the shared point. #1185 changes the repair request's length and overlaps on
  `repair-guide.ts` only.

## Acceptance criteria

- [ ] AC-1: An ADT whose only finding is root pages outside the reading order previews
  as supported, lists them in `keptRootPages`, and has no `unlisted-root-page` issue.
- [ ] AC-2: An ADT that has such pages plus a blocking problem is still unsupported, and
  its repair request doesn't ask to remove or restore-kit the kept pages.
- [ ] AC-3: Import stores each kept page and dependency as `kept-pages/<sha256>` with the
  original bytes, and writes a `kept-root-pages` version that lists their archive paths.
- [ ] AC-4: A kept page's local reference that resolves inside the archive, outside
  `content/**`, and isn't a reading-order page is stored as a dependency; a reference to a
  missing file is listed in the review as missing and doesn't block the import.
- [ ] AC-5: A path that would escape the bundle root (`..`, absolute, drive letter) is never
  written outside `kept-pages/` and never exported.
- [ ] AC-6: Export contains every kept file at its archive path with identical bytes, and
  `packageFilesAvailable` and the ownership receipt accept the bundle; the download
  succeeds.
- [ ] AC-7: When export already produces a file at a dependency's path, export's file is
  kept; when it produces a page at a kept page's path, packaging fails with
  `KEPT_PAGE_PATH_TAKEN` naming the page.
- [ ] AC-8: `imsmanifest.xml` lists the kept pages.
- [ ] AC-9: Importing the exported bundle again yields the same kept set with the same
  bytes (round trip).
- [ ] AC-10: Re-importing a newer ADT that drops a kept page writes a new
  `kept-root-pages` version without it; the next export omits the page, and the previous
  version and its blobs stay readable.
- [ ] AC-11: A change to the kept set invalidates the packaging input hash; an unchanged
  set doesn't.
- [ ] AC-12: Preview serves a kept page at its path with the bytes stored, and the response
  carries `Content-Security-Policy: sandbox` without `allow-same-origin`.
- [ ] AC-13: Preview still answers 404 for a root `.html` that is neither a section nor a
  kept page.
- [ ] AC-14: The import review shows the "Kept as-is" group with each page and any
  missing dependency, translated in all five locales.
- [ ] AC-15: The accessibility assessment report states how many kept pages weren't
  checked, and doesn't count them as passing.
- [ ] AC-16: A book without kept pages exports byte-identical to today's output.

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1, AC-2 | unit | `apps/api/src/services/adt-import/__tests__/kept-root-pages.test.ts` (new) | `AC-1: …`, `AC-2: …` |
| AC-3, AC-4, AC-5 | API | `apps/api/src/services/adt-import/__tests__/kept-root-pages.test.ts` (new) | `AC-3: …` to `AC-5: …` |
| AC-6, AC-7, AC-8, AC-16 | unit | `packages/pipeline/src/__tests__/package-kept-root-pages.test.ts` (new) | `AC-6: …` to `AC-8: …`, `AC-16: …` |
| AC-9, AC-10 | integration | `apps/api/src/services/adt-import/__tests__/reexport.integration.test.ts` (import → export → import) | `AC-9: …`, `AC-10: …` |
| AC-11 | unit | `packages/pipeline/src/__tests__/package-web.test.ts` | `AC-11: …` |
| AC-12, AC-13 | API | `apps/api/src/routes/adt-preview.test.ts` | `AC-12: …`, `AC-13: …` |
| AC-14 | component | `apps/studio/src/components/import/ImportProject/ImportProject.test.tsx` | `AC-14: …` |
| AC-15 | unit | `packages/pipeline/src/__tests__/accessibility-assessment.test.ts` | `AC-15: …` |

Fixture: a small exported ADT with a standalone `credits.html` that links
`images/moe-logo.png` (used by no other page), and an out-of-order activity page that
loads the reader runtime. The live check uses the #1154 workbook.

## Rollout

Three PRs, each revertable on its own:

1. **Storage and export** (AC-3 to AC-11, AC-16): the node, the blobs, the export copy and
   the package checks. Import still blocks, so nothing reaches users; the tests seed the
   node directly.
2. **Import and review** (AC-1, AC-2, AC-14): pages stop blocking and are written by
   import. This is the PR that ships the change to authors.
3. **Preview and the report note** (AC-12, AC-13, AC-15).

Reverting PR 2 restores today's blocking import; books already imported keep their
pages in export until PR 1 is reverted too. No migration: existing books have no
`kept-root-pages` node and export as before (AC-16).

## Open questions

- **Q1 (Elias, product, by 2026-12-02):** the review wording "Kept as-is" and its
  sentence. Default: the text above.
- **Q2 (Eliezir, by 2026-12-02):** run the kept-page copy inside
  `restoreImportedAdtPresentation` or as a separate step on the same hook, given #1051's
  planned changes there. Default: a separate step after presentation restore.
- **Q3 (reviewer, by 2026-12-02):** D4 fails packaging when a generated page takes a kept
  page's name. Alternative: the generated page wins and the export reports the kept page
  as shadowed. Default: fail, as written.
