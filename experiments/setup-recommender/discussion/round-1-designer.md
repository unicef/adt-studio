# Round 1 · UI/UX designer

## What I built
Three clickable prototypes, same four real books (El Viaje, Hyena & Raven, Colouring My School, Práticas), real AI answers/reasons/cited pages (E4 run 1 = "reading 1", E5 run 1 = "reading 2"), real page images. Open `prototypes/index.html`. Screenshots in each `shots/`.

- **A · confirm-facts**: everything pre-filled. A "Check this first" card shows up only when the two readings disagree AND the disagreement changes a setting. Other answers are collapsed rows. Settings panel updates live (changed rows flash, old value struck through).
- **B · teaching-chat**: one question at a time. Each question has a one-line "what this changes" lesson, a small layout sketch, and the AI's guess pre-highlighted. Asks only what matters for that book (story -> where the words sit; textbook -> activities; diagrams only if found). 3-4 questions, not 6. "Use your guesses for the rest" escape.
- **C · describe-first**: user picks story / textbook / reference before anything. AI fills the rest. If the AI would have guessed differently, it says so but follows the user ("you know the whole book").

Fixed-at-import settings (page grouping, diagrams) are always in a hatched violet box with a lock, the measurement written out ("0 of 4 facing pairs continue across the fold") and the pages that prove it. Changing them is tucked behind "Change" with a warning. The Create step repeats them once more.

## What I learned
- El Viaje's best explainer is the page strip: reading 2 labels every page "front matter". Showing it makes "the AI only saw the foreword" obvious, no jargon needed. Question becomes "What comes after these pages?"
- Práticas has two disagreements (composition, diagrams) that change no setting. Asking would be noise. Rule I used: **only ask when the disagreement changes a setting**. On these 4 books (run 1) that gives 1 question for El Viaje and 0 for the other 3. Not checked on other runs yet.
- Spreads need a picture, not words: two joined pages with a dashed fold.
- "Diagrams" is locked but fed by an AI fact. It's the one irreversible setting the AI can affect, so it deserves a question even when no disagreement.
- Confidence badges dropped entirely: they never caught an error.
- Describe-first: one pick is cheap, but the user's free-text line does nothing yet (E3 showed hints are ignored). I left the box but labelled it unused. Maybe drop it.

## Open disagreements
- I think the chat (B) is too slow for the 5 books where nothing is wrong; A gets them to "Create" in one click. B's value may be first-time users only. Want user testing to say.
- C makes every user answer a question the AI gets right 5/6 times.

## Want next round
- Dev: run the "ask only if it changes a setting" rule on all runs/variants: how many questions per book, and any wrong setting left unasked?
- Dev: is diagrams (feeds a locked setting) ever wrong? Should it always be confirmed?
- User/tester: click A vs B on El Viaje and My School; which feels faster, which do you trust?

Rebuild: `python3 prototypes/_build/build.py`, images `tsx prototypes/_build/render.ts <pdfs> prototypes/pages`, shots `node prototypes/_build/shots.mjs`.
