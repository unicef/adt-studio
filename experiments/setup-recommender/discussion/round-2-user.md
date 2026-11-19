# Round 2 · User (Ana, content coordinator)

I tested **D · Check, then ask** on all five books, using the screen code and all 19 screenshots (desktop, phone and dark). I also read both round-2 notes and the dev's new wording in `prototypes/data/`.

**Short version:** this is the flow I asked for, and I'd use it. On easy books it is quick and calm. On El Viaje it shows me why it is unsure. I found one real problem: on El Viaje there is a third question that the screen doesn't count, and on a phone I would miss it.

## Walkthroughs (what I did, how long it felt)

| Book | What I saw | My clicks | Felt like |
|---|---|---|---|
| Hyena | "Looks right. Here's what we found." | Glance, then Create | ~10 s |
| Práticas | Looks right. Activities on. The bar no longer covers the layout row. | Glance, then Create | ~10 s |
| My School | Looks right, plus the colouring note | Read the note, then Create | ~15 s |
| Egypt (run 2) | 1 question: what kind of book | "A school book", then Create | ~25 s |
| El Viaje | "2 quick questions", plus a maps question in the side panel | Story, Mostly words, (maybe) maps, then Create | ~45 s |

## What worked
- **"Looks right" in one line.** The big tick is gone, which I wanted. I trust the four facts more now that each one shows "Seen on pages 3, 5, 8".
- **El Viaje question 1.** The page strip labelled "2 · Opening, 3 · Opening…" plus the line "We couldn't see the book itself" is honest. It made me trust the tool more, not less.
- **No answer pre-picked when the guesses differ: yes, that's fine.** I know my books, so it took me 2 seconds per question. It also made me read the question, which is the point. On easy books I don't want this.
- **After the questions, everything is shown open**, and the unchecked answers say "A guess from the opening pages only" in orange. That is exactly what I asked for in round 1, without making me answer them all. **So I now agree with the dev:** show them open, don't ask them.
- **Exercises wording works.** "Does the book ask the reader to write or answer something?" plus "Doesn't count: colouring, drawing" is clear. On My School, "Colouring pages don't count as exercises, so no activities are made from them" stopped me from switching activities on by mistake. I'd answer correctly now.
- **The pictures in the side panel.** "Keep the printed page" with My School's own spread is very clear. So is "Picture beside the words" on Hyena.
- **The locked box and the last check before creating.** "These three can't be changed after import" makes sense, and I'd read it.
- **"Walk me through it"** is fine as an optional link. I'd use it once, on my first book.

## Where I hesitated or would go wrong
1. **A hidden third question on El Viaje.** The banner says "2 quick questions, then you're done". The side panel also asks "We only saw the opening pages. Does the rest of the book have maps or charts?", with **No already picked**. On a laptop I only noticed it after finishing. On the phone (shot 17) it sits below everything. I'd click Create without ever seeing it, and it is a setting I can't change later. This is the one place I'd get something wrong without knowing.
2. **"Rebuilt to fit the screen" on El Viaje.** On question 1, both "A story" and "A school book" say "Page layout: Rebuilt to fit the screen". So why does my answer matter? I'd think the question was pointless. If it changes something else (the starting template), show that.
3. **"Rebuilt to fit the screen" vs "One column, like an article".** For a novel with no pictures I can't tell the difference. The preview uses a foreword page shrunk inside a phone, which I can't read. On Egypt and Práticas the preview made sense, because I could see a picture moving.
4. **Egypt: "One of our guesses" on Story and Information only.** The AI never thought "school book". I picked it anyway, but for a second I doubted myself. Then (shot 09, where I picked while waiting) it said: "Looks right. You said a school book; **one of** our guesses was different." In fact both guesses were different, so "Looks right" and "different" in the same line confused me.
5. **"I'm not sure, use your guess" when there are two guesses.** Which one does it use? Please say: "Use 'A story'".
6. **Hyena, facing pages.** It says "**One page at a time**", and then "We measured it: each PDF page is already a full two-page spread." To me that reads as a contradiction on a setting I can't change. I'd stop and worry. Say something like "Your PDF already has both pages side by side, so we show each PDF page as one screen."
7. **Choose pages.** I can only set "Start at page". On El Viaje I want to keep the cover but drop the foreword, and on Egypt drop the end pages (p11). If I start at 2 I lose the cover. It also printed "**Pages 1–1** are left out", which should read "Page 1 is left out". The data knows where the book starts ("The book starts on page 3"), so suggest that for me.
8. **Loader text:** "We read 8 of 8 pages. A long book: about 12 pages, spread from start to end." I read this as "my book is 12 pages long?" Say it only for long books, or say "For long books we look at about 12 pages."
9. **My School page 1** is the cover but labelled "Opening". That's small, but the labels are what I trust, so they need to be right.
10. **"3 settings are set now"** next to Create: I didn't know what it meant. "3 things can't change after this" is clearer.

## Trust
- **More trust:** the page strips with labels, "Seen on pages…", "A guess from the opening pages only", and no pre-picked answer when unsure.
- **Less trust:** a pre-picked answer on a locked setting the AI only guessed (the maps question), the Hyena contradiction, and the "one of our guesses" error.

## To the developer, in plain words
- **0.39 questions per book, and nothing wrong got through:** great. I'd rather answer 1 question on 2 books out of 6 than check 4 facts on every book.
- **The coverage rule (ask everything when only opening pages were read):** yes. But all 3 questions must be in the main question card and counted. Not 2 in the card and 1 in the side panel.
- **Diagrams never asked on normal books:** OK, as long as "This is wrong" stays next to it with the pages as proof.
- **Your option texts in the data are good, sometimes better than the screen's.** "A story with a few colouring or drawing pages is still a story" should be on the screen. Today the screen and the data use different wording, so please pick one.
- **E11 without images, 2.2 s:** I don't care how it works. I care what happens on my slow office internet. Does "about 4 s" become 40 s? Can I answer while it loads?

## Open disagreements
- **With the designer:** the maps check must not be a pre-answered control in the side panel. Either make it question 3 in the card or leave it unanswered.
- **With the designer:** a "what it changes" line that is identical across options should not be shown as the reason, or it should list everything that changes.
- **Agreed with the dev now:** show open, don't ask, once one answer is flagged.

## Top 5 requests for round 3
1. **Every question in one place, counted.** On El Viaje, make "maps or charts?" question 3 in the card, with no default because it is locked and only guessed. It must also be visible on a phone.
2. **Honest option cards.** Show everything an answer changes, not only page layout. Name the guess that "use your guess" picks. Fix "one of our guesses" when both differ, and don't say "Looks right" in that case.
3. **A better page picker.** Keep the cover, skip opening pages, skip end pages. Pre-fill "The book seems to start on page 3". Fix "Pages 1–1".
4. **Fix the Hyena facing-pages wording,** and use a real middle page (not the foreword) in the layout previews, so "Rebuilt to fit the screen" and "One column" look different.
5. **Test it in real conditions:** a whole 150–200-page book (what does the strip look like?), a real activity book, slow internet, and the screens in Portuguese and Spanish, since I often work in those.
