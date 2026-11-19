# Round 2 — developer

## What I did
- Replayed the designer's rule ("ask only if the answer would change a setting") on **every pair of saved runs**, not just run 1: `analyze-asking.ts` → `results/poc/asking.json`. No LLM calls.
- **E10 plain words** (`variants/e10-plain-words.ts`): E4 with Ana's plain, positive questions. Colouring and drawing are defined as "not exercises". These are the same words the user would see.
- **E11 page labels without images** (`variants/e11-page-types-text.ts`): for providers that can't take images, and as a cheap second reading.
- Book files updated (`prototypes/data/`): positive yes/no questions, `plainQuestion` + `plainOptions`, `coverage` (pages read, where the book starts), `ask` (questions to ask), `askAcrossRuns`, `unsupported`, and `words` (a plain glossary) in `engine.json`. Fixed the El Viaje flag text that Ana caught.
- 36 of 70 LLM calls used. `rules.ts` and `facts.ts` are unchanged.

## What I learned
**1. The designer's rule holds on all runs.** With page labels (E5) as the proposal and the whole-book reading (E4) as the check:

| Book | Questions (9 run pairs) | Wrong settings let through |
|---|---|---|
| Práticas, My School, Hyena | 0 every time | 0 |
| Research paper | 1 in 3 of 9 pairs | 0 |
| Egypt | 1 every time | 0 |
| El Viaje | 1 every time | 0 |

That is 0.39 questions per book and nothing slipped through (0/54). Without the check, 9/54 pairs had a wrong setting. Of the 21 questions asked, 9 fixed a wrong answer and 12 confirmed a right one.

**2. The check must read the book a different way.** Running the same reading twice misses errors (E5+E5: 2/36 slipped; E4+E4: 6/36, because El Viaje is wrong in every run). Page labels against page labels without images also missed some (3/54). Page-by-page against whole-book missed nothing.

**3. Ana's hidden risk is real, so add a coverage rule.** On El Viaje no page voted (all front matter), so every answer is a guess. E5 got "story" right in all runs only because its whole-book guess happened to be right. New rule: when fewer than 2 pages of the actual book were read, ask every fact that matters and say why ("These pages come before the book starts. What comes after them?"). It costs El Viaje 3 questions instead of 1 and no other book changes. `coverage.contentStartsAt` gives where the content starts for the "set where the book starts" control (page 2 or 3 on the other books, none on El Viaje).

**4. Diagrams: never wrong.** Across every run of every image reading, the AI never got diagrams wrong. Its answer decides the locked Figures setting on 4 of 6 books (those where the PDF has no vector drawings). Confirming it every time adds 0.5 questions per book and caught nothing here. But all 4 of those books truly have none, so the test is weak. My suggestion: show it in the locked box with the pages as proof, without asking.

**5. Plain words help the AI too.** E10 got 52/54 against E4's 48/54, and El Viaje was right in 2 of 3 runs (E4: 0 of 3). My School's exercises came back "none" 3/3. Ana's colouring worry is also smaller than it looks: exercises only change a setting for schoolbooks, so a storybook never gets that question.

**6. Without images it works too.** E11 (page labels from text and numbers) got 54/54 using 1.4k tokens in 2.2 s. With E6 as the check it needs 0.67 questions and nothing slipped through.

## Open disagreements
- **With the designer:** don't force a diagrams question; it adds cost and caught nothing so far.
- **With Ana:** "show every answer once one is flagged" adds questions on the research paper and Egypt (1.11 vs 0.39 per book) and caught nothing more. The coverage rule targets the real case. I'd show the other answers open but not as questions.
- My earlier "1–3 questions per book" was the count of facts that matter. With the check, it is 0 on half the books.

## What I want next
- **Designer:** use `ask`, `coverage.say/question` and `words`. One mixed flow: 0 questions → quiet "looks right", otherwise one question at a time.
- **Ana:** check the new `teachingQuestion` / `plainQuestion` wording.
- **Product/all:** a whole book with front matter, a real activity book, a book with raster maps/charts (to stress diagrams), and real user wording. Same caveat as before: 6 excerpts, rules are in-sample.
