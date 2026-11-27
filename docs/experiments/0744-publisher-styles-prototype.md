# Finding — Publisher styles, components, and page masters

**Related issue:** [#744](https://github.com/unicef/adt-studio/issues/744).
**Branch:** `elasticsounds/styles-components-prototype` (kept as requested).
**Lane:** experiment; this implementation is for local evaluation, not merging.
**Question:** can publishers control a book through a finite design library and
repeatable page templates instead of independently generated page HTML? Can one
book design accommodate the mixed layouts in the Weather and Climate sample?
**Time box:** 2026-10-02 → 2026-10-03; extended for mixed layouts, the main Storyboard strategy handoff, and publisher-requested learning components.
**Demo:** local Studio, Storyboard → Settings → **Styles**.

## What we tried

The publisher model is **paragraph style → component → page master → content
region assignment → proof**. The Styles tab exposes each layer, its source evidence, and
the CSS/HTML it produces. Changing a shared style changes all assigned instances.

- **Source-derived design:** cluster PDF text runs by semantic role, font family,
  size, weight, italic, color, leading, and alignment. Preserve differing variants
  rather than averaging all paragraphs together. Match semantic leaves to PDF
  runs by ID, exact normalized text, then a contained source line. Report evidence
  counts and source page IDs. Unmatched text receives an explicitly identified
  preset rather than claiming its styling was detected.
- **Components:** discover recurring content structures (figures, passages,
  callouts, etc.) from Sectioning. In source mode, PDF image geometry contributes
  landscape/square/portrait variants and side-by-side image groups. Fills, borders,
  padding, and other treatments start from editable presets. This does **not**
  recover arbitrary vector decoration or discover arbitrary HTML components
  from screenshots.
- **Fieldnotes:** a designed starting point using the bundled Merriweather and
  Atkinson Hyperlegible fonts, warm paper, green typography, and ochre accents.
- **Five page masters:** opener, reading, illustrated, activity, and reference.
  Choose a master from section type and content-tree features; show the reason
  and let the publisher override it. Each master controls margins, gutter, width, paper, and page treatment. A page
  combines full-width, two-column, three-column, left-sidebar, and right-sidebar
  regions. The old page-wide column setting remains available for legacy designs. These are responsive templates, not
  fixed-height print pagination.
- **Mapping:** inspect and override the text-style and object-style binding for
  each source node. The original text, image IDs, hierarchy, and reading order
  remain in the saved design. Pruned content stays excluded.
- **Proofs:** live preview, scaled desktop/mobile viewports, source comparison,
  append-only design history with restoration, and frozen generated storyboards.

The new analyzer and renderer make **zero LLM calls** and add no dependencies.
Existing AI Sectioning can provide semantic input; extraction-only books also work
with explicitly labeled heuristic roles. This separates discovery from composition:
rendering never asks a model to choose fonts or write page HTML.

## Try it

```sh
pnpm typecheck
pnpm exec tsx scripts/seed-publisher-styles-demo.ts
pnpm dev
```

Open the `styles-raven-demo` book, then Storyboard → Settings → Styles. The seed
uses four pages of the repository's real PDF fixture and **curated semantic
groups**, documented in the script. It refuses to overwrite an existing demo.
All extracted files and saved designs live inside the demo's book directory.

1. Choose **Fieldnotes — designed template**, then **Analyze book**.
2. Select page 2. Under **Text**, edit Paragraph size or color; check page 3.
3. Under **Objects**, change the figure's image fit, height, or corner radius.
4. Change a page's **Page master**, or edit its margins/gutter to affect every assigned page.
   Click a **Page regions** diagram to choose a region layout, adjust column
   breaks, split a region before a content group, or merge it with the next one.
5. **Generate Styles proof**, reload, and inspect **Saved Styles proof**.
   To render into the main Storyboard, save the design, click **Use in Storyboard**,
   then **Re-run** on the Overview screen.
6. Switch to **Live design**, save an edit, and use **History** to restore a design.
7. Choose **Learn typography from this PDF** and analyze again to compare actual
   PDF typography and image proportions with the designed preset. Save or discard
   the current draft before analyzing a different starting point.

For a different book, run Extract first. Run Sectioning for better semantic roles,
reading order, component grouping, and image selection. A scanned PDF needs
Sectioning because PDF text-run extraction alone cannot read its text.

## Mixed-layout follow-up: Weather and Climate

The original prototype placed all top-level groups into one page-wide grid. An
illustrated page therefore became two columns even when it contained a heading,
body plus sidebar, wide body text, and a full-width illustration. This was the
wrong unit of layout for a publisher.

A **region** now binds intact content groups to slots in one of five reusable
layout templates. Regions stack vertically. Masters still provide the shared
page design; paragraph and object styles remain independent of region choices.
The region editor exposes both the diagram and its actual content assignments.
Changing a template repartitions groups across columns; column breaks are
editable. Splitting or merging starts with full-width regions so every group has
an explicit home. Mobile stacks slots in their original reading order.

Detection matches accepted semantic groups to PDF text runs and image rectangles.
It finds bands of vertically overlapping objects in separate horizontal columns.
Text line widths are estimated when the extractor only supplies a larger block
bounding box; this is a suggestion, not exact reconstruction. Image coordinates
are measured. Ambiguous groups stay full width. No semantic group is split and
no content is reordered to force a geometric match. Every active top-level group
must appear exactly once, in source order, enforced by the document schema.
Paragraph components also flow their sentence leaves inline, preserving their IDs
and individual text, rather than rendering each extracted sentence as a block.

For the existing weather design, use **Detect mixed layouts**, rather than
rebuilding its style library. This drafts region assignments for all pages while
preserving the current typography, object styles, master choices, and content.
Save/generate appends Styles versions as before. Old designs still open, and frozen
storyboards retain their saved HTML and CSS. The weather book's saved version 3
was not changed during browser verification.

Verified against the local 20-page weather sample:

- Page 4: full-width heading → body/right sidebar → full-width body → figure.
- Pages 3 and 7: chapter heading plus body/question or vocabulary sidebars.
- Page 16: heading and introduction → narrow thermometer beside two stacked figures.
- Page 17: paired instruments → full-width figure and text.
- Page 19: single-column text and illustrations.

Playwright verified the page 4 override, split/merge controls, mobile stacking
(390 px viewport and 390 px content width), and unchanged saved version. All six
sampled pages loaded without JavaScript errors. Screenshots live in `.context/`.
The three-column template and invalid/missing/duplicate/reordered slot assignments
are covered by synthetic geometry tests. Detection remains conservative for text
that wraps around figures and for interleaved semantic groups. Review those pages
and adjust regions; arbitrary print layout reconstruction is outside this experiment.

## Storage and boundaries

The prototype stores book-level snapshots in existing versioned `node_data`:
`publisher-styles-prototype/book` and `publisher-storyboard-prototype/book`.
Restoration appends a version; it does not remove history. Each storyboard freezes
its design, content, HTML, and shared CSS. Subsequent live edits do not alter it.
Image URLs still resolve the book's current image files; image binaries and font
binaries are not separately frozen in a storyboard snapshot.

Saving checks both the design version at the start of editing and a fingerprint of
the extracted/sectioned inputs. Concurrent or stale writes return 409. Generating
saves the design and proof together in a transaction. No production section IDs
are allocated by the analyzer: it uses existing section IDs or, for extraction-only
proofs, the source page ID. The demo's curated sections use the existing ID factory.

The Styles proof stays in **Styles**. The explicit **Publisher styles — mixed
layouts** strategy now also renders the saved design into normal `web-rendering`
versions through the existing Storyboard stage, per-page regeneration, and CLI
render dispatcher. The pipeline graph is unchanged. This remains an opt-in local
experiment, not a production-ready rendering/export contract.
CSS values and references are schema-validated, source text is escaped, and the
preview iframe disables scripts. The frontend accesses this through the API only.

## Main Storyboard handoff follow-up

Publisher feedback exposed a workflow gap: **Generate storyboard** in Styles
saved an isolated proof, while running the main Storyboard with **Two Column
Story** still used its fixed image/text partition. Detecting mixed regions did
not change that strategy. The earlier UI used the same name for two destinations.

- The Styles action is now **Generate Styles proof**. **Use in Storyboard** selects
  **Publisher styles — mixed layouts** and opens Overview, where **Re-run** is
  available. Both Overview and General list the strategy; Template Rendering
  directs the publisher to Styles for editing this design.
- The strategy pins the latest saved design version once per run. It fails clearly
  for missing layouts, missing images, or changed source content, rather than
  falling back to two columns. Section-specific strategy overrides remain honored.
- The adapter emits the normal section identity and leaf IDs, preserves source
  reading order and heading levels, and validates the markup. It carries the
  schema-validated shared Styles CSS with the saved HTML. Styles owns typography
  for this strategy; the Fonts tab's default role scale does not override it.
- Only active section strategies trigger visual-refinement setup. Rendering the
  publisher template does not call a model or the Liquid two-column template.
- A real UI rerun exposed the existing queue hook's destructive history clearing.
  That hook now validates and preserves node history for this explicit strategy;
  downstream run statuses are reset, and rendered pages append versions. The first
  weather verification run encountered the old hook before this guard was added.
  Generic rerun policy outside the experiment is not changed here.

The weather book was switched from `two_column_story` to `publisher_styles` and
all 20 pages rendered using saved Styles design version 6. The Styles design was
not modified. Main Storyboard page 4 was checked in the browser: its full-width
heading, body/sidebar region, wide paragraph and illustration all survived. Images
loaded and no JavaScript errors occurred. The main viewer’s mobile preview
stacked the regions without horizontal overflow (375 px viewport/content). A
second UI rerun after the history guard retained versions 1 and 2 on all 20 pages. Screenshot: `.context/weather-main-storyboard.png`.

Regression coverage includes the real stage runner and single-section regenerate,
the queue's before-run hook, preserved previous render versions, source-change
rejection before deletion, and explicit assertions that neither the model nor the
two-column Liquid engine is called. Exported readers, arbitrary interactive
activities, and automatic staleness when editing a Styles design remain for a
production spec. Save in Styles and re-run Storyboard to apply later changes.

## Learning design follow-up: coloured headers and reading cards

The publisher asked for the weather book’s full-colour headers and sidebar boxes
as a consistent, friendly design language. This remains the same experiment on
2026-10-03: the new **Learning design** panel applies an explicit draft preset to
the current book, preserving its source content, text bindings, and layout regions.
It does not re-analyze or overwrite the publisher’s saved design.

- **Shared book accent:** a weather-inspired green starting point, editable in
  Styles. Chapter bands, cards, and linked heading styles follow that accent.
  Atkinson Hyperlegible, generous line spacing, rounded boxes and restrained tints
  provide the new preset’s reading design. Original font/shape recovery is not
  claimed; these are designed treatments mapped to the source semantic groups.
- **Finite component library:** chapter banners, section headings, question cards,
  vocabulary cards, think-about cards, and a generic learning card. Matching uses
  existing heading roles and sidebar structures; the English weather labels help
  distinguish card purposes, with a generic card fallback for other labels.
- **Editable treatments:** Objects exposes plain, soft-card, outlined-card, and
  accent-banner treatments; solid/tinted/no header; header size; padding, gap and
  corners; and book-linked versus custom background/accent colours. The existing
  first heading supplies the header text, including a nested heading group. No
  text or decorative labels are invented. Sidebar landmarks reference the actual
  heading’s DOM ID; source leaf IDs and order remain unchanged.
- **Contrast:** treatment text colours are calculated from the actual opaque
  background, including light accents and custom fills. They target at least
  [4.5:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
  Linked headings fall back to readable ink if the accent is too light against
  the page. Cards also retain headings and borders in forced-colour mode.
- **Responsive composition:** boxes have no fixed height or clipped overflow.
  Regions now expose sidebar width. Optional text wrapping uses a float only when
  the sidebar already comes first in source reading order; the schema rejects
  wrapping that would require reordering. Other regions retain grid columns.
  Both stack on narrow screens. Arbitrary print-style paragraph wrapping is still
  outside the prototype.

All new schema fields are optional for old designs. Applying the learning preset
is a validated, draft-only API operation with source-freshness checks. Save,
restore, frozen Styles proofs and normal Storyboard all use the existing versioned
paths. The implementation remains deterministic and adds no dependencies or AI
calls. Shared colours/CSS are generated in the pipeline, not the frontend.

The existing weather design version **9** was used as the starting point. The UI
saved **version 10** and a new Styles proof, then regenerated all **20** main
Storyboard pages. Design versions 1–10, earlier frozen proofs, and render versions
1–4 on every page remain available. Page 4 uses a 40% sidebar; page 7 demonstrates
the optional wrap flow. Other page-region assignments remain intact.

Verification for this follow-up:

- The 138-test suite below plus `publisher-theme.test.ts`: **142 tests passed**.
  New coverage checks finite shared treatments, direct/nested header mapping,
  exact content and reading order in the normal Storyboard adapter, contrast for
  seven light/dark/midtone accents and custom fills, draft-only API behavior,
  stale-source rejection, invalid colours, and safe wrap assignments.
- Browser checks on all 20 frozen proofs found no text-contrast failures or
  horizontal overflow at 1040 px and **320 px**. At 320 px, doubled text sizes
  with increased line, letter and word spacing also stayed within the viewport.
  These checks support [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
  evaluation; they are not a full accessibility audit.
- Main Storyboard pages 3, 4 and 7 displayed design 10, loaded all illustrations,
  retained coloured boxes, and produced no JavaScript errors. Screenshots:
  `.context/weather-learning-pg003.png`, `weather-learning-pg004.png`, and
  `weather-learning-pg007.png`.
- Styles controls were checked for shared edits across pages, custom fills and
  header sizes, book-accent propagation, and discarding a draft without changing
  the saved version.
- Typecheck, Studio lint and production build passed. All five locales are
  translated. Existing unused-suppression and build chunk-size warnings remain.

The earlier proofing limits still apply: image descriptions and table semantics
need editorial review; this is not an export or accessible-publication acceptance
run. Changes to Styles still require saving and rerunning the main Storyboard.

## What we learned

On the four-page demo, source mode found **4 paragraph styles and 3 component
styles**; Fieldnotes reduced that to **2 paragraph styles and 3 component styles**.
Both shared **5 available masters**. A local one-shot measurement after module load
took **6 ms analysis / 1 ms rendering** in source mode and **1 ms / 1 ms** in
Fieldnotes mode. These are small-fixture observations, not a large-book benchmark.

The useful interaction is editing the library while viewing an actual assigned
page. A style list alone does not explain where an edit will apply; usage counts,
source evidence, per-node assignments, and immutable proofs make that inspectable.

### Verification

- `pnpm typecheck` — passed.
- `pnpm exec vitest run packages/pipeline/src/__tests__/publisher-layout.test.ts packages/pipeline/src/__tests__/publisher-styles.test.ts packages/pipeline/src/__tests__/web-rendering.test.ts apps/api/src/services/publisher-storyboard.test.ts apps/api/src/routes/publisher-styles.test.ts apps/api/src/services/page-edit-service.test.ts apps/api/src/services/stage-runner.test.ts apps/api/src/routes/stages.test.ts 'apps/studio/src/routes/books.$label.$step.settings.test.tsx' apps/studio/src/lib/render-strategy.test.ts`
  — **138 tests passed**. Covers source clustering, geometry variants, deterministic
  output, mixed regions, reading-order preservation, complete slot assignment,
  legacy designs, text/ID preservation, escaping, unsafe CSS, extraction-only content,
  actual PDF extraction, versioning, restore, stale/concurrent writes, frozen
  proofs, opt-in strategy dispatch, real stage and per-page generation, and queue
  history preservation. Styles proof generation itself leaves the main rendering
  node untouched.
- `pnpm lint` — passed with 8 pre-existing unused-suppression warnings.
- Lingui extraction/compilation — all five locales translated.
- `pnpm --filter @adt/studio build` — passed; existing large-chunk warnings remain.
- Playwright against local Studio — verified source analysis, live typography,
  an image-component edit affecting multiple pages, page-master reassignment,
  generate/reload, restore, stale edit rejection, loaded images, source comparison,
  and mobile width with no horizontal overflow. No page JavaScript errors.
- `git diff --check` — passed. `pnpm lint:invariants` is not implemented in this
  checkout; the existing type, lint, and relevant test checks were used instead.

### Not verified / limits

- No desktop installer, release build acceptance run, full repository test suite,
  export acceptance testing, or independent publisher/human review.
- Classification is a rule-based suggestion, not learned visual page taxonomy.
  Text wrapping around figures inside a paragraph, tables, mathematical content,
  inline emphasis, RTL typography,
  print pagination, and interactive activity behavior need a separate design.
- Extraction-only input can contain decorative/background composite images;
  Sectioning is the intended source of accepted illustrations and semantic groups.
- Original PDF font names may need matching installed/attached fonts; the browser
  otherwise falls back. Original source fonts are not reconstructed from glyphs.
- Proofing notes flag image descriptions, tables, rich text, and static activities.
  This prototype does not claim those proofs are ready to publish.

## Recommendation

- [x] Write a production spec after publisher evaluation; allocate its number
  through the normal spec process rather than reserving one for this experiment.
- [ ] Archive.
- [x] Extend the experiment — mixed-layout follow-up completed on 2026-10-03.

The next spec should decide: visual discovery versus semantic/geometry inference;
component slot contracts and style inheritance; overflow and pagination policy;
per-page overrides; ownership relative to Fonts; and adoption into the normal
versioned rendering/export pipeline. If AI discovery is added, it should propose
schema-validated library entries and bindings through the existing cached, logged
LLM port, while template rendering remains deterministic.
