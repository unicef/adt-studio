import { useMemo, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowRight, Check, ChevronUp, Loader2, Minimize2, Sparkles, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import type { FilteredImage } from "../useFilteredImages"
import { AiPageScan } from "./AiPageScan"
import { AiThumbGrid } from "./AiThumbGrid"
import { LanguageNotice } from "./LanguageNotice"
import { VERDICT_DOT } from "./opinionCopy"
import type { SecondOpinionApi } from "./useSecondOpinion"

const PRIMARY = "flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--chrome-hex)] px-3.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
const QUIET = "flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-card px-3 text-[12.5px] font-medium transition-colors hover:bg-muted"
const ICON = "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

function Tally({ opinion, items, large = false }: { opinion: SecondOpinionApi; items: readonly FilteredImage[]; large?: boolean }) {
  const { t } = useLingui()
  const tally = { keep: 0, unsure: 0, remove: 0 }
  for (const item of items) {
    const answer = opinion.opinionOf(item)
    if (answer) tally[answer.verdict]++
  }
  const rows = [
    { verdict: "keep" as const, text: t`${plural(tally.keep, { one: "# to bring back", other: "# to bring back" })}` },
    { verdict: "unsure" as const, text: t`${plural(tally.unsure, { one: "# not sure", other: "# not sure" })}` },
    { verdict: "remove" as const, text: t`${plural(tally.remove, { one: "# fine to leave out", other: "# fine to leave out" })}` },
  ]
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums", large ? "text-[13px]" : "text-[12px] text-muted-foreground")}>
      {rows.map((row) => (
        <span key={row.verdict} className={cn("flex items-center gap-1.5 transition-opacity duration-300", tally[row.verdict] === 0 && "opacity-50")}>
          <span aria-hidden className={cn("size-2 rounded-full", VERDICT_DOT[row.verdict])} />
          {row.text}
        </span>
      ))}
    </div>
  )
}

function Flow({ label, items }: { label: string; items: readonly FilteredImage[] }) {
  const { t } = useLingui()
  const sample = items.slice(0, 3)
  const step = { x: 16, y: 9 }
  const CHIP = "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-semibold whitespace-nowrap"
  const DOTSIZE = "size-2.5"
  return (
    <div className={"flex min-h-0 flex-1 items-center justify-center gap-6 rounded-xl bg-muted/40 px-6 py-8"} aria-hidden>
      <span className="relative shrink-0" style={{ width: 80 + step.x * 2, height: 80 + step.y * 2 }}>
        {sample.map((item, index) => (
          <span key={item.key} className="absolute" style={{ left: index * step.x, top: index * step.y, transform: `rotate(${(index - 1) * 6}deg)` }}>
            <FilteredThumb paper label={label} imageId={item.imageId} alt="" className="size-20 p-1.5 shadow-md" />
          </span>
        ))}
      </span>
      <ArrowRight className="size-6 shrink-0 text-muted-foreground" />
      <span className="grid size-20 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[var(--chrome-hex)]">
        <Sparkles className="size-9" />
      </span>
      <ArrowRight className="size-6 shrink-0 text-muted-foreground" />
      <span className="flex flex-col gap-2">
        <span className={cn(CHIP, "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300")}>
          <span className={cn(DOTSIZE, "rounded-full", VERDICT_DOT.keep)} />
          {t`Bring back`}
        </span>
        <span className={cn(CHIP, "bg-amber-400/15 text-amber-800 dark:text-amber-300")}>
          <span className={cn(DOTSIZE, "rounded-full", VERDICT_DOT.unsure)} />
          {t`Not sure`}
        </span>
        <span className={cn(CHIP, "bg-muted text-muted-foreground")}>
          <span className={cn(DOTSIZE, "rounded-full", VERDICT_DOT.remove)} />
          {t`Fine to leave out`}
        </span>
      </span>
    </div>
  )
}

