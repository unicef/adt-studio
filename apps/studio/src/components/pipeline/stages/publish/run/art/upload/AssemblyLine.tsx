import type { CSSProperties } from "react"
import type { StepAnimationProps } from "../contract"
import { unitSequence, type PageSlot } from "../page-sequence"
import { UploadFrame } from "./UploadFrame"
import { CHANNEL, clamp } from "./upload-common"
import { useUploadChannel } from "./useUploadChannel"

/**
 * **The Assembly Line.** The author's pages ride a factory belt — Modern Times, in paper. They
 * come in from off-frame, pass behind the sending machine, and come out the other side carrying a
 * stamped seal, off into warm light at the edge of the frame.
 *
 * The belt is *one physical clock*: pages, strap texture and roller rims all move at the same
 * 26px/s, which is what makes it a machine rather than three animations. It runs on the ambient
 * clock and it NEVER stops — not even in a stall, which is both the law (ambient never freezes)
 * and the Chaplin joke (the line does not care). The truth lives elsewhere: the machine's sight
 * glass, a boiler-gauge tube whose blue level is the aggregate, written inline and transitioned
 * over the channel's 900ms. A stall holds the level and cools the light; the belt churns on.
 *
 * Honesty: no page on the belt means "a file just landed" — arrivals on the wire never touch the
 * belt, whose rhythm is fixed forever. The seal appears while the page is hidden inside the
 * machine, on the page's own ride clock, so per-item change is clock-driven and nothing ever
 * flashes on screen. The pages loop forever and nothing about them can be counted toward a finish;
 * only the glass fills.
 *
 * The one deliberate deviation from the coprime-period set: the strap texture (1.92s) and roller
 * rotation (2.41s) are short periods *derived from the belt speed*, not chosen as rhythms. They
 * are continuous uniform motion — the case the quality bar explicitly exempts for conveyors —
 * and a texture loop whose travel equals its repeat length has no seam and no beat.
 */

const DESIGN = { width: 400, height: 240 }

/** The belt's surface line, and the speed everything on it shares. */
const BELT_TOP = 168
/* The ride runs far past the design box on both sides — the scene is not a slot, it is the page's
 * own machinery, clipped only by the card it sits in. Pages must therefore enter and leave beyond
 * anything the widest card can show, or they pop into existence over a visible belt. Speed is held
 * at the same 26px/s; only the journey got longer. */
const RIDE_S = 40
const TRAVEL = 1040
const ENTER = -320

/** The machine straddles the belt here; a page is fully hidden while inside. */
const MACHINE = { left: 232, width: 88, top: 74 }

/** Parked positions for the reduced-motion still — the ride keyframe departs from these, and its
 *  travel is authored so the park position cancels out of the moving picture entirely. The page
 *  past the machine rests with its seal shown (`--cv-seal`), because it has been through. Parks
 *  spill past the design box on purpose: whatever width the card gives, the still is populated. */
const PAGES = [
  { park: -150, sealed: false },
  { park: 22, sealed: false },
  { park: 116, sealed: false },
  { park: 204, sealed: false },
  { park: 344, sealed: true },
  { park: 500, sealed: true },
] as const

/** Along the whole visible run, not just the authored box — the belt is as wide as the card. */
const WHEELS = [-172, -58, 46, 146, 354, 462, 576] as const

/**
 * A generic cloud — three lobes, hand-drawn path — for the machine's badge and the stamp on the
 * pages that have been through it. Deliberately NOT the vendor's mark, which is banned here: this
 * is "a cloud", the destination in the abstract, at the two sizes where icon-weight drawing is the
 * correct scale (a 26px housing label and a 9px stamp).
 */
