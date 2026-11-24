import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_OPTIONS, settingsChangedBy, settingsFor, type FactAnswers } from "../../../engine/answers"
import { FACT_LONG, FACT_SHORT, OTHER_POSSIBILITY, OUR_GUESS } from "../../../engine/words"
import { useSettingWords } from "../useBookState"

/**
 * The answers a note offers, in plain words, each with what it would set: only the bookmarks that
 * differ between the answers are named, so the consequence of a choice is visible before it's made.
 */
export function FactOptions({ rec, fact, answers, checked, legend, onPick }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; checked: string | null; legend: string; onPick: (value: string) => void }) {
  const { i18n } = useLingui()
  const words = useSettingWords()
  const name = useId()
  const options = FACT_OPTIONS[fact.id]
  const varying = [...new Set(options.flatMap((v) => settingsChangedBy(rec, answers, fact.id, v)))] as SetupSettingId[]
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="sr-only">{legend}</legend>
      {options.map((value) => {
        const on = checked === value
        const then = settingsFor(rec, { ...answers, [fact.id]: value })
        return (
          <label
            key={value}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1 rounded-xl border bg-white/70 px-3 py-2 transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400/70 dark:bg-white/[0.04]",
              on ? "border-brand-500 bg-white shadow-[0_4px_14px_-8px_rgba(43,127,255,0.6)] dark:bg-brand-500/15" : "border-stone-900/10 hover:border-brand-300 dark:border-white/10",
            )}
          >
            <input type="radio" name={name} value={value} className="sr-only" checked={on} onChange={() => onPick(value)} />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors", on ? "border-brand-600" : "border-stone-400/70")}>
                <span className={cn("size-1.5 rounded-full bg-brand-600 transition-transform duration-150", on ? "scale-100" : "scale-0")} />
              </span>
              <span className="text-[13.5px] font-semibold">{i18n._(FACT_SHORT[fact.id][value]!)}</span>
              {value === fact.value && (
                <span className="rounded-full bg-brand-600/10 px-1.5 py-px text-[10.5px] font-semibold text-brand-700 dark:text-brand-700">{i18n._(OUR_GUESS)}</span>
              )}
              {value === other && <span className="rounded-full bg-stone-900/[0.06] px-1.5 py-px text-[10.5px] font-semibold text-stone-600 dark:bg-white/10 dark:text-stone-300">{i18n._(OTHER_POSSIBILITY)}</span>}
            </span>
            <span className="pl-6 text-[12px] leading-snug text-stone-600 dark:text-stone-300">{i18n._(FACT_LONG[fact.id][value]!)}</span>
            {varying.length > 0 && (
              <span className="flex flex-col gap-0.5 pl-6 text-[11.5px] font-medium text-stone-500 dark:text-stone-400">
                {varying.map((id) => (
                  <span key={id}>
                    <ArrowRight aria-hidden className="mr-1 inline size-3 align-[-2px]" />
                    <Trans>
                      {words.name(id)}: <span className="font-semibold text-stone-700 dark:text-stone-200">{words.value(id, then[id]!.value)}</span>
                    </Trans>
                  </span>
                ))}
              </span>
            )}
          </label>
        )
      })}
    </fieldset>
  )
}
