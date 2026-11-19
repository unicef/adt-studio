# Experiment: setup recommender for Add Book (#333)

Not for merge. Compares the current one-shot recommender with a "facts, then rules" approach.

| | Approach |
|---|---|
| `e0-poc` E0 | Victor's adt-poc-llm `poc-v1` at `fd36742`, unchanged: one call picks all six settings |
| `e1-measure` E1 | Measurements from the PDF only (`profile.ts`, `facts.ts`), no LLM, then the rulebook (`rules.ts`) |
| `e2-facts` E2 | Measurements + the LLM answers 4 plain questions about the book, one call each (`questions.ts`), then the rulebook |
| `e3-facts-description` E3 | E2 + a one-line description from the person adding the book (simulated) |

Layout:

| Path | What |
|---|---|
| `profile.ts`, `facts.ts` | Measurements from the PDF (mupdf), shared by every variant |
| `rules.ts` | The rulebook: facts → the six settings, each with the rule that fired |
| `variants/` | One file per approach, registered in `variants/index.ts` |
| `datasets/*.json` | Books, their known-good settings, and the one-line descriptions |
| `results/<dataset>/` | One JSON per (book, variant, run), plus `summary.json` |

```bash
set -a; . <file with OPENAI_API_KEY>; set +a
T=../../node_modules/.bin/tsx
$T run.ts <pdf-dir> datasets/poc.json results/poc --variants e2-facts --runs 3
./run-e0.sh <poc-repo> <e0-out> 3 && $T import-e0.ts <e0-out> results/poc   # Victor's PoC baseline
$T score.ts datasets/poc.json results/poc
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

## Caveats

- **The rules and thresholds were written while looking at these same 4 labelled books.** E1's 100% is a
  fit to the data, not evidence. A fair score needs books the rules were not tuned on.
- The PoC PDFs are 7–12 page excerpts, not whole books.
- The E3 descriptions were written by us, not by users.
- E3 shows a description given as a hint does not override what the model sees (El Viaje stays
  "reference" even when described as a story). The user's answer has to replace the fact, not inform it.