function CloudMark({ filled = false, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.9}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** What one belt slot carries, and whether its plate is spread-wide. */
interface BeltItem {
  slot: PageSlot
  wide: boolean
}

/** Ambient sheets on a stride, like the lift cast before them: two pages in frame at once are
 *  never a facing pair, so nothing reads as one page duplicated. The units are what the machine
 *  actually handles — for a spread book, the merged facing pairs, whole and wide, with only the
 *  standalone cover keeping the single page's shape. */
function beltCast(pages: readonly string[], spread: boolean): readonly BeltItem[] {
  const units = unitSequence(pages, spread)
  if (units.length === 0) return PAGES.map(() => ({ slot: null, wide: false }))
  return PAGES.map((_page, index) => {
    const at = (1 + index * 5) % units.length
    return { slot: units[at] ?? null, wide: spread && at !== 0 }
  })
}

export function AssemblyLine({ pages, progress, aspect, spread, className }: StepAnimationProps) {
  const { value, stalled } = useUploadChannel(progress)

  /* Plates take the shape of what they carry: a landscape book gives landscape plates, and a
     spread book's merged pairs ride wide — capped under the machine's 88, so every plate still
     disappears completely inside it for the stamp. */
  const pageH = 44
  const plateW = (wide: boolean) =>
    Math.min(84, pageH * clamp(wide ? aspect * 2 : aspect, 0.5, 2))
  const cast = beltCast(pages, spread)

  const glassH = 58
  const level: CSSProperties = {
    transform: `translateY(${((1 - value) * glassH).toFixed(2)}px)`,
    transition: `transform ${CHANNEL}`,
  }

  return (
    <UploadFrame design={DESIGN} stalled={stalled} mode="cover" className={className}>
      <div className="up-cv-scene">
        <div className="up-cv-floor" />
        <div className="up-cv-strap" />
        <div className="up-cv-track" />

        {WHEELS.map((x) => (
          <div key={x} className="up-cv-wheel" style={{ left: x }}>
            <span className="up-cv-notch" />
            <span className="up-cv-hub" />
          </div>
        ))}

        {PAGES.map((page, index) => {
          const item = cast[index] ?? { slot: null, wide: false }
          return (
            <div
              key={index}
              className="up-cv-page"
              style={{
                left: page.park,
                top: BELT_TOP - pageH,
                width: plateW(item.wide),
                height: pageH,
              }}
            >
              <div
                className="up-cv-ride"
                style={
                  {
                    "--cv-from": `${ENTER - page.park}px`,
                    "--cv-to": `${ENTER + TRAVEL - page.park}px`,
                    animationDuration: `${RIDE_S}s`,
                    animationDelay: `${(-index * RIDE_S) / PAGES.length}s`,
                  } as CSSProperties
                }
              >
                <span className="up-cv-page-shadow" />
                <div className="up-cv-card">
                  {item.slot === null ? (
                    <span className="up-cv-print" />
                  ) : (
                    <img
                      src={item.slot.src}
                      alt=""
                      decoding="async"
                      draggable={false}
                      className="up-fade absolute inset-0 h-full w-full object-cover object-center"
                    />
                  )}
                  {/* The stamp's clock IS the ride's clock — same duration, same delay — or its
                      flip percentage lands at the wrong position and pages arrive pre-stamped. */}
                  <span
                    className="up-cv-seal"
                    style={
                      {
                        "--cv-seal": page.sealed ? 1 : 0,
                        animationDuration: `${RIDE_S}s`,
                        animationDelay: `${(-index * RIDE_S) / PAGES.length}s`,
                      } as CSSProperties
                    }
                  >
                    <CloudMark filled />
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        <div className="up-cv-glow" />

        <div className="up-cv-machine" style={{ left: MACHINE.left, top: MACHINE.top, width: MACHINE.width }}>
          <span className="up-cv-lamp" />
          <span className="up-cv-lamp-halo" />
          <div className="up-cv-body">
            <CloudMark className="up-cv-brand" />
            <span className="up-cv-vent" />
            <span className="up-cv-rivet" style={{ left: 7, top: 7 }} />
            <span className="up-cv-rivet" style={{ right: 7, top: 7 }} />
            <span className="up-cv-rivet" style={{ left: 7, bottom: 7 }} />
            <span className="up-cv-rivet" style={{ right: 7, bottom: 7 }} />
            <div className="up-cv-glass" style={{ height: glassH + 6 }}>
              <span className="up-cv-level" style={{ top: 3, height: glassH, ...level }} />
              <span className="up-cv-glass-shine" />
            </div>
            <span className="up-cv-tick" style={{ top: 24 }} />
            <span className="up-cv-tick" style={{ top: 46 }} />
            <span className="up-cv-tick" style={{ top: 68 }} />
          </div>
          <div className="up-cv-skirt" />
        </div>

        <span className="up-stall" />
      </div>
    </UploadFrame>
  )
}
