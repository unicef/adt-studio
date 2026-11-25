import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import type { SetupBookFactId, SetupFact, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, settingsFor, type FactAnswers } from "../../engine/answers"
import { FACT_SHORT } from "../../engine/words"
import { ClaimMark } from "../livechat/ideas/evidence/ClaimMark"
import { PreviewChoices, Screen } from "../livechat/ideas/question/PreviewChoices"
import type { Answers } from "../chat/useAnswers"
import { FACT_HINT, QUESTION_SHORT } from "../chat/words"
import { screenPages, useScreenImages } from "../preview/stage/pages"
import { lookOf } from "../preview/useSetup"
import { Morph } from "./Morph"

/** The book as it would come out with the current answers, on the page that shows the fact. */
function Picture({ rec, fact, answers, file }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; file: File | null | undefined }) {
  const look = lookOf(settingsFor(rec, answers))
  const pages = screenPages(rec, look.pageGrouping, fact.evidencePages[0] ?? rec.previewPage)
  const srcs = useScreenImages(file, pages)
  return (
    <span className="qd18-pv relative grid h-[112px] w-full shrink-0 place-items-center overflow-hidden rounded-[12px] sm:h-[120px] sm:w-[188px]">
      <Screen shown={look} srcs={srcs} width={160} />
    </span>
  )
}

function SureCard({ rec, fact, chat, file, frozen, onAnswer }: { rec: SetupRecommendation; fact: SetupFact; chat: Answers; file: File | null | undefined; frozen: boolean; onAnswer: (fact: SetupBookFactId, value: string) => void }) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const [open, setOpen] = useState(false)
  const value = derived.current[fact.id]
  const changed = value !== fact.value
  const head = `gd-sure-${fact.id}`
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
  const order = [value, ...FACT_OPTIONS[fact.id].filter((v) => v !== value && v !== other), ...(other && other !== value ? [other] : [])]
  return (
    <div inert={frozen} className="gd-sure flex flex-col gap-3 rounded-[18px] p-2.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Picture rec={rec} fact={fact} answers={derived.current} file={file} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 px-1.5 pb-1 sm:px-0 sm:pb-0 sm:pr-2">
          <span id={head} className="text-[13px] text-muted-foreground">
            {i18n._(QUESTION_SHORT[fact.id]!)}
            <ClaimMark file={file} pages={fact.evidencePages} />
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--gd-step)] px-2 py-0.5 text-[11.5px] font-medium text-primary-foreground">
              <Check className="size-3 stroke-[3]" />
              {changed ? <Trans>Your pick</Trans> : <Trans>I&apos;m sure</Trans>}
            </span>
          </span>
          <span className="text-[13.5px] leading-snug text-muted-foreground">{i18n._(FACT_HINT[fact.id]![value]!)}</span>
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="lc-link -ml-1.5 mt-1 inline-flex min-h-9 items-center gap-1 px-1.5 text-[13.5px] font-medium">
            {open ? <Trans>Hide the other options</Trans> : <Trans>See the other options</Trans>}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      <Morph swap={String(open)} inner="">
        {open && (
          <div className="px-0.5 pb-1">
            <PreviewChoices
              rec={rec}
              fact={fact}
              order={order}
              answers={derived.current}
              chosen={value}
              onAnswer={(v) => {
                setOpen(false)
                onAnswer(fact.id, v)
              }}
              file={file}
              labelId={head}
            />
          </div>
        )}
      </Morph>
    </div>
  )
}

/**
 * What the engine is sure of (the facts it didn't ask about and that change the setup): each one
 * highlighted as the pick, with the book as it would come out, and its other options one tap away.
 */
export function SureFacts({ rec, chat, file, frozen, onAnswer }: { rec: SetupRecommendation; chat: Answers; file: File | null | undefined; frozen: boolean; onAnswer: (fact: SetupBookFactId, value: string) => void }) {
  const asked = new Set(chat.derived!.asked.map((f) => f.id))
  const sure = rec.facts.filter((f) => f.matters && !asked.has(f.id))
  if (!sure.length) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[15px] font-semibold tracking-[-0.01em]">
        <Trans>What I&apos;m sure of</Trans>
      </h2>
      {sure.map((fact) => (
        <SureCard key={fact.id} rec={rec} fact={fact} chat={chat} file={file} frozen={frozen} onAnswer={onAnswer} />
      ))}
    </section>
  )
}
