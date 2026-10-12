import type { CSSProperties } from "react"
import type { StepAnimationProps } from "../contract"
import { unitSequence, type PageSlot } from "../page-sequence"
import { DrawnPage } from "./DrawnPage"
import { FitBox, PageFace } from "./FitBox"
import { PAPER } from "./palette"

const DESIGN = { width: 400, height: 200 }

/**
 * The box a page is fitted inside, rather than the page's own size.
 *
 * The old constant was `84 × 112` — 3:4, a textbook — and every position in this drawing was laid
 * out against it. A picture book for five-year-olds is very often square or landscape, and a 3:4
 * card drawn around a landscape page either letterboxes it or crops the illustration, which is the
 * entire content of the page. So the card is the book's own trim size, fitted into a bounding box
 * that both piles are guaranteed to sit inside.
 *
 * The bound on *width* is what keeps the two piles from colliding — a landscape card is much wider
 * relative to its height, and a card free to grow sideways would close the 146-unit corridor the
 * sheet travels down. The bound on *height* is what keeps a tall book from pushing the apex of the
 * throw out through the top of the frame. 84 × 132 is chosen so that at 3:4 the width binds and the
 * card comes out at exactly the 84 × 112 this animation was composed at: the chosen design is
 * unchanged for a portrait book, and only bends for the books it was wrong for.
 */
const CARD_BOX = { width: 84, height: 132 }
const CARD_RADIUS = 3
/** Five cards per pile, forever, whatever the book's length. See the honesty note below. */
const DEPTH = 5

/**
 * The two piles by their *centres*, not their corners.
 *
 * Corners were the trap. Anchoring a pile by its top-left means every change in card size moves the
 * pile, and the sheet's travel — a single hard-coded `translateX` in the stylesheet — silently stops
 * matching where the far pile actually is. Centres are invariant: both piles shift inward by the
 * same half-width when the card narrows, so the distance between the sheet's start and the top card
 * of the output pile stays exactly 229.4 at every aspect, and the keyframes never have to know the
 * shape of the book.
 *
 * The values are the old layout's centres to the unit — 42 + 84/2 and 272 + 84/2, 52 + 112/2 and
 * 38.5 + 112/2 — so a 3:4 book renders pixel-identically to before.
 */
const SOURCE = { x: 84, y: 108 }
const OUTPUT = { x: 314, y: 94.5 }
/** Where the sheet sits when it is at rest: one slot above the top of the source pile. */
const SHEET = { left: 3, top: -7.5 }

interface Card {
  width: number
  height: number
  /** The vertical arc, as a multiple of the height it was authored against. See `--pe-a-lift`. */
  lift: number
}

/**
 * The card, resolved against the book.
 *
 * `lift` exists because the throw is authored in design pixels — an 18px apex over a 112px card —
 * and 18px over a 42px landscape card is a card being lobbed rather than passed. Scaling the arc
 * with the card keeps the *gesture* constant instead of the number. Clamped at both ends: below
 * 0.45 the arc stops reading as a throw at all, and above 1.1 the apex of a tall book's sheet
 * leaves the top of the 200-unit frame.
 */
function cardFor(aspect: number): Card {
  const width = Math.min(CARD_BOX.width, CARD_BOX.height * aspect)
  const height = width / aspect
  return { width, height, lift: Math.min(1.1, Math.max(0.45, height / 112)) }
}

/** 0.6px right and 1.5px up per card. Cards squared to the pixel read as a printed block. */
function offset(index: number) {
  return { x: index * 0.6, y: index * -1.5 }
}

/* The sheet is frozen at 65% of its traverse when motion is off, so these are the values the
   reduced-motion frame is composed around. They are base CSS, not a keyframe: the shipped rule
   zeroes every duration with `!important`, so nothing can be held by `fill-mode`. The vertical
   parking height rides on `lift` for the same reason the arc does. */
const PARKED = { x: 149.1, y: -16, rotate: -0.2, scale: 1.026 }

function Crest() {
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{ height: 1, background: PAPER.crest }}
    />
  )
}

/**
 * A card in a pile: one flat baked shadow that is never animated, and a 1px top edge.
 *
 * The shadow is baked because a pile of five cards each with a live shadow is five layers being
 * re-rasterised for a move none of them make. Only the sheet in flight gets a shadow that changes,
 * and it gets it as its own element.
 */
