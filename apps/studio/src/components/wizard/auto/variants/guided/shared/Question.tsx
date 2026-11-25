import { useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Quote } from "lucide-react"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, settingsFor, settingsTouchedBy, type FactAnswers } from "../../../engine/answers"
import { FACT_SHORT } from "../../../engine/words"
import { useInlinePages } from "./ideas/evidence/ClaimMark"
import { PreviewChoices } from "./ideas/question/PreviewChoices"
import { SmartDefault } from "./ideas/question/SmartDefault"
import "./ideas/question/question.css"
import { PageStrip } from "./Evidence"
import { useIdea } from "./ideaGroups"
import type { SettingValue } from "./useAnswers"
import { Why } from "./Why"
import { ASK_WHY, FACT_HINT, plainTitle } from "./words"

/**
 * The answers as short cards: a label and one line each, the engine's guess marked. Why it asks,
 * the other reading's own words, what each answer sets and the pages are behind "Why?"; one page
 * is shown by default. The answer stays changeable after it's given.
 */
export function QuestionCard({ rec, fact, answers, chosen, onAnswer, frozen, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; chosen?: string; onAnswer: (value: string) => void; frozen: boolean; file: File | null | undefined; labelId: string }) {
  const { i18n } = useLingui()
  const touched = settingsTouchedBy(rec, answers, fact.id)
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
  const order = [fact.value, ...(other ? [other] : []), ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value && v !== other)]
  const idea = useIdea("question")
  const inlinePages = useInlinePages()
  // d21: only the guess until the user asks for the others (or has answered).
  const [others, setOthers] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const smart = idea === "d21" && !chosen && !others
  const bare = idea === "d18"
  // What an answer sets, in plain words ("One column, like an article").
  const sets = (id: SetupSettingId, value: SettingValue | undefined) => {
    const plain = plainTitle(id, value)
    return plain ? i18n._(plain) : String(value)
  }
  return (
    // d18 sits on the page like the board's cards: no surface around them.
    <div inert={frozen} className={bare ? "flex w-full flex-col gap-1" : "lc-surface flex w-full flex-col gap-0.5 p-1.5"}>
      {smart ? (
        <SmartDefault
          fact={fact}
          file={file}
          onAnswer={onAnswer}
          onOthers={() => {
            setOthers(true)
            window.requestAnimationFrame(() => list.current?.querySelector<HTMLElement>("button")?.focus())
          }}
        />
      ) : idea === "d18" ? (
        <PreviewChoices rec={rec} fact={fact} order={order} answers={answers} chosen={chosen} onAnswer={onAnswer} file={file} labelId={labelId} />
      ) : (
      <div ref={list} role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
        {order.map((value) => {
          const selected = chosen === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onAnswer(value)}
              className={cn(
                "relative flex w-full flex-col text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                "min-h-11 gap-0.5 rounded-[14px] px-3.5 py-2.5 pr-10",
                selected ? "bg-brand-50 ring-1 ring-brand-600" : "ring-1 ring-transparent hover:bg-[var(--lc-stage)]",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-medium">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
                {value === fact.value && (
                  <span className="whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-medium text-brand-700">
                    <Trans>My guess</Trans>
                  </span>
                )}
              </span>
              <span className="text-[13.5px] text-muted-foreground">{i18n._(FACT_HINT[fact.id]![value]!)}</span>
              <span aria-hidden className={cn("absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full transition-[transform,opacity] duration-200", selected ? "scale-100 bg-brand-600 text-primary-foreground opacity-100" : "scale-75 opacity-0")}>
                <Check className="size-3 stroke-[3]" />
              </span>
            </button>
          )
        })}
      </div>
      )}
      <div className={bare ? "px-1 pt-1" : "mx-2 border-t border-border/70 pb-0.5 pt-1"}>
        <Why aside={fact.evidencePages.length > 0 && !inlinePages ? <PageStrip file={file} pages={fact.evidencePages.slice(0, 1)} className="shrink-0" small /> : undefined}>
          {fact.askReason && <p>{i18n._(ASK_WHY[fact.askReason]!)}</p>}
          {other && fact.reason && (
            <p className="flex gap-1.5 italic">
              <Quote className="mt-0.5 size-3 shrink-0 opacity-60" />
              <span>
                <Trans>The other reading:</Trans> {fact.reason}
              </span>
            </p>
          )}
          {touched.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {order.map((value) => {
                const then = settingsFor(rec, { ...answers, [fact.id]: value })
                return (
                  <li key={value}>
                    <span className="font-medium text-foreground">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
                    {" → "}
                    {touched.map((id) => sets(id, then[id]?.value)).join(" · ")}
                  </li>
                )
              })}
            </ul>
          )}
          {fact.evidencePages.length > 1 && <PageStrip file={file} pages={fact.evidencePages.slice(1)} />}
        </Why>
      </div>
    </div>
  )
}
