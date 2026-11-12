---
id: SPEC-0024
title: Right-to-left books — direction-neutral page generation
status: draft # draft | in-review | approved | in-progress | implemented | verified | superseded
owner: "@elasticsounds" # exactly one human owner
approvers: [] # ≥1 maintainer; + product sign-off when user-facing scope changes
issues: ["#1115"]
prs: [] # filled in as implementation lands
adr: ""
created: 2026-11-12
updated: 2026-11-12
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
25 of 28 sections still show English reading right to left or sitting on the right,
because of the `dir="rtl"` and `text-right` the model wrote into the page.

**3. English book read in Urdu** (*English Grade 2*, 20 pages, 34 sections, 745 text
blocks; four pages translated by hand, alignment measured on all). 137 text blocks stay
against the left edge, in 14 of 34 sections: the model wrote `text-left` on 12 of the
20 pages.

**Why:**

- No prompt carries the direction. The generation context has no language or direction
  field (`packages/pipeline/src/render-llm.ts:64-81`), and none of the 19 prompts that
  write or review page HTML mention it.
- Prompt rules assume left to right: the table-of-contents rules require the title
  "on the left" and the page number "flush right" on a shared "right edge"
  (`prompts/web_generation_html.liquid:15,21,22`,
  `prompts/web_generation_html_overlay.liquid:19,23`, `prompts/visual_review.liquid:25`),
  and the deterministic TOC repair adds `text-right` (`packages/pipeline/src/toc-layout.ts:29`).
- Nothing checks it. `validateWebRendering` (`render-llm.ts:242`) enforces structure,
  ids, reading order and typography, and has no rule about direction or alignment.

## Goals

A **book with a right-to-left language** is one whose source language *or any
translation* is written right to left.

- **G1** For such a book, every prompt that writes or reviews page HTML is told so, and
  told which direction the page is rendered in.
- **G2** Its generated HTML makes no direction or left/right alignment decision of its
  own, so the one layout reads correctly in each of the book's languages.
- **G3** A deterministic check rejects a violation, so the model retries instead of the
  defect reaching the Storyboard.
- **G4** Pages that already exist can be made direction-neutral without a model call
  and without changing how they look in the language they were written in.
- **G5** A book with no right-to-left language is untouched: same rendered prompts,
  same cache keys, same generated HTML.

## Non-goals

- **A language switch in the Storyboard.** Today the translated page is visible only in
  Preview. A read-only Storyboard preview has been prototyped and works; it is a new
  feature and gets its own proposal.
- **Text accuracy.** On *GK-2* page 10, 3 of 7 text blocks do not match the scan (the
  PDF has no text layer). That is a transcription problem.
- **Spacing and side utilities.** Margins, padding, borders and floats (`ml-`, `pr-`,
  `border-l`, `float-right`) are guided by the prompt but neither checked nor
  converted. The Storyboard's spacing controls only understand the physical forms.
- **Layout mirroring.** Which side a picture sits on stays a judgement for the
  reviewer; no rule about `flex-row-reverse`. Nothing reviews the mirrored page in a
  translation's direction.
- **Edits by people.** Manual Storyboard edits and user-directed AI edits are not
  checked: someone may left-align a block on purpose. The alignment control already
  understands `text-start` / `text-end`
  (`apps/studio/.../style-editor/class-maps/typography.ts:120`).
- **Per-page direction.** The page is rendered in the direction of the book's source
  language.
- **Exports, fonts, reader interface strings.** EPUB direction, a Nastaliq typeface and
  the incomplete Urdu interface catalogue are separate work.

## Proposed design

### Options

| | What | Rough cost | Verdict |
|---|---|---|---|
| A | Tell the prompts only | 1 partial, 19 one-line includes, ~40 lines of plumbing | Not enough: the model already knew the Urdu page was right-to-left (it wrote `dir="rtl"` itself in 18 sections) and still left-aligned text |
| B | Rewrite the HTML after every generation | ~80 lines, 2 files | Reliable but silent, and cannot tell a deliberate left-to-right block from a mistake |
| **C** | **A, plus a validator rule that rejects and retries, plus a one-off conversion for pages that already exist** | **A + ~250 lines, 2 new files, ~5 touched** | **Chosen.** New pages use the existing reject-and-retry path, visible in the LLM log; old pages are converted once, as new versions |

### Design

- **D1 — the gate.** The rule is on when `getTextDirection()` (`@adt/types`, the lookup
  the reader uses) is `rtl` for the book's source language or for any of its output
  languages. The page's own render direction is the source language's. Both reach the
  prompts and the validator on the render input
  (`packages/pipeline/src/web-rendering.ts:95`) and the sectioning config.
