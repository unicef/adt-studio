# Round 3 · User (Ana, content coordinator)

I tested all three round-3 flows on the six books, using the 36 screenshots: 18 for Check then ask, 10 for Tell us while we read and 8 for Teach me. I also read both round-3 notes and the pt-BR and es strings in `prototypes/data/engine.json`.

**Short version:** I'd keep **Check, then ask** as the default. It already has the best part of "Tell us": an optional "what kind of book is it?" while I wait. I'd offer "Teach me" as a link for my first book. Most of my round-2 requests are fixed. The El Viaje maps question is now question 3, it shows on the phone, and nothing is pre-picked.

## Walkthroughs (how long it felt)

| Book | Check, then ask | Tell us while we read | Teach me |
|---|---|---|---|
| Hyena | "Looks right", then Create, ~10 s | 2 taps + Create, ~15 s | 3 steps, ~35 s |
| My School | ~15 s (read the colouring note) | ~15 s | ~35 s |
| Práticas | ~10 s | ~15 s | 2 steps, ~25 s |
| Egypt | 1 question, ~25 s; ~45 s with the page picker | 0 questions if I'm right, ~15 s | ~40 s |
| El Viaje (AI wrong) | 3 questions, ~50 s | 2 taps + 1 question, ~30 s | 3 steps, ~50 s |

## What worked
- **El Viaje is honest now.** "All 8 pages we read are the cover, title pages or a foreword. **We couldn't see the book itself.**" plus the labelled strip. I trust it *because* it admits this.
- **Question 3 (maps) is in the card and counted**: "Question 3 of 3 · can't change after import". The side panel says "Waiting for your answer". On the phone (shot 16) I see it, so I wouldn't miss it any more.
- **"I'm not sure. Use 'A story'"** names the guess. On maps, "Not sure? We'll keep any labelled drawings whole, which is safe either way. [Do that]" calms me down.
- **Option cards show everything.** "Page layout + Starting template" under each kind of book, with a preview made from the book's own page (Egypt, Hyena). Now I can see why my answer matters.
- **Egypt's question 1 header is clear:** "Looking page by page we'd say a school book. Looking at the book as a whole we'd say information to read."
- **When I'm wrong, the screen catches me.** Egypt "You said a story. Both our guesses were different… We went with you; please check the summary." In Tell us, Hyena "You said / The pages say", with my own page as the picture. That card is excellent: I look at page 7 and see that I was wrong.
- **Hyena wording is fixed.** "Already side by side… Nothing to join." I don't worry any more.
- **Page picker:** "The book seems to start on page 3. Keep the cover, skip the opening pages and end pages? [Use this]" is exactly what I asked for. "9 of 11 pages, leaving out pages 2, 11" is clear. So is the red line saying "can't be added back".
- **Create dialog.** It lists the three things that can't change, and it saved me on the phone, where the locked box sits below the sticky Create button.

## Where I hesitated or would go wrong
1. **Tell us shows "you said" on something I never said.** On Egypt (Tell us, shot 04), "Things to write or mark: No **you said** / Your answer". The wait card only asked two things (kind and words). That is a false label, and it would make me stop trusting every other "you said".
2. **Mixed-up header in Tell us, El Viaje.** The intro ends with "What comes after them?" but the question below is about maps. In Check, then ask, it sits above "What is this book mostly?", where it fits.
3. **"None found on pages 2–4, 6–7"** (El Viaje, done). Those pages are the foreword. It should say "You said none". On My School the side panel says "pages 2–6, 8" but the card says "Looked at pages 2, 3, 4, 5". Which is it?
4. **"Starting template"** is on every kind-of-book card, and I don't know what a template is here. Teach me says "This picks the starting template". That still doesn't tell me what I'd see.
5. **Page picker range row.** It shows "from page **1** to 10" while page 2 is left out. I'd think the box was wrong. There are also two buttons ("Use this", then "Use these pages") and I wasn't sure the first one had done anything.
6. **Egypt question 1:** the page strip is cut off at the right ("11 · pag…").
7. **Tell us while we read: 4 s is not enough time.** I'm still reading "Where are the words on a page?" when it finishes. That question is hard to answer from memory, while "what kind of book" is easy. On slow internet (20 s), two taps are fine.
8. **Teach me** feels like Check, then ask with a grey box added. On Hyena I clicked "Yes, 'A story' is right" three times without reading. "Use your guesses for the ones you're sure about" is a good way out, but it sits below the card.
9. **The 200-page strip** is labelled "Hyena and Raven, 200 pages" with made-up labels. The dev now has real strips (Volcanoes, the textbook). I want to see a real one.

## Translations (I work in Portuguese and Spanish)
- **pt-BR, "legenda" means two things.** The setting is "Mapas e desenhos com **legendas**", then the option says "Uma **legenda** embaixo de uma foto não conta." A teacher would read that as a contradiction. Use "desenhos com nomes/rótulos" for the setting and keep "legenda" for captions only.
- "O que este livro é, na maior parte?" is stiff. Write "Que tipo de livro é este, na maior parte?"
- "Refeito para caber na tela" / "Rehecho para caber en la pantalla" sounds like the book is redone. Write "Reorganizado para caber na tela" / "Reorganizado para ajustarse a la pantalla".
- "Páginas lado a lado" (the setting name) collides with "já traz as duas páginas lado a lado" (Hyena). Write "Páginas duplas" for the setting.
- The screen and the data still differ in English: "Kept whole, with their labels" vs "Kept together with their labels"; "Exercises become interactive" vs "Made from the book's exercises"; "One page per screen" vs "One PDF page per screen". Pick one before translating. A person must still check all of this.

## To the developer, in plain words
- **The whole-book result scares me, and it is the most important news.** On the old setup, Volcanoes came out as "information", 6 of 6 times, with high confidence. That is El Viaje on a real 52-page book. Reading from the middle, plus the page strip on screen, is what I'd trust.
- **JPEG: yes.** "16 s instead of 93 s" on my office internet matters more to me than anything else on this list.
- **"Not sure" on maps: auto or the guess?** I liked "safe either way". Only keep that sentence if it's true, so test it on Volcanoes first. If auto adds junk pictures to a picture book, don't call it safe.
- **Going with me when one guess agrees: fine**, and the green line tells me. But on something that can't change later, always show me the "You said / The pages say" card, as you suggested.

## Which direction
**Check, then ask** as the default, with the optional "what kind of book is it?" chips while it reads. Easy books take 10–15 s, and hard books ask me only what matters. **Tell us** as a separate flow isn't worth two taps on every book. Its conflict card is great, though, so reuse it in Check, then ask whenever my wait-time answer differs. **Teach me** should be one "Show me how it works" link the first time.

## Top 5 requests (for whoever builds the real one)
1. **One flow:** Check, then ask, plus an optional kind-of-book tap while waiting, plus the "You said / The pages say" card when I'm wrong. Teach me only as a first-time link.
2. **Never label something "you said" or "found on pages" unless it's true.** Make page lists match between card and panel. Fix the Tell us maps header.
3. **Explain "Starting template"** with a small picture of what changes, or drop the word.
4. **Page picker polish:** the range box should match what's ticked, one confirm button, no cut-off strip. Show a real whole-book strip (Volcanoes) instead of the made-up 200-page one.
5. **Fix the English first, then have a person check pt-BR and es** (legenda/rótulo, "Reorganizado"). Test with a real teacher on a real activity book, on slow internet.
