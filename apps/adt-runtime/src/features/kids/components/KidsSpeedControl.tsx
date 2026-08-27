import { Gauge, Rabbit, Turtle } from "lucide-react"
import { cn } from "@/shared/lib/utils"

export const KIDS_SPEEDS = [0.75, 1, 1.3] as const
export type KidsSpeed = (typeof KIDS_SPEEDS)[number]

interface KidsSpeedControlProps {
  speed: number
  onChange: (speed: KidsSpeed) => void
  slowLabel: string
  normalLabel: string
  fastLabel: string
  groupLabel: string
  reduceMotion?: boolean
}

/**
 * Three-segment reading-speed picker. The previous control cycled through the
 * speeds on tap, which hid two of the three options and offered no way back —
 * showing all three at once makes the choice direct and reversible.
 */
export function KidsSpeedControl({
  speed,
  onChange,
  slowLabel,
  normalLabel,
  fastLabel,
  groupLabel,
  reduceMotion = false,
}: KidsSpeedControlProps) {
  const segments: { value: KidsSpeed; label: string; icon: React.ReactNode }[] =
    [
      { value: 0.75, label: slowLabel, icon: <Turtle className="h-6 w-6" /> },
      { value: 1, label: normalLabel, icon: <Gauge className="h-6 w-6" /> },
      { value: 1.3, label: fastLabel, icon: <Rabbit className="h-6 w-6" /> },
    ]

  return (
    <div
      role="group"
      aria-label={groupLabel}
      data-testid="kids-action-speed"
      className="grid grid-cols-3 gap-2 rounded-2xl bg-sky-50/70 p-2 ring-2 ring-sky-100"
    >
      {segments.map((segment) => {
        const active = matchesSpeed(speed, segment.value)
        return (
          <button
            key={segment.value}
            type="button"
            data-testid={`kids-action-speed-${segment.value}`}
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2",
              "text-sm font-extrabold leading-tight text-slate-800",
              reduceMotion
                ? "transition-none"
                : "transition-[transform,box-shadow,background-color] duration-150 ease-out active:scale-[0.97]",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
              active
                ? "bg-[#FFF6D6] text-slate-950 shadow-[0_2px_0_#EFC94C] ring-2 ring-[#FFC800]"
                : "bg-white shadow-[0_2px_0_#D9EBF8] ring-1 ring-sky-100 hover:bg-sky-50",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(active ? "text-[#8A6400]" : "text-sky-700")}
            >
              {segment.icon}
            </span>
            <span>{segment.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function matchesSpeed(current: number, segment: KidsSpeed) {
  if (segment === 0.75) return current < 1
  if (segment === 1.3) return current > 1
  return current === 1
}