- **D2 — one shared partial.** `prompts/_text_direction.liquid`, included by the 19
  prompts below. It renders nothing when the gate is off.
  - Generation: `web_generation_html`, `web_generation_html_overlay`, the ten
    `activity_*` prompts (not their `_answers` companions, which write no HTML)
  - Review and edit: `visual_review`, `visual_review_flexible`, `visual_review_edit`,
    `html_edit`, `html_edit_verify`
  - Sectioning: `page_sectioning`, `page_sectioning_refinement` (context only)
- **D3 — what the partial says.**
  - Which direction this page is rendered in, and that the same page is also read in
    the other direction, mirrored.
  - In a right-to-left page the first child of a row sits on the right.
  - Do not set `dir`, and do not align text left or right. Leave alignment unset, or
    use `text-center`, `text-justify`, `text-start`, `text-end`.
  - A block wholly in a script of the other direction (an English line in an Urdu
    page) may carry the matching `dir`.
  - Prefer logical spacing (`ms-`, `me-`, `ps-`, `pe-`).
  - Reviewers: reject text sitting against the far edge unless the source page shows
    it there.
- **D4 — the check.** `validateTextDirection(html, pageDirection)` in a new
  `packages/pipeline/src/validate-text-direction.ts`, called from `validateWebRendering`
  beside the typography check (`render-llm.ts:292`). The review loop already
  re-validates revised HTML with `validateWebRendering` (`render-llm.ts:152`), so
  reviewer corrections are covered. With the gate on it reports:
  - **R1** any `dir` attribute, except one that marks an element whose text is wholly
    in a script of the direction opposite to the page;
  - **R2** any `text-left` or `text-right` utility, with or without a variant prefix
    (`md:text-left`).

  With the gate off it reports nothing.
- **D5 — table of contents.** With the gate on, the TOC rules in the two generation
  prompts and the review prompt say "start" and "end" instead of "left" and "right",
  and the TOC repair uses `text-end` instead of `text-right`.
- **D6 — caching.** The cache key hashes the rendered system and user messages
  (`packages/llm/src/cache.ts:56`). The partial renders nothing with the gate off, so
  those prompts and their cache keys do not change.
- **D7 — converting pages that already exist.** A deterministic rewrite, saved as new
  page versions, for a book whose gate turns on after its pages were rendered (a
  right-to-left translation is added) or that was rendered before this change:
  - for a page written left to right, `text-left` → `text-start` and `text-right` →
    `text-end`, keeping any variant prefix; the mirror mapping for a page written right
    to left, whose own `dir="rtl"` is removed;
  - a `<th>` with no alignment class of its own that was inheriting left or right gets
    the logical class itself. A table header centres itself unless an ancestor sets
    alignment explicitly, and `start` does not count as explicit.

  Measured on *English Grade 2*: 74 classes on 14 pages and 2 header cells converted;
  all 34 pages pixel-identical in English before and after; text blocks against the
  left edge in the Urdu view 137 → 0. Without the header rule, one English page
  changed.

  The conversion preserves how a page looks in its own language. It does not repair a
  mistake: the left-aligned Urdu blocks in *GK-2* stay where they are until those pages
  are rendered again.

### Decisions to ratify

1. The gate is "any of the book's languages is right-to-left", not "the source language
   is".
2. Option C: reject-and-retry for new pages, a one-off conversion for old ones.
3. R2 bans `text-right` as well as `text-left`: one way of writing it keeps runs
   repeatable.
4. A block in the other direction's script is marked with `dir`, the only `dir`
   allowed.
5. Sectioning prompts are told the direction, with no check on the order they return.
6. Manual and user-directed AI edits are exempt from the check.

## Impact map

- **Files (expected):**
  - `prompts/_text_direction.liquid` (new) and one include line in 19 prompts; TOC
    wording in three of them
  - `packages/pipeline/src/validate-text-direction.ts` and
    `packages/pipeline/src/neutral-alignment.ts` (new), `render-llm.ts`,
    `web-rendering.ts`, `toc-layout.ts`, `page-sectioning.ts`, `pipeline-dag.ts`
  - `apps/api/src/services/stage-runner.ts`, `page-edit-service.ts`, one route and one
    Studio control for the conversion
- **Invariants:** prompt output contract (this spec). The conversion writes new
  `web-rendering` versions and never overwrites one. No identifier or layer change.
- **Freshness:** the prompt fingerprints that feed freshness signatures cover Easy
  Read, translation and speech preparation (`packages/pipeline/src/output-catalog.ts:121,140,166`),
  not Storyboard rendering. Whether a converted page marks downstream outputs "needs
  update" is to be confirmed in implementation: its text is unchanged.
- **Migration:** none automatic.
- **Collides with:**
  - **#964** (GPT-6.1 Sol prompt rewrite) edits the same prompt files. Whichever lands
    second re-adds the include line.
  - **#887 / SPEC-0011** (prompt persistence): a book with its own copy of a prompt
    does not pick up the include. Documented, not solved here.
  - **#1114** must merge first: it provides `getTextDirection` and
    `resolveBookLanguage`.

## Acceptance criteria

