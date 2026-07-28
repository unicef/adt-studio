import { ChevronDown } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * "There is more below" affordance for a scrollable kids surface: a white fade
 * with a chevron, shown only while the scroller has content past the fold.
 * Purely decorative — it never intercepts pointer events.
 */
export function KidsScrollFade({
  visible,
  reduceMotion,
}: {
  visible: boolean
  reduceMotion?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="kids-scroll-fade"
      data-visible={visible ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center",
        "bg-gradient-to-t from-white via-white/85 to-transparent",
        reduceMotion ? "transition-none" : "transition-opacity duration-200 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 shadow-sm">
        <ChevronDown className="h-5 w-5" />
      </span>
    </div>
  )
}
