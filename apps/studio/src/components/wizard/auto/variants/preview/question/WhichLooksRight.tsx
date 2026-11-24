import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupSettingId } from "@adt/types"
import { Eye, Quote, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, SETTING_IDS } from "../../../engine/answers"
import { FACT_LONG, FACT_QUESTION, FACT_SHORT, OTHER_POSSIBILITY, OUR_GUESS } from "../../../engine/words"
import { DeviceToggle } from "../../../decide/strategies"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import type { CanvasSetup } from "../useSetup"
import type { Device } from "../stage/layouts"
import { screenPages } from "../stage/pages"
import { useBox } from "../stage/useBox"
import { SETTING_LABEL } from "../labels"
import { deviceSize } from "../stage/BookDevice"
import { OptionCard } from "./OptionCard"

function EvidenceThumb({ file, page, active, onClick }: { file: File | null; page: number; active: boolean; onClick: () => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 64)
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={t`Compare on page ${page}`} className={cn("flex flex-col items-center gap-0.5 rounded-lg p-1 transition-colors", active ? "bg-brand-50 ring-2 ring-brand-500" : "hover:bg-muted")}>
      <span className="grid h-[42px] w-[32px] place-items-center overflow-hidden rounded-[4px] bg-muted ring-1 ring-border">{src && <img src={src} alt="" className="max-h-full max-w-full" />}</span>
      <span className="text-[10.5px] font-semibold tabular-nums text-muted-foreground">{page}</span>
    </button>
  )
}

/**
 * A question from the engine, asked as "Which looks right?": the book as it would come out with
 * each answer, side by side, on one of the book's own pages that shows the thing in question.
 * Picking one answers it; the stage then shows the book with that answer.
 */
export function WhichLooksRight({ setup, fact, file, device, onDevice, number, total, onPick, onClose }: { setup: CanvasSetup; fact: SetupFact; file: File | null; device: Device; onDevice: (d: Device) => void; number: number; total: number; onPick: (value: string) => void; onClose?: () => void }) {
  const { t, i18n } = useLingui()
  const { rec, answers, answered } = setup
  const [page, setPage] = useState(fact.evidencePages[0] ?? rec.previewPage)
  const { ref, box } = useBox()

  const readings = [...new Set([fact.value, fact.secondOpinion].filter((v): v is string => !!v))]
  const same = (a: string, b: string) => SETTING_IDS.every((id) => setup.lookFor(fact.id, a)[id] === setup.lookFor(fact.id, b)[id])
  // Show the two readings; when they'd make the same book (or only one reading ran), show every answer so the outcomes differ.
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
  const maxH = phone ? 300 : Math.max(140, box.h - 190)
  const width = Math.max(120, Math.min(cardW, (maxH * dw) / dh))
  const height = (width * dh) / dw
  const disagree = fact.askReason === "readings-disagree"

  return (
    <section aria-labelledby={`pf-q-${fact.id}`} className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-700">{total > 1 ? <Trans>Question {number} of {total}</Trans> : fact.ask ? <Trans>One thing to check</Trans> : <Trans>Compare</Trans>}</span>
          <h2 id={`pf-q-${fact.id}`} className="max-w-[680px] text-[19px] font-semibold leading-snug tracking-[-0.01em] sm:text-[21px]">
            {i18n._(FACT_QUESTION[fact.id])}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <DeviceToggle value={device} onChange={onDevice} />
          {onClose && (
            <button type="button" onClick={onClose} aria-label={fact.ask && !answered.includes(fact.id) ? t`Decide later` : t`Close the comparison`} title={fact.ask && !answered.includes(fact.id) ? t`Decide later` : t`Close the comparison`} className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {alike && (
        <p className="-mt-1 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
          <Trans>These look alike on screen. The answer changes {hidden}, which shapes how the book is built.</Trans>
        </p>
      )}
      <div ref={ref} className={cn("grid min-h-0 flex-1 gap-4", cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
        {box.w > 0 &&
          cards.map((v, i) => (
            <OptionCard
              key={`${v}-${device}-${page}`}
              index={i}
              title={i18n._(FACT_SHORT[fact.id][v])}
              body={i18n._(FACT_LONG[fact.id][v])}
              tag={
                readings.length >= 2 && readings.includes(v) && (
                  <span className={cn("w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold", v === fact.value ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-muted text-muted-foreground ring-1 ring-border")}>{i18n._(v === fact.value ? OUR_GUESS : OTHER_POSSIBILITY)}</span>
                )
              }
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {fact.reason && (
            <p className="flex max-w-[640px] items-start gap-2 text-[13px] leading-snug text-muted-foreground">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
              <span>
                {disagree ? <Trans>The two AI readings disagree. One of them said:</Trans> : <Trans>Only a few pages of the book showed this. The AI said:</Trans>} <span className="italic text-foreground/80">{fact.reason}</span>
              </span>
            </p>
          )}
          {others.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <Trans>Neither?</Trans>
              {others.map((v) => (
                <button key={v} type="button" onClick={() => onPick(v)} className="rounded-full bg-card px-3 py-1 font-semibold text-foreground ring-1 ring-border transition-colors hover:ring-brand-300">
                  {i18n._(FACT_SHORT[fact.id][v])}
                </button>
              ))}
            </p>
          )}
        </div>
        {fact.evidencePages.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="mr-1 text-[12px] font-medium text-muted-foreground">
              <Trans>Shown on page</Trans>
            </span>
            {fact.evidencePages.slice(0, 4).map((p) => (
              <EvidenceThumb key={p} file={file} page={p} active={p === page} onClick={() => setPage(p)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