- [ ] AC-1: With the gate off, each of the 19 prompts renders byte-identical to its
      output before this change.
- [ ] AC-2: With the gate on, each of the 19 prompts' rendered text contains the
      direction block, stating the page's render direction.
- [ ] AC-3: The gate is on for a right-to-left source language, and for a left-to-right
      source language with a right-to-left output language; it is off otherwise.
- [ ] AC-4: With the gate on, the check rejects a `dir` attribute that matches the page
      direction, and one on an element containing letters of the page's own script; it
      accepts one on an element wholly in the other direction's script.
- [ ] AC-5: With the gate on, the check rejects `text-left` and `text-right`, including
      variant-prefixed forms, and accepts `text-center`, `text-justify`, `text-start`,
      `text-end` and no alignment class.
- [ ] AC-6: With the gate off, the check reports nothing for any of the inputs in AC-4
      and AC-5.
- [ ] AC-7: A render that violates the check is retried with the error text fed back,
      and the step succeeds when the retry complies.
- [ ] AC-8: HTML revised by the visual reviewer goes through the same check.
- [ ] AC-9: With the gate on, the TOC repair emits no `text-left` or `text-right`; with
      it off, its output is unchanged.
- [ ] AC-10: The conversion maps `text-left`/`text-right` to `text-start`/`text-end`
      for a left-to-right page (and the mirror for a right-to-left page), keeps variant
      prefixes, removes a right-to-left page's own `dir="rtl"`, and gives an inheriting
      `<th>` the class itself.
- [ ] AC-11: The conversion saves a new page version and leaves the previous one
      restorable.
- [ ] AC-12 (acceptance run): *English Grade 2* converted shows all 34 pages
      pixel-identical in English, and no text block against the left edge in Urdu.
- [ ] AC-13 (acceptance run, needs a provider key): *GK-2* rendered twice from scratch
      shows, on all 28 sections in both runs, no Urdu text against the left edge, no
      `dir` on content elements, and no English text reading right to left in the
      English view. Record how many sections needed a retry.

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | unit | `packages/pipeline/src/__tests__/text-direction-prompts.test.ts` | `AC-1: prompts render unchanged with the gate off` |
| AC-2 | unit | same | `AC-2: prompts carry the direction block with the gate on` |
| AC-3 | unit | `packages/pipeline/src/__tests__/validate-text-direction.test.ts` | `AC-3: the gate follows the book's languages` |
| AC-4 | unit | same | `AC-4: dir attributes` |
| AC-5 | unit | same | `AC-5: left and right alignment utilities` |
| AC-6 | unit | same | `AC-6: nothing is checked with the gate off` |
| AC-7 | unit | `packages/pipeline/src/__tests__/render-llm.test.ts` | `AC-7: a direction violation is retried` |
| AC-8 | unit | `packages/pipeline/src/__tests__/visual-review.test.ts` | `AC-8: reviewer revisions are checked` |
| AC-9 | unit | `packages/pipeline/src/__tests__/toc-layout.test.ts` | `AC-9: TOC repair follows the gate` |
| AC-10 | unit | `packages/pipeline/src/__tests__/neutral-alignment.test.ts` | `AC-10: alignment conversion` |
| AC-11 | API | `apps/api/src/routes/pages.test.ts` | `AC-11: conversion saves a new version` |
| AC-12 | acceptance | recorded in `docs/verification/` | *English Grade 2* conversion audit |
| AC-13 | acceptance | recorded in `docs/verification/` | *GK-2* two-run audit |

AC-1 needs the pre-change rendered prompts as fixtures, captured from `develop` before
the first prompt edit.

## Rollout

Three independently revertable PRs, after #1114 merges:

1. **Convert existing pages** (D7): no prompt or validator change, no model call. Ships
   value alone for books that already exist.
2. **Tell the prompts** (D1, D2, D3, D5 wording, D6). Reverting removes the include
   lines.
3. **The check** (D4, D5 repair). Reverting removes one call.

No flag: every part is inert for a book with no right-to-left language.

## Open questions

- **OQ-1 — retry cost.** Each rejection is one more model call. Default: accept it. If
  AC-13 shows more than a quarter of sections needing two or more retries, fall back to
  rewriting R2 violations after generation, for alignment only. Owner: @elasticsounds,
  decide from the AC-13 numbers.
- **OQ-2 — sectioning.** Telling the sectioning prompts changes reading order for new
  right-to-left runs, on one observed case (*GK-2* page 10: a picture on the left
  ordered before the text on its right). Default: include them. Owner: @elasticsounds,
  by 2026-11-17.
- **OQ-3 — user-directed AI edits.** Told the direction but not checked. Default: keep
  exempt. Owner: @elasticsounds, by 2026-11-17.
- **OQ-4 — how the conversion is started.** Default: an explicit action offered when a
  right-to-left language is added to a book that already has pages; never automatic.
  Owner: @elasticsounds, by 2026-11-17.
