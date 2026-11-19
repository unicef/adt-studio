# Round 2 · UI/UX designer

## What I built
One mixed flow, **D · Check, then ask** (`prototypes/check-then-ask/`, 19 screenshots in `shots/`). It is Ana's request 1. Five real books: El Viaje (run 1), Egypt (run 2, where the page reading calls history lessons "Story"), My School, Práticas, Hyena.

1. **Reading screen.** The PDF measurement shows first (0.2 s): real text and facing pages. The page strip fills in while the AI reads. While you wait you can pick the kind of book (optional chips, from C) or "Choose pages" to set where the book starts. There is no free-text box.
2. **Sure → "Looks right. Here's what we found."** One line, no big tick. Four plain facts, each with a sketch, "Seen on pages …" and "Change". "Walk me through it" turns the same facts into one-at-a-time questions with our guess pre-picked. That is the teaching chat, but only when you ask for it.
3. **Not sure → "We're not sure about this book. 2 quick questions."** One card at a time. It says why we're asking (the page strip with "Opening" labels, or "we got two different answers"). The question is worded positively. Each option shows a sketch and **what it changes** ("Page layout: Keep the printed page"). Both guesses are tagged, and no answer is pre-picked when we disagree. "I'm not sure, use your guess" is a real button now, not grey text.
4. **Panel.** **Set now. Can't change after import** has a lock and stripes, and holds 3 items: facing pages, labelled drawings and **pages to import** (new). "What you'll get" shows a **small picture of the result** for the page layout, made with the book's own page.

## When it asks (the rule)
A fact is asked only if another answer would change a setting AND (the two guesses differ OR every page we read was opening pages).
- El Viaje: 2 questions (kind, where the words are). This catches Ana's hidden "Mostly text" risk.
- Egypt run 2: 1 question. My School, Práticas, Hyena: 0.
- If the user picks "school book" on El Viaje, a question about exercises appears. If they pick "information", the question about where the words are disappears.
- Diagrams is never a question. My check of all 36 readings (E4 + E5, 3 runs) found it was never wrong. I show it open in the locked box instead. When we only saw opening pages, it asks "Does the rest of the book have maps or charts?" right there.
- My quick check over 3 runs: every wrong fact was either flagged by disagreement or changed no setting. This needs the dev to confirm.

## Words (answers Ana's list)
- "readings" → "our guesses"
- "front matter" → "Opening"
- "preset" → "Starting template", in "2 more settings"
- "sections" → "Reading parts", also in "2 more settings"
- "AI rebuilds the layout" → "Rebuilt to fit the screen", with a picture
- "Diagrams" → "Maps and labelled drawings"
- Exercises: "Does the book ask the reader to write or answer something?" Counts: questions, blanks, matching, quizzes. Doesn't count: colouring, drawing, questions inside the story. My School shows that note.

## Answer to the dev: which fields
- **Used:** `questionOrder` (trimmed: diagrams dropped, exercises only when the kind is school book), flags that matter only, `citedPages`, and `whatIf` (I recompute it live with `decide()`).
- **Rewritten:** `teachingQuestion`, because Ana found the double negatives. `summary` became the fact rows.
- Ask only what matters, but show every fact open after any question.

## Open disagreements
- **Dev:** I didn't use E5 alone as the proposal. When the two guesses differ, the question has no default. Rubber-stamping a pre-filled guess is the risk Ana described.
- **Product (open):** should colouring ever make activities? I said no. That needs a product decision.
- **Still not tested:** the "Choose pages" range. It only works on excerpts here.

## Want next round
- **Dev:**
  - Run the D rule (disagree OR only opening pages, matters) on all 3 runs. Does any wrong setting get through? How many questions per book?
  - On whole books: what does the page strip look like at 200 pages (about 12 sampled)?
- **User (Ana):**
  - El Viaje and Egypt in D: is 1–2 questions with no default OK, or annoying?
  - Do the layout pictures make "Rebuilt to fit the screen" clear?
  - Does the exercises wording work?
