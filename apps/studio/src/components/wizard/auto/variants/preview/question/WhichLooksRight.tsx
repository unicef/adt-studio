import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupSettingId } from "@adt/types"
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, SETTING_IDS } from "../../../engine/answers"
import { FACT_LONG, FACT_QUESTION, FACT_SHORT, OTHER_POSSIBILITY, OUR_GUESS } from "../../../engine/words"
import { DeviceToggle } from "../../../decide/strategies"
import { SETTING_LABEL } from "../labels"
import type { CanvasSetup } from "../useSetup"
import type { Device } from "../stage/layouts"
import { screenPages } from "../stage/pages"
import { useBox } from "../stage/useBox"
import { deviceSize } from "../stage/BookDevice"
import { OptionCard } from "./OptionCard"

const QUIET = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"

/** The page the comparison is drawn on: one of the pages that show the thing in question, stepped with small arrows. */
function PageStepper({ file, pages, page, onPage }: { file: File | null; pages: number[]; page: number; onPage: (p: number) => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 64)
  const i = Math.max(0, pages.indexOf(page))
  const go = (d: number) => onPage(pages[(i + d + pages.length) % pages.length])
  const arrow = cn("grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", QUIET)
  return (
    <div className="inline-flex items-center gap-1">
      {pages.length > 1 && (
        <button type="button" onClick={() => go(-1)} aria-label={t`Previous page`} className={arrow}>
          <ChevronLeft className="size-4" />
        </button>
      )}
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground" aria-live="polite">
        <span aria-hidden className="grid h-[30px] w-[23px] place-items-center overflow-hidden rounded-[3px] bg-muted ring-1 ring-border">{src && <img src={src} alt="" className="max-h-full max-w-full" />}</span>
        <Trans>Page {page}</Trans>
      </span>
      {pages.length > 1 && (
        <button type="button" onClick={() => go(1)} aria-label={t`Next page`} className={arrow}>
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  )
}

/**
 * A question from the engine, and the only thing on the canvas while it's open: the book as it
 * would come out with each answer, side by side, on a page that shows the thing in question.
 * Picking one answers it. The reading's own words wait behind "Why are we asking?".
 */
export function WhichLooksRight({ setup, fact, file, device, onDevice, onPick, onClose }: { setup: CanvasSetup; fact: SetupFact; file: File | null; device: Device; onDevice: (d: Device) => void; onPick: (value: string) => void; onClose?: () => void }) {
  const { t, i18n } = useLingui()
  const { rec, answers, answered } = setup
  const evidence = fact.evidencePages.length ? fact.evidencePages.slice(0, 6) : [rec.previewPage]
  const [page, setPage] = useState(evidence[0])
  const [why, setWhy] = useState(false)
  const { ref, box } = useBox()

  const readings = [...new Set([fact.value, fact.secondOpinion].filter((v): v is string => !!v))]
  const same = (a: string, b: string) => SETTING_IDS.every((id) => setup.lookFor(fact.id, a)[id] === setup.lookFor(fact.id, b)[id])
  // The two readings; when they'd make the same book (or only one ran), every answer, so the outcomes differ.
  const cards = readings.length >= 2 && !same(readings[0], readings[1]) ? readings : FACT_OPTIONS[fact.id]
  const others = FACT_OPTIONS[fact.id].filter((v) => !cards.includes(v))
  const looks = cards.map((v) => setup.lookFor(fact.id, v))
  const moved = SETTING_IDS.filter((id) => looks.some((l) => l[id] !== looks[0][id])) as SetupSettingId[]
  // Every setting but Preset shows on the preview.
  const alike = moved.length > 0 && SETTING_IDS.filter((id) => id !== "preset").every((id) => looks.every((l) => l[id] === looks[0][id]))
  const hidden = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(moved.map((id) => i18n._(SETTING_LABEL[id])))
  const current = answered.includes(fact.id) || !fact.ask ? answers[fact.id] : null

  const phone = box.w > 0 && box.w < 640
  const cols = phone ? 1 : cards.length
  const gap = 16
  const cardW = (box.w - gap * (cols - 1)) / cols - 24
  const { w: dw, h: dh } = deviceSize(device)
  const maxH = phone ? 230 : Math.max(140, box.h - 120)
  const width = Math.max(120, Math.min(cardW, (maxH * dw) / dh))
  const height = (width * dh) / dw

  return (
    <section aria-labelledby={`pf-q-${fact.id}`} className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`pf-q-${fact.id}`} className="min-w-0 max-w-[640px] text-[17px] font-semibold leading-snug tracking-[-0.01em] sm:text-[19px]">
          {i18n._(FACT_QUESTION[fact.id])}
        </h2>
        <div className="flex items-center gap-2">
          <DeviceToggle value={device} onChange={onDevice} />
          {onClose && (
            <button type="button" onClick={onClose} aria-label={t`Close the comparison`} title={t`Close the comparison`} className={cn("grid size-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground", QUIET)}>
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={ref} className={cn("grid min-h-0 flex-1 items-center gap-4", cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
        {box.w > 0 &&
          cards.map((v, i) => (
            <OptionCard
              key={`${v}-${device}-${page}`}
              index={i}
              title={i18n._(FACT_SHORT[fact.id][v])}
              detail={i18n._(FACT_LONG[fact.id][v])}
              tag={readings.length >= 2 && readings.includes(v) ? i18n._(v === fact.value ? OUR_GUESS : OTHER_POSSIBILITY) : undefined}
              guess={v === fact.value}
              look={looks[i]}
              moved={moved}
              device={device}
              file={file}
              pages={screenPages(rec, looks[i].pageGrouping, page)}
              width={width}
              height={height}
              chosen={current === v}
              onChoose={() => onPick(v)}
            />
          ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PageStepper file={file} pages={evidence} page={page} onPage={setPage} />
          <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why} aria-controls={`pf-why-${fact.id}`} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50", QUIET)}>
            <Trans>Why are we asking?</Trans>
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", why && "rotate-180")} />
          </button>
          {others.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Trans>Neither:</Trans>
              {others.map((v) => (
                <button key={v} type="button" onClick={() => onPick(v)} className={cn("rounded-full px-2 py-0.5 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-brand-400", QUIET)}>
                  {i18n._(FACT_SHORT[fact.id][v])}
                </button>
              ))}
            </span>
          )}
        </div>
        <Collapsible shown={why}>
          <div id={`pf-why-${fact.id}`} inert={!why} className="flex max-w-[720px] flex-col gap-1.5 pt-1 text-[13px] leading-snug text-muted-foreground">
            <p>{fact.askReason === "readings-disagree" ? <Trans>The two AI readings of your book disagree here.</Trans> : <Trans>Only a few pages showed this, so we&apos;d rather ask.</Trans>}</p>
            {fact.reason && <p className="italic text-foreground/80">“{fact.reason}”</p>}
            {alike && <p>{t`Both look alike on screen. The answer changes ${hidden}.`}</p>}
          </div>
        </Collapsible>
      </div>
    </section>
  )
}
