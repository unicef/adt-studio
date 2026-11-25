import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupRecommendation } from "@adt/types"
import { FACT_OPTIONS, settingsTouchedBy } from "../../../engine/answers"
import { FACT_SHORT, SETTING_NAME } from "../../../engine/words"
import { ClaimMark } from "../shared/ideas/evidence/ClaimMark"
import { PreviewChoices } from "../shared/ideas/question/PreviewChoices"
import { lookOf } from "../shared/screens/look"
import type { Answers } from "../shared/useAnswers"
import { FACT_HINT, plainTitle, QUESTION_SHORT } from "../shared/words"
import { Picture, PICTURE, SurePick } from "./SurePick"

/**
 * One fact on a Check screen. Sure (the engine didn't ask): its pick highlighted, the others under
 * "See the other options". Asked: every answer side by side, the guess marked and selected until
 * the user picks another. `sets` adds what the answer turns on ("Interactive activities: On").
 */
export function FactPick({ rec, fact, chat, file, sets }: { rec: SetupRecommendation; fact: SetupFact; chat: Answers; file: File | null | undefined; sets?: boolean }) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const [open, setOpen] = useState(false)
  const value = derived.current[fact.id]
  const labelId = `gd-fact-${fact.id}`
  const page = fact.evidencePages[0] ?? rec.previewPage
  const question = (
    <>
      {i18n._(QUESTION_SHORT[fact.id]!)}
      <ClaimMark file={file} pages={fact.evidencePages} />
    </>
  )

  if (fact.ask) {
    const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
    const order = [fact.value, ...(other ? [other] : []), ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value && v !== other)]
    return (
      <div className="flex flex-col gap-2">
        <p id={labelId} className="px-1 text-[15px] font-medium">
          {question}
        </p>
        <PreviewChoices rec={rec} fact={fact} order={order} answers={derived.current} chosen={value} onAnswer={(v) => chat.answer(fact.id, v)} file={file} labelId={labelId} />
      </div>
    )
  }

  const order = [value, ...FACT_OPTIONS[fact.id].filter((v) => v !== value)]
  const touched = sets ? settingsTouchedBy(rec, derived.current, fact.id) : []
  const result = touched
    .map((id) => {
      const words = plainTitle(id, derived.effective[id]?.value)
      return `${i18n._(SETTING_NAME[id])}: ${words ? i18n._(words) : String(derived.effective[id]?.value)}`
    })
    .join(" · ")
  return (
    <SurePick
      picture={<Picture rec={rec} look={lookOf(derived.effective)} page={page} file={file} className={PICTURE} />}
      label={question}
      title={i18n._(FACT_SHORT[fact.id][value]!)}
      hint={i18n._(FACT_HINT[fact.id]![value]!)}
      result={result || undefined}
      changed={value !== fact.value}
      labelId={labelId}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
    >
      <PreviewChoices
        rec={rec}
        fact={fact}
        order={order}
        answers={derived.current}
        chosen={value}
        onAnswer={(v) => {
          setOpen(false)
          chat.answer(fact.id, v)
        }}
        file={file}
        labelId={labelId}
      />
    </SurePick>
  )
}
