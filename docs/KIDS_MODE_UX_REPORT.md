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
3. **Does our plan for what comes next make sense to you?** (§14)

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

The builder is deliberately low-vision friendly: colours come first, a large
live preview, big tiles, icon-only section tabs with a sliding indicator, and a
shuffle button for children who'd rather not make ten decisions.

### The library, and the other styles available

We render with **DiceBear**, an open avatar library. We chose its *Adventurer*
style, but the same library ships **31 styles** — all already installed, so
switching is a change of style name and part catalog, not a new dependency.

| Style | Character |
|---|---|
| **Adventurer** *(in use)* | Illustrated, friendly, wide feature range |
| **Avataaars** | The familiar flat-vector look; very large part catalog |
| **Micah** | Clean, modern, softer palette |
| **Dylan** | Bold, simple shapes, few but strong options |
| **Big Ears** | Playful and cartoonish, reads well small |
| **Lorelei** | Hand-drawn, delicate line work |
| **Open Peeps** | Sketchy, hand-illustrated, very characterful |
| **Notionists** | Minimal line-art |
| **Personas** | Rounded, corporate-friendly |
| **Pixel Art** | Retro game sprites |
| **Bottts** | Robots — a possible route for *buddies*, not just child avatars |
| **Fun Emoji** | Expressive faces, no body |

Worth a look together: *Adventurer* was a reasonable first pick rather than a
researched one, and a style like *Open Peeps* or *Big Ears* may sit better
beside hand-illustrated buddies and storybook art. Two styles (**Bottts** for
robots, **Fun Emoji** for faces) could also give us buddy characters from the
same library.

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

Given the whole design rests on a personal relationship with the buddy, we think
this is worth solving properly.

### No voice input

The child cannot *speak* to the buddy — everything is tap or keyboard. This is
the single most requested direction and the hardest to do well: it must work
**offline**, which rules out cloud speech recognition and makes browser speech
APIs unreliable across the devices this programme targets. We want to spike the
recognition path before committing to the feature.

### Also open

**No dark mode yet.** A low-stimulation theme is something we'd like to add for
children who find the bright sky palette tiring.

---

## 14. Ideas for what comes next

Not a committed roadmap — this is what's on our minds, shared so you can tell us
what sounds right, what sounds wrong, and what we've missed.

### Things we think are close

**Interface translations.** The book text translates today, but the buddy's own
words only exist in a couple of languages. Everything is in place to fix it.

**Dark mode.** A calmer, low-stimulation theme for children who find the bright
sky palette tiring.

**A buddy who coaches.** After a couple of wrong answers, the buddy could offer a
hint rather than just encouraging another try. The explanations already exist in
the book — the buddy simply isn't using them yet.

### Things we'd like to solve properly

**The buddy saying the child's name.** The gap that bothers us most. It needs a
real approach rather than a quick patch, and we have a few ideas we'd like to
talk through.

**Turning pages more smoothly.** Right now each page is a fresh page load. If the
reader swapped pages in place instead, we'd get a page-turn animation, background
ambience, and read-aloud that doesn't stop at the page edge — all from one change.

**Better voices.** Covered in §12. The most interesting question here is whether
believable creature and robot voices are worth a new provider.

### Bigger, further out

**Letting people add their own buddies** (§3) — the natural next step for
personalisation, and the piece we're most curious whether you want.

**Talking to the buddy.** Children speaking to the buddy rather than tapping.
Genuinely hard to do offline, so we'd want to test the idea before promising it.

**A sign-forward experience for deaf and hard-of-hearing children.** This one we
don't think we should design alone — it needs co-design with the children it's
for.

**Small delights** — earning things, decorating your buddy, ambient soundscapes.
Fun, and firmly behind everything above.
