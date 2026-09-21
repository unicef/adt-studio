# Spec: Crossword cells collapsed into a single leaf during page-sectioning

## Problem

Page-sectioning sometimes collapses a crossword's individual letter cells into a single `activity_fill_in_the_blank` leaf containing the whole word, instead of emitting one leaf per cell.

When this happens, the downstream activity-rendering LLM cannot satisfy validation: the visual layout has N cells, but the source content tree has only one `data-id` to attach. Splitting that `data-id` across multiple cells produces "Text mismatch" errors (each cell's text doesn't match the full word) and "Text node outside any data-id element" errors (bare letters in styled cells).

## Observed example

Two near-identical crossword pages from the same book, processed in the same run, produced different extractions:

**pg015 (correct extraction — one leaf per cell):**
```
activity_fill_in_the_blank id=pg015_n0007 "R"
activity_fill_in_the_blank id=pg015_n0008 "E"
activity_fill_in_the_blank id=pg015_n0009 "C"
activity_fill_in_the_blank id=pg015_n0010 "E"
activity_fill_in_the_blank id=pg015_n0011 "T"
activity_fill_in_the_blank id=pg015_n0012 "A"
```

**pg016 (collapsed extraction — bug):**
```
activity_fill_in_the_blank id=pg016_n0004 "R E C E T A S"
```

Both pages visually show the same shape: a row of seven boxes, one letter per box, prefilled (or to be filled) with the letters of "RECETAS".

## Where it happens

The page-sectioning step (`packages/pipeline/src/page-sectioning.ts` and the `page_sectioning` LLM prompt) decides how to break page content into nodes. The bug is in the prompt or the post-processing logic that lets it merge consecutive single-character cells into one node when their visual layout reads left-to-right as a word.

## What "fixed" looks like

For any visually grid-arranged set of single-character or `__`-style cells (crossword grids, letter-by-letter answer rows, "complete the word" boxes, fill-the-syllable strips, etc.), each cell must be emitted as its own leaf node:

- One letter per leaf when a letter is shown.
- One blank-placeholder leaf per cell when the cell is empty (text `"_"` or `"__"`).
- The natural reading order across cells determines node ordering.

Fix should NOT regress the case where a single answer line truly is one input — e.g., `"Nombre: ___"` stays a single `activity_fill_in_the_blank` leaf because there's just one writable area, not a grid.

## Acceptance criteria

1. Re-running page-sectioning on a book containing a crossword produces one leaf per cell (matches the pg015 shape, not the pg016 shape).
2. The activity-rendering step then passes validation for that page (no "Text mismatch" or "Text node outside any data-id element" errors on cells).
3. Existing single-input cases (e.g., `"Nombre: ___"`) remain a single leaf.
4. Add a regression test: a fixture page-sectioning input that visually shows a 7-cell crossword row should round-trip to 7 leaves, not 1.

## Suggested approach

Two paths, ranked by intrusiveness:

1. **Prompt-only fix.** Add explicit guidance to the `page_sectioning` prompt: "When a row or column of visually distinct boxes/cells each contains (or is meant to contain) a single character or short fragment, emit one leaf per cell, not one merged leaf for the row." Include a small example. Cheapest if it works.

2. **Post-processing detector.** If prompt guidance is unreliable, add a deterministic check in `page-sectioning.ts` that splits a leaf whose text matches the pattern `^[A-Za-zÀ-ÿ](\s+[A-Za-zÀ-ÿ])+$` (single letters separated by spaces) into one leaf per letter, preserving role and parent. Belt-and-suspenders if the LLM keeps merging them.

Start with #1, fall back to #2 if a follow-up run still shows collapsed cells.

## Related context

The downstream FITB renderer already has guidance for both shapes (per-letter leaves AND single-leaf row strings) in `prompts/activity_fill_in_the_blank.liquid` section 1c. That guidance is a partial workaround for the collapsed case but cannot produce a correct visual rendering when the source has a single leaf — fix must happen upstream in sectioning.
