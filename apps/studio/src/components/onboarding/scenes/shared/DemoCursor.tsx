import { cn } from "@/lib/utils"

/**
 * A soft, cinematic pointer that slides so its TIP lands on (x, y) within a demo
 * panel, emitting a ping ripple centered on the tip while `clicking`. The cursor
 * image's tip sits at its top-left corner, so (x, y) is the exact click point.
 * Purely decorative.
 */
export function DemoCursor({
  x,
  y,
  clicking,
  color = "#111827",
}: {
  x: number
  y: number
  clicking: boolean
  color?: string
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30 transition-transform duration-[750ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <span
        className={cn(
          "absolute -left-4 -top-4 block h-8 w-8 rounded-full",
          clicking ? "animate-ping" : "opacity-0",
        )}
        style={{ backgroundColor: color, opacity: clicking ? 0.25 : 0 }}
      />
      <img
        src="/onboarding/cursor.png"
        alt=""
        className={cn(
          "block h-auto w-[30px] drop-shadow-[0_3px_6px_rgba(0,0,0,0.3)] transition-transform duration-150",
          clicking ? "scale-90" : "scale-100",
        )}
        style={{ transformOrigin: "top left" }}
      />
    </div>
  )
}
