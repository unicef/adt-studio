# Review screen variants: "show the picks, ask only if needed"

The product owner's idea: the AI runs, then shows what it picked, and the user confirms or changes. Questions appear only when needed. The default screen is a review, not a questionnaire.

Start at `prototypes/confirm-variants.html`. Everything uses the round-3 source: same data (`prototypes/data/*.json`), same `decide()`, same plain words (`F`, `S`, `LAYOUT_SAY` are cut out of `_build/round3.html` at build time), same locked box. Source: `_build/confirm.html`. Screenshots: `prototypes/v-*/shots/` (12–15 each, desktop, phone, dark).

## Rules shared by all five
- One click on a book with nothing to ask: "Looks right · Create book".
- A needed question is a toggle with the two guesses ("Page by page" / "Whole book"), and each side lists the settings it gives. When we only saw opening pages and the guesses agree, all three options show and none is picked. "Something else?" and "Not sure? Use …" are links under the toggle.
- Create stays disabled until the needed questions are answered.
- Changing anything shows "What your changes did": each setting that flipped, old value struck through, with a lock and "can't change after import" on locked ones.
- El Viaje shows the whole-book reading as the AI's pick (`src=whole`), so the AI is wrong there ("information to read"). The tester box switches this and the asking policy (P0–P4) live.

## What each variant tests
| Variant | What it tests |
|---|---|
| **Picks list** `v-picks-list` | One list: facts ("About the book"), settings ("What we'll make"), locked group. A needed question is a highlighted row with a toggle, not a separate step. Can people scan 10 rows and spot a wrong one? |
| **Result first** `v-result-first` | Leads with a big preview of a real middle page in the chosen layout, then a one-line summary. "Change" opens the list. Questions sit above the preview, and the preview says "Waiting for your answer" until they are answered. Does a picture make wrong picks obvious without reading? |
| **Sure vs not sure** `v-sure-unsure` | "Please check" (open, needed only), "Can't change after import" (always open), "We're sure" (collapsed, one line each). The maps question stays inside the locked group, and the header counts it. Does grouping make people look where errors are? It is the natural screen for P4 (highlight without asking). |
| **Settings view** `v-settings` | The 6 settings in plain words, each with "because …". Changing a setting shows the fact it implies ("Means Kind of book: Information to read. Also changes Starting template"), or "Not possible for this PDF". Do users prefer reviewing settings or facts? |
| **One sentence** `v-sentence` (mine) | "This is [a story], and [the words are next to the pictures]. It has [nothing to write or mark] and [no maps…]. So we'll make it with [picture beside the words]…" Each part is a pill you can tap. Needed parts are dashed blanks ("information to read or a story?"). Is the shortest possible review fast and still clear? |

What building them showed:
- **Settings view writes facts the user never stated.** On Hyena, choosing "Rebuilt to fit the screen" means telling us the book is "Mostly words", which is false for a picture book. The setting is right, but the fact behind it is wrong, and a later rule that reads that fact will use it. Either store setting overrides apart from facts, or only offer settings that the true facts can reach.
- **Result first needs a real body page.** El Viaje has none, so the hero becomes "Waiting" or a sketch. Its strongest case is Hyena, My School and Egypt, where the preview is the book's own page.
- **One sentence works for 4 facts.** It would not scale to more, and its locked pills need the locked box below anyway.

## Asking policies (no new LLM calls)
`analyze-confirm.ts` replays every saved run pair. The honest user answers each question right and changes nothing else. Silent error = a setting at Create that differs from the true-facts setting.

| Policy | Questions per book, mean (max) | Silent errors (run pairs; settings, locked) | Wrong picks that matter shown as "sure" |
|---|---|---|---|
| P0 never ask | 0 (0) | 9/54; 18, 0 locked | 9 |
| P1 guesses differ AND it matters | 0.39 (1) | 0 | 0 |
| P2 P1 + only opening pages read | 0.72 (3) | 0 | 0 |
| P3 P2 + always ask maps | 1.22 (3) | 0 | 0 |
| P4 ask only locked; highlight the rest | 0.17 (1) | 9/54; 18, 0 locked, all 18 in highlighted rows | 0 |

These numbers are for the E5 page labels as the pick and E4 as the check (the prototypes' engine). With E10 as the check (the recommended engine), P1 drops to 0.22 questions and P2 to 0.67, with the same zeros. On whole books (E12 / E13, 18 pairs), P0 lets 3/18 through (Volcanoes layout), while P1 and P2 ask 0.67 and let nothing through. The only locked error in all replays is E12t's "no diagrams" on the textbook (P0 3/18), and every other policy catches it.

Reading it:
- **P0 is not safe.** 1 pair in 6 creates a wrong book unless the user spots the error, and every wrong pick looks "sure".
- **P1 does all the work in this data.** P2 and P3 add 0.3–0.8 questions and catch nothing more here. They protect cases we have not seen: both readings wrong on opening pages, or a wrong maps answer on a locked setting. El Viaje needs P2 to be honest about the foreword even when both readings happen to be right.
- **P4 is the PO's idea taken literally.** It has the fewest questions, but every one of its errors sits in a highlighted row the user can click past. Whether that is safe depends on people, not on the data.

## Recommendation
- **Policy:** keep **P2** as the default (P1, plus the opening-pages rule for El Viaje-type files). Drop P3: it costs 0.5 questions per book and caught nothing. Test P4 only as a user-test arm.
- **Put two variants in front of real users: Sure vs not sure, and Result first.** Sure vs not sure is the cleanest form of "review, ask only if needed": the locked group is explicit, and it is the only screen where P4 can be tested fairly. Result first tests the PO's other instinct, that a picture beats words. Both reach Create in one click on 4 of 6 books.
- **Picks list** is the fallback if both feel too clever. It is the most complete, but the longest (10+ rows).
- **Settings view** belongs in an A/B arm only after the fact-override problem above is fixed. **One sentence** is a quick hallway test, not a candidate.

## Open questions
1. With P4, do people read highlighted rows, or click "Looks right"? This is the one number that decides P2 vs P4. Test Egypt under P4 (`?policy=P4`).
2. Should a setting changed by hand (Settings view, or "Change" on a setting row) be stored as an override and not as a fact?
3. Is the toggle with "Page by page / Whole book" tags clear? Ana disliked "readings" in round 1.
4. Page range is shown as a locked row with "Use this"; the full picker (round 3) is not rebuilt here.
5. Same caveats as before: 8 books, the rules are in-sample on 6, and the user model is honest and perfect. Real users answer wrong sometimes.
