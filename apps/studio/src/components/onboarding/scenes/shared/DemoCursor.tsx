import { cn } from "@/lib/utils"

/**
 * A macOS-style pointer that slides to (x, y) within a demo panel and emits a
 * ping ripple while `clicking`. Purely decorative.
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
          "absolute -left-2.5 -top-2.5 block h-8 w-8 rounded-full",
          clicking ? "animate-ping" : "opacity-0",
        )}
        style={{ backgroundColor: color, opacity: clicking ? 0.22 : 0 }}
      />
      <svg width="22" height="22" viewBox="0 0 28 28" className="drop-shadow-md">
        <path
          d="M6 4 L6 22 L11 17.5 L14.2 24 L17 22.7 L13.8 16.3 L20.5 16.3 Z"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
