import { useState } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { Quote } from "lucide-react"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, SETTING_IDS, settingsFor, type FactAnswers } from "../../engine/answers"
import { FACT_SHORT, OTHER_POSSIBILITY, OUR_GUESS } from "../../engine/words"
import { PageStrip } from "../chat/Evidence"
import { Why } from "../chat/Why"
import { ASK_WHY, FACT_HINT, QUESTION_SHORT } from "../chat/words"
import { OptionCard } from "../preview/question/OptionCard"
import { deviceSize } from "../preview/stage/BookDevice"
import { screenPages } from "../preview/stage/pages"
import { useBox } from "../preview/stage/useBox"
import { lookOf } from "../preview/useSetup"
import { morphName, useMorph } from "./morph"
import { DoneLine, StageHead, Surface } from "./Surface"

/**
 * A question, grown into a panel that takes most of the window: the answers side by side as the
 * book would come out with each, "1 of 2" above. Picking one shrinks that card into the user's
 * reply bubble (same morph name), and the next step grows. Answered, it is a one-line bubble that
 * grows back out to change the answer. Why it asks, the reading's words and the pages are behind "Why?".
 */
export function QuestionSurface({ rec, fact, answers, chosen, index, total, expanded, frozen, file, onPick, onOpen, onCollapse }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; chosen?: string; index: number; total: number; expanded: boolean; frozen: boolean; file: File; onPick: (value: string) => void; onOpen: () => void; onCollapse: () => void }) {
  const { i18n } = useLingui()
  const morph = useMorph()
  const head = `lc-q-${fact.id}-head`
  const { ref, box } = useBox()
  const [picking, setPicking] = useState<string | null>(null)

  const reply = chosen && (
    <Surface name={`lc-reply-${fact.id}`} expanded={false} side="user">
      {i18n._(FACT_SHORT[fact.id][chosen]!)}
    </Surface>
  )

  if (!expanded)
    return (
      <div className="flex flex-col gap-2">
        <Surface name={`lc-q-${fact.id}`} expanded={false} labelledBy={head}>
          <DoneLine onOpen={onOpen} locked={frozen}>
            <span id={head} className="text-muted-foreground">
              {i18n._(QUESTION_SHORT[fact.id]!)}
            </span>
          </DoneLine>
        </Surface>
        {reply}
      </div>
    )

  const readings = [...new Set([fact.value, fact.secondOpinion].filter((v): v is string => !!v))]
  const lookFor = (v: string) => lookOf(settingsFor(rec, { ...answers, [fact.id]: v }))
  const same = (a: string, b: string) => SETTING_IDS.every((id) => lookFor(a)[id] === lookFor(b)[id])
  const cards = readings.length >= 2 && !same(readings[0]!, readings[1]!) ? readings : FACT_OPTIONS[fact.id]
  const others = FACT_OPTIONS[fact.id].filter((v) => !cards.includes(v))
  const looks = cards.map(lookFor)
  const moved = SETTING_IDS.filter((id) => looks.some((l) => l[id] !== looks[0]![id])) as SetupSettingId[]
  const page = fact.evidencePages[0] ?? rec.previewPage
  // Only the Preset differs: the screens look alike, so say what the answer really changes.
  const alike = moved.length > 0 && moved.every((id) => id === "preset")
  const { w: dw, h: dh } = deviceSize("desktop")
  const cardW = (box.w - 20 * (cards.length - 1)) / cards.length - 24
  const width = Math.max(140, Math.min(cardW, ((box.h - 96) * dw) / dh))
  const height = (width * dh) / dw

  const pick = (v: string) => {
    flushSync(() => setPicking(v))
    morph(() => {
      setPicking(null)
      onPick(v)
    })
  }

  return (
    <Surface name={`lc-q-${fact.id}`} expanded labelledBy={head}>
      <div className="flex h-[clamp(440px,calc(100vh-200px),760px)] flex-col gap-4 p-6">
        <StageHead id={head} kicker={total > 1 ? <Trans>{index} of {total}</Trans> : undefined} title={i18n._(QUESTION_SHORT[fact.id]!)} onCollapse={chosen ? onCollapse : undefined} />
        <div ref={ref} inert={frozen} className={cn("grid min-h-0 flex-1 items-center justify-items-center gap-5", cards.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {box.w > 0 &&
            cards.map((v, i) => (
              <div key={v} style={picking === v ? morphName(`lc-reply-${fact.id}`) : undefined} className="min-w-0">
                <OptionCard
                  index={i}
                  title={i18n._(FACT_SHORT[fact.id][v]!)}
                  detail={i18n._(FACT_HINT[fact.id]![v]!)}
                  tag={readings.length >= 2 && readings.includes(v) ? i18n._(v === fact.value ? OUR_GUESS : OTHER_POSSIBILITY) : undefined}
                  guess={v === fact.value}
                  look={looks[i]!}
                  moved={moved}
                  device="desktop"
                  file={file}
                  pages={screenPages(rec, looks[i]!.pageGrouping, page)}
                  width={width}
                  height={height}
                  chosen={chosen === v}
                  onChoose={() => pick(v)}
                />
              </div>
            ))}
        </div>
        <div className="flex items-start gap-4">
          <Why className="min-w-0 flex-1" aside={<PageStrip file={file} pages={[page]} small />}>
            {fact.askReason && <p>{i18n._(ASK_WHY[fact.askReason]!)}</p>}
            {fact.reason && fact.secondOpinion && fact.secondOpinion !== fact.value && (
              <p className="flex gap-1.5 italic">
                <Quote className="mt-0.5 size-3 shrink-0 opacity-60" />
                <span>
                  <Trans>The other reading:</Trans> {fact.reason}
                </span>
              </p>
            )}
            {fact.evidencePages.length > 1 && <PageStrip file={file} pages={fact.evidencePages.slice(1)} />}
          </Why>
          {alike && (
            <span className="shrink-0 pt-1 text-[13px] text-muted-foreground">
              <Trans>They look alike on screen; the answer sets the Preset.</Trans>
            </span>
          )}
          {others.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-[13px] text-muted-foreground">
              <Trans>Neither:</Trans>
              {others.map((v) => (
                <button key={v} type="button" onClick={() => pick(v)} aria-pressed={chosen === v} className="rounded-full px-2 py-0.5 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-brand-400">
                  {i18n._(FACT_SHORT[fact.id][v]!)}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
    </Surface>
  )
}
