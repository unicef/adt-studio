import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import type { StepAnimationProps } from "../contract"
import { stackedSequence } from "../page-sequence"
import { PaperCard } from "./paper"

/**
 * Seven loose cards, and where each one lies before the gather.
 *
 * Authored by hand rather than generated, for two reasons. The composition has to be legible at
 * 160×160 — cards must not stack on top of each other in the scatter, or the arrival has nothing to
 * arrive from — and the *distances* have to be unequal. Seven cards travelling the same distance in
 * the same time is a tween of seven rectangles; card six moves 27 units and card five moves 112, so
 * the field arrives with visibly different speeds under one shared curve.
 *
 * Rotations stay inside ±9°. Beyond that the scatter stops being pages set down on a desk and
 * becomes a fan, and a fan of thumbnails with shadows is a sticker collage.
 */
const SCATTER = [
  { x: -110, y: -36, r: -8 },
  { x: -58, y: 40, r: 6 },
  { x: 6, y: -44, r: 3.5 },
  { x: 72, y: 34, r: -5 },
  { x: 110, y: -20, r: 9 },
  { x: -22, y: -10, r: -2.5 },
  { x: 46, y: 14, r: 4.5 },
] as const

/**
 * **A — The Gather.** Loose pages collapse into one squared stack, and then the artwork is still for
 * the rest of the step.
 *
 * The seven cards are the *same nodes* for the whole run. In the shipped screen they are the ones
 * step 1 already put on screen and the ones step 3 lifts away; nothing mounts at the step boundary
 * and nothing unmounts, which is the only reason a step that can finish in 900ms cannot flash. The
 * shot is 780ms, so at 900ms it has finished; cut early, step 3 lifts the stack from wherever it is,
 * because an interrupted transform is truncated rather than reset.
 *
 * Seven regardless of whether the book is twelve pages or four hundred, all seven on screen before
 * the step begins, and the stagger tight enough that they overlap. Cards landing one after another
 * with gaps between them is a count, and the stream carries no count at this step.
 *
 * The leaves are laid bottom-first so the **cover finishes on top**, with one blank beneath it — a
 * stack whose top leaf is page seven is a book somebody dropped face-down.
 */
export function GatherStack({ pages, aspect, spread, className }: StepAnimationProps) {
  /* Leaves, not units: a stack is the closed book, and a closed spread book is a pile of single
     pages — each merged render contributes its two halves, and the cards keep the page's shape. */
  const leaves = stackedSequence(pages, SCATTER.length, spread)

  return (
    <div aria-hidden="true" className={cn("pkg-scope", className)}>
      <div className="pkg-art pkg-art--a">
        <div className="pkg-a-stack" style={{ "--page-aspect": aspect } as CSSProperties}>
          {SCATTER.map((card, index) => (
            <div
              key={index}
              className="pkg-a-card"
              style={
                {
                  "--i": index,
                  "--sx": card.x,
                  "--sy": card.y,
                  "--sr": card.r,
                } as CSSProperties
              }
            >
              <PaperCard src={leaves[index]?.src} half={leaves[index]?.half} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
