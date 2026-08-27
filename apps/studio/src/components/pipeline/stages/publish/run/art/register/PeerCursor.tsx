import { cn } from "@/lib/utils"

/**
 * Somebody else, reading your book — drawn the way the shipped reader already draws them.
 *
 * This is not an invented multiplayer trope. `PeerCursors.tsx` in `@adt/runtime` is live: a share
 * link is opened by several people and each one's pointer shows up on the page as a coloured arrow
 * flying a flag with their name, plus an edge marker for anyone reading further down. So the
 * artwork echoes that vocabulary deliberately — the same arrow path, the same
 * `3px 12px 12px 12px` flag (sharp where it meets the arrow, round elsewhere, so it reads as flown
 * *from* the cursor rather than as a bubble drifting beside it), the same edge marker with its tail
 * pointing off-screen. Not imported, because that component is a fixed-position overlay wired to
 * presence atoms and a resolved anchor engine; this is a 400×200 miniature of what it produces.
 *
 * **These have to read as different people**, which is the requirement four grey avatar glyphs in a
 * row would fail. Distinctness comes from four independent axes, none of which is a glyph:
 *
 * 1. **A different hue** — the Studio's presence palette, one person one colour, the same rule the
 *    real cursors and the feedback pins already follow.
 * 2. **A different name, and therefore a different label width.** "Ana" is a third of "Beatriz".
 *    Width is the axis doing the work: even where the type is too small to read, four flags of four
 *    lengths say four names, and there is nothing to translate — these are sample names, not copy.
 * 3. **A different arrow size**, 0.84× to 1.12×, because pointer sizes differ with zoom and device.
 * 4. **A different speed.** Every cursor drifts on its own pair of near-coprime periods (7, 11, 13,
 *    23, 31, 41 seconds), so no two ever agree and the group never falls into step.
 *
 * The names are decorative and the whole artwork is `aria-hidden`; nothing here is announced.
 */
const ARROW = "M2 1.5 L2 14 L5.6 10.6 L8.2 16 L10.6 14.9 L8 9.7 L13 9.7 Z"

/** The right-hand tail from the shipped overlay: long side against the pill, point away from it. */
const TAIL_RIGHT = "M9 7 L0 14 L0 0 Z"

/**
 * Four sample readers.
 *
 * Short, neutral first names of deliberately unequal length. They carry no meaning and are never
 * translated — a locale that renamed them would only change how wide four coloured flags are.
 * Hue, arrow size and drift period live in the stylesheet against `data-peer`, keyed by the same
 * index, so a person is one row here and one block there.
 */
export const PEERS = [{ name: "Ana" }, { name: "Mateus" }, { name: "Yuki" }, { name: "Beatriz" }] as const

export type PeerIndex = 0 | 1 | 2 | 3

/**
 * One peer's pointer, placed by `--p-x` / `--p-y` in the variant's stylesheet.
 *
 * Three nested spans rather than one, and the nesting is load-bearing: the outer span carries the
 * *phase* (arriving, leaning toward the link row), the middle and inner ones carry the two ambient
 * drift axes. Compose them onto one element and the arrival transition would fight two infinite
 * animations for the same `transform`, which is the bug where a cursor jumps back to its drift
 * position halfway through the handover.
 */
export function PeerCursor({ index, className }: { index: PeerIndex; className?: string }) {
  return (
    <span className={cn("pubreg-peer", className)} data-peer={index}>
      <span className="pubreg-peer-x">
        <span className="pubreg-peer-y">
          <svg className="pubreg-peer-arrow" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d={ARROW}
              fill="currentColor"
              stroke="#ffffff"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="pubreg-peer-flag">{PEERS[index].name}</span>
        </span>
      </span>
    </span>
  )
}

/**
 * A peer who is reading somewhere you cannot see, parked against an edge with their tail pointing
 * out of the frame.
 *
 * The shipped overlay draws exactly this, and it is the detail that makes the miniature a promise
 * rather than a decoration: a share link does not put everybody on the same page, and the reader UI
 * already says so. It is also the cheapest way to imply "and others" without drawing a fifth arrow
 * the composition has no room for.
 */
export function PeerEdgeMarker({ index, className }: { index: PeerIndex; className?: string }) {
  return (
    <span className={cn("pubreg-peer-edge", className)} data-peer={index}>
      <span className="pubreg-peer-flag pubreg-peer-flag--edge">{PEERS[index].name}</span>
      <svg className="pubreg-peer-tail" viewBox="0 0 9 14" aria-hidden="true">
        <path d={TAIL_RIGHT} fill="currentColor" />
      </svg>
    </span>
  )
}
