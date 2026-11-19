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