function PileCard({ tone = PAPER.slab, edge = PAPER.slabEdge }: { tone?: string; edge?: string }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        borderRadius: CARD_RADIUS,
        background: `linear-gradient(163deg, ${tone} 0%, ${edge} 100%)`,
        boxShadow: `0 1px 1.5px ${PAPER.cast}, 0 3px 7px ${PAPER.castWide}`,
        outline: `1px solid ${PAPER.border}`,
        outlineOffset: -1,
      }}
    >
      <Crest />
    </div>
  )
}

/**
 * The page a card is showing, as a stack of cross-fading faces on one shared 13.2s cycle.
 *
 * Used in both places that show the page, and that is the whole point: the source card and the
 * sheet leaving it must show the *same* page at every instant, because two identical pages on
 * screen at once is the only thing that reads as a **copy**. Give them independent cycles and they
 * drift, and the moment they differ the animation is depicting a book being dealt out, not copied.
 *
 * Three faces rather than one so the loop does not repeat identically until its fourth pass; with
 * one or two renders available they double up, which costs a rhythm and nothing else.
 */
function PageRider({
  rides,
  height,
}: {
  rides: readonly PageSlot[] | null
  height: number
}) {
  if (!rides) return <DrawnPage height={height} />

  return (
    <>
      {rides.map((slot, index) =>
        /* A null slot is the blank leaf the page-order rule inserts after the cover. Rendering
           nothing is correct: the paper of the card underneath *is* a blank page. */
        slot === null ? null : (
          <PageFace
            key={index}
            src={slot.src}
            half={slot.half}
            style={{
              opacity: index === 0 ? 1 : 0,
              animation: `pe-a-page 13.2s ${index * -4400}ms infinite`,
            }}
          />
        ),
      )}
    </>
  )
}

/**
 * **A — Sheet Feed.** A page is copied: the original stays on the source pile, an identical sheet
 * lifts off it, travels, and settles onto the finished pile.

 * The source card holds the real page for the whole run and the sheet leaving it shows the *same*
 * page. That is the difference between copying and moving, and it is the entire point of the step —
 * a sheet that departs from a blank slab and acquires content in the air is depicting a page being
 * built or dealt out, not duplicated.
 *
 * Everything that makes this feel authored is not the traverse. It is the 200ms of anticipation
 * with a 1.5° tilt before anything moves sideways; the shadow spreading and thinning as the sheet
 * climbs, whose absence is exactly what makes a moving card look pasted on; a 2px settle on
 * landing; and 350ms of follow-through in the pile that was left behind, which nobody notices and
 * everybody feels. The horizontal drive and the vertical arc are on separate elements so the
 * traverse keeps one mechanical curve while the throw keeps a real apex.
 *
 * The cards are the book's own shape. See `CARD_BOX` — a landscape page in a portrait card is
 * either letterboxed or cropped, and cropping is not an option when the illustration *is* the page.
 *
 * Honesty: both piles are five cards deep for the entire run and neither ever gains or loses one.
 * The sheet does not join the output pile — it *becomes* its top card by crossfading into a face
 * that was always there, and the source keeps its page rather than surrendering it. Nothing on
 * screen can be counted, and nothing trends toward a finish, which is correct for a step that
 * reports no progress at all.
 */
