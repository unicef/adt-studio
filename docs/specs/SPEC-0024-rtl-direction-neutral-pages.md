---
id: SPEC-0024
title: Right-to-left books — direction-neutral page generation
status: in-review # draft | in-review | approved | in-progress | implemented | verified | superseded
owner: "@elasticsounds" # exactly one human owner
approvers: [] # ≥1 maintainer; + product sign-off when user-facing scope changes
issues: ["#1115"]
prs: ["#1118", "#1119", "#1120", "#1130"]
adr: ""
created: 2026-11-12
updated: 2026-11-14
---

## Problem (with evidence)

A book in a right-to-left language (Urdu, Arabic, Hebrew, Persian, Pashto, …) is laid
out right to left since #1114: the reader, the Storyboard preview and the review
screenshots put `dir="rtl"` on the document root, and the reader flips it when the
reader switches language.

A book has **one** page layout. A translation does not create new pages: the reader
swaps the translated words into the same HTML by `data-id`. So one page has to work in
every language the book has — and the page HTML is written by a model that is never
told the direction. Three measurements, each in a browser on every section:

**1. Urdu book read in Urdu** (*GK-2*, 20 pages, 28 sections, `openai:gpt-5.4`).
Direction held everywhere. The model improvised everything else:

| Markup the model chose | Sections (of 28) |
|---|---|
| its own `dir="rtl"` | 18 |
| `text-right` | 22 |
| `text-left` | 6 |
| `flex-row-reverse` | 5 |

- Urdu headings and paragraphs sit against the left edge on five sections (pages 4, 6,
  10, 11, 17). The source pages are right-aligned or centred.
- The same pages rendered twice handled direction differently in 15 of 28 sections.
- Of 126 visual reviews, 70 mention right-to-left. The reviewer corrected a picture on
  the wrong side on page 10, and approved page 6 with its text left-aligned.

**2. The same Urdu book read in English.** The page direction switches correctly, and
only 122 of 315 text blocks read left to right: the rest keep the `dir="rtl"` the model
wrote into the page, and 185 sit against the right edge.

**3. English book read in Urdu** (*English Grade 2*, 20 pages, 34 sections, 745 text
blocks; four pages translated by hand, alignment measured on all). 137 text blocks stay
against the left edge, in 14 of 34 sections: the model wrote `text-left` on 12 of the
20 pages.

**4. First run with this design** (*GK-2-2*, the same book rendered from scratch on
2026-11-13 with the packaging rewrite, the prompt block and the generation rewrite; 20
sections, `openai:gpt-5.4`). The block reached all 79 render and review calls, and the
model wrote no `dir`, `text-left` or `text-right`. In a browser: no Urdu block against
the left edge, and in English all 302 text blocks read left to right. Four things were
still wrong, and are in scope since:

- **The contents table is mirrored.** The original has, from the right: serial number,
  title, page number. It was saved, and so rendered, page number first. Sectioning
  saves the order a page is read in and its prompts say "left-to-right"
  (`prompts/page_sectioning.liquid:157,169`). On 8 pages the model tried another order
  while rendering and validation put the saved one back. The first run had the same
  mirrored table.
- **The contents page is centred** (53 uses of `text-center`); the original is aligned
  to the start. The block listed `text-center` first among the allowed alternatives.
- **Floated boxes do not follow the text.** All four (pages 7, 8, 9, 15) were written
  `float-right … ms-8`, copied from the left-to-right example in the render prompt
  (`prompts/web_generation_html.liquid:55`). The box stays on the right in English, and
  in both languages its gap is on the outer side, so the wrapped text touches it.
- **Preview has no style for the rewritten classes.** The Studio preview stylesheet is
  built from the stored HTML, and the packaging rewrite introduces classes that are not
  in it (`text-end`, five times on one page of *GK-2*).

**Why:**

- No prompt carries the direction. The generation context has no language or direction
  field (`packages/pipeline/src/render-llm.ts:64-81`), and none of the prompts that
  write or review page HTML mention it.
- Prompt rules assume left to right: the table-of-contents rules require the title
  "on the left" and the page number "flush right" on a shared "right edge"
  (`prompts/web_generation_html.liquid:15,21,22`,
  `prompts/web_generation_html_overlay.liquid:19,23`, `prompts/visual_review.liquid:25`),
  and the deterministic TOC repair adds `text-right` (`packages/pipeline/src/toc-layout.ts:29`).
