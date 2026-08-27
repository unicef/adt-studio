import { useRef, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import type { StepAnimationProps } from "../contract"
import { spreads } from "../page-sequence"
import { Leaf } from "./Leaf"
import { LinkRow } from "./LinkRow"
import { PeerCursor } from "./PeerCursor"
import { useReaderMetrics } from "./reader-metrics"
import { RegisterFrame } from "./RegisterFrame"
import type { RegisterPhase } from "./phase-clock"

/**
 * I — Over the Spread.  *No chrome at all: the book, four readers, and a page turning under them.*
 *
 * The opposite end of the range from H. There is no window, no address field, no implied browser —
 * the open book fills the frame and the only interface in the picture is the four cursors on it.
 * The claim is quieter and more physical: this is your book, and people are in it.
 *
 * **The page turns during Opening, once.** The leaf whose front is the recto of the first spread
 * swings left on its gutter, and its *back* is the verso of the second — which is what the back of
 * that leaf actually is in a printed book, and the reason `spreads()` exists. Underneath, page
 * three is revealed on the right. The turn is a one-shot on the Opening transition and never
 * repeats: a book that kept turning pages through an unbounded Holding would be drawing reading
 * progress, and there is no progress here to draw.
 *
 * The cursors do **not** react to it. They browse on their own near-coprime clocks straight through
 * the turn, which is exactly what four real pointers do while the page under them moves — and it is
 * the detail that stops the turn reading as something the animation is doing *to* them.
 *
 * **Where the eye ends up.** The readers never converge. Instead the whole spread lifts six pixels
 * and steps out of the way, and the row comes out from behind it into the space it vacated, with
 * the ring pulsing at its rect and Copy landing last. The artwork physically making room is a
 * stronger handover than the artwork merely becoming less interesting, and the final motion is on
 * the row itself.
 *
 * Reduced motion: the turn angle, the lift and the row's travel are all multiplied by `--reg-on`,
 * so the still is the first spread, flat and unturned, with four cursors parked on it and the link
 * present beneath. Nothing is caught mid-swing.
 */
export function OverTheSpread({
  pages,
  aspect,
  spread,
  className,
  phase,
  shareUrl = null,
}: StepAnimationProps & {
  /** Derived from the run — see `useRegisterPhase`. */
  phase: RegisterPhase
  /** The real link, once the run has one. Hidden until `arrived`, so a placeholder shows never. */
  shareUrl?: string | null
}) {
  return (
    <RegisterFrame className={cn("pubreg-i", className)} phase={phase}>
      {(resolved) => (
        <OverTheSpreadBody
          phase={resolved}
          pages={pages}
          aspect={aspect}
          spread={spread}
          shareUrl={shareUrl}
        />
      )}
    </RegisterFrame>
  )
}

function OverTheSpreadBody({
  phase,
  pages,
  aspect,
  spread,
  shareUrl,
}: {
  phase: RegisterPhase
  pages: readonly string[]
  aspect: number
  spread: boolean
  shareUrl: string | null
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const metrics = useReaderMetrics(bodyRef, aspect, "spread")
  /* For a spread book each pair is one merged render split back into its halves, so the open book
     is genuinely one opening of the scan — merged, as the layout rule asks. */
  const pairs = spreads(pages, spread)
  /* Two real facing pairs, and the mechanics between them are the point: turning the first pair's
     recto leftwards puts *its own back* — the second pair's verso — over the left page, and uncovers
     the second pair's recto on the right. Any other assignment draws a turn that could not happen. */
  const first = pairs[0]
  const second = pairs[1]

  return (
    <div ref={bodyRef} className="pubreg-i-body" style={metrics as CSSProperties}>
      <span className="pubreg-ring" aria-hidden="true" />

      <div className="pubreg-i-art" aria-hidden="true">
        <span className="pubreg-i-spread">
          <span className="pubreg-i-leaf pubreg-i-leaf--verso">
            <Leaf src={first?.verso?.src} half={first?.verso?.half} kind="page" seed={0} />
          </span>
          <span className="pubreg-i-leaf pubreg-i-leaf--recto">
            <Leaf src={second?.recto?.src} half={second?.recto?.half} kind="page" seed={2} />
          </span>

          <span className="pubreg-i-turn">
            <span className="pubreg-i-face pubreg-i-face--front">
              <Leaf src={first?.recto?.src} half={first?.recto?.half} kind="page" seed={1} />
            </span>
            <span className="pubreg-i-face pubreg-i-face--back">
              <Leaf src={second?.verso?.src} half={second?.verso?.half} kind="page" seed={0} />
            </span>
          </span>

          <span className="pubreg-i-gutter" />
        </span>

        {/* Outside the spread, not inside it. The spread is a 3D rendering context — it has to be,
            for the leaf to turn — and inside one, painting order is depth order: `z-index` stops
            applying and the turned leaf, which ends up nearer the viewer than a flat overlay, ate
            the two cursors on the left page entirely. As a sibling the layer is composited after
            the whole spread, which is also how the shipped overlay works: it is fixed above the
            content, not part of it. */}
        <span className="pubreg-i-peers">
          <PeerCursor index={0} />
          <PeerCursor index={1} />
          <PeerCursor index={2} />
          <PeerCursor index={3} />
        </span>
      </div>

      <div className="pubreg-i-sleeve">
        <LinkRow revealed={phase === "arrived"} url={shareUrl} />
      </div>
    </div>
  )
}
