# Kids Mode — UX feature report

**Test build for team review · ADT Studio**

**▶ Try it: https://eliezir.github.io/adt-kids-mode-demo/**

*Hyena and Raven* — Tony Lelliott & Wiehan de Jager, from
[African Storybook](https://africanstorybook.org), used under its open licence.
Available in English, Portuguese (Brazil) and Spanish (Uruguay).

---

## 1. How to read this document

> ### ⚠️ This is a test build from an unmerged branch. Bugs are expected.
>
> Nothing here is final. We are showing it early *because* we want the direction
> challenged while changing it is still cheap.

Three things are deliberately temporary, and you should not read them as
decisions we have made:

| What you'll see | Why it's there |
|---|---|
| A **List / Chat / Shelf** switch pinned top-left | So you can compare three menu designs on the same book. It is a developer control, untranslated, and it disappears once one design is chosen. |
| Three different buddy menus | We could not decide on paper, so we built all three. **We want you to pick.** |
| Placeholder-ish buddy art | The five buddies are a working set, not a commissioned cast. See §3. |

**What we are specifically asking for:**

1. **Which buddy menu?** (§6–§9)
2. **Are PNG buddies the right approach**, or should we invest in something richer? (§3)
3. **Do our priorities match yours?** (§13)

---

## 2. What Kids Mode is

A child-facing reading layer for **ages 4–8**, many of them pre-literate or
early readers, some with low vision or motor difficulties. It wraps an ordinary
ADT book without altering it.

A reading buddy greets the child by name, reads aloud, offers help, reacts to
answers and celebrates the end of the book. Everything is designed so a child
who **cannot read the labels at all** can still navigate — by icon, colour,
size and position.

Everything ships **inside the book package** and works offline. No network, no
accounts, no per-child server state.

---

## 3. The buddies

Five characters. The child picks one during onboarding and can change it later.

| Buddy | Character | Voice |
|---|---|---|
| **Rex** | Dinosaur | `onyx` |
| **Bolt** | Robot | `echo` |
| **Pip** | Bunny | `nova` |
| **Luna** | Cat | `sage` |
| **Zibby** | Alien | `fable` |

### Seven poses each

Every buddy ships **7 expressions**, so the character can react rather than
just sit there:

| # | Pose | Used for |
|---|---|---|
| 1 | `standing` | Idle, at rest in the corner |
| 2 | `signature` | The character's own hallmark pose |
| 3 | `happy` | Menu open, general warmth |
| 4 | `excited` | Correct answers, celebration, end of book |
| 5 | `thinking` | While processing / waiting |
| 6 | `surprised` | Feature reveals during onboarding |
| 7 | `encouraging` | After a wrong answer — "try again" |

### How they're built — plain numbered PNGs

Deliberately the simplest thing that works:

```
assets/kids-buddies/<id>/<id>_1.png … <id>_7.png
```

**35 PNGs total.** No sprite sheets, no animation runtime, no 3D, no rigging.
The runtime just swaps the `src`. Motion comes from CSS (a gentle idle bob, a
pop when the buddy changes expression), which respects
`prefers-reduced-motion`.

**Why this matters for the future:** adding a sixth buddy is *dropping a folder
of 7 PNGs in place and adding one registry entry.* No pipeline, no tooling, no
code. That was the whole point — we wanted the cast to be cheap to extend before
we knew who the cast should be.

**This is open to change — tell us if you'd rather have something richer.**
The trade-off is honest:

- **PNGs (today)** — trivial to add, tiny, offline-safe, but expressions are
  fixed. No lip-sync, no in-between motion, no reaction we didn't pre-draw.
- **Layered/rigged (e.g. Rive, Lottie)** — real animation, lip-sync while
  speaking, blended emotions. Costs an animation runtime, an authoring pipeline,
  and a specialist to produce each character.
- **3D** — the richest, and by far the most expensive to produce, license and
  run on the low-end devices this programme targets.

Our recommendation is to **stay on PNGs until the interaction design settles**,
then invest in animation for a chosen cast. But if you already know you want
proper animated or 3D buddies, that changes the art commissioning schedule
significantly and we should decide now rather than later.

### Planned: let users add their own buddies

Today the roster is fixed at build time. We plan a **buddy library in Studio**:
an author uploads a name, 7 numbered PNGs and picks a voice preset, and that
buddy appears in every book they produce.

The runtime is already built for this — it accepts arbitrary image URLs and
falls back safely for buddy IDs it doesn't recognise, and the "Add buddy" tile
is already stubbed in the UI. The remaining work is the Studio-side library and
storage. Further out, the same mechanism could let a *teacher or child* add a
buddy, which is a much bigger conversation about moderation and safety.

---

## 4. The buddy talks to the child

The buddy speaks — actual audio, not just text bubbles.

- **Greets the child by name** on arrival
- **Confirms every action out loud** — "Okay! Now I read slowly, like a turtle."
- **Chats unprompted while reading**, at a randomised 45–90s gap, paused
  whenever narration plays or the menu is open, and switchable off
- **Narrates the whole onboarding**, so a pre-literate child is never stuck at a
  screen of text

All speech is **pre-generated into the book package** and plays offline. Lines
live in one shared registry, so a new line is written once and picked up by the
voice pipeline automatically.

---

## 5. The buddy reacts to quizzes and activities

When a child answers, the buddy appears beside **their own avatar** with a
spoken line — celebrating a win, or gently encouraging another try. This works
across every activity type, not just quizzes.

**Quizzes now answer on click.** Picking an option judges it immediately —
verdict, explanation, sound, buddy reaction and confetti all on one tap. The
Submit button is gone for quizzes; it returns as **Next** once everything is
right. For a 5-year-old, "choose, then find and press a second button" was a
step with no meaning.

Keyboard users keep a deliberate commit step: arrow keys browse the options
without judging (otherwise navigating would mark answers wrong), and Enter
commits.

Reaching the last page opens a **celebration screen** — the buddy and the
child's avatar together, the book's title, confetti and a spoken
congratulation.

---

## 6. The menu problem

The buddy's menu is where every tool lives, and the original was measurably
broken:

- **~50% of the actions were hidden** below the fold — at *every* screen size,
  including a 1440px desktop
- **No cue whatsoever** that more existed: no scrollbar, no fade, no arrow. The
  last visible card was simply sliced in half
- On a 1440px display it rendered as a **416px column**, ignoring the screen
- A flat list of 9–12 identical-looking rows, far too much for the age group
- Toggle labels that flipped between "Easy read on" / "Easy read off" — genuinely
  ambiguous about whether they describe the current state or the action

That earned a redesign. We built three, because the right answer wasn't obvious.

---

## 7. Design A — List

A grouped two-column popover. Actions sit under **Reading**, **How it looks**
and **My things**, each group with its own colour so a child can find an action
by hue before reading it.

Speed is a range slider from turtle to rabbit. Toggles are real switches with a
sliding knob and an On/Off label. "Meet my buddy again" — which restarts the
whole onboarding — is separated into a quiet footer.

**Everything fits with no scrolling** on desktop and tablet. Where it can still
overflow, a fade and a chevron appear.

---

## 8. Design B — Chat

The menu as a **conversation**. The buddy asks, and the child picks from at most
four large replies. Choosing a group drills in; a big arrowed **Go back**
returns. Transitions slide directionally and chips arrive staggered, so it reads
as a conversational turn.

**Lowest cognitive load of the three** — the child answers a question instead of
scanning a menu. The cost is that common actions take two taps instead of one.

---

## 9. Design C — Shelf

A **full-width dock** rising from the bottom edge. Three group columns spread
across the whole display on desktop; on a phone it becomes a bottom sheet with a
grab handle.

Uses horizontal space the corner popover wasted entirely, and its switch-style
toggles are the clearest state indicator of any design.

---

## 10. Comparison

Same book, same actions, measured live:

| | List | Chat | Shelf |
|---|---|---|---|
| Panel (1440×900) | 704 × 674 | 672 × 510 | full width |
| Actions visible at once | 9 | 3 | 12 |
| Scrolling needed | none | none | none |
| Controls under 44px | 0 | 0 | 0 |
| Off-screen controls | 0 | 0 | 0 |
| Taps to a common action | 1 | 2 | 1 |

All three pass the accessibility floor. The choice is about **feel**, which is
why we need your eyes rather than our measurements.

---

## 11. The avatar builder

Separate from the buddy: the child builds **themselves**. That avatar then
appears beside the buddy in activity reactions, on the celebration screen and in
the menu.

Built on **DiceBear's "adventurer" style**, rendered offline as SVG — no
network, no image requests, no per-child asset storage.

### What the child can change

| Part | Options |
|---|---|
| Skin tone | 7 |
| Hair style | 45 (26 long, 19 short) |
| Hair colour | 14 |
| Eyes | 26 |
| Eyebrows | 15 |
| Mouth | 30 |
| Glasses | 5 + none |
| Earrings | 6 + none |
| Features | freckles, blush, birthmark + none |
| Background | 7 |

**Over 361 million** base combinations, ~60 billion with accessories.

The builder is deliberately low-vision friendly: colours come first, a large
live preview, big tiles, icon-only section tabs with a sliding indicator, and a
shuffle button for children who'd rather not make ten decisions.

### Customising or replacing it

The part catalog is **data, not code** — one list per feature in a single shared
file. Practical consequences:

- **Narrowing it** (fewer, better-curated options) is deleting list entries
- **Regional appropriateness** — skin tone and hair colour palettes can be
  tuned per deployment without touching the builder
- **A different style entirely** — DiceBear ships many; swapping is a change of
  style plus catalog
- **Custom artwork** — the builder renders whatever the avatar layer produces,
  so a bespoke illustrated set could replace DiceBear with the same UI, if you'd
  rather the children looked hand-drawn like the buddies

Tell us if you'd like the option set curated, expanded, or redrawn.

---

## 12. Voices — and where they fall short

Generated with the **OpenAI speech API**, one clip per line per language, baked
into the book package and cached so regeneration is cheap. Each buddy has a
preset voice (`onyx`, `echo`, `nova`, `sage`, `fable`) plus a per-buddy style
instruction shaping delivery.

**The honest problem: customisation is poor.** These are *human* voices acting.
We can nudge tone with instructions, but we cannot make Bolt sound like an
actual robot or Zibby sound like an actual alien. A child meeting a robot that
sounds like a man doing a voice is a weaker illusion than the artwork deserves.

We're still looking for a better approach. The provider layer is already
abstracted (OpenAI, Azure and Gemini implementations exist), so swapping is a
contained change. **ElevenLabs** looks the most promising route to genuine
creature and robot timbre, including voice-design-from-description. That brings
a new API dependency and cost profile, so we'd want your view before committing.

**Coverage today:** voice packs exist for **2 languages**. The pipeline handles
any language; this is a cost and runtime question, not a technical one.

---

## 13. Known issues and missing features

Listed plainly so nobody files these as surprises.

### The buddy cannot say the child's name

The most conspicuous gap. The buddy *displays* "Hi Maya!" but **speaks** the
generic "Hi! Tap me if you need help." Names are unbounded and clips are
pre-generated offline, so there is no clip for "Maya".

Options, none free:
- Bake the most common regional names per locale (covers many children, not all)
- Splice a separately generated name clip into the greeting
- Use on-device speech for the name only — inconsistent voice, no offline guarantee

Given the whole design rests on a personal relationship with the buddy, we think
this is worth solving properly.

### No voice input

The child cannot *speak* to the buddy — everything is tap or keyboard. This is
the single most requested direction and the hardest to do well: it must work
**offline**, which rules out cloud speech recognition and makes browser speech
APIs unreliable across the devices this programme targets. We want to spike the
recognition path before committing to the feature.

### Also open

| Issue | Notes |
|---|---|
| **Kids interface is English-only outside en / pt-BR** | The book text translates; the buddy doesn't. Scheduled, not hard. |
| **No dark mode** | Cheapest real accessibility win on our list. |
| **Branch unmerged** | This build is a long-lived branch; nothing has landed yet. |
| **Ambient soundscapes** | Blocked: page turns are full document loads, so a background loop restarts every page. Needs soft navigation first. |
| **No page-turn animation** | Same root cause as above. |
| **Two menu designs untested** | Automated tests cover List; Chat and Shelf are verified by hand only. |

---

## 14. Accessibility commitments

What this build guarantees today:

- **Every control ≥ 44×44px**, verified automatically across all three menus
- **Nothing hidden without a cue** — anything scrollable shows a fade and chevron
- **`prefers-reduced-motion` respected** throughout; every animation has an inert path
- **Visible focus rings** on every interactive element
- **Toggles report state** via `aria-pressed`; command buttons deliberately don't
- **Keyboard reachable** end to end, including quizzes
- **Text comfort** — four text sizes and a dyslexia-friendly spaced font, applied to the book itself
- **No unsolicited audio** — buddy chatter and sound effects are both switchable off, and turning effects off never silences the story

Still open: a screen-reader pass with real users, and the deaf/hard-of-hearing
experience, which needs co-design rather than code.

---

## 15. What we plan next

Graded by impact against effort. **S** = days, **M** = 1–2 weeks, **L** = multi-week.

### Do first — high impact, low cost

| # | Item | Impact | Effort |
|---|---|---|---|
| 1 | **Merge the branch** | Critical | M |
| 2 | **Kids interface translations** (es, fr, sq, pt-BR) | Critical | S |
| 3 | **Lint + CI coverage for the runtime** | High | S |
| 4 | **Dark mode** | High | S–M |
| 5 | **Buddy coaching after repeated wrong answers** | High | S |
| 6 | **Tests for the Chat and Shelf menus** | High | S |

### Then

| # | Item | Impact | Effort |
|---|---|---|---|
| 7 | **Buddy speaks the child's name** | High | M — needs a strategy decision |
| 8 | **Soft page navigation** | High | M — unlocks page-turn animation, ambient audio and uninterrupted narration together |
| 9 | **Better voices (ElevenLabs)** | Medium | M |
| 10 | **Voice-pack coverage beyond 2 languages** | Medium | M — mostly cost |
| 11 | **Adaptive guidance** (stop repeating learned hints) | Medium | M |

### Larger / gated

| # | Item | Impact | Effort |
|---|---|---|---|
| 12 | **Custom buddies in Studio** (§3) | High | L |
| 13 | **Voice input** (§13) | Medium | M — spike offline recognition first |
| 14 | **Deaf / hard-of-hearing co-design** | High for that cohort | L — research-led |
| 15 | **Ambient soundscapes** | Low | M–L — needs #8 |
| 16 | **Stars and outfit rewards** | Low | L |

**Our recommendation:** land items 1–3 before building anything new. A
99-commit branch, a half-translated interface and no CI guard are a worse risk
than any missing feature. Items 4 and 5 on top of that give a complete enough
accessibility story for a pilot.

---

## 16. What we need from you

1. **Pick a menu design** — List, Chat or Shelf (§6–§10)
2. **Buddy art direction** — stay on PNGs, or commission animated/3D? (§3)
3. **Voice direction** — is the current quality acceptable for a pilot, or should we pursue ElevenLabs? (§12)
4. **Priority check** — does §15 match your ordering?
5. **Anything that feels wrong for the age group**, however small

Bugs are expected — please report them, but treat rough edges as rough edges
rather than decisions.
