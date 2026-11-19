# Round 1 — developer

## What I did
- New variant **E9 describe-first** (`variants/e9-describe-first.ts`): the user types a line, a text-only call says which facts the words *state*, *imply* or leave *unknown* (with the quote). Only "stated" facts are taken as the user's answer; one call reads the pages for the rest. Ran 3 description styles (short / vague / rich). 60 LLM calls.
- **Data for the designer** (`export-prototype-data.ts`, no LLM): `prototypes/data/<book>.json`, `engine.json`, `index.json`, page thumbnails in `prototypes/data/pages/`.
- **Flow costs** in `results/poc/flows.json`: questions per flow, loader time, describe-in-parallel conflicts.

## What I learned
1. **Most books need only 1–3 questions.** A fact only matters if another answer would change a setting. Research paper: 1 (kind of book). Workbook: 2. Storybooks: 3. Never 4, never 6.
   - "Kind of book" changes 4 settings. Exercises change 2. Text/pictures changes 1 (layout). Diagrams change 1 (figures), and only when the PDF measurement didn't already find them.
2. **Show only flags that matter.** Out of 6 flagged facts, 2 mattered. The workbook's 2 flags (layout, diagrams) change nothing. If we flag only facts that matter, we get 2 flags total, both on the hard books (El Viaje, Egypt).
3. **Describe-first saves fewer questions than hoped.**

   | How the user describes the book | Facts settled per book |
   |---|---|
   | 1 sentence | 1.4 |
   | "Kids book." | 0.4 |
   | 2 rich sentences | 3.3 |

   Every fact the words stated was right (30/30). The parse changed in 2 of 48 cells between runs.
4. **Describe in parallel, don't wait.** Read the pages while the user types. Their stated facts replace the AI's. Where the two differ, ask: "You said story, the pages look like a foreword." That conflict showed up exactly on El Viaje and Egypt, and the user was right in 4 of 4. Running both at once instead of one after the other saves about 1.5 s.
5. **Loader timing (median / slowest).**

   | Step | Median | Slowest |
   |---|---|---|
   | Measuring the PDF | 0.2 s | 0.5 s |
   | E5 page labels | 3.4 s | 4.7 s |
   | E4 one call | 4.4 s | 8.3 s |
   | Old one-shot | 7.6 s | 18.5 s |

   So the loader can show the two settings fixed at import (spreads, scanned) almost at once, then fill in the AI facts after about 4 s.
6. A teaching chat over the **settings** asks 6 questions. A chat over the **facts that matter** asks 1–3, and each answer can say what it changes (`whatIf` in each book file).

## Caveats
Tiny set, excerpts, our own descriptions. The "proposal" in the book files uses E5 run 1, which happened to be all right. E5 changes answers between runs (32/36 stable), so the cross-check flag is what protects us, not E5 alone.

## Open questions for the other roles
- **Designer:** each book file has `facts.*.teachingQuestion` (yes/no), `whatIf` (what changes if they say no), `questionOrder`, `flag`, `citedPages` + thumbnails, a one-line `summary`, and `settings.*.rule`. Should the flow ask only `questionOrder`, or show every fact and highlight the flagged ones?
- **Product:** I'd argue against a chat that walks through all 6 settings. It's 6 questions where 1–3 do the job, and render/sectioning need product knowledge. If the goal is teaching, teach on the facts.
- **Both:** Do we accept that the free-text box is optional? The words settle little unless the user writes 2 sentences.

## Next round, if wanted
- Whole books (not excerpts), to test page picking and latency at 100+ pages.
- A held-out set of books the rules never saw.
- Wording of yes/no questions tested on real users.
