import { cn } from "@/lib/utils"
import { OB_ACCENT } from "../../theme"

/**
 * The regular macOS arrow pointer. Slides so its tip lands on (x, y) and emits a
 * ping ripple centered on the tip while `clicking`. `color` drives the ripple so
 * the click feedback matches the element being clicked. Purely decorative.
 */
export function DemoCursor({
  x,
  y,
  clicking,
  color = OB_ACCENT,
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
      <svg
        width="22"
        height="24"
        viewBox="0 0 22 24"
        fill="none"
        className={cn(
          "drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] transition-transform duration-150",
          clicking ? "scale-90" : "scale-100",
        )}
        style={{ overflow: "visible", transformOrigin: "0px 0px" }}
      >
        <path
          d="M0.6 0.6 L0.6 16.8 L5.2 12.7 L8.1 19 L10.6 17.9 L7.7 11.9 L13.7 11.9 Z"
          fill="#1a1a1a"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
