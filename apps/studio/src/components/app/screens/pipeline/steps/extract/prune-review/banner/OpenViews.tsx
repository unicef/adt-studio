import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import { VerdictMark } from "../second-opinion/AiThumbGrid"
import type { FilteredImage } from "../useFilteredImages"
import type { BannerModel } from "./bannerModel"

export function FocusView({
  model,
  items,
  currentKey,
  onPick,
  renderDetail,
}: {
  model: BannerModel
  items: readonly FilteredImage[]
  currentKey: string | null
  onPick: (key: string) => void
  renderDetail: (item: FilteredImage, next: () => void) => ReactNode
}) {
  const { t } = useLingui()
  const found = currentKey ? items.findIndex((item) => item.key === currentKey) : -1
  const at = found >= 0 ? found : 0
  const current = items[at]
  if (!current) return null
  const setIndex = (position: number) => {
    const target = items[Math.max(0, Math.min(items.length - 1, position))]
    if (target) onPick(target.key)
  }
  const next = () => {
    const later = items.slice(at + 1).find((item) => model.decisionOf(item) === null)
    const earlier = items.slice(0, at).find((item) => model.decisionOf(item) === null)
    const target = later ?? earlier
    if (target) onPick(target.key)
  }
  const decided = items.filter((item) => model.decisionOf(item) !== null).length
  const NAV = "grid size-9 shrink-0 place-items-center rounded-lg border bg-card transition-colors duration-150 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
  return (
    <div className="flex flex-col gap-4" data-open-view="focus">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setIndex(at - 1)} disabled={at === 0} className={NAV} aria-label={t`Previous picture`}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1.5 [scrollbar-width:thin]">
          {items.map((item, position) => {
            const answer = model.ai.opinion.opinionOf(item)
            const decision = model.decisionOf(item)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setIndex(position)}
                aria-pressed={position === at}
                aria-label={t`Page ${item.pageNumber}: show details`}
                className={cn(
                  "relative block size-[4.5rem] shrink-0 rounded-lg outline-none transition-[transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)]",
                  position === at ? "shadow-[0_0_0_3px_var(--chrome-hex)]" : "hover:-translate-y-0.5",
                  decision && position !== at && "opacity-45",
                )}
              >
                <FilteredThumb paper label={model.label} imageId={item.imageId} alt="" className="absolute inset-0 size-full rounded-lg p-1" />
                {answer && <VerdictMark verdict={answer.verdict} small />}
                {decision && (
                  <span className={cn("absolute inset-x-0 bottom-0 rounded-b-lg py-px text-center text-[9px] font-semibold tracking-wide text-white uppercase", decision === "back" ? "bg-[var(--chrome-hex)]" : "bg-zinc-600")}>
                    {decision === "back" ? t`Back in` : t`Left out`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <span className="flex shrink-0 flex-col items-end text-[12px] leading-tight text-muted-foreground tabular-nums">
          <span>{t`${at + 1} of ${items.length}`}</span>
          <span>{t`${decided} decided`}</span>
        </span>
        <button type="button" onClick={() => setIndex(at + 1)} disabled={at >= items.length - 1} className={NAV} aria-label={t`Next picture`}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div key={current.key} className="rounded-xl border bg-card p-5 animate-in fade-in duration-200 motion-reduce:animate-none" aria-live="polite" data-banner-detail>
        {renderDetail(current, next)}
      </div>
    </div>
  )
}