- Nothing normalises it. `validateWebRendering` (`render-llm.ts:242`) enforces
  structure, ids, reading order and typography, and has no rule about direction or
  alignment.

## Goals

A **book with a right-to-left language** is one whose source language *or any
translation* is written right to left.

- **G1** Its pages make no direction or left/right alignment decision of their own, so
  the one layout reads correctly in each of the book's languages.
- **G2** That holds for pages that already exist, with no model call and no change to
  how they look in the language they were written in.
- **G3** That holds for newly generated pages as they are stored, so the Storyboard
  shows what the reader shows.
- **G4** The model is told when the page it sections, writes or reviews is
  right-to-left, and the saved reading order of such a page starts at the right.
- **G5** None of this can fail a page or cost a retry.
- **G6** A book with no right-to-left language is untouched: same rendered prompts,
  same cache keys, same generated and packaged HTML.

## Non-goals

- **A language switch in the Storyboard.** Today the translated page is visible only in
  Preview. A read-only Storyboard preview has been prototyped and works; it is a new
  feature and gets its own proposal.
- **Reading order already saved.** Sectioning is told the direction for new runs
  (D7). Pages sectioned before keep their saved order until sectioning is run again.
- **Text accuracy.** On *GK-2* page 10, 3 of 7 text blocks do not match the scan (the
  PDF has no text layer). That is a transcription problem.
- **Spacing and side utilities.** Margins, padding and borders (`ml-`, `pr-`,
  `border-l`) are guided by the prompt but not rewritten: the Storyboard's spacing
  controls only understand the physical forms. The one exception is a floated box,
  whose float and side margin are rewritten together (D2).
- **Layout mirroring.** Which side a picture sits on stays a judgement for the
  reviewer; no rule about `flex-row-reverse`. Nothing reviews the mirrored page in a
  translation's direction.
- **Edits by people.** Manual Storyboard edits and user-directed AI edits are not
  rewritten as they are saved: someone may left-align a block on purpose. They are
  still converted, exactly, when the page is packaged. The alignment control already
  understands `text-start` / `text-end`
  (`apps/studio/.../style-editor/class-maps/typography.ts:120`).
- **Existing right-to-left pages that are wrong.** The packaging rewrite preserves how
  a page looks in its own language. The left-aligned Urdu blocks in a book rendered
  before this change stay until those pages are rendered again or fixed by hand.
- **Per-page direction.** The page is rendered in the direction of the book's source
  language.
- **Exports, fonts, reader interface strings.** EPUB direction, a Nastaliq typeface and
  the incomplete Urdu interface catalogue are separate work.

## Proposed design

### Options

| | What | Rough cost | Verdict |
|---|---|---|---|
| A | Tell the prompts only | 1 partial, 6 include lines, ~40 lines of plumbing | Not enough: the model already knew the Urdu page was right-to-left (it wrote `dir="rtl"` itself in 18 sections) and still left-aligned text |
| B | A, plus a validator rule that rejects the page so the model retries | A + ~150 lines | Every rejection is a model call, and a model that keeps violating the rule fails the page. It could not be run against a model before it was needed |
| **C** | **A, plus a deterministic rewrite: at generation for new pages, at packaging for existing ones** | **A + ~300 lines, 1 new module** | **Chosen.** Same result as a model that obeys the rule, and it cannot fail a page |

### Design

- **D1 — the gate.** `resolvePageDirection(sourceLanguage, outputLanguages)`
  (`packages/pipeline/src/language-context.ts`) returns the direction the book's pages
  are rendered in when any of its languages is right-to-left by `getTextDirection()`
  (`@adt/types`, the lookup the reader uses), and `undefined` otherwise. `undefined`
  switches everything below off.
