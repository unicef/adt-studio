import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupFact, SetupRecommendation } from "@adt/types"
import { FACT_OPTIONS, type FactAnswers } from "../../../engine/answers"
import { FACT_LONG, FACT_QUESTION, FACT_SHORT } from "../../../engine/words"
import { FactOptions } from "./FactOptions"
import { PAPER } from "./Note"
import { PageChips } from "./PageChips"
import { Paper, Why } from "./Why"

/**
 * One question, pinned beside its page: short answers that say which setting each one sets, and
 * a "Why?" with the full question, what each answer means, the AI's words and the pages.
 */
export function QuestionCard({ rec, fact, answers, answered, onAnswer, onShowPage }: { rec: SetupRecommendation; fact: SetupFact; answers: FactAnswers; answered: boolean; onAnswer: (fact: SetupBookFactId, value: string) => void; onShowPage: (page: number) => void }) {
  const { i18n } = useLingui()
  return (
    <Paper tone={answered ? PAPER.done : PAPER.ask}>
      <p className="mb-3 text-[13px] leading-snug opacity-80">
        {fact.askReason === "few-body-pages" ? <Trans>Only a few pages to go on.</Trans> : <Trans>The two AI readings disagree.</Trans>}
      </p>
      <FactOptions rec={rec} fact={fact} answers={answers} checked={answered ? answers[fact.id] : null} legend={i18n._(FACT_QUESTION[fact.id])} compact onPick={(v) => onAnswer(fact.id, v)} />
      <Why className="mt-3">
        <p className="text-[13px] font-semibold leading-snug">{i18n._(FACT_QUESTION[fact.id])}</p>
        <ul className="flex flex-col gap-1 text-[12.5px] leading-snug opacity-85">
          {FACT_OPTIONS[fact.id].map((v) => (
            <li key={v}>
              <span className="font-semibold">{i18n._(FACT_SHORT[fact.id][v]!)}:</span> {i18n._(FACT_LONG[fact.id][v]!)}
            </li>
          ))}
        </ul>
        {fact.reason && <p className="text-[12.5px] italic leading-snug opacity-80">&ldquo;{fact.reason}&rdquo;</p>}
        <PageChips pages={fact.evidencePages} onShowPage={onShowPage} />
      </Why>
    </Paper>
  )
}
