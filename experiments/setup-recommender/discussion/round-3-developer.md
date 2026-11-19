# Round 3 · developer

## What I did
- **Whole books.** I ran two whole books the rules were never written against: a 52-page picture book (Volcanoes) and a 427-page university textbook (Elements of Computing). I labelled their facts before the first run (`datasets/whole.json`). The PDFs are copyrighted, so they stay outside the repo and their page images are git-ignored.
- **New readings** (`variants/e12-whole-book.ts`):
  - E12 labels a sample of pages: the first 10–24, 10 from the middle and the last 4. On books of 30 pages or fewer it labels every page, the same as E5.
  - E13 reads 6 pages from the middle of the book. On short books it is the same as E10.
  - E12t has no images, E12j sends JPEG, and E14 sends small low-detail images.
- **One question card in the data.** Every book file now has `status`, `questions[]`, `lockedSettings[]`, `range`, `previewPage`, `coverage.strip` and plain wording for the measured facts. `engine.json` has every string in en, pt-BR and es.
- I used 52 of the 70 LLM calls. `rules.ts` and `facts.ts` are unchanged, and the old fields in the data files did not change.

## The three engines, side by side
| Engine (screen it feeds) | AI wait | Upload, picture book on 1 Mbps | Questions per book (PoC / whole) | Wrong settings let through |
|---|---|---|---|---|
| **A. Page labels + middle check** (Check then ask; Teach me) | 4 s / 7 s | 93 s as PNG, **16 s as JPEG** | 0.67 / 0.17 | 0/54 / 0/18 |
| **B. Same, no images** (providers without images) | 2–5 s | under 1 s | 1.0 / not tested | 0/54 / not tested with a text-only check |
| **C. Tell us while we read** (A + 1 text call) | the user types while A runs | as A | your answers replace questions | stated facts 30/30 right (our own descriptions) |

Measuring the PDF takes 0.2 s on the excerpts and 1.8–3.4 s on the whole books, so the locked settings can show before any upload.

## What I learned
1. **The old page chooser fails on whole books.** E4 and E10 read pages 2, 3, 4, 5, 27 and 51 of Volcanoes, which are mostly opening pages and the back cover. All 6 runs said "information" with high confidence. That is the El Viaje failure again, on a real book. Reading from the middle (E13) got 33 of 33 settings right and makes the best check: 0.17 questions per book, with nothing let through.
2. **The page range works.** With images, the suggestion was the same in 5 of 5 runs on each book: keep the cover, start on page 8 (Volcanoes) or page 24 (the textbook, which is right). Without images, the textbook start came out as 24, 45 and 8.
3. **Slow internet: send JPEG, not PNG.** On the picture book, JPEG makes the upload 5 times smaller with the same answers (22/22 settings right). I tested this on the page-label reading only, not on the check. Text-heavy books gain less.
4. **Small low-detail images are too blurry for "where are the words".** In E14, both readings agreed on a wrong layout for Volcanoes, so 2 of 18 run pairs let it through. Keep normal detail for the check.
5. **Text-only can miss figures that are images, on a locked setting.** Once, E12t said "no diagrams" for the textbook, which would turn Figures off. The image check caught it.

## Answers to the designer
- **Is "not sure → Figures auto" safe?** This comes from reading the pipeline code; I have not tested it. Auto groups text with vector drawings. A book without vector drawings changes little. But on a picture book whose speech bubbles are drawn as vector shapes, it may make extra figure candidates for the filter to remove. Try it on Volcanoes before relying on it. The data now has both choices: `useGuess` (our guess) and `safeChoice` (auto).
- **Going with the user when one guess agrees?** I think that's fine: two of three agree. Show a conflict when both guesses differ, and always on a locked setting.
- **The long-book strip:** real strips are now in `whole-*.json → coverage.strip`. Use them instead of the made-up labels.

## Open disagreements
- **Designer:** "not sure" on the locked maps question. You pick auto, my data picks the guess. Product should decide.
- **Ana:** I translated the screens into pt-BR and es, but a person must check them before any user test.
- **All:** we still have 8 books, and the rules are in-sample on 6 of them.

## What I'd want next
- **Product:** a real activity book and real user descriptions in Portuguese and Spanish.
- **Product:** a test of Figures auto on a picture book.
