import type { MessageDescriptor } from "@lingui/core"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Loader2, RotateCcw, Undo2 } from "lucide-react"
import { getPageThumbnailUrl } from "@/api/client"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import { AiSuggestion } from "../focus/AiSuggestion"
import { aiTextOf } from "../judge/useJudging"
import { reasonLabel } from "../ReasonChip"
import { thumbRect } from "../thumbRect"
import { whyText } from "../tier"
import type { FilteredImage } from "../useFilteredImages"
import type { BannerModel } from "./bannerModel"

export function PageSpot({ model, item, className }: { model: BannerModel; item: FilteredImage; className?: string }) {
  const { t } = useLingui()
  const size = item.pageSize
  const aspect = size ? size.w / size.h : 3 / 4
  const rect = thumbRect(item.bounds, size, aspect, "contain")
  return (
    <figure className={cn("flex shrink-0 flex-col gap-1", className)}>
      <span className="relative block overflow-hidden rounded-md border bg-zinc-50 dark:bg-zinc-200" style={{ aspectRatio: aspect }}>
        <img src={getPageThumbnailUrl(model.label, item.pageId, 320)} alt="" loading="lazy" className="size-full object-contain" />
        {rect && (
          <span
            aria-hidden
            className="absolute rounded-[3px] border-2 border-[var(--chrome-hex)] bg-[color-mix(in_srgb,var(--chrome-hex)_18%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_22%,transparent)]"
            style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%`, minWidth: 6, minHeight: 6 }}
          />
        )}
      </span>
      <figcaption className="text-center text-[11px] text-muted-foreground tabular-nums">{t`Where it sat on page ${item.pageNumber}`}</figcaption>
    </figure>
  )
}

const SECTION = "flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-0"
const LABEL = "text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
const BASE = "relative flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold whitespace-nowrap transition-[background-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] focus-visible:ring-offset-1"

export function usePictureFacts(model: BannerModel, item: FilteredImage) {
  const { t, i18n } = useLingui()
  const translate = (descriptor: MessageDescriptor) => i18n._(descriptor)
  return {
    why: whyText(translate, model.rankOf(item)),
    reason: reasonLabel(translate, item.reason),
    explain: item.reason.explain ? i18n._(item.reason.explain) : null,
    earlier: aiTextOf(item.reason),
    answer: model.ai.opinion.opinionOf(item),
    size: item.width && item.height ? t`${item.width} × ${item.height} px` : null,
  }
}

export function ReasonFacts({ model, item, labelled = true }: { model: BannerModel; item: FilteredImage; labelled?: boolean }) {
  const { t } = useLingui()
  const facts = usePictureFacts(model, item)
  return (
    <section className={SECTION}>
      {labelled && <p className={LABEL}>{t`Why Extract left it out`}</p>}
      <p className="text-[13px] font-medium">{facts.reason}</p>
      {facts.explain && <p className="text-[12px] leading-snug text-muted-foreground">{facts.explain}</p>}
      {facts.size && <p className="text-[12px] text-muted-foreground tabular-nums">{facts.size}</p>}
    </section>
  )
}

export function WorthFacts({ model, item, labelled = true }: { model: BannerModel; item: FilteredImage; labelled?: boolean }) {
  const { t } = useLingui()
  const facts = usePictureFacts(model, item)
  if (!facts.why && !facts.earlier) return null
  return (
    <section className={SECTION}>
      {labelled && <p className={LABEL}>{t`Why it's worth checking`}</p>}
      {facts.why && <p className="text-[13px] font-medium">{facts.why}</p>}
      {facts.earlier && (
        <p className="line-clamp-3 text-[12px] leading-snug text-muted-foreground" title={facts.earlier}>
          {t`Earlier check: ${facts.earlier}`}
        </p>
      )}
    </section>
  )
}

export function AiFacts({ model, item, labelled = true }: { model: BannerModel; item: FilteredImage; labelled?: boolean }) {
  const { t } = useLingui()
  const answer = model.ai.opinion.opinionOf(item)
  return (
    <section className={SECTION}>
      {labelled && <p className={LABEL}>{t`AI second look`}</p>}
      {answer ? <AiSuggestion opinion={answer} /> : <p className="text-[12.5px] text-muted-foreground">{t`No AI answer yet for this picture.`}</p>}
    </section>
  )
}

export function DecisionRow({ model, item, onOpen, onDecided, className }: { model: BannerModel; item: FilteredImage; onOpen?: (() => void) | null; onDecided: () => void; className?: string }) {
  const { t } = useLingui()
  const answer = model.ai.opinion.opinionOf(item)
  const repeats = model.repeatsOf(item)
  const decision = model.decisionOf(item)
  const busy = model.busyOf(item)
  const suggest = answer?.verdict
  const pageElements = item.reason.kind === "page-elements"
  const bringBack = () => {
    model.onBringBack(item)
    onDecided()
  }
  const leaveOut = () => {
    model.onLeaveOut(item)
    onDecided()
  }
  const hintTag = (show: boolean) =>
    show ? (
      <span className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-background px-1.5 text-[10px] font-semibold whitespace-nowrap text-[var(--chrome-hex)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--chrome-hex)_35%,transparent)]">
        {t`AI suggests`}
      </span>
    ) : null
  if (decision)
    return (
      <div className={cn("flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 animate-in fade-in duration-200 motion-reduce:animate-none", className)} role="status">
        <span className={cn("text-[13px] font-semibold", decision === "back" ? "text-[var(--chrome-hex)]" : "text-foreground")}>
          {decision === "back" ? (repeats > 1 ? t`All ${repeats} copies brought back` : t`Brought back into the book`) : t`Kept left out`}
        </span>
        {decision === "back" && <span className="text-[12px] text-muted-foreground">{t`Saved as a new version of page ${item.pageNumber}.`}</span>}
        <button type="button" onClick={() => model.onUndo(item)} disabled={busy || model.blocked} className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />}
          {t`Undo`}
        </button>
      </div>
    )
  return (
    <div className={cn("flex flex-wrap items-center gap-2 pt-1", className)}>
      <button
        type="button"
        onClick={bringBack}
        disabled={busy || model.blocked}
        title={model.blocked ? t`A run is in progress. You can bring pictures back once it finishes.` : t`Saves a new version of page ${item.pageNumber}`}
        className={cn(BASE, "bg-[var(--chrome-hex)] text-white hover:opacity-90")}
        data-banner-bring-back
      >
        {hintTag(suggest === "keep")}
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
        {repeats > 1 ? t`Bring all ${repeats} back` : pageElements ? t`Keep as picture` : t`Bring back`}
      </button>
      <button type="button" onClick={leaveOut} disabled={busy} className={cn(BASE, "border bg-card text-foreground hover:bg-muted")} data-banner-leave-out>
        {hintTag(suggest === "remove")}
        {t`Leave out`}
      </button>
      {onOpen && (
        <button type="button" onClick={onOpen} className="ml-1 flex h-10 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-[var(--chrome-hex)] transition-colors hover:underline">
          <Trans>See it on its page</Trans>
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export function PictureSections({ model, item, onOpen, onDecided, showTitle = true, className }: { model: BannerModel; item: FilteredImage; onOpen?: (() => void) | null; onDecided: () => void; showTitle?: boolean; className?: string }) {
  const { t } = useLingui()
  const repeats = model.repeatsOf(item)
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      {showTitle && (
        <p className="text-[15px] font-semibold">
          {t`Page ${item.pageNumber} · picture ${item.number}`}
          {repeats > 1 && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{t`· repeats ${repeats} times`}</span>}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <ReasonFacts model={model} item={item} />
        <WorthFacts model={model} item={item} />
        <AiFacts model={model} item={item} />
      </div>
      <DecisionRow model={model} item={item} onOpen={onOpen} onDecided={onDecided} />
    </div>
  )
}

export function PictureContext({ model, item, onOpen, onDecided }: { model: BannerModel; item: FilteredImage; onOpen: () => void; onDecided: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)]" data-picture-context="focus">
      <FilteredThumb paper label={model.label} imageId={item.imageId} alt="" className="h-[22rem] w-full p-4" />
      <PageSpot model={model} item={item} className="w-full max-w-[16rem] justify-self-center" />
      <PictureSections model={model} item={item} onOpen={onOpen} onDecided={onDecided} />
    </div>
  )
}
