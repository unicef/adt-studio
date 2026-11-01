import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

/**
 * One page of the author's book, or paper when there is none.
 *
 * Shared by the two options that use real pages, so that the degradation is written once. The
 * contract says `pages` can be empty — a book whose renders were never made, or the gallery with no
 * book selected — and the rule is that the art degrades to paper, never to nothing. A slab on its
 * own is not paper though: it is a grey rectangle. The well and the four rules of unequal length are
 * what make it read as a page seen too small to read, and the unequal lengths are the whole trick,
 * because rules of matching width are the tell that made every skeleton screen look like a skeleton
 * screen.
 *
 * No `loading="lazy"`: these are 46-unit cards drawn from URLs the gallery has already fetched, and
 * a lazy decode would land mid-gesture.
 */
export function PaperCard({
  src,
  half,
  className,
  style,
}: {
  src?: string
  /** One page cropped back out of a spread book's merged render: the image draws at twice the
   *  card's width and `.pkg-paper`'s own `overflow: hidden` does the cutting. */
  half?: "left" | "right"
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={cn("pkg-paper", className)} style={style}>
      {src ? (
        <img
          src={src}
          alt=""
          decoding="async"
          className="pkg-paper-img"
          style={half ? { width: "200%", marginLeft: half === "right" ? "-100%" : 0 } : undefined}
        />
      ) : (
        <>
          <span
            className="pkg-paper-well"
            style={{ left: "12%", top: "9%", width: "76%", height: "34%" }}
          />
          {PAPER_RULES.map((rule) => (
            <span
              key={rule.top}
              className="pkg-paper-rule"
              style={{ left: "12%", top: rule.top, width: rule.width }}
            />
          ))}
        </>
      )}
    </div>
  )
}

const PAPER_RULES = [
  { top: "52%", width: "76%" },
  { top: "64%", width: "68%" },
  { top: "76%", width: "76%" },
  { top: "88%", width: "44%" },
] as const
