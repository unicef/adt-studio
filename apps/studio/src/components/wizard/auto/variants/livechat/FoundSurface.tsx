import { useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { ChevronLeft, ChevronRight, FileText, Maximize2 } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import { RULE_WHY, TEXT_LAYER } from "../../engine/words"
import { Pill, settledSettings } from "../chat/Findings"
import type { Derived } from "../chat/useAnswers"
import { KIND_SAYS, SETTING_LABEL, valueTitle } from "../chat/words"
import { screenPages } from "../preview/stage/pages"
import { StageHead, Surface } from "./Surface"

const HEAD = "lc-found-head"
// eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
const LEAD: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping"]

/** What the AI noticed, as short tags on the page view (only what a rule really fired on). */
const NOTICE: Record<string, MessageDescriptor> = {
  "group-joined-spreads": msg`Pictures cross the fold`,
  "group-facing-pages": msg`Text faces picture`,
  "group-wide-pages": msg`Two pages per PDF page`,
  "render-keep-page": msg`Words on the pictures`,
  "render-overlay-no-text-layer": msg`Words on the pictures`,
  "render-side-by-side": msg`Words beside the pictures`,
  "render-reflow": msg`Mostly words`,
  "render-reference-column": msg`Dense information`,
  "render-textbook-ai": msg`Lessons and exercises`,
  "figures-keep-together": msg`Labelled pictures`,
  "activities-on": msg`Tasks for the reader`,
}

function BigPage({ file, page, side }: { file: File; page: number; side?: "left" | "right" }) {
  // The column is a size container: two facing pages share its width, one page may use all of it.
  const src = usePageThumb(file, page, 320)
  return (
    <span className={cn("relative grid place-items-center overflow-hidden bg-white", side === "left" && "rounded-l-[8px]", side === "right" && "rounded-r-[8px]", !side && "rounded-[8px]")}>
      {src ? <img key={src} src={src} alt="" className={cn("h-auto max-h-[min(46vh,440px)] w-auto animate-in fade-in duration-300", side ? "max-w-[50cqw]" : "max-w-[100cqw]")} /> : <FileText className="m-24 size-8 text-slate-300" />}
    </span>
  )
}

/**
 * What the assistant found. As a bubble: one sentence, at most three settings, how many questions
 * follow. Grown out ("See why"), it becomes a large view of the pages that show it, with what was
 * noticed tagged on them (the fold glows when facing pages join) and every reason beside it.
 */
export function FoundSurface({ rec, derived, file, expanded, onOpen, onCollapse }: { rec: SetupRecommendation; derived: Derived; file: File; expanded: boolean; onOpen: () => void; onCollapse: () => void }) {
  const { i18n, t } = useLingui()
  const settled = settledSettings(rec, derived)
  const genreAsked = derived.asked.some((f) => f.id === "genre")
  const chips = LEAD.filter((id) => settled.includes(id))
  const leadWhy = settled.includes("renderStrategy") ? RULE_WHY[rec.settings.renderStrategy?.rule ?? ""] : settled.includes("pageGrouping") ? RULE_WHY[rec.settings.pageGrouping?.rule ?? ""] : undefined
  const spread = derived.effective.pageGrouping?.value === "spread" && rec.measured.pageStorage !== "spreads-as-wide-pages"
  const evidence = [...new Set([...(spread ? rec.measured.pageStorageEvidence : []), ...(rec.settingEvidence.renderStrategy ?? []), ...(rec.settingEvidence.preset ?? []), rec.previewPage])].sort((a, b) => a - b)
  const [at, setAt] = useState(0)
  const page = evidence[at] ?? rec.previewPage
  const pages = spread ? screenPages(rec, "spread", page) : [page]
  const notices = [...new Set(settled.map((id) => NOTICE[rec.settings[id]?.rule ?? ""]).filter((m): m is MessageDescriptor => !!m))].slice(0, 3)
  const scan = rec.measured.textLayer !== "digital"
  const count = derived.asked.length

  const sentence = (
    <>
      {!genreAsked && <strong className="font-semibold">{i18n._(KIND_SAYS[derived.proposed.genre]!)} </strong>}
      {leadWhy ? i18n._(leadWhy) : <Trans>I&apos;ve read it.</Trans>}
    </>
  )

  if (!expanded)
    return (
      <Surface name="lc-found" expanded={false} labelledBy={HEAD}>
        <div className="flex flex-col gap-2 py-0.5">
          <p id={HEAD}>
            {sentence}{" "}
            {!rec.secondOpinion && (
              <span className="text-amber-700 dark:text-amber-300">
                <Trans>Only one of my two readings came back.</Trans>{" "}
              </span>
            )}
            {count > 0 && (
              <span className="text-muted-foreground">
                <Plural value={count} one="One question first." other="# questions first." />
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((id) => (
              <Pill key={id} id={id} derived={derived} />
            ))}
            <button type="button" onClick={onOpen} aria-expanded={false} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
              <Maximize2 className="size-3" />
              <Trans>See why</Trans>
            </button>
          </div>
        </div>
      </Surface>
    )

  return (
    <Surface name="lc-found" expanded labelledBy={HEAD}>
      <div className="flex flex-col gap-4 p-6">
        <StageHead id={HEAD} title={sentence} onCollapse={onCollapse} />
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-6">
          <div className="flex min-w-0 flex-col items-center gap-3" style={{ containerType: "inline-size" }}>
            <div className="relative flex max-w-full items-stretch rounded-[10px] shadow-[0_30px_60px_-30px_rgba(15,23,42,0.6)] ring-1 ring-slate-900/10" role="img" aria-label={pages.length === 2 ? t`Pages ${pages[0]} and ${pages[1]}` : t`Page ${pages[0]}`}>
              {pages.map((p, i) => (
                <BigPage key={p} file={file} page={p} side={pages.length === 2 ? (i === 0 ? "left" : "right") : undefined} />
              ))}
              {pages.length === 2 && (
                <span aria-hidden className="lc-glow pointer-events-none absolute inset-y-0 left-1/2 w-[4px] -ml-[2px] bg-brand-500 shadow-[0_0_28px_8px_rgba(43,127,255,0.5)]" />
              )}
              <span className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-1.5">
                {notices.map((n, i) => (
                  <span key={i} className="lc-rise rounded-full bg-slate-900/75 px-3 py-1 text-[12.5px] font-semibold text-white shadow-lg backdrop-blur" style={{ animationDelay: `${200 + i * 120}ms` }}>
                    {i18n._(n)}
                  </span>
                ))}
                {scan && (
                  <span className="lc-rise rounded-full bg-amber-500/90 px-3 py-1 text-[12.5px] font-semibold text-white shadow-lg" style={{ animationDelay: "560ms" }}>
                    <Trans>Scanned: no real text</Trans>
                  </span>
                )}
              </span>
            </div>
            {evidence.length > 1 && (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <button type="button" onClick={() => setAt((a) => (a - 1 + evidence.length) % evidence.length)} aria-label={t`Previous page`} className="grid size-8 place-items-center rounded-full hover:bg-muted hover:text-foreground">
                  <ChevronLeft className="size-4" />
                </button>
                <span aria-live="polite" className="tabular-nums">
                  {pages.length === 2 ? <Trans>Pages {pages[0]}–{pages[1]}</Trans> : <Trans>Page {pages[0]}</Trans>}
                </span>
                <button type="button" onClick={() => setAt((a) => (a + 1) % evidence.length)} aria-label={t`Next page`} className="grid size-8 place-items-center rounded-full hover:bg-muted hover:text-foreground">
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-3 self-start text-[13.5px] leading-snug">
            {settled.map((id, i) => {
              const why = RULE_WHY[rec.settings[id]?.rule ?? ""]
              const title = valueTitle(id, derived.effective[id]?.value)
              return (
                <li key={id} className="lc-rise flex flex-col gap-0.5" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <span className="text-[12px] text-muted-foreground">{i18n._(SETTING_LABEL[id])}</span>
                  <span className="font-semibold">{title ? i18n._(title) : ""}</span>
                  {why && <span className="text-muted-foreground">{i18n._(why)}</span>}
                </li>
              )
            })}
            {scan && <li className="text-muted-foreground">{i18n._(TEXT_LAYER[rec.measured.textLayer]!)}</li>}
          </ul>
        </div>
      </div>
    </Surface>
  )
}
