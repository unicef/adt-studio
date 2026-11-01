# Finding — composed activity pages (#765)

**Status:** runnable experiment; do not merge as production implementation.
**Branch:** `elasticsounds/multi-page-activities-support` (workspace branch retained).
**Time box:** October 24–November 7, 2026; initial checks October 24.
**Question:** can independently generated activity sections share a reader page
with either page-wide or section-scoped submission?

The owner explicitly requested an experiment branch PR to try this behavior. The
draft PR distributes the experiment; it is not an approved spec implementation or
a request to merge. Its cross-package scope allows end-to-end evaluation.

## Try it

Open **Sectioning → Settings → Section Types → Experimental activity pages**:

- **Off:** existing one-section-per-output-page behavior.
- **Group sections — check whole page:** show sections together and check all
  supported activities with one button.
- **Group sections — check one section at a time:** outline the active activity
  and check it individually. Next section focuses the next unfinished activity;
  Next advances to the following page after every activity is complete.

When only this setting changes, choose **Save** to try existing sections without
generation. Reopen Preview or rebuild the export. New mixed-activity pages need
Sectioning and Storyboard to detect/render their separate activities. Reading an
existing single-section page never silently re-sections it.

Generate two synthetic demo books without any LLM calls:

```sh
pnpm install
pnpm build
pnpm exec tsx scripts/create-activity-pages-demo.ts
BOOKS_DIR="$PWD/.context/activity-pages-books" pnpm dev
```

Use the Studio URL printed by the dev server. Each demo contains a passage,
multiple choice, two fill-in-the-blank activities that reuse local item names,
a written response, and a following reading page. Answers: **Sun**, **sun**,
**moon**, and a meaningful sentence. Try a wrong answer before correcting it.
Text/native choices restore on return; completion is checked again. The script
refuses to overwrite an existing demo; pass a fresh books directory as its argument
to generate another copy.

Equivalent book configuration:

```yaml
generate_activities: true
page_sectioning:
  mode: page # dynamic also works
  experimental_activity_pages: page # off | page | section
```

## What we tried

- Reuse Dynamic semantic activity detection when enabled, including in By Page.
  Default generation remains unchanged.
- Group adjacent rendered sections from one source PDF page at preview/export
  time. Section entities, IDs, HTML, history, and reading-order input are retained.
  No composition entity or migration is introduced in this spike.
- Use the first section ID for group navigation; keep all section URLs addressable.
  Exported TOC links point to section anchors within the group.
- Give classic activity instances local roots, submission state, and answer maps.
  Namespace presentation IDs/radio groups while retaining authored text IDs and
  local answer keys. Keep language/configuration shared.
- Let a page coordinator own submission and navigation. Graders retain their rules;
  written responses count as accepted/completed rather than factually correct.
  Batch checking suppresses competing activity toasts and sounds.
- Wait for async validation, block repeated submission, discard stale results after
  edits/language changes/disposal, and require a new check after editing a completed
  response. The last page has a Page complete state.
- Compose fragments vertically, providing a first primitive for future block editing.

## Boundaries

- Automatic grouping only within one source page. No manual grouping/reorder UI,
  arbitrary block editor, cross-source-page composition, or viewport fitting.
  Long pages scroll.
- Supported classic mechanics: multiple choice, multi-select, true/false,
  fill-in-the-blank/table, written response, matching, sorting, ordering, underline.
  Custom/scripted activities, fragments containing style/script elements, enabled
  editable steppers, and fixed layouts retain their separate-page path.
- Scoped mode leaves surrounding content visible. It focuses the current section;
  it does not reveal just one screen at a time.
- Existing reader navigation remains available. This controls the submission flow,
  not access restrictions on the book.
- Text/native choice responses restore. Persisting drag/drop/ordering attempts and
  a general attempt/version migration contract remain specification work. No new
  grading engine or combined score is introduced.
- Source identities remain intact, but output grouping uses a derived first-section
  owner. Production needs stable output-page identity and explicit composition
  history/rollback semantics.
- Per-section sign-language/annotation targeting, read-aloud focus across sections,
  SCORM completion semantics, translated layouts, and external EPUB/WebPub reader
  behavior need further acceptance work. Grouped output does not reproduce the
  PDF's full-page visual arrangement.

## Findings and verification

The existing graders can be reused with scoped roots, state, and answers. A Submit
button change alone would not initialize repeated activity types or isolate their
state. Shared grouping/composition helpers keep preview and web packaging aligned.

Integration checks caught the standalone activity entry's required first import
and preview Tailwind's need to scan the derived shell. Both are handled. A plain
Save action makes it possible to compare grouping modes without generation.

- `pnpm build`, `pnpm typecheck`, runtime typecheck: passed.
- `pnpm lint`: passed with eight existing unused-suppression warnings.
- Studio Lingui extraction: all five catalogs translated, zero missing entries.
- Affected Vitest run: **40 files / 534 tests passed**.
- Browser checks on both synthetic modes: wrong-answer recovery, asynchronous
  written responses, next-page and back navigation, text/choice restoration, and
  no browser page errors.
- Packaged ADT browser check: mixed submission and next-page navigation passed
  without page errors.
- Running Studio: save/reload of Off and page grouping changes the preview manifest
  from six to two pages without submitting a generation run.

Affected test command:

```sh
pnpm exec vitest run apps/adt-runtime/src \
  packages/pipeline/src/__tests__/page-sectioning.test.ts \
  packages/pipeline/src/__tests__/page-sectioning-prompt.test.ts \
  packages/pipeline/src/__tests__/package-web.test.ts \
  packages/pipeline/src/__tests__/experimental-activity-pages.test.ts \
  apps/api/src/routes/adt-preview.test.ts --maxWorkers 2
```

Not verified: full monorepo suite, real provider-generated books, desktop
installers, external EPUB/WebPub hosts, or the production acceptance set.
Synthetic checks are feasibility evidence, not release verification.

## Recommendation

- [x] Write a reviewed specification after product feedback.
- [ ] Archive.
- [ ] Extend with an explicit scope and time box.

Use [#765](https://github.com/unicef/adt-studio/issues/765) for the mixed-activity
contract and coordinate mode semantics with
[SPEC-0003 / #884](https://github.com/unicef/adt-studio/pull/884). Keep nested activity
detection (#767) and full block authoring separately scoped. Turning the flag off
returns existing sections to separate output pages while retaining saved content.
