import { useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupRecommendation } from "@adt/types"
import { FACT_OPTIONS, settingsTouchedBy } from "../../engine/answers"
import { FACT_SHORT, SETTING_NAME } from "../../engine/words"
import { PreviewChoices } from "../shared/PreviewChoices"
import { lookOf } from "../shared/screens/look"
import type { Answers } from "../shared/useAnswers"
import { factArt } from "../shared/art/ConceptArt"
import { FACT_HINT, plainTitle, QUESTION_SHORT } from "../shared/words"
import { Picture, PICTURE, SurePick } from "./SurePick"
import { CompactOptionsContext } from "../shared/optionsLayout"

/**
 * One fact on a Check screen. Sure (the engine didn't ask): its pick highlighted, the others under
 * "See the other options". Asked: every answer side by side, the guess marked and selected until
 * the user picks another. `sets` adds what the answer turns on ("Interactive activities: On").
 */
export function FactPick({ rec, fact, chat, file, sets, stacked }: { rec: SetupRecommendation; fact: SetupFact; chat: Answers; file: File | null | undefined; sets?: boolean; /** One of several questions on the screen: the question, every answer as a compact card (the picked one marked) and what it sets, without the large picture. */ stacked?: boolean }) {
  const { i18n, t } = useLingui()
  const derived = chat.derived!
  const value = derived.current[fact.id]
  const labelId = `gd-fact-${fact.id}`
  const page = fact.evidencePages[0] ?? rec.previewPage
  const question = i18n._(QUESTION_SHORT[fact.id]!)

  if (fact.ask) {
    const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
    const order = [fact.value, ...(other ? [other] : []), ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value && v !== other)]
    return (
      <div className="flex flex-col gap-2">
        <p id={labelId} className="px-1 text-[15px] font-medium">
          {question}
        </p>
        <CompactOptionsContext.Provider value={stacked ? "all" : false}>
          <PreviewChoices rec={rec} fact={fact} order={order} answers={derived.current} chosen={value} onAnswer={(v) => chat.answer(fact.id, v)} file={file} labelId={labelId} />
        </CompactOptionsContext.Provider>
      </div>
    )
  }

  // The engine's pick first; the order stays put while the user tries the others.
  const order = [fact.value, ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value)]
  const applies = settingsTouchedBy(rec, derived.current, fact.id)
  const touched = sets ? applies : []
  const result = touched
    .map((id) => {
      const words = plainTitle(id, derived.effective[id]?.value)
      const name = i18n._(SETTING_NAME[id])
      const setTo = words ? i18n._(words) : String(derived.effective[id]?.value)
      return t`${name}: ${setTo}`
    })
    .join(" · ")
  if (stacked)
    return (
      <div className="flex flex-col gap-2">
        <p id={labelId} className="px-1 text-[15px] font-medium">
          {question}
        </p>
        <CompactOptionsContext.Provider value="all">
          <PreviewChoices rec={rec} fact={fact} order={order} answers={derived.current} chosen={value} onAnswer={(v) => chat.answer(fact.id, v)} file={file} labelId={labelId} />
        </CompactOptionsContext.Provider>
        {result && <p className="px-1 text-[13.5px] leading-snug text-foreground/85">{result}</p>}
      </div>
    )
  return (
    <SurePick
      picture={
        factArt(fact.id, value) ? (
          <span className={`grid shrink-0 place-items-center p-3 ${PICTURE}`}>{factArt(fact.id, value)}</span>
        ) : (
          <Picture rec={rec} look={lookOf(derived.effective)} page={page} file={file} className={PICTURE} />
        )
      }
      label={question}
      title={i18n._(FACT_SHORT[fact.id][value]!)}
      hint={i18n._(FACT_HINT[fact.id]![value]!)}
      result={result || undefined}
      changed={value !== fact.value}
      labelId={labelId}
      others
    >
      <PreviewChoices
        rec={rec}
        fact={fact}
        order={order}
        answers={derived.current}
        chosen={value}
        onAnswer={(v) => chat.answer(fact.id, v)}
        file={file}
        labelId={labelId}
      />
    </SurePick>
  )
}
