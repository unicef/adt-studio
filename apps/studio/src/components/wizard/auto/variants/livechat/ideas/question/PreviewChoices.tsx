import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { settingsFor, type FactAnswers } from "../../../../engine/answers"
import { FACT_SHORT } from "../../../../engine/words"
import { settingsTouchedBy } from "../../../chat/useAnswers"
import { FACT_HINT, plainTitle } from "../../../chat/words"
import { SCREEN, ScreenContent, type Shown } from "../../../preview/stage/layouts"
import { screenPages, useDescribe, useScreenImages } from "../../../preview/stage/pages"
import { useBox } from "../../../preview/stage/useBox"
import { lookOf } from "../../../preview/useSetup"
import "./question.css"

/** One screen of the book as it would come out, drawn like a page on the board: no device frame. */
function Screen({ shown, srcs, width }: { shown: Shown; srcs: (string | undefined)[]; width: number }) {
  const s = SCREEN.desktop
  const scale = width / s.w
  return (
    <span className="qd18-pg relative block overflow-hidden rounded-[5px] bg-white" style={{ width, height: s.h * scale }}>
      <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: `scale(${scale})` }}>
        <ScreenContent shown={shown} device="desktop" srcs={srcs} />
      </span>
    </span>
  )
}

function Choice({ rec, fact, value, answers, page, width, chosen, first, onPick, file, moved }: { rec: SetupRecommendation; fact: SetupFact; value: string; answers: FactAnswers; page: number; width: number; chosen: boolean; first: boolean; onPick: () => void; file: File | null | undefined; moved: SetupSettingId[] }) {
  const { i18n } = useLingui()
  const describe = useDescribe()
  const decided = settingsFor(rec, { ...answers, [fact.id]: value })
  const look = lookOf(decided)
  const pages = screenPages(rec, look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  const label = i18n._(FACT_SHORT[fact.id][value]!)
  // The short line: what you'd get, in plain words ("Picture beside the words"); the answer's own hint when nothing changes.
  const brings = moved[0]
  const plain = brings ? plainTitle(brings, decided[brings]?.value) : undefined
  const line = i18n._(plain ?? FACT_HINT[fact.id]![value]!)
  const guess = value === fact.value
  return (
    <button type="button" aria-pressed={chosen} data-q-first={first ? "" : undefined} onClick={onPick} aria-label={`${label}. ${line}. ${describe(look, "desktop", pages)}`} className={cn("qd18-o group relative flex min-w-0 flex-col p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", chosen && "is-sel")}>
      <span className="qd18-pv relative grid h-[150px] place-items-center overflow-hidden rounded-[12px]">
        <span className="qd18-dev">
          <Screen shown={look} srcs={srcs} width={width} />
        </span>
        {guess && (
          <span className="absolute left-2 top-2 whitespace-nowrap rounded-full bg-[var(--lc-bubble)] px-2 py-0.5 text-[11px] font-medium text-brand-700 shadow-sm">
            <Trans>My guess</Trans>
          </span>
        )}
      </span>
      <span className="flex flex-col px-1.5 pb-1 pt-2.5">
        <span className="text-[15px] font-medium leading-tight">{label}</span>
        <span className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{line}</span>
      </span>
    </button>
  )
}

/**
 * Choices with live previews (d18): light picture cards, each a screen of the book as it would come
 * out (drawn on one of the user's own pages that show the thing in question), a plain label and one
 * short line. The picked card lifts with an accent edge; the others' pictures sit back a little.
 */
export function PreviewChoices({ rec, fact, order, answers, chosen, onAnswer, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; order: string[]; answers: FactAnswers; chosen?: string; onAnswer: (value: string) => void; file: File | null | undefined; labelId: string }) {
  const { ref, box } = useBox()
  const page = fact.evidencePages[0] ?? rec.previewPage
  const touched = settingsTouchedBy(rec, answers, fact.id)
  // The setting the answers differ on most visibly comes first.
  const moved = [...touched].sort((a, b) => Number(b === "renderStrategy" || b === "pageGrouping") - Number(a === "renderStrategy" || a === "pageGrouping"))
  const cols = order.length
  const card = (box.w - 12 * (cols - 1)) / cols
  // The screen fits the picture area (150px tall, 16:10) with room around it.
  const width = Math.max(110, Math.min(card - 30, (134 * SCREEN.desktop.w) / SCREEN.desktop.h))
  return (
    <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-3 pt-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {box.w > 0 && order.map((value, i) => <Choice key={value} rec={rec} fact={fact} value={value} answers={answers} page={page} width={width} chosen={chosen === value} first={i === 0} onPick={() => onAnswer(value)} file={file} moved={moved} />)}
    </div>
  )
}
