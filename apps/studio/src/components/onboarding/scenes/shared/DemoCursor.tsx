import { cn } from "@/lib/utils"

/**
 * The macOS-style white pointing hand. It slides so its fingertip lands on
 * (x, y) within a demo panel, with a ping ripple centered on the fingertip while
 * `clicking`. (x, y) is the exact click point. Purely decorative.
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
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] transition-transform duration-150",
          clicking ? "scale-90" : "scale-100",
        )}
        style={{ marginLeft: -16, marginTop: -3, transformOrigin: "16px 3px" }}
      >
        <path
          d="M10 3.4a1.5 1.5 0 0 1 3 0v6.85a.75.75 0 0 0 1.5 0V8.1a1.5 1.5 0 0 1 3 0v2.55a.75.75 0 0 0 1.5 0V9.7a1.5 1.5 0 0 1 3 0v6.4c0 3.3-2.2 5.6-5.5 5.6h-2.2c-1.7 0-2.7-.55-3.75-1.95l-4-5.1a1.5 1.5 0 0 1 2.2-2.03L10 13V3.4Z"
          fill="#ffffff"
          stroke="#111111"
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
