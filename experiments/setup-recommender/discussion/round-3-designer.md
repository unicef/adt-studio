# Round 3 · UI/UX designer

## What I built
Three directions on one source, so the product owner can switch between them on the same book (tabs at the top of each). All three use the same six books, rules, wording and data. Start at `prototypes/index.html`.

| Direction | Folder | What it tests | Shots |
|---|---|---|---|
| **Check, then ask** (default candidate) | `r3-check-then-ask/` | "Looks right" plus 0–3 questions, only when unsure | 18 |
| **Tell us while we read** | `r3-tell-while-reading/` | the user's own two answers during the 4 s wait, checked against the pages | 10 |
| **Teach me** | `r3-teach-me/` | the PO's teaching idea: one step per fact that matters, saying what it is for | 8 |

- **Source:** `_build/round3.html`, built by `build.py`. The data comes from the dev's `prototypes/data/*.json`: proposals, second guesses, `coverage`, `askAcrossRuns` and the answer key. Questions and option texts are the dev's `plainQuestion` / `plainOptions`, so the screen and the data now match (Ana's mismatch).
- **Books:** the research paper is added, which makes six books. Egypt now uses run 1, the same as the data: one guess says school book, the other says information.
- **For testers:** every screen has a box with the AI's two answers, the answer used and the answer key.

## Ana's round-2 requests
1. **Every question in the card, and counted.** El Viaje has 3 questions, and the third is maps (locked, lavender header, nothing picked). The side panel says "Waiting for your answer" and asks nothing itself. The status line and the dock both say one question can't change later.
2. **Honest option cards.** Each card lists every setting that changes between the options, and only those: El Viaje question 1 shows Page layout and Starting template. Locked settings carry a lock. A mini preview appears when the page layout changes. "I'm not sure. Use 'A story'" names the guess it picks. For the locked maps question, "not sure" picks the safe choice: "keep any labelled drawings whole". When the kind you picked differs from both of our guesses, the screen no longer says "Looks right".
3. **Page picker.** You tap pages to leave them out, or choose a range and tick "keep the cover". It suggests "The book seems to start on page 3. Keep the cover, skip the opening and end pages?" The side panel offers the same suggestion. Ranges read "9 of 11: 1, 3–10". On El Viaje it says it can't suggest anything and asks "Is this the right file?"
4. **Hyena wording.** It now says "Already side by side. Your PDF already has both pages side by side…". The layout previews use a real middle page of the book. Where we never saw one (El Viaje), they use a labelled sketch and say that "Rebuilt" and "One column" look almost the same for a book that is mostly words.
5. **Real conditions.**
   - Slow internet: the loader says the locked settings are already measured and you can answer while waiting.
   - Long books: a 200-page strip sketch, about 12 pages with a whole-book bar. The page labels in it are made up.
   - Loader text: now "We look at all 8 pages". The 12-page sentence only appears for long books.
   - Locked box: "3 things can't change after this".
   - Not done: Portuguese and Spanish screens. The wording is still changing, and a translation should be done by people, not by me.

## Questions per book (run 1, from the prototype's own rule)
| Book | Check, then ask | Tell us (user right) | Teach me |
|---|---|---|---|
| El Viaje | 3 | 1 (maps) | 3 |
| Egypt | 1 | 0 | 3 |
| My School | 0 | 0 | 3 |
| Práticas | 0 | 0 | 2 |
| Hyena | 0 | 0 | 3 |
| Research paper | 0 | 0 | 1 |

## What I learned
- "Tell us" catches El Viaje with 1 question instead of 3, but only if people answer during the wait. A conflict card ("You said / the pages look like") appears only when **both** of our guesses differ from the user's answer. On El Viaje we can't check the user at all, and the screen says so.
- "Teach me" costs 2–3 steps on easy books, where "Check" costs 0. I'd keep it as an opt-in ("first book" or a link), not as the default.
- I treat page 1 as "Cover" even when the AI labels it "Opening", as Ana asked for My School. That is a display rule; the AI's label is unchanged.

## Open disagreements
- **Dev:** when we are unsure about the locked maps question, "not sure" picks "keep labelled drawings whole". Is `auto` really harmless on a book with no diagrams?
- **Dev:** "Tell us" shows a conflict only when both guesses differ. With one guess agreeing, it silently goes with the user. Is that too trusting?
- **Ana:** I kept "Teach me" as a separate direction even though you'd use it once. The PO should judge it.

## Next
- **Product owner:** try all three side by side on El Viaje and Egypt, then on My School.
- **Dev:**
  - Is `figureExtraction: auto` safe as the "not sure" fallback?
  - Run on a whole book and a real activity book.
- **Ana:** does the page picker work, does the El Viaje Q3 card work on a phone, and is "Tell us" worth two taps on every book?