- **D2 — the rewrite.** `neutralizeDirectionMarkup(html, pageDirection)`
  (`packages/pipeline/src/direction-neutral-html.ts`):
  - `text-left` / `text-right` become `text-start` / `text-end`, mapped for the
    direction the page was written in, keeping any variant prefix (`md:text-left`);
  - a `<th>` with no alignment class of its own that was inheriting left or right gets
    the logical class itself. A table header centres itself unless an ancestor sets
    alignment explicitly, and `start` does not count as explicit;
  - a `dir` that only repeats the direction the element already inherits is removed. A
    `dir` that changes the direction is kept;
  - `float-left` / `float-right`, and the `clear-left` / `clear-right` that go with
    them, become `float-start` / `float-end` and `clear-start` / `clear-end`, mapped
    the same way, so a box the text wraps around changes side with the text. The side
    margin on the floated element (`ml-8`, `max-lg:mr-0`) becomes `ms-` / `me-` with
    it; no other element's margin is touched. A float keeps the side it was given
    whatever script is inside it.

  It patches opening tags only; the rest of the page stays byte-identical, and applying
  it twice changes nothing.
- **D3 — existing pages: at packaging.** `renderPageHtml()`
  (`packages/pipeline/src/packaging/web.ts`) applies D2 as the page is packaged or
  previewed. Stored pages are not touched, so nothing is migrated and nothing can be
  lost. The Studio preview stylesheet (`generateTailwindCss()`,
  `apps/api/src/routes/adt-preview.ts`) is built from the stored HTML and from its
  rewritten form, and its cache is keyed on the page direction: the rewrite introduces
  classes the stored HTML does not contain, and adding a right-to-left language changes
  what is served without changing any stored node.
- **D4 — new pages: at generation.** `validateWebRendering()` applies D2 to HTML that
  has passed validation, so the stored page is neutral. The review loop re-validates
  revised HTML with the same function (`render-llm.ts:152`), so reviewer corrections
  are covered. Here, and only here, it also corrects three things in a right-to-left
  page instead of preserving them:
  - right-to-left text the model pushed to the left is aligned to the start;
  - a table-of-contents page number, which the TOC repair right-aligns for a
    left-to-right row, is aligned to the end of its cell;
  - a floated box whose only side margin is on its outer side gets that gap on the
    text side.
- **D5 — the prompts.** One shared partial, `prompts/_text_direction.liquid`, included
  by the seventeen prompts that write or review page HTML: the twelve render prompts
  through `_render_fidelity`, and `visual_review`, `visual_review_flexible`,
  `visual_review_edit`, `html_edit`, `html_edit_verify` directly. It says the page is
  already rendered right-to-left, which side the first child of a row sits on, how to
  read "left" and "right" in the existing instructions (including the table of
  contents), and that the page must not set `dir` or left/right alignment. It asks for
  the alignment of the original page image, with no class for text that starts at the
  right and `text-center` only for text that is centred there, and it names the float
  classes and the side their gap goes on. It renders only when the page direction is
  `rtl`. A left-to-right book with a right-to-left
  translation is made neutral by D3 and D4, not by the model, so adding a translation
  does not change its prompts.
- **D6 — caching.** The cache key hashes the rendered system and user messages
  (`packages/llm/src/cache.ts:56`). The partial renders nothing unless the page is
  right-to-left, so every other prompt and its cache key are unchanged.
- **D7 — sectioning.** A second partial, `prompts/_reading_direction.liquid`, included
  by `page_sectioning` and `page_sectioning_refinement`. It says reading starts at the
  right: of side-by-side blocks or columns the rightmost comes first, the first
  `table_cell` of a row is the rightmost, and a contents entry has its title towards
  the right and its page number at the left edge. It is about the order of blocks,
  never the text inside one. `sectionPage()` receives the direction as
  `pageDirection` from the same gate, and the partial renders only for `rtl`, as in D5
  and D6. Sectioning has no deterministic repair: the saved order cannot be checked
  against the page without a model.

### Decisions to ratify

1. The gate for the rewrite is "any of the book's languages is right-to-left", not "the
   source language is".
2. Option C: rewrite, never reject.
3. D4's three corrections change how a newly generated right-to-left page looks. They
   are not applied to pages that already exist.
4. The prompts are told only when the page itself is right-to-left.
5. Manual and user-directed AI edits are not rewritten when saved.
6. Sectioning is told the direction with no repair behind it (D7). A right-to-left book
   sectioned before this change keeps its saved order until sectioning is run again.
