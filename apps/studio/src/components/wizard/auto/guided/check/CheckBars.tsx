import { cn } from "@/lib/utils"
import type { ScreenId } from "./screens"

type Props = { screens: ScreenId[]; at: ScreenId | null; done: ScreenId[] }

/**
 * Where you are in Check, under the stepper's Check: one small bar per screen (passed, on view,
 * still to come).
 */
export function CheckBars({ screens, at, done }: Props) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {screens.map((s) => (
        <span key={s} className={cn("h-1 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none", s === at ? "w-4 bg-[var(--gd-step)]" : done.includes(s) ? "w-2.5 bg-[var(--gd-step)]/60" : "w-2.5 bg-border")} />
      ))}
    </span>
  )
}
