import { useEffect, useRef, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Quote } from "lucide-react"
import type { SetupFact, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, settingsFor, type FactAnswers } from "../../engine/answers"
import { FACT_SHORT } from "../../engine/words"
import { useInlinePages } from "../livechat/ideas/evidence/ClaimMark"
import { launch } from "../livechat/ideas/question/FlyIn"
import { PreviewChoices } from "../livechat/ideas/question/PreviewChoices"
import { SmartDefault } from "../livechat/ideas/question/SmartDefault"
import "../livechat/ideas/question/question.css"
import { PageStrip } from "./Evidence"
import { useIdea } from "./ideas"
import { settingsTouchedBy } from "./useAnswers"
import { Why } from "./Why"
import { ASK_WHY, FACT_HINT, QUESTION_SHORT, SETTING_LABEL, valueTitle } from "./words"

/** The question in the assistant's bubble: where it is in the run ("1 of 2"), then the question, short. */
export function QuestionText({ fact, index, total, mark }: { fact: SetupFact; index: number; total: number; mark?: ReactNode }) {
  const { i18n } = useLingui()
  return (
    <>
      {total > 1 && (
        <span className="mb-0.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-brand-700">
          <Trans>
            {index} of {total}
          </Trans>
        </span>
      )}
      <strong className="block font-semibold">
        {i18n._(QUESTION_SHORT[fact.id]!)}
        {mark}
      </strong>
    </>
  )
}

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
  // d19: right after a tap, the others fade and the tapped one leaves for the reply.
  const [flown, setFlown] = useState<string | null>(null)
  useEffect(() => {
    if (!flown) return
    const id = window.setTimeout(() => setFlown(null), 1100)
    return () => window.clearTimeout(id)
  }, [flown])
  const pick = (value: string, el: Element | null) => {
    if (idea === "d19" && value !== chosen) {
      launch(fact.id, el)
      setFlown(value)
    }
    onAnswer(value)
  }
  const smart = idea === "d21" && !chosen && !others
  return (
    <div inert={frozen} className="flex w-full flex-col gap-1 rounded-[22px] bg-card/95 p-2 ring-1 ring-border shadow-[0_14px_36px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
      {smart ? (
        <SmartDefault
          fact={fact}
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
              onClick={(e) => pick(value, e.currentTarget)}
              data-flown={flown ? (flown === value ? "went" : "other") : undefined}
              className={cn("relative flex w-full flex-col rounded-[16px] px-3.5 py-2.5 pr-10 text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]", idea === "d19" && "qd19-fade", selected ? "bg-brand-50 ring-2 ring-brand-500" : "ring-1 ring-transparent hover:bg-muted/70 hover:ring-border")}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-semibold">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
                {value === fact.value && (
                  <span className="whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
                    <Trans>My guess</Trans>
                  </span>
                )}
              </span>
              <span className="text-[13px] text-muted-foreground">{i18n._(FACT_HINT[fact.id]![value]!)}</span>
              <span aria-hidden className={cn("absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full transition-[transform,opacity] duration-200", selected ? "scale-100 bg-brand-600 text-primary-foreground opacity-100" : "scale-75 opacity-0")}>
                <Check className="size-3 stroke-[3]" />
              </span>
            </button>
          )
        })}
      </div>
      )}
      <div className="border-t border-border/70 px-2 pb-1 pt-1.5">
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
                    <span className="font-semibold text-foreground">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
                    {" → "}
                    {touched
                      .map((id) => {
                        const title = valueTitle(id, then[id]?.value)
                        return `${i18n._(SETTING_LABEL[id])}: ${title ? i18n._(title) : String(then[id]?.value)}`
                      })
                      .join(", ")}
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
