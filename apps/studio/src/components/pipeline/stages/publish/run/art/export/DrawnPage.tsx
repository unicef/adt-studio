import { cn } from "@/lib/utils"
import { PAPER, WELL } from "./palette"

/**
 * A page drawn in CSS.
 *
 * It is the fallback whenever `pages` is empty — a book with no renders is a real case, and the art
 * has to degrade to *paper*, not to blank.
 *
 * The text lines are a repeating gradient of short runs rather than solid bars, and that single
 * decision is what keeps this out of skeleton-screen territory: a solid bar of light grey is a
 * placeholder, a row of ink-weight word shapes with ragged line lengths is type. Line widths are
 * 100/94/97/88/96/62% — uniform widths are what make skeletons look fake, and the short last line
 * is the strongest single cue that this is a paragraph.
 *
 * Every internal dimension is a proportion of the height it is given, and the height it is given
 * comes from the book's own trim size, so the drawn page is the same shape as a real one. Nothing
 * here is a fixed pixel value that a landscape card would have to letterbox around.
 */
export function DrawnPage({
  height,
  className,
}: {
  /** The page's rendered height in design pixels. Every internal dimension is derived from it. */
  height: number
  className?: string
}) {
  /* Word run sized off the page, not off a fixed px value: the same component draws a 112-unit
     portrait card and a 42-unit landscape one, and a 6px word on a 42px card is a brick. */
  const word = Math.max(1.5, height * 0.03)
  const gap = Math.max(0.7, word * 0.4)
  const lines = [1, 0.94, 0.97, 0.88, 0.96, 0.62]

  return (
    <div
      className={cn("absolute inset-0", className)}
      style={{ background: `linear-gradient(160deg, ${PAPER.face} 0%, ${PAPER.faceEdge} 100%)` }}
    >
      <div
        className="absolute rounded-full"
        style={{
          left: "10%",
          top: "6.5%",
          width: "24%",
          height: `${height * 0.014}px`,
          background: PAPER.warm,
          opacity: 0.55,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "10%",
          top: "9.5%",
          width: "70%",
          height: `${height * 0.046}px`,
          backgroundImage: `repeating-linear-gradient(90deg, ${PAPER.ink} 0 ${word * 2.1}px, transparent ${word * 2.1}px ${word * 2.1 + gap * 1.6}px)`,
          opacity: 0.92,
        }}
      />

      {/* The picture. Cool against all that paper so it reads as an illustration rather than as
          another block of text, and off-centre marks inside it so it is not an empty rectangle. */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: "10%",
          top: "17.5%",
          width: "80%",
          height: "28.5%",
          borderRadius: `${Math.max(1, height * 0.012)}px`,
          background: `linear-gradient(150deg, ${WELL.from} 0%, ${WELL.to} 100%)`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(60% 70% at 26% 74%, ${WELL.markA} 0%, transparent 62%), radial-gradient(42% 52% at 72% 34%, ${WELL.markB} 0%, transparent 66%)`,
          }}
        />
      </div>

      {lines.map((ratio, index) => {
        /* Word width jittered per line, so six lines do not stack into a vertical comb. */
        const run = word * (0.82 + ((index * 7) % 5) / 12)
        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: "10%",
              top: `${(0.525 + index * 0.052) * 100}%`,
              width: `${0.8 * ratio * 100}%`,
              height: `${height * 0.019}px`,
              backgroundImage: `repeating-linear-gradient(90deg, ${PAPER.ink} 0 ${run}px, transparent ${run}px ${run + gap}px)`,
            }}
          />
        )
      })}

      <div
        className="absolute"
        style={{
          left: "10%",
          top: "87.5%",
          width: "38%",
          height: `${height * 0.014}px`,
          backgroundImage: `repeating-linear-gradient(90deg, ${PAPER.inkSoft} 0 ${word * 0.7}px, transparent ${word * 0.7}px ${word * 0.7 + gap}px)`,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "10%",
          top: "90.5%",
          width: "22%",
          height: `${height * 0.014}px`,
          backgroundImage: `repeating-linear-gradient(90deg, ${PAPER.inkSoft} 0 ${word * 0.7}px, transparent ${word * 0.7}px ${word * 0.7 + gap}px)`,
        }}
      />
    </div>
  )
}