7. Floats use the logical values (`float: inline-start`), not a second class per
   direction: the `ltr:` / `rtl:` variants sort after the responsive ones in the
   generated stylesheet and would override `max-lg:float-none`. The logical values need
   Chrome 118, Safari 15 or Firefox 55; an older browser shows the box unfloated, and
   only in a book with a right-to-left language.

## Impact map

- **Files:**
  - `packages/pipeline/src/direction-neutral-html.ts` (new), `language-context.ts`,
    `packaging/web.ts`, `render-llm.ts`, `web-rendering.ts`, `page-sectioning.ts`,
    `pipeline-dag.ts`
  - `prompts/_text_direction.liquid` (new), `_render_fidelity.liquid`, and the five
    review and edit prompts
  - `prompts/_reading_direction.liquid` (new), `page_sectioning.liquid`,
    `page_sectioning_refinement.liquid`
  - `apps/api/src/routes/adt-preview.ts`, `services/stage-runner.ts`,
    `services/page-edit-service.ts`
- **Invariants:** prompt output contract (this spec). No entity, identifier, staleness
  or layer change: the packaging rewrite is not stored, and the generation rewrite is
  part of producing the version that is stored.
- **Freshness:** the prompt fingerprints that feed freshness signatures cover Easy
  Read, translation and speech preparation (`packages/pipeline/src/output-catalog.ts:121,140,166`),
  not sectioning or Storyboard rendering. Nothing is marked out of date; a right-to-left
  book picks the new prompts up the next time those steps are run.
- **Migration:** none.
- **Collides with:**
  - **#964** (GPT-6.1 Sol prompt rewrite) edits the same prompt files. Whichever lands
    second re-adds the include lines.
  - **#887 / SPEC-0011** (prompt persistence): a book with its own copy of a prompt
    does not pick up the include. Documented, not solved here.
  - **#1114** must merge first: it provides `getTextDirection` and
    `resolveBookLanguage`.

## Acceptance criteria

- [ ] AC-1: For a page that is not right-to-left, each of the seventeen prompts renders
      byte-identical to its output without the block.
- [ ] AC-2: For a right-to-left page, each of the seventeen prompts carries the block
      once, in the system message, and nothing else changes.
- [ ] AC-3: The gate is off for a book with no right-to-left language, and otherwise
      returns the source language's direction.
- [ ] AC-4: The rewrite maps `text-left`/`text-right` to `text-start`/`text-end` for a
      left-to-right page and the mirror for a right-to-left page, keeping variant
      prefixes.
- [ ] AC-5: A `<th>` that was inheriting left or right gets the logical class itself;
      one whose nearest explicit alignment is neither is not touched.
- [ ] AC-6: A `dir` that repeats the inherited direction is removed; one that changes
      it, and what is nested inside it, is kept.
- [ ] AC-7: The rewrite changes opening tags only, leaves a page with nothing to
      rewrite byte-identical, and is unchanged when applied twice.
- [ ] AC-8: Packaging rewrites the page for a book with a right-to-left language and
      leaves every other book's page byte-identical.
- [ ] AC-9: A newly generated page is stored rewritten for a book with a right-to-left
      language, and exactly as the model wrote it for every other book.
- [ ] AC-10: At generation, in a right-to-left page, right-to-left text aligned left is
      started, a block wholly in a left-to-right script is kept at the end, a
      table-of-contents page number is aligned to the end, a class re-added by a
      repair step is not duplicated, and a floated box whose only side margin is on its
      outer side gets it on the text side.
- [ ] AC-11: The prompts receive the page direction from the book's languages.
- [x] AC-12 (measured through the real packager, on scratch copies): *English Grade 2*
      with an Urdu translation is pixel-identical in English on 34 of 34 pages, with
      text blocks against the left edge in Urdu 137 → 0. *GK-2* with an English
      translation is pixel-identical in Urdu on 32 of 32 pages, with text blocks reading
      left to right in English 122 of 315 → 315 of 315.
- [x] AC-13 (acceptance run by the owner, 2026-11-13, before D7 and the float rules):
      *GK-2-2* rendered from scratch shows, on all 20 sections, no Urdu text against the
      left edge and no `dir` written by the model; in English all 302 text blocks read
      left to right.
