# Experiment: setup recommender for Add Book (#333)

Not for merge. Compares the current one-shot recommender with a "facts, then rules" approach.

| | Approach |
|---|---|
| `e0-poc` E0 | Victor's adt-poc-llm `poc-v1` at `fd36742`, unchanged: one call picks all six settings |
| `e1-measure` E1 | Measurements from the PDF only (`profile.ts`, `facts.ts`), no LLM, then the rulebook (`rules.ts`) |
| `e2-facts` E2 | Measurements + the LLM answers 4 plain questions about the book, one call each (`questions.ts`), then the rulebook |
| `e3-facts-description` E3 | E2 + a one-line description from the person adding the book (simulated) |
| `e4-one-call` E4 | E2's 4 questions in one call (`variants/one-call.ts`) |
| `e5-page-types` E5 | One call labels every page (small low-detail image + 300 chars): page type, text placement, figure. Facts are counted from the labels with fixed thresholds; front matter does not vote |
| `e6-text-only` E6 | E4 without images: measurements + extracted text (providers without image input) |
| `e7-bagged` E7 | E4 on 3 page slices, majority vote per fact; slices disagree -> flag for the user |
| `e8-genre-first` E8 | The user picks story / textbook / reference first (simulated from the true facts), one call answers the other 3 |
| `e9-describe-{short,vague,rich}` | The user types a description first. A text-only call says which facts the words state (only those are taken as the user's answer), one E4 call answers the rest from the pages |
| `e10-plain-words` E10 | E4 with the questions in plain, positive words a teacher can answer from the paper book; colouring and drawing defined as "not exercises" |
| `e11-page-types-text` E11 | E5 without images: page labels from text + per-page measured numbers (no-image providers, cheap second reading) |
| `x-e4-e5-crosscheck` | Offline only (`simulate.ts`): E5's facts, flagged wherever the same-numbered E4 run disagrees |

Layout:

| Path | What |
|---|---|
| `profile.ts`, `facts.ts` | Measurements from the PDF (mupdf), shared by every variant |
| `rules.ts` | The rulebook: facts → the six settings, each with the rule that fired |
| `variants/` | One file per approach, registered in `variants/index.ts` |
| `datasets/*.json` | Books, their known-good settings, and the one-line descriptions |
| `results/<dataset>/` | One JSON per (book, variant, run), plus `summary.json` and `simulation.json` |
| `simulate.ts` | Offline user-in-the-loop replay: true facts (`facts` in the dataset) stand in for an honest user |
| `reports/research.html` | Visual report; `reports/embed-data.ts` refreshes its data block |

```bash
set -a; . <file with OPENAI_API_KEY>; set +a
T=../../node_modules/.bin/tsx
$T run.ts <pdf-dir> datasets/poc.json results/poc --variants e2-facts --runs 3
./run-e0.sh <poc-repo> <e0-out> 3 && $T import-e0.ts <e0-out> results/poc   # Victor's PoC baseline
$T run.ts <pdf-dir> datasets/poc.json results/poc --variants e4-one-call,e5-page-types --model gpt-5.4 --tag gpt-5.4
$T score.ts datasets/poc.json results/poc
$T simulate.ts datasets/poc.json results/poc
$T reports/embed-data.ts results/poc reports/research.html
```

To add an approach: write `variants/<id>.ts` exporting a `Variant` (see `variants/types.ts`), register it, run it.

## Results, 2026-11-19 (gpt-5.4-mini, 6 PoC PDFs, 3 runs each)

| | Agreement with known-good settings | Same answer in all 3 runs | Tokens in / out per book | Time |
|---|---|---|---|---|
| E0 one-shot | 41/54 (76%) | 27/36 | 8.6k / 0.5k | 9.4 s |
| E1 measurements only | 18/18 (100%, overfit, see below) | 36/36 | 0 | 0.1–0.4 s |
| E2 facts + rules | 48/54 (89%) | 36/36 | 24k / 0.3k | 4.7 s |
| E3 E2 + description | 48/54 (89%) | 36/36 | 24k / 0.3k | 4.7 s |

Per decision (E0 → E2): preset 9/12 → 9/12, render strategy 5/12 → 9/12, page grouping 10/12 → 12/12,
sectioning 11/12 → 12/12, activities 3/3 → 3/3, figure extraction 3/3 → 3/3.

What E0 got wrong or changed between runs:
- Render strategy is the weakest decision: 5/12, and on the research paper it said `llm`, `llm-overlay` and
  `fixed_layout` in three runs.
- El Viaje came back as a textbook in all three runs, and as `spread` in one.
- Colouring My School: `llm-overlay` instead of `fixed_layout`.

What E2 got wrong: all 6 misses are one book. The El Viaje excerpt is the prologue of a novel, so the model
calls it reference material; given only those pages, that answer is defensible. In the real flow the user
corrects that one fact ("It's a story") and every setting follows.

## Results, round 2 (2026-11-19, same set, 3 runs each)

| | Agreement | Stable | Diagnostic books | Input tokens / calls per book | Time |
|---|---|---|---|---|---|
| E4 one call | 48/54 | 36/36 | 15/15 | 6.6k / 1 | 4.7 s |
| E5 label every page | 54/54 | 32/36 | 13/15 | 3.2k / 1 | 3.4 s |
| E6 text only | 45/54 | 34/36 | 15/15 | 1.5k / 1 | 2.7 s |
| E7 3 slices + vote | 48/54 | 36/36 | 15/15 | 9.4k / 3 | 4.0 s |
| E8 user picks kind first | 54/54 | 36/36 | 15/15 | 6.4k / 1 | 4.4 s |
| E4 on gpt-5.4 | 54/54 | 36/36 | 15/15 | 6.6k / 1 | 6.5 s |
| E5 on gpt-5.4 | 54/54 | 36/36 | 15/15 | 3.2k / 1 | 4.3 s |

User-in-the-loop replay (`simulate.ts`, wrong facts the approach flagged):
- Self-reported confidence flagged 0 of the wrong facts from E2 and E4 (all came with "high").
- E7 slice disagreement flagged 6/6 wrong facts, at 1.2 flagged cards per book.
- E4 x E5 disagreement flagged 5/5, at 0.8 flagged cards per book, with no extra call.
- On gpt-5.4, E4 and E5 got 0/72 facts wrong each.
- A teaching chat over the 6 settings always asks 6 questions. With E0's proposals the user would change 0.9
  settings per book, 0.6 of them on settings that need product knowledge (render, sectioning, figures).
- The two irreversible settings (page grouping, figures) were never wrong for any facts-based variant: they
  come from measurements.

Recommendation and charts: `reports/research.html`.

Not changed: `rules.ts`, `facts.ts`. Harness changes: `llm.ts` takes an image `detail`; `questions.ts` exports
`context`; `run.ts` takes `--tag` and passes the dataset's true facts as `userFacts` (E8 only); `score.ts`
reports diagnostic-book agreement apart. E5's counting thresholds were set before its first run. Its wording
(a foreword counts as front matter) was written knowing El Viaje's excerpt is a foreword. The true facts in
`datasets/poc.json` are hand-labelled from the excerpt pages.

## Caveats

- **The rules and thresholds were written while looking at these same 4 labelled books.** E1's 100% is a
  fit to the data, not evidence. A fair score needs books the rules were not tuned on.
- The PoC PDFs are 7–12 page excerpts, not whole books.
- The E3 descriptions were written by us, not by users.
- E3 shows a description given as a hint does not override what the model sees (El Viaje stays
  "reference" even when described as a story). The user's answer has to replace the fact, not inform it.

## Round 3 of variants, developer round 1 (2026-11-19)

E9 describe-first, 1 run per style + a 2nd run for short and vague (60 LLM calls). Descriptions are ours,
written knowing the books (`descriptions` in `datasets/poc.json`).

| Description | Facts the words settle per book | Settings right | Notes |
|---|---|---|---|
| short (dataset line) | 1.4 of 4 | 36/36 | "A short story in Spanish" fixes El Viaje |
| vague ("Kids book.") | 0.4 of 4 | 32/36 | El Viaje stays wrong: pages say reference |
| rich (2 sentences) | 3.3 of 4 | 18/18 | |

Every fact the parser marked "stated" was right (30/30); the parse changed in 2 of 48 cells between runs.

`export-prototype-data.ts` (offline) writes `prototypes/data/` for the designer and `results/poc/flows.json`
(questions per flow, loader time, describe-in-parallel conflicts). Its "facts that matter" are read off
`rules.ts` as it is: a fact matters for a book when another answer would change a setting.

## Developer round 2 (2026-11-19): when to ask, plain words, no-image path

E10 and E11, 6 books x 3 runs (36 LLM calls). `analyze-asking.ts` (offline) replays asking rules on every
pair of saved runs and writes `results/poc/asking.json`.

| | Settings right | Same in 3 runs | Tokens in | Time |
|---|---|---|---|---|
| E4 one call | 48/54 | 36/36 | 6.6k | 4.7 s |
| E10 plain words | 52/54 | 34/36 | 6.6k | 4.4 s |
| E5 page labels | 54/54 | 32/36 | 3.2k | 3.4 s |
| E11 page labels, no images | 54/54 | 32/36 | 1.4k | 2.2 s |

Asking rule "ask a fact only if the other reading's answer would change a setting", E5 proposal, all run pairs:

| Check reading | Questions per book | Pairs where a wrong setting slipped through |
|---|---|---|
| none | 0 | 9/54 |
| E4 (whole book) | 0.39 | 0/54 |
| E10 (whole book, plain) | 0.22 | 0/54 |
| E6 (whole book, no images) | 0.63 | 0/54 |
| E11 (page labels, no images) | 0.44 | 3/54 |
| E5 again (2nd run) | 0.22 | 2/36 |

A check only works when it reads the book a different way (whole book vs page by page). Re-running the same
reading, or a similar one, makes the same mistake twice. No-image path: E11 + E6, 0.67 questions, 0/54 slipped.

## Developer round 3 (2026-11-19): whole books, slow links, one question card

52 LLM calls. New: `variants/e12-whole-book.ts` (E12, E12t, E12j, E13, E14), `analyze-whole.ts`,
`prototype-words.ts`, `datasets/whole.json`, `results/whole/`. `rules.ts` and `facts.ts` unchanged.
Harness: `renderPages` and `llm.ts` can send JPEG; E10 is now built by `makePlainWords` (same behaviour).

| Variant | What |
|---|---|
| `e12-sampled` E12 | E5 on a page sample: first 10–24 pages, 10 from the middle, last 4 (≤ 30 pages: every page, = E5) |
| `e12t-sampled-text` | E12 without images |
| `e12j-sampled-jpeg` | E12 with JPEG instead of PNG (same low detail) |
| `e13-plain-words-middle` E13 | E10 reading 6 pages from the middle of the book (≤ 30 pages: = E10) |
| `e14-middle-lite` E14 | E13 with 512 px JPEG at low detail |

Whole books (`datasets/whole.json`, 2 books outside the PoC set, facts labelled before any run; PDFs are
copyrighted and live outside the repo):

| | Volcanoes, 52-page picture book | Elements of Computing, 427-page textbook |
|---|---|---|
| Measuring the PDF | 3.4 s | 1.8 s |
| E4 / E10 (6 pages from E4's chooser) | "reference" 6/6 runs, high confidence: read pages 2, 3, 4, 5, 27, 51 | right |
| E12 (24 / 38 pages) | right 3/3 (composition wrong in 1) | right 3/3 |
| E13 (6 middle pages) | right 3/3 | right 3/3 |
| Suggested range (E12, 3/3 runs) | keep cover, 8–49 (story starts p8, author pages 50–52) | keep cover, 24–423 (true start p24) |

Settings right: E12 32/33, E13 33/33, E12t 32/33, E4 27/33, E10 27/33, E14 31/33.

Asking rule (changes + cover), whole books, all run pairs (18):

| Proposal / check | Questions per book | Wrong setting slipped through |
|---|---|---|
| E12 / E4 | 1.17 | 0 |
| E12 / E13 | 0.17 | 0 |
| E12 / E12t (no images in the check) | 0.67 | 0 |
| E12 / E14 (small JPEG, low detail) | 0.28 | 2 |

On the PoC set E13 = E10 and E12 = E5, so E5 / E10 applies: 0.67 questions per book with the cover rule, 0/54.
E5 / E14 on the PoC set: 0.72, 0/36.

Upload per book (`results/whole/whole.json`), request body only:

| | Volcanoes PNG | Volcanoes JPEG | Elements PNG | Elements JPEG |
|---|---|---|---|---|
| E12 pages (512 px) | 6.4 MB, 51 s at 1 Mbps | 1.25 MB, 10 s | 2.3 MB, 18 s | 1.5 MB, 12 s |
| E4/E13 pages (1000 px) | 4.3 MB, 35 s | 0.9 MB, 7 s | 1.0 MB, 8 s | 0.6 MB, 5 s |
| E12t (no images) | 9 KB | | 16 KB | |
| E13 pages (1000 px) | 5.3 MB, 42 s | 0.8 MB, 6 s | 1.3 MB, 10 s | 0.8 MB, 7 s |
| Engine A (E12 + E13) | 11.6 MB, 93 s | 2.1 MB, 16 s | 3.5 MB, 28 s | 2.3 MB, 19 s |

Findings:
- **E4's page chooser fails on whole books.** It starts at page 2, so on a picture book it read 4 opening
  pages and the back cover, and said "reference" with high confidence every time. It is the El Viaje failure on
  a real whole book. Reading from the middle (E13) fixed it, and makes the best check: 0.17 questions per book.
- **The check needs normal-detail images for "where are the words".** E14 (low detail) agreed with E12's wrong
  "beside the picture" on Volcanoes, so 2 of 18 pairs let a wrong layout through.
- **Text only can miss raster figures on a locked setting.** E12t said "no diagrams" once on the 427-page
  textbook, whose figures are images, which would switch off Figures (fixed at import). The image check caught it.
- **JPEG instead of PNG cuts the upload of picture books 5x** with the same answers (E12j 22/22; JPEG not
  tested on the E13 check). Text-heavy books gain less (1.5x).
- The suggested range is stable with images: same start and end in 5/5 image runs (E12, E12j) on each book. Without images the textbook start came out as 24, 45 and 8.

`export-prototype-data.ts` takes `[proposal] [check]` and merges `index.json`. Book files gain `status`,
`statusText`, `questions[]` (the card: counted, `default: null`, both guesses named, `useGuess`, `locked`, every
setting that differs between options), `lockedSettings[]`, `range`, `previewPage`, `coverage.strip`,
`measured.*.plain`, and `engine.json` gains `i18n` (en, pt-BR, es; developer translations, unchecked).
Whole-book page images go to `prototypes/data/pages-local/` (git-ignored).

## Review screen: "show the picks, ask only if needed" (2026-11-19)

No LLM calls. `analyze-confirm.ts` replays every saved run pair for a review screen (`results/poc/confirm-policies.json`,
`results/whole/confirm-policies.json`). The honest user answers questions right and edits nothing else (the worst case
for a review screen). Silent error = a setting at Create that differs from the one the true facts give.

| Policy | E5 pick / E4 check (54 pairs): questions per book (max) | Silent errors: pairs, settings (locked) | Wrong picks that matter shown as sure | Whole books E12 / E13 (18 pairs): questions, silent |
|---|---|---|---|---|
| P0 never ask | 0 (0) | 9/54, 18 (0) | 9 | 0, 3/18 |
| P1 guesses differ AND another answer changes a setting | 0.39 (1) | 0 | 0 | 0.67, 0 |
| P2 P1 + only opening pages read | 0.72 (3) | 0 | 0 | 0.67, 0 |
| P3 P2 + always ask maps when it decides Figures | 1.22 (3) | 0 | 0 | 1.67, 0 |
| P4 ask only locked when unsure, highlight the rest | 0.17 (1) | 9/54, 18 (0), all 18 in highlighted rows | 0 | 0, 3/18 (highlighted) |

- P1 already catches every error in the saved runs (also E5/E10: 0.22 q; E4 shown as the pick: 0.39 q). P2's coverage
  rule and P3's maps rule caught nothing extra here; they guard cases this data does not contain (both readings wrong
  the same way on opening pages; a wrong maps answer on a locked setting).
- The only locked silent errors in all replays: text-only page labels (E12t) on the 427-page textbook said "no
  diagrams" (P0: 3/18). P1, P2, P3 and P4 all catch it, because the image check disagrees.
- P4 relies on people reading highlighted rows. Every error it lets through is in one, so its real error rate is
  between P1's (0) and P0's, depending on attention. Measure that with users before choosing it.

Prototypes: `prototypes/confirm-variants.html` (5 variants, `prototypes/v-*/`, source `prototypes/_build/confirm.html`),
notes in `discussion/confirm-variants.md`.
