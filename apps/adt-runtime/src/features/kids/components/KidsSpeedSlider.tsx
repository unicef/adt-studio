import { Rabbit, Turtle } from "lucide-react"
import { cn } from "@/shared/lib/utils"

const SPEED_STEPS = [0.75, 0.9, 1, 1.15, 1.3] as const

export type KidsSliderSpeed = (typeof SPEED_STEPS)[number]

interface KidsSpeedSliderProps {
  speed: number
  onChange: (speed: KidsSliderSpeed) => void
  groupLabel: string
  slowLabel: string
  normalLabel: string
  fastLabel: string
  reduceMotion: boolean
}

export function KidsSpeedSlider({
  speed,
  onChange,
  groupLabel,
  slowLabel,
  normalLabel,
  fastLabel,
  reduceMotion,
}: KidsSpeedSliderProps) {
  const stepIndex = closestStepIndex(speed)
  const resolvedSpeed = SPEED_STEPS[stepIndex]
  const speedLabel =
    resolvedSpeed < 1
      ? slowLabel
      : resolvedSpeed > 1
        ? fastLabel
        : normalLabel
  const filledPercent = (stepIndex / (SPEED_STEPS.length - 1)) * 100

  return (
    <div
      data-testid="kids-action-speed"
      className="flex min-h-16 items-center gap-2 rounded-2xl bg-sky-50/70 px-3 py-2 ring-2 ring-sky-100"
    >
      <Turtle
        className="h-7 w-7 shrink-0 text-sky-800"
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <div className="relative flex h-11 min-w-0 flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-0 h-3.5 overflow-hidden rounded-full bg-slate-300 shadow-inner ring-1 ring-slate-400/60">
          <div
            className={cn(
              "h-full rounded-full bg-[#FFC800] shadow-[inset_0_-2px_0_#DDAE00]",
              reduceMotion
                ? "transition-none"
                : "transition-[width] duration-200 ease-out",
            )}
            style={{ width: `${filledPercent}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={SPEED_STEPS.length - 1}
          step={1}
          value={stepIndex}
          aria-label={groupLabel}
          aria-valuetext={speedLabel}
          onChange={(event) => onChange(SPEED_STEPS[Number(event.target.value)])}
          className={cn(
            "relative h-11 w-full cursor-pointer appearance-none bg-transparent",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
            "[&::-webkit-slider-runnable-track]:h-3.5 [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:mt-[-15px] [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#9A7000] [&::-webkit-slider-thumb]:bg-[#FFF6D6] [&::-webkit-slider-thumb]:shadow-[0_3px_0_#C79500,0_3px_10px_rgba(15,23,42,0.3)]",
            "[&::-moz-range-track]:h-3.5 [&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:w-10 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#9A7000] [&::-moz-range-thumb]:bg-[#FFF6D6] [&::-moz-range-thumb]:shadow-[0_3px_0_#C79500,0_3px_10px_rgba(15,23,42,0.3)]",
            reduceMotion
              ? "[&::-webkit-slider-thumb]:transition-none [&::-moz-range-thumb]:transition-none"
              : "[&::-webkit-slider-thumb]:transition-[transform,box-shadow] [&::-webkit-slider-thumb]:duration-200 [&::-webkit-slider-thumb]:ease-out [&::-moz-range-thumb]:transition-[transform,box-shadow] [&::-moz-range-thumb]:duration-200 [&::-moz-range-thumb]:ease-out",
          )}
        />
      </div>
      <Rabbit
        className="h-7 w-7 shrink-0 text-sky-800"
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <span className="min-w-16 text-center text-sm font-black text-slate-900">
        {speedLabel}
      </span>
    </div>
  )
}

function closestStepIndex(speed: number) {
  return SPEED_STEPS.reduce(
    (closest, candidate, index) =>
      Math.abs(candidate - speed) < Math.abs(SPEED_STEPS[closest] - speed)
        ? index
        : closest,
    0,
  )
}
