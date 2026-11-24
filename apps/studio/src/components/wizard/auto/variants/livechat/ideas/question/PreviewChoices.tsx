import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { settingsFor, type FactAnswers } from "../../../../engine/answers"
import { FACT_SHORT } from "../../../../engine/words"
import { settingsTouchedBy } from "../../../chat/useAnswers"
import { SETTING_LABEL, valueTitle } from "../../../chat/words"
import { BookDevice, fitScale } from "../../../preview/stage/BookDevice"
import { screenPages, useDescribe, useScreenImages } from "../../../preview/stage/pages"
import { useBox } from "../../../preview/stage/useBox"
import { lookOf } from "../../../preview/useSetup"
import "./question.css"

function Choice({ rec, fact, value, answers, page, width, chosen, first, onPick, file, moved }: { rec: SetupRecommendation; fact: SetupFact; value: string; answers: FactAnswers; page: number; width: number; chosen: boolean; first: boolean; onPick: () => void; file: File | null | undefined; moved: SetupSettingId[] }) {
  const { i18n } = useLingui()
  const describe = useDescribe()
  const decided = settingsFor(rec, { ...answers, [fact.id]: value })
  const look = lookOf(decided)
  const pages = screenPages(rec, look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  const scale = fitScale("desktop", width, width * 0.7)
  const label = i18n._(FACT_SHORT[fact.id][value]!)
  const brings = moved[0]
  const brought = brings ? valueTitle(brings, decided[brings]?.value) : undefined
  return (
    <button type="button" aria-pressed={chosen} data-q-first={first ? "" : undefined} onClick={onPick} aria-label={`${label}. ${describe(look, "desktop", pages)}`} className={cn("qd18-o group relative flex min-w-0 flex-col gap-2 rounded-[18px] bg-card p-2 text-left ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", chosen ? "is-sel ring-2 ring-brand-500" : "ring-border hover:ring-brand-300")}>
      <span className="qd18-pv grid place-items-center overflow-hidden rounded-[12px] bg-gradient-to-br from-brand-50 to-brand-100/70 py-2.5">
        <span className="qd18-dev">
          <BookDevice device="desktop" scale={scale} shown={look} srcs={srcs} label="" />
        </span>
      </span>
      <span className="flex items-start gap-2 px-1 pb-0.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-[14.5px] font-semibold leading-tight">{label}</span>
            {value === fact.value && (
              <span className="whitespace-nowrap rounded-full bg-brand-50 px-1.5 py-px text-[10.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
                <Trans>My guess</Trans>
              </span>
            )}
          </span>
          {brings && brought && (
            <span className="text-[12px] leading-snug text-muted-foreground">
              {i18n._(SETTING_LABEL[brings])} <span className="font-semibold text-foreground">{i18n._(brought)}</span>
            </span>
          )}
        </span>
        <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200", chosen ? "border-brand-600 bg-brand-600 text-primary-foreground" : "border-border group-hover:border-brand-300")}>{chosen && <Check className="size-3 stroke-[3]" />}</span>
      </span>
    </button>
  )
}

/**
 * Choices with live previews (d18): each answer is a picture of the book as it would come out,
 * drawn on one of the user's own pages that show the thing in question. The picked one lifts.
 */
export function PreviewChoices({ rec, fact, order, answers, chosen, onAnswer, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; order: string[]; answers: FactAnswers; chosen?: string; onAnswer: (value: string) => void; file: File | null | undefined; labelId: string }) {
  const { ref, box } = useBox()
  const page = fact.evidencePages[0] ?? rec.previewPage
  const touched = settingsTouchedBy(rec, answers, fact.id)
  // The setting the answers differ on most visibly comes first.
  const moved = [...touched].sort((a, b) => Number(b === "renderStrategy" || b === "pageGrouping") - Number(a === "renderStrategy" || a === "pageGrouping"))
  const cols = order.length
  const width = Math.max(120, (box.w - 8 * (cols - 1)) / cols - 36)
  return (
    <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {box.w > 0 && order.map((value, i) => <Choice key={value} rec={rec} fact={fact} value={value} answers={answers} page={page} width={width} chosen={chosen === value} first={i === 0} onPick={() => onAnswer(value)} file={file} moved={moved} />)}
    </div>
  )
}
