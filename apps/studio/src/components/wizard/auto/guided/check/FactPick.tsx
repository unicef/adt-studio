import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupRecommendation } from "@adt/types"
import { FACT_OPTIONS, settingsFor, settingsTouchedBy } from "../../engine/answers"
import { FACT_SHORT, SETTING_NAME } from "../../engine/words"
import { Citation } from "../shared/Citation"
import { morphFrom } from "../shared/motion"
import { PreviewChoices } from "../shared/PreviewChoices"
import { lookOf } from "../shared/screens/look"
import type { Answers } from "../shared/useAnswers"
import { factArt } from "../shared/art/ConceptArt"
import { FACT_HINT, plainTitle, QUESTION_SHORT } from "../shared/words"
import { WizardSettings } from "../shared/WizardSettings"
import { useWizardNames } from "../shared/wizardNames"
import { Picture, PICTURE, SurePick } from "./SurePick"
import { useCheckLayout } from "../shared/checkLayout"
import { PickView, type PickOption } from "./PickView"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { SetupBookFactId } from "@adt/types"

/**
 * One fact on a Check screen. Sure (the engine didn't ask): its pick highlighted, the others under
 * "See the other options". Asked: every answer side by side, the guess marked and selected until
 * the user picks another. `sets` adds what the answer turns on ("Interactive activities: On").
 */
/** The start of the statement in the sentence layout, before the answer. */
const LEAD: Record<SetupBookFactId, MessageDescriptor> = {
  genre: msg`This book is mostly`,
  composition: msg`On its pages, the words are`,
  exercises: msg`Tasks for the reader to answer:`,
  diagrams: msg`Labelled pictures, like maps or diagrams:`,
}
const lower = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)

export function FactPick({ rec, fact, chat, file, sets }: { rec: SetupRecommendation; fact: SetupFact; chat: Answers; file: File | null | undefined; sets?: boolean }) {
  const { i18n } = useLingui()
  const layout = useCheckLayout()
  const names = useWizardNames()
  const derived = chat.derived!
  const [open, setOpen] = useState(false)
  const value = derived.current[fact.id]
  const labelId = `gd-fact-${fact.id}`
  const page = fact.evidencePages[0] ?? rec.previewPage
  const question = (
    <>
      {i18n._(QUESTION_SHORT[fact.id]!)}
      <Citation file={file} pages={fact.evidencePages} />
    </>
  )

  if (layout !== "card") {
    const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? fact.secondOpinion : null
    const order = [fact.value, ...(other ? [other] : []), ...FACT_OPTIONS[fact.id].filter((v) => v !== fact.value && v !== other)]
    const applies = settingsTouchedBy(rec, derived.current, fact.id)
    const options = order.map((v): PickOption => {
      const decided = settingsFor(rec, { ...derived.current, [fact.id]: v })
      return {
        value: v,
        title: i18n._(FACT_SHORT[fact.id][v]!),
        hint: i18n._(FACT_HINT[fact.id]![v]!),
        thumb: factArt(fact.id, v) ?? <Picture rec={rec} look={lookOf(decided)} page={page} file={file} className="h-full w-full" />,
        extra: names ? <WizardSettings settings={decided} only={applies.length ? applies : undefined} className="mt-1.5" /> : undefined,
      }
    })
    return (
      <PickView
        layout={layout}
        question={i18n._(QUESTION_SHORT[fact.id]!)}
        sentence={{ before: i18n._(LEAD[fact.id]), after: "." }}
        options={layout === "sentence" ? options.map((o) => ({ ...o, title: lower(o.title) })) : options}
        chosen={value}
        guess={fact.value}
        sure={!fact.ask}
        pages={fact.evidencePages}
        file={file}
        onPick={(v) => chat.answer(fact.id, v)}
      />
    )
  }

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
  const applies = settingsTouchedBy(rec, derived.current, fact.id)
  const touched = sets ? applies : []
  const result = touched
    .map((id) => {
      const words = plainTitle(id, derived.effective[id]?.value)
      return `${i18n._(SETTING_NAME[id])}: ${words ? i18n._(words) : String(derived.effective[id]?.value)}`
    })
    .join(" · ")
  return (
    <SurePick
      picture={
        factArt(fact.id, value) ? (
          <span className={`qd18-pv grid shrink-0 place-items-center rounded-[12px] p-3 ${PICTURE}`}>{factArt(fact.id, value)}</span>
        ) : (
          <Picture rec={rec} look={lookOf(derived.effective)} page={page} file={file} className={PICTURE} />
        )
      }
      label={question}
      title={i18n._(FACT_SHORT[fact.id][value]!)}
      hint={i18n._(FACT_HINT[fact.id]![value]!)}
      result={names ? <WizardSettings settings={derived.effective} only={applies.length ? applies : undefined} /> : result || undefined}
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
        onAnswer={(v, card) =>
          morphFrom(card, `pick-${labelId}`, () => {
            setOpen(false)
            chat.answer(fact.id, v)
          })
        }
        file={file}
        labelId={labelId}
      />
    </SurePick>
  )
}
