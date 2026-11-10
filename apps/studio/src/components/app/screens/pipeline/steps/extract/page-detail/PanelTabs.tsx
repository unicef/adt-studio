import { useEffect, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ArrowRight, Check, FileText, ImageMinus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../prune-review/FilteredThumb"
import type { ReviewTab } from "../prune-review/LeftOutContext"
import { VerdictMark } from "../prune-review/second-opinion/AiThumbGrid"

type Tone = "plain" | "keep" | "unsure" | "done"

const triggerClassName =
  "relative flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
const contentClassName = "flex flex-col gap-5 outline-none data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-200 motion-reduce:animate-none"

const PILL: Record<Exclude<Tone, "done">, string> = {
  plain: "bg-[var(--chrome-hex)] text-white",
  keep: "bg-emerald-600 text-white",
  unsure: "bg-amber-400 text-amber-950",
}
const DOT: Record<Exclude<Tone, "done">, string> = {
  plain: "bg-[var(--chrome-hex)]",
  keep: "bg-emerald-500",
  unsure: "bg-amber-400",
}

function toneOf(review: ReviewTab): Tone {
  if (review.left === 0) return "done"
  if (review.keep > 0) return "keep"
  if (review.unsure > 0) return "unsure"
  return "plain"
}

function useStateText(review: ReviewTab) {
  const { t } = useLingui()
  const tone = toneOf(review)
  if (tone === "done") return t`All checked`
  if (tone === "keep") return t`${plural(review.keep, { one: "# to bring back", other: "# to bring back" })}`
  if (tone === "unsure") return t`${plural(review.unsure, { one: "# not sure", other: "# not sure" })}`
  return t`${plural(review.left, { one: "# to check", other: "# to check" })}`
}

function Count({ review }: { review: ReviewTab }) {
  const tone = toneOf(review)
  if (tone === "done")
    return (
      <span className="grid size-4 place-items-center rounded-full bg-emerald-600 text-white animate-in zoom-in-50 duration-200 motion-reduce:animate-none">
        <Check className="size-2.5" aria-hidden />
      </span>
    )
  const count = tone === "keep" ? review.keep : tone === "unsure" ? review.unsure : review.left
  return <span className={cn("grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums transition-colors duration-300", PILL[tone])}>{count}</span>
}

function Nudge({ review, onOpen, onDismiss }: { review: ReviewTab; onOpen: () => void; onDismiss: () => void }) {
  const { t } = useLingui()
  const top = review.top
  const tone = toneOf(review)
  if (!top || tone === "done") return null
  const answer = review.opinionOf(top)
  const eyebrow = tone === "keep" ? t`AI second look · bring back` : tone === "unsure" ? t`AI second look · not sure` : t`Left out by Extract`
  const title =
    tone === "keep"
      ? t`${plural(review.keep, { one: "The AI suggests bringing back # picture", other: "The AI suggests bringing back # pictures" })}`
      : tone === "unsure"
        ? t`${plural(review.unsure, { one: "The AI isn't sure about # picture", other: "The AI isn't sure about # pictures" })}`
        : t`${plural(review.left, { one: "# left-out picture could matter here", other: "# left-out pictures could matter here" })}`
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none" data-review-nudge={tone}>
      <div className="flex items-start gap-3">
      <button type="button" onClick={onOpen} aria-label={t`Review picture ${top.number}`} className="relative block size-14 shrink-0 rounded-lg outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)]">
        <FilteredThumb paper label={review.label} imageId={top.imageId} alt="" className="absolute inset-0 size-full rounded-lg p-1" />
        {answer && <VerdictMark verdict={answer.verdict} small />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
          {eyebrow}
        </p>
        <p className="text-[13px] leading-snug font-semibold">{title}</p>
        <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground" lang={answer?.language}>
          {answer?.reasoning ?? <Trans>Sectioning only uses the pictures you keep.</Trans>}
        </p>
      </div>
      <button type="button" onClick={onDismiss} aria-label={t`Dismiss`} className="-mt-0.5 -mr-0.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <X className="size-3.5" />
      </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-8 items-center gap-1 self-end rounded-lg bg-[var(--chrome-hex)] px-3 text-[12px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
        data-review-nudge-open
      >
        {t`Review`}
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

export type PanelTab = "review" | "details"

export function usePanelTab(review: ReviewTab | null, pageId: string) {
  const [tab, setTab] = useState<PanelTab>("details")
  useEffect(() => {
    setTab("details")
  }, [pageId])
  const running = review?.running ?? false
  const start = review?.start
  const choose = (value: string) => {
    const next: PanelTab = value === "review" ? "review" : "details"
    setTab(next)
    if (next === "review" && !running) start?.()
  }
  return { tab: review ? tab : null, choose }
}

export function PanelTabs({ pageId, hex, review, details, tab, onChoose }: { pageId: string; hex: string; review: ReviewTab; details: ReactNode; tab: PanelTab; onChoose: (value: string) => void }) {
  const { t } = useLingui()
  const [dismissed, setDismissed] = useState(false)
  const stateText = useStateText(review)

  useEffect(() => {
    setDismissed(false)
  }, [pageId])

  const choose = onChoose
  const paint = (node: HTMLElement | null) => node?.style.setProperty("--chrome-hex", hex)

  return (
    <TabsPrimitive.Root ref={paint} value={tab} onValueChange={choose} className="flex flex-col gap-4" data-panel-tabs>
      <TabsPrimitive.List aria-label={t`Right panel`} className="grid shrink-0 grid-cols-2 rounded-lg bg-muted p-0.5">
        <TabsPrimitive.Trigger value="details" className={triggerClassName} data-panel-tab="details">
          <FileText className="size-3.5 shrink-0" aria-hidden />
          {t`Page details`}
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="review" className={triggerClassName} title={stateText} aria-label={t`Review: ${stateText}`} data-panel-tab="review">
          <ImageMinus className="size-3.5 shrink-0" aria-hidden />
          {t`Review`}
          <Count review={review} />
        </TabsPrimitive.Trigger>
      </TabsPrimitive.List>
      <TabsPrimitive.Content value="details" className={contentClassName}>
        {!dismissed && <Nudge review={review} onOpen={() => choose("review")} onDismiss={() => setDismissed(true)} />}
        {details}
      </TabsPrimitive.Content>
      <TabsPrimitive.Content value="review" className={contentClassName}>
        {review.content}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  )
}
