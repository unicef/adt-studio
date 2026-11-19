# Round 1 · User (Ana, content coordinator)

I tested A, B and C on El Viaje, My School, Hyena and Práticas, using the HTML and all 23 screenshots. I'm writing as Ana: I know my books well and I don't know ADT's internal words.

## A · Check the reading
- **Hyena, My School, Práticas:** I'd click "Create book" in about 10 seconds. That felt great. But the huge green tick takes half the screen and tells me nothing. One line saying "Looks right. Here is what we read." would be enough.
- **El Viaje:** "Two readings disagree". I stopped here and wondered who did the reading and why there were two. I'd rather read "We weren't sure what kind of book this is".
- **"Can't tell" / "front matter"**: the page strip worked. I saw at once that the AI only read the foreword, and that made me trust it *more*, because it showed me why it was unsure.
- **"reading 1"** label on the Reference card: I don't know what it means and I'd ignore it.
- After I picked "A story", the right panel changed to **"AI rebuilds the layout"**. That scared me a little. Will it change how my book looks? I need one sentence and a small picture of the result.
- **Risk:** the AI also decided "Where does the text sit? Mostly text" **from the foreword pages only**. In A that answer is folded away, so I would never check it. Once the AI is wrong about one thing in a book, I'd want every answer from that book shown open.
- On Práticas the "Ready" bar at the bottom covered the Layout row and part of an answer. I couldn't see the layout before clicking Create.

## B · Short conversation
- **El Viaje:** this felt clearer and more respectful. "What kind of book is it? I'm not sure" plus "What comes after these pages?" is exactly how a colleague would ask me. I answered in about 30 seconds. It then asked where the words sit, which caught the second risk that A hides. **For a hard book, B is the one I trust.**
- **My School:** 3 questions where the AI was right every time. The first click felt useful because I learned about spreads. By the third I was clicking "same as the AI" without reading. Doing 20 books a year, that turns into blind clicking. I didn't notice "Use your guesses for the rest" at first: it's small grey text below the card.
- **The sketches** (on the pictures / beside / mostly text) helped more than any of the words.
- **"Each page stands alone. Right?"** made me stop. Right compared to what? "Do any pictures spread across two pages?" is a question I can answer by looking at the book.

## C · Tell us first
- Picking story/textbook/reference is easy and I'd always know the answer. It is one click and not annoying.
- After I picked, the orange box said the AI thought otherwise, but "We're going with your answer: you know the whole book" made me feel respected.
- The box marked "not used" annoyed me. Don't show me a box that does nothing. If it stays, I'd type "the PDF starts with a 6-page foreword" and expect the AI to use that.
- C still showed me "Mostly text" from the foreword pages, with no warning.

## Words that confused me
"readings", "reading 1", "front matter", "Preset", "AI rebuilds the layout", "One section per page", "Sections: split pages into parts", "Diagrams: keep labelled diagrams together".
"Fixed when you import" was clear, and so was the lock. "Facing pages as one screen" with the picture was clear.

## The developer's yes/no questions (`teachingQuestion` in the data)
- **"Is there nothing for the reader to do, no questions or blanks to fill?"** This is a double negative. I would answer "Yes" meaning "yes, there are things to do" and get it wrong. Please ask it the positive way.
- **Colouring My School:** the book asks children to *colour*. Is that "something to do"? I'd say yes, and I think that would turn activities on by mistake. The question needs to say what counts, for example quizzes, blanks or questions, but not colouring or drawing.
- **"8 pages"**: my real book has 200. I'd worry I uploaded the wrong file. Tell me which pages the AI looked at, and let me say "skip the foreword, the story starts on page 9".

## Reacting to the developer
- "1–3 questions instead of 6": yes. **I'd rather answer 2 questions than wait 30 seconds or read 6 cards.**
- "4 seconds to read the pages": fine for me, even on slow internet. Show the locked settings first, as you said, so I know something is happening.
- Free-text box optional: yes. But if it's there it must work. Otherwise remove it.
- Describe while it reads: I like that. I'd pick the kind of book while the AI reads the pages, so the wait is free.

## My choice
**A for easy books, B for hard ones.** The screen should open in A when the readings agree and switch to B's one-at-a-time questions, with sketches, when the AI is unsure. The book-type pick from C can be the first screen, *during* the wait. I'd skip it on easy books if the AI already knows.

## Top 5 requests for next round
1. **A mixed flow:** quiet "looks right" on easy books, B-style questions only when unsure. If one answer is wrong, show all the answers for that book open.
2. **Plain words everywhere:** no "readings", "preset", "front matter" or "sections". Write each question so a teacher can answer it by looking at the paper book, with no double negatives.
3. **A small picture of the result** for each layout choice ("this is how a page will look"), especially "AI rebuilds the layout".
4. **Say which pages were read**, and let me say where the real content starts (page range / skip the foreword) before the AI reads.
5. **Clear meaning for "things to do"**, with colouring and drawing called out. And test it on a real colouring book and a real activity book.