function Intro({ label, opinion, items, onCancel }: { label: string; opinion: SecondOpinionApi; items: readonly FilteredImage[]; onCancel: () => void }) {
  const { t } = useLingui()
  const todo = items.filter((item) => !opinion.opinionOf(item))
  const pages = new Set(todo.map((item) => item.pageId)).size
  return (
    <div className="flex h-full min-h-0 flex-col gap-5" data-ai-check="intro">
      <Flow label={label} items={todo} />
      <p className="text-[16px] leading-relaxed">
        <Trans>The AI looks at each left-out picture on its page and says whether a reader would miss it. It only suggests: nothing in the book changes until you choose.</Trans>
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] text-foreground/80 marker:text-muted-foreground">
        <li>{t`${plural(todo.length, { one: "# picture", other: "# pictures" })} from ${plural(pages, { one: "# page", other: "# pages" })}, the ones most worth checking`}</li>
        <li>
          <Trans>Uses your AI account. Answers are saved, so running it again is free.</Trans>
        </li>
        <li>
          <Trans>Takes about a minute. You can keep working while it runs.</Trans>
        </li>
      </ul>
      <div className="flex shrink-0 justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={cn(QUIET, "h-10 px-4 text-[13.5px]")}>
          <Trans>Not now</Trans>
        </button>
        <button type="button" onClick={() => void opinion.ask(items)} disabled={todo.length === 0} className={cn(PRIMARY, "h-10 px-4 text-[13.5px]")} data-ai-start>
          <Sparkles className="size-3.5" aria-hidden />
          <Trans>Start the second look</Trans>
        </button>
      </div>
    </div>
  )
}

function Live({ label, opinion, items }: { label: string; opinion: SecondOpinionApi; items: readonly FilteredImage[] }) {
  const { t } = useLingui()
  const run = opinion.run
  const active = useMemo(() => new Set(run?.active ?? []), [run?.active])
  const shown = useMemo(() => (run ? items.filter((item) => run.keys.includes(item.key)) : items), [items, run])
  const pageItems = run?.pageId ? shown.filter((item) => item.pageId === run.pageId && active.has(item.key)) : []
  const done = run?.done.length ?? 0
  const total = run?.keys.length ?? 0
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-ai-check="live">
      <div className="flex flex-col gap-1.5">
        <p className="flex h-5 items-center gap-2 text-[13px] font-semibold tabular-nums">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--chrome-hex)] motion-reduce:animate-none" aria-hidden />
          {run?.stopping ? t`Stopping after the pages in progress…` : t`Checking ${done} of ${total} pictures`}
        </p>
        <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-[var(--chrome-hex)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] gap-3">
        {run?.pageId && pageItems.length > 0 ? (
          <AiPageScan label={label} pageId={run.pageId} items={pageItems} />
        ) : (
          <figure className="flex flex-col gap-1.5 self-start">
            <span className="grid aspect-[3/4] w-full place-items-center rounded-md border border-dashed text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            </span>
            <figcaption className="h-8" />
          </figure>
        )}
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <p className="shrink-0 text-[12px] leading-relaxed text-muted-foreground">
            <Trans>Each picture is sent with its page, so the AI sees where it sat and what the text says around it.</Trans>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <AiThumbGrid label={label} items={shown} active={active} opinionOf={opinion.opinionOf} />
          </div>
        </div>
      </div>
      <div className="flex h-5 shrink-0 items-center">
        <Tally opinion={opinion} items={shown} />
      </div>
      <p className="h-4 shrink-0 truncate text-[12px] text-destructive">{opinion.error ?? ""}</p>
    </div>
  )
}

