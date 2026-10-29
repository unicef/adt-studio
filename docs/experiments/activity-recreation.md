# Finding — PDF activity recreation prototype (untracked, `exp/untracked-activity-recreation`)

**Question:** Can the pipeline turn activities already present in a source PDF into editable, accessible digital activities without generating new quiz questions?
**Time box:** 2026-10-22 → 2026-11-05 (14 days). **Demo:** local Studio prototype.

## What we tried

Replace the legacy book-level quiz generation path with a pipeline step that finds
sections classified as activities, then converts their rendered representation and
answer key into the existing structured activity format used by the packaged runtime.

The prototype deliberately uses the existing PDF extraction, page-sectioning,
activity rendering, structured activity schemas, and stepper runtime. It does not
add a second interaction format or manufacture assessment questions from adjacent
book pages.

## What we learned (with numbers where we have them)

- The existing activity renderer already has the source content, layout intent,
  and answer key produced from PDF sectioning. A separate question-generation
  pass is unnecessary for this path.
- The structured runtime currently supports 5 of the 10 configured activity
  section types: fill in the blank, multiple choice, true/false, open ended,
  and underline text. Tables, matching, multi-select, sorting, and ordering
  remain in the storyboard renderer and are reported as skipped.
- The prototype creates a new versioned `editable-activity` entity only when
  that section has no existing conversion. Existing editor data is preserved.
- On 2026-10-23, a read-only inspection of the local `Matematik--3` book found
  seven semantic sections and seven rendered sections, all classified as
  ordinary text/images or `other`. Its saved recreation report contained
  `found: 0, recreated: 0`. Converting only pre-classified activities cannot
  digitize these exercises. The screen also had no results browser.

## Revised local prototype (2026-10-23)

The Activities screen now offers a source-page selector and PDF image preview.
The author can select **Auto-identify** (the default) or **Manual input**.
Auto-identify asks the existing agent to identify exercises from the selected
page's extracted source text even when sectioning did not classify them as
activities. Optional author instructions narrow the selection or supply missing
details. The identified exercises are grouped into one interactive section,
preserving exercise boundaries, numbering and subquestions. The prompt asks the
agent to avoid already digitized exercises and to report insufficient evidence
or no exercises without writing a section; these are model instructions, not
deterministic guarantees. Manual input requires an exercise number, description,
or original text. Switching modes preserves the input; changing source pages
clears it to prevent applying another page's instructions.
The existing activity agent receives a faithful-digitization request: retain
the source language, wording, numbers and subquestions; do not invent a quiz
or guess missing content. The existing versioned create tools append an
interactive section. Results appear in a book-wide activity list with a working
reader preview and a link to the page editor. No new API or storage format is
introduced. Standard and custom interactive activities use their existing
runtime; a stepper conversion is not required to play them.

The agent reads extracted text and rendered page content, **not the PDF image**.
The image shown in Studio is for author reference. Diagram-dependent or
missing source content needs details supplied by the author; visual ingestion
and automatic whole-book exercise detection remain follow-up work. The
existing agent tools require a rendered, reflowable page. The form blocks
unrendered and fixed-layout pages with guidance to render in Storyboard;
fixed-layout digitization remains follow-up work.

The batch step now records its lifecycle, rejects an explicitly requested empty
conversion with an actionable error (skips it in a multi-stage run), skips pruned sections, and refuses to replace invalid existing
editor data. Batch conversion remains a separate prototype path; the CLI DAG
still implements legacy quiz generation. Permanent stage identities and
CLI/API parity must be settled in the follow-up spec.

Verification: TypeScript check, Studio production build and 85 focused activity
workflow/storage/tool/stage-runner tests pass. The automatic/manual mode addition
also passes seven focused UI tests covering an empty auto input, optional author
guidance, required manual text, page/mode switching and existing failure/preview
paths. These use a mocked AI request, so automatic identification quality is
not established by them. All five locale catalogs are
complete. Studio lint reports no errors (existing unused-suppression warnings).
Live AI generation, source fidelity and release-build acceptance on a PDF
corpus have not been verified. This experiment is not a release-ready spec
implementation.

## Updated Activities choices (2026-10-24)

The screen now separates four author intents. **From PDF** retains the source
exercise recreation flow above and is the default. Four **presets** create new
questions from the selected page in a chosen format: multiple choice, fill in
the blanks, true/false, or written answer. The API validates the selected
template type, exposes only the templated write tool, and restricts that tool
to the exact renderer type. **Experimental** creates a new activity from page
context and lets the agent choose a templated or custom interaction.
**Prompt written** requires the author's own request for what to create and
how it should work, with the selected page available as context.

The form now shows short option names. Each question-mark button opens a
description and a small outlined illustration of the interaction; the
instructional paragraphs were removed. Existing activity previews and editor
links remain available. Source selection still requires a rendered,
reflowable page. A preset constrains the output format, but the question and
answer content still come from an LLM and require author review.