- [ ] AC-14: The rewrite maps `float-left`/`float-right` and `clear-left`/`clear-right`
      to their logical forms for the direction the page was written in, moves the side
      margin of the floated element with it and no other margin, and is unchanged when
      applied twice.
- [ ] AC-15: The Studio preview stylesheet has rules for the classes the rewrite
      introduces, and is rebuilt when a book gains a right-to-left language.
- [ ] AC-16: For a page that is not right-to-left, the two sectioning prompts render
      byte-identical to their output without the reading-direction block; for a
      right-to-left page each carries it once, in the system message.
- [ ] AC-17: The sectioning prompts receive the page direction from the book's
      languages.
- [ ] AC-18 (acceptance re-run, needs a provider key): *GK-2-2* sectioned and rendered
      from scratch has its contents table in the order of the original (serial number
      at the right), contents titles aligned to the start, and each floated box on the
      mirrored side in English with its gap on the text side.

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | unit | `packages/pipeline/src/__tests__/text-direction-prompts.test.ts` | `AC-1: <prompt> renders unchanged for a book that is not right-to-left` |
| AC-2 | unit | same | `AC-2: <prompt> carries the block once, in the system message, for a right-to-left book` |
| AC-3 | unit | `packages/pipeline/src/__tests__/direction-neutral-html.test.ts` | `AC-3: …` (2 tests) |
| AC-4 | unit | same | `AC-4: …` (2 tests) |
| AC-5 | unit | same | `AC-5: …` (2 tests) |
| AC-6 | unit | same | `AC-6: …` (2 tests) |
| AC-7 | unit | same | `AC-7: …` (3 tests) |
| AC-8 | unit | `packages/pipeline/src/__tests__/package-web.test.ts` | `AC-8: …` (3 tests) |
| AC-9 | unit | `packages/pipeline/src/__tests__/web-rendering.test.ts` | `AC-9: …` (3 tests) |
| AC-10 | unit | `packages/pipeline/src/__tests__/direction-neutral-html.test.ts` | `AC-10: …` (6 tests) |
| AC-11 | unit | `packages/pipeline/src/__tests__/web-rendering.test.ts` | `AC-11: …` |
| AC-12 | measured | recorded in the implementation PRs | two-book browser audit |
| AC-13 | acceptance | recorded in the implementation PRs | *GK-2-2* from-scratch audit |
| AC-14 | unit | `packages/pipeline/src/__tests__/direction-neutral-html.test.ts` | `AC-14: …` (4 tests) |
| AC-15 | unit | `apps/api/src/routes/adt-preview.test.ts` | `AC-15: the preview stylesheet covers the classes the direction-neutral rewrite introduces` |
| AC-16 | unit | `packages/pipeline/src/__tests__/text-direction-prompts.test.ts` | `AC-16: <prompt> …` (2 tests per prompt) |
| AC-17 | unit | `packages/pipeline/src/__tests__/page-sectioning.test.ts` | `AC-17: …` |
| AC-18 | acceptance | recorded in the implementation PRs | *GK-2-2* from-scratch re-run |

## Rollout

Four stacked, independently revertable PRs on top of #1114:

1. **Packaging rewrite** (D1, D2, D3): no prompt change, no model call. Ships value
   alone for books that already exist.
2. **Prompts** (D5, D6). Reverting removes the include lines.
3. **Generation rewrite** (D4). Reverting removes one call.
4. **Sectioning** (D7). Reverting removes two include lines.

No flag: every part is inert for a book with no right-to-left language.

## Open questions

- **OQ-1 — does telling the model help?** Answered by the AC-13 run: yes. With the
  block, the model wrote no `dir`, `text-left` or `text-right` in 79 calls; without it,
  it wrote its own `dir` in 18 of 28 sections and `text-left` in 6. Kept.
- **OQ-2 — sectioning.** Answered by the same run: the contents table was saved in
  left-to-right order in both runs. Included as D7.
- **OQ-3 — do the reworded block and D7 hold?** Unmeasured: neither the reworded
  alignment and float guidance nor the sectioning block has been run against a model.
  AC-18 answers it. Default: keep both; the D4 float correction covers the float gap
  either way, and nothing covers a wrong reading order. Owner: @elasticsounds, decide
  from the AC-18 run.