function Done({ label, opinion, items, onReview }: { label: string; opinion: SecondOpinionApi; items: readonly FilteredImage[]; onReview: (item: FilteredImage) => void }) {
  const { t } = useLingui()
  const run = opinion.run
  const shown = run ? items.filter((item) => run.keys.includes(item.key)) : items
  const keep = shown.filter((item) => opinion.opinionOf(item)?.verdict === "keep")
  const unsure = shown.filter((item) => opinion.opinionOf(item)?.verdict === "unsure")
  const first = keep[0] ?? unsure[0]
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-ai-check="done">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--chrome-hex)] text-white">
          <Check className="size-3.5" aria-hidden />
        </span>
        {keep.length > 0
          ? t`${plural(keep.length, { one: "The AI thinks # picture should come back", other: "The AI thinks # pictures should come back" })}`
          : t`The AI agrees these can stay out`}
      </p>
      <Tally opinion={opinion} items={shown} large />
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground empty:hidden">
        <LanguageNotice label={label} opinion={opinion} scope={shown} />
      </div>
      {(keep.length > 0 || unsure.length > 0) && (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <AiThumbGrid label={label} items={[...keep, ...unsure]} active={new Set()} opinionOf={opinion.opinionOf} onOpen={onReview} />
        </div>
      )}
      {opinion.error && <p className="text-[12px] text-destructive">{t`Some pages could not be checked: ${opinion.error}`}</p>}
      <p className="mt-auto shrink-0 text-[12px] text-muted-foreground">
        <Trans>The answers now show next to each picture while you check them. You still decide.</Trans>
      </p>
      <div className="flex shrink-0 justify-end gap-2">
        <button type="button" onClick={opinion.dismiss} className={QUIET}>
          <Trans>Close</Trans>
        </button>
        {first && (
          <button type="button" onClick={() => onReview(first)} className={PRIMARY}>
            {keep.length > 0 ? t`Check the ${keep.length} first` : t`Check the ${unsure.length} not sure`}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

function Body({ label, opinion, items, onReview }: { label: string; opinion: SecondOpinionApi; items: readonly FilteredImage[]; onReview: (item: FilteredImage) => void }) {
  const content =
    opinion.view === "intro" && !opinion.running ? (
      <Intro label={label} opinion={opinion} items={items} onCancel={opinion.dismiss} />
    ) : opinion.run?.finished ? (
      <Done label={label} opinion={opinion} items={items} onReview={onReview} />
    ) : (
      <Live label={label} opinion={opinion} items={items} />
    )
  return <div className="flex h-[32rem] min-h-0 flex-col">{content}</div>
}

function HeaderActions({ opinion }: { opinion: SecondOpinionApi }) {
  const { t } = useLingui()
  return (
    <span className="flex items-center gap-0.5">
      {opinion.running && (
        <>
          <button type="button" onClick={() => opinion.setView("pill")} className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" data-ai-background>
            <Minimize2 className="size-3.5" aria-hidden />
            {t`Run in background`}
          </button>
          {!opinion.run?.stopping && (
            <button type="button" onClick={opinion.stop} className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t`Stop after the pages in progress`}>
              <Square className="size-2.5 fill-current" aria-hidden />
              {t`Stop`}
            </button>
          )}
        </>
      )}
      {!opinion.running && (
        <button type="button" onClick={opinion.dismiss} className={ICON} aria-label={t`Close`}>
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}

function Title() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[var(--chrome-hex)]">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <Trans>AI second look</Trans>
    </span>
  )
}

export function AiCheckSurface({ label, hex, opinion, items, onReview }: { label: string; hex: string; opinion: SecondOpinionApi; items: readonly FilteredImage[]; onReview: (item: FilteredImage) => void }) {
  const paint = (node: HTMLElement | null) => node?.style.setProperty("--chrome-hex", hex)
  const open = opinion.view === "intro" || opinion.view === "live"
  const review = (item: FilteredImage) => {
    opinion.setView("pill")
    onReview(item)
  }
  return (
      <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && (opinion.running ? opinion.setView("pill") : opinion.dismiss())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 z-50 flex w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border bg-background p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none"
            data-ai-check-surface="sheet"
            ref={paint}
          >
            <div className="flex items-center gap-2">
              <DialogPrimitive.Title asChild>
                <span className="min-w-0 flex-1">
                  <Title />
                </span>
              </DialogPrimitive.Title>
              <HeaderActions opinion={opinion} />
            </div>
            <Body label={label} opinion={opinion} items={items} onReview={review} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
}

function Ring({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 9
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className="stroke-muted" />
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-[var(--chrome-hex)] transition-[stroke-dashoffset] duration-500" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value)} />
    </svg>
  )
}

export function AiPill({ hex, opinion, items }: { hex: string; opinion: SecondOpinionApi; items: readonly FilteredImage[] }): ReactNode {
  const paint = (node: HTMLElement | null) => node?.style.setProperty("--chrome-hex", hex)
  const { t } = useLingui()
  const run = opinion.run
  if (!run || opinion.view !== "pill") return null
  const done = run.done.length
  const total = run.keys.length
  const keep = items.filter((item) => run.keys.includes(item.key) && opinion.opinionOf(item)?.verdict === "keep").length
  return (
    <div
      ref={paint}
      className={cn(
        "fixed bottom-28 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border py-1 pr-1 pl-1.5 shadow-lg transition-colors duration-300 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
        run.finished && keep > 0 ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950" : "bg-background",
      )}
      data-ai-pill
    >
      <button type="button" onClick={() => opinion.setView("live")} className="flex items-center gap-2 rounded-full py-0.5 pr-2 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)]">
        {run.finished ? (
          <span className={cn("grid size-6 place-items-center rounded-full text-white", keep > 0 ? "bg-emerald-600" : "bg-[var(--chrome-hex)]")}>
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : (
          <Ring value={total ? done / total : 0} />
        )}
        {run.finished
          ? keep > 0
            ? t`${plural(keep, { one: "AI second look done · # to bring back · Check", other: "AI second look done · # to bring back · Check" })}`
            : t`AI second look done`
          : t`AI second look · ${done} of ${total}`}
        <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
      {run.finished && (
        <button type="button" onClick={opinion.dismiss} className={ICON} aria-label={t`Dismiss`}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