export function SheetFeed({ pages, aspect, spread }: StepAnimationProps) {
  /* A spread book's unit is the merged facing pair, so its sheets are spread-shaped — twice the
     page's aspect, under the same clamp the aspect itself arrives with. */
  const card = cardFor(spread ? Math.min(2, aspect * 2) : aspect)
  /* Three riders on a 13.2s cycle: the loop is 4.4s, so the piece does not repeat identically
     until the fourth pass. With one or two renders available the layers double up, which costs a
     rhythm and nothing else. */
  /* Units in reading order — never raw indexing, per the decided page-order rule. For a spread
     book the single-shaped cover is left off the copier: it would be centre-cropped into a
     spread-shaped card, and a mangled cover is worse than no cover on a step about body pages. */
  const sequence = unitSequence(pages, spread)
  const pool = spread ? sequence.slice(1) : sequence
  const rides = pool.length > 0 ? [0, 1, 2].map((index) => pool[index % pool.length] ?? null) : null

  const pile = { width: card.width, height: card.height }

  return (
    <FitBox width={DESIGN.width} height={DESIGN.height}>
      {/* Output pile — resolved paper, breathing 800ms out of phase with the source so the two
          never pulse together. Its top face carries a real page at 18% and desaturated, which is
          enough for the sheet to dissolve into something rather than into nothing, and far too
          faint for anybody to read an identity off it. */}
      <div
        className="absolute"
        style={{
          left: OUTPUT.x - card.width / 2,
          top: OUTPUT.y - card.height / 2,
          ...pile,
          animation: "pe-a-breath 2.4s cubic-bezier(.4,0,.6,1) -800ms infinite",
        }}
      >
        {Array.from({ length: DEPTH }, (_unused, index) => {
          const slot = offset(index)
          const top = index === DEPTH - 1
          return (
            <div
              key={index}
              className="absolute inset-0"
              style={{ transform: `translate(${slot.x}px, ${slot.y}px)` }}
            >
              <PileCard tone={top ? PAPER.face : PAPER.pileDeep} edge={PAPER.faceEdge} />
              {top ? (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ borderRadius: CARD_RADIUS, opacity: 0.18, filter: "saturate(.35)" }}
                >
                  {rides && rides[0] !== null ? (
                    <PageFace src={rides[0].src} half={rides[0].half} />
                  ) : (
                    <DrawnPage height={card.height} />
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Source pile, plus the sheet, which is a child of it so that the two share the breath and
          the sheet does not drift by a pixel against the card underneath it while at rest. */}
      <div
        className="absolute"
        style={{
          left: SOURCE.x - card.width / 2,
          top: SOURCE.y - card.height / 2,
          ...pile,
          animation: "pe-a-breath 2.4s cubic-bezier(.4,0,.6,1) infinite",
        }}
      >
        {Array.from({ length: DEPTH }, (_unused, index) => {
          const slot = offset(index)
          const top = index === DEPTH - 1
          return (
            <div
              key={index}
              className="absolute inset-0"
              style={{ transform: `translate(${slot.x}px, ${slot.y}px)` }}
            >
              {/* The relax rides on an inner element so the pile's static stacking offset stays
                  static; the stagger runs from the top of the pile downward. */}
              <div
                className="absolute inset-0"
                style={{
                  animation: `pe-a-relax 4.4s cubic-bezier(.22,1,.36,1) ${(DEPTH - 1 - index) * 60}ms infinite`,
                }}
              >
                <PileCard />
                {top ? <PageRider rides={rides} height={card.height} /> : null}
              </div>
            </div>
          )
        })}

        <div
          className="absolute"
          style={{
            left: SHEET.left,
            top: SHEET.top,
            ...pile,
            transform: `translateX(${PARKED.x}px) rotate(${PARKED.rotate}deg) scale(${PARKED.scale})`,
            animation:
              "pe-a-sheet-x 4.4s cubic-bezier(.45,0,.25,1) infinite, pe-a-sheet-fade 4.4s linear infinite",
          }}
        >
          <div
            className="absolute inset-0"
            style={
              {
                "--pe-a-lift": card.lift,
                transform: `translateY(${PARKED.y * card.lift}px)`,
                animation: "pe-a-sheet-y 4.4s cubic-bezier(.4,0,.6,1) infinite",
              } as CSSProperties
            }
          >
            {/* Pre-baked: the blur is set once and only opacity and scale are animated. A shadow
                that scales up as it fades is the only altitude cue in the picture.

                The cast's downward offset lives on the wrapper because `pe-a-shadow` declares a
                whole `transform`, and a keyframe that sets `transform: scale()` would silently
                drop a `translateY` written alongside it. */}
            <div
              className="absolute inset-0"
              style={{ transform: `translateY(${7 * card.lift}px)` }}
            >
              <div
                className="absolute inset-0"
                style={{
                  borderRadius: CARD_RADIUS + 3,
                  background: PAPER.shadow,
                  filter: "blur(7px)",
                  transform: "scale(1.13)",
                  opacity: 0.07,
                  animation: "pe-a-shadow 4.4s cubic-bezier(.4,0,.6,1) infinite",
                }}
              />
            </div>

            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                borderRadius: CARD_RADIUS,
                background: `linear-gradient(163deg, ${PAPER.face} 0%, ${PAPER.faceEdge} 100%)`,
                outline: `1px solid ${PAPER.border}`,
                outlineOffset: -1,
              }}
            >
              <PageRider rides={rides} height={card.height} />

              <Crest />
            </div>
          </div>
        </div>
      </div>
    </FitBox>
  )
}
