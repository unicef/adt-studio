import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Quote } from "lucide-react"
import type { SetupFact, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, settingsFor, type FactAnswers } from "../../engine/answers"
import { FACT_LONG, FACT_QUESTION, FACT_SHORT } from "../../engine/words"
import { Eyebrow } from "./bubbles"
import { PageStrip } from "./Evidence"
import { settingsTouchedBy } from "./useAnswers"
import { ASK_WHY, SETTING_LABEL, valueTitle } from "./words"

/** The question's words, for the assistant's bubble: why it asks, then the question itself. */
export function QuestionText({ fact }: { fact: SetupFact }) {
  const { i18n } = useLingui()
  return (
    <>
      {fact.askReason && <span className="mb-1 block text-muted-foreground">{i18n._(ASK_WHY[fact.askReason]!)}</span>}
      <strong className="block font-semibold">{i18n._(FACT_QUESTION[fact.id])}</strong>
    </>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone: "guess" | "other" }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", tone === "guess" ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-muted text-muted-foreground ring-border")}>{children}</span>
}

/**
 * The answers to one question as cards: plain words, what each would set (in the wizard's names),
 * and which reading said what. The answer stays changeable after it's given; the thread below
 * follows it.
 */
export function QuestionCard({ rec, fact, answers, chosen, onAnswer, frozen, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; chosen?: string; onAnswer: (value: string) => void; frozen: boolean; file: File | null | undefined; labelId: string }) {
  const { i18n } = useLingui()
  const touched = settingsTouchedBy(rec, answers, fact.id)
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
  const order = [fact.value, ...(other ? [other] : []), ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value && v !== other)]
  return (
    <div inert={frozen} className="flex w-full flex-col gap-3 rounded-[22px] bg-card/95 p-2 ring-1 ring-border shadow-[0_14px_36px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
      <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
        {order.map((value) => {
          const then = settingsFor(rec, { ...answers, [fact.id]: value })
          const selected = chosen === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onAnswer(value)}
              className={cn(
                "group relative flex w-full flex-col gap-1 rounded-[16px] px-3.5 py-3 text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                selected ? "bg-brand-50 ring-2 ring-brand-500" : "ring-1 ring-transparent hover:bg-muted/70 hover:ring-border",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
                <span className="text-[15px] font-semibold">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
                {value === fact.value && (
                  <Badge tone="guess">
                    <Trans>My guess</Trans>
                  </Badge>
                )}
                {value === other && (
                  <Badge tone="other">
                    <Trans>Other reading</Trans>
                  </Badge>
                )}
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">{i18n._(FACT_LONG[fact.id][value]!)}</span>
              {value === other && fact.reason && (
                <span className="mt-0.5 flex gap-1.5 text-[12.5px] italic leading-snug text-muted-foreground/90">
                  <Quote className="mt-0.5 size-3 shrink-0 not-italic opacity-60" />
                  {fact.reason}
                </span>
              )}
              {touched.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                  {touched.map((id) => {
                    const title = valueTitle(id, then[id]?.value)
                    return (
                      <span key={id} className="text-muted-foreground">
                        {i18n._(SETTING_LABEL[id])}: <span className="font-semibold text-foreground">{title ? i18n._(title) : String(then[id]?.value)}</span>
                      </span>
                    )
                  })}
                </span>
              )}
              <span aria-hidden className={cn("absolute right-3 top-3 grid size-5 place-items-center rounded-full transition-[transform,opacity,background-color] duration-200", selected ? "scale-100 bg-brand-600 text-primary-foreground opacity-100" : "scale-75 opacity-0")}>
                <Check className="size-3 stroke-[3]" />
              </span>
            </button>
          )
        })}
      </div>
      {fact.evidencePages.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/70 px-2 pb-1 pt-2.5">
          <Eyebrow>
            <Trans>Pages I looked at</Trans>
          </Eyebrow>
          <PageStrip file={file} pages={fact.evidencePages} />
        </div>
      )}
    </div>
  )
}