Verification: TypeScript check, 11 focused Activities UI tests, templated
tool restriction test, Studio lint and Lingui extraction pass; all four
translated catalogs have zero missing strings. Live generation on a PDF
acceptance set, preset answer quality, and release-build behavior remain
unverified. The revised choices remain part of this experiment rather than
an approved shipping contract.

## Activity options revision (2026-10-25)

The four options are now **Replicate**, **Presets**, **AI suggestion** and
**Custom prompt**. Replicate asks for a one-to-one copy of the printed exercise
that only adds interaction (drag and drop, input, textarea, checkbox, drawable
areas). Presets remain the template-restricted, safest AI path. AI suggestion is
the former Experimental option, and Custom prompt the former Prompt written.
All AI-created paths now instruct the agent to reuse the page's own wording and
figures and to add no extra introductions, hints or additional questions.
Activities in the results list can be deleted after confirmation, through the
existing versioned section deletion API.

Verification: 22 Activities UI tests (including delete and cancel), Studio
typecheck and eslint on the Quizzes folder pass; all four translated catalogs
have zero missing strings. Whether Replicate keeps the printed figure intact
(rather than rebuilding it as a reflowable section) is not established; live
generation was not run.

## False duplicate detection (2026-10-25)

A replication attempt on `pg009` failed because the agent treated input-like
controls in the existing page rendering as proof that the source exercises
were already digitized. The `getPage` and `getSection` tools now explicitly
mark saved interactive sections using their `activity_*` section type, and
both the system and request prompts prohibit treating ordinary rendered HTML
or its appearance as proof of digitization. Replication is requested for source
exercises without a matching marked activity section.

Verification: 24 focused Activities UI and agent-tool tests pass, as does
`pnpm typecheck`; live generation on `pg009` was not rerun.

## Studio-only solution reveal (2026-10-25)

Activity cards now have a **Show solution** control. It reads the saved
answer key from the page rendering and displays it alongside the embedded
Studio preview; open-ended items are identified as having no single correct
answer, and activities without a saved key say so explicitly. This reveal is
part of Studio only and does not add a solution control to the packaged learner
activity.

Verification: 18 focused Activities UI tests, `pnpm typecheck`, and `pnpm lint`
pass (lint has 8 pre-existing unused-disable warnings). Lingui extraction
reports zero missing translations across all locales.

## Visual template selection (2026-10-29)

The current local Activities workspace opens **Create activity**. Its shared
generation dialog starts with **Activity style**, which controls the options below:

- **Let AI choose the layout:** recreate an exercise **From the book** or
  **Suggest an activity**, with editable instructions and an explanation that AI
  selects the activity format and layout.
- **Use a standard layout:** all ten standard activity formats appear as illustrated
  template cards alongside a larger **Layout preview**. A template must be selected
  before generation.
- **Create a custom layout:** a prompt field for the content, layout and interaction,
  without template cards or a speculative preview.

Each path retains its own prompt and selection when switching styles. The requesting
author specified layout-only previews, so these examples contain no interactive
exercise controls. Selecting a card updates the preview and editable instructions;
only **Generate** submits the existing generation request. The footer names the
destination page and explains that the resulting activity can be reviewed and edited.

Examples are illustrative, not rendered predictions of the chosen book page.
The dialog explicitly says that generated content and appearance may differ.
Source recreation keeps the source-preservation request and uses automatic layout selection.
The change reuses the existing API, modes and inclusive-design request, and adds
no package dependency. All introduced Studio text is translated into all five locales.

This continues the existing local prototype within its November 5 time box.
It does not imply spec approval or readiness to merge; promotion follows the
spec and independent review requirements recorded in
[the inclusive-activities proposal](../analysis/INCLUSIVE_ACTIVITIES.md#coordination-lane-and-review).

Verification: 22 focused activity UI tests pass across three files. `pnpm typecheck`,
`pnpm --filter @adt/studio compile --strict`, Studio's production build and
`pnpm lint` pass (eight existing unused-suppression warnings; the build retains its
chunk-size warning). Headless Chromium checks keyboard style selection, the
mode-specific options, static previews, retained drafts, no generation during
browsing, and explicit submission with the active mode. All three style paths
have zero violations in the scoped axe WCAG 2 A/AA and 2.1 AA checks.
Desktop and 320-pixel layouts were inspected; all three paths in all five locales
have no horizontal dialog overflow. These browser checks use the real
dialog with a stubbed submit callback. Live AI generation, exact output fidelity,
screen-reader walkthroughs and packaged Electron/release acceptance were not run.

## Recommendation

- [x] write SPEC-NNNN
- [ ] archive
- [ ] extend time box by <days> because <reason>

The follow-up spec should define the permanent `activity-recreation` step
identity, the source-to-activity provenance contract, review handling for
unsupported or low-confidence exercises, support for the remaining five
activity types, and an acceptance corpus of representative PDFs.
