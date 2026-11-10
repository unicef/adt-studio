import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PictureSections } from "../banner/PictureContext"
import type { BannerModel } from "../banner/bannerModel"
import { FilteredThumb } from "../FilteredThumb"
import { VerdictMark } from "../second-opinion/AiThumbGrid"
import type { FilteredImage } from "../useFilteredImages"
import { PageDone } from "./PageDone"
import type { PageReview } from "./usePageReview"

export interface PageReviewState {
  model: BannerModel
  items: FilteredImage[]
  current: FilteredImage | null
  done: boolean
  pick: (key: string) => void
  next: () => void
  review: PageReview
}

export const NAV = "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"

export function Filmstrip({ state, size = "md" }: { state: PageReviewState; size?: "sm" | "md" }) {
  const { t } = useLingui()
  const box = size === "sm" ? "size-10" : "size-12"
  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto p-1 [scrollbar-width:thin]" data-page-filmstrip>
      {state.items.map((item) => {
        const answer = state.model.ai.opinion.opinionOf(item)
        const decision = state.model.decisionOf(item)
        const active = state.current?.key === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => state.pick(item.key)}
            aria-pressed={active}
            aria-label={t`Picture ${item.number}`}
            className={cn(
              "relative block shrink-0 rounded-md outline-none transition-[box-shadow,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)]",
              box,
              active ? "shadow-[0_0_0_2px_var(--chrome-hex)]" : "hover:opacity-100",
              decision && !active && "opacity-45",
            )}
          >
            <FilteredThumb paper label={state.model.label} imageId={item.imageId} alt="" className="absolute inset-0 size-full rounded-md p-0.5" />
            {answer && <VerdictMark verdict={answer.verdict} small />}
            {decision && (
              <span className={cn("absolute inset-x-0 bottom-0 rounded-b-md text-center text-[8px] font-semibold tracking-wide text-white uppercase", decision === "back" ? "bg-[var(--chrome-hex)]" : "bg-zinc-600")}>
                {decision === "back" ? t`In` : t`Out`}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Counter({ state }: { state: PageReviewState }) {
  const { t } = useLingui()
  const at = state.current ? state.items.findIndex((item) => item.key === state.current?.key) : -1
  const decided = state.items.filter((item) => state.model.decisionOf(item) !== null).length
  const step = (delta: number) => {
    const target = state.items[at + delta]
    if (target) state.pick(target.key)
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button type="button" onClick={() => step(-1)} disabled={at <= 0} className={NAV} aria-label={t`Previous picture`}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-[11.5px] whitespace-nowrap text-muted-foreground tabular-nums">{t`${at + 1} of ${state.items.length} · ${decided} decided`}</span>
      <button type="button" onClick={() => step(1)} disabled={at < 0 || at >= state.items.length - 1} className={NAV} aria-label={t`Next picture`}>
        <ChevronRight className="size-4" />
      </button>
    </span>
  )
}

export function Empty({ state }: { state: PageReviewState }) {
  return <PageDone review={{ ...state.review, empty: state.items.length === 0, done: true }} />
}

export function PageReviewColumn({ state, menu }: { state: PageReviewState; menu?: ReactNode }) {
  const { t } = useLingui()
  const current = state.current
  return (
    <section aria-label={t`Left-out pictures on this page`} data-page-review="tab" className="flex shrink-0 flex-col gap-3 animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="flex items-center gap-1">
        <p className="min-w-0 flex-1 text-[13px] font-semibold">{t`${plural(state.items.length, { one: "# left-out picture on this page", other: "# left-out pictures on this page" })}`}</p>
        {menu}
      </div>
      {state.items.length > 1 && <Filmstrip state={state} size="sm" />}
      {state.done || !current ? (
        <Empty state={state} />
      ) : (
        <div key={current.key} className="flex flex-col gap-3 animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">{t`Picture ${current.number}`}</span>
            <Counter state={state} />
          </div>
          <FilteredThumb paper label={state.model.label} imageId={current.imageId} alt="" className="h-60 w-full rounded-lg p-3" />
          <PictureSections model={state.model} item={current} onDecided={state.next} showTitle={false} />
        </div>
      )}
    </section>
  )
}
