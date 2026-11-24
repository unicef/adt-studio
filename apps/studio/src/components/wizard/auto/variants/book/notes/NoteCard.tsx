import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { FactAnswers } from "../../../engine/answers"
import { FACT_QUESTION, FACT_SHORT, RULE_WHY, TEXT_LAYER } from "../../../engine/words"
import { settingsDrivenBy, type Finding } from "../model"
import { useSettingWords } from "../useBookState"
import { FACT_TOPIC, TOPIC_PAGES, TOPIC_TEXT } from "../words"
import { FactOptions } from "./FactOptions"
import { BADGE, PAPER, languageName } from "./Note"
import { PageChips } from "./PageChips"
import { Paper, Why } from "./Why"

/**
 * One finding at a time, for "What we noticed": its topic and answer in a line; the AI's own
 * words, the pages and the settings it moves behind "Why?"; a fact can be corrected ("Not right?").
 */
export function NoteCard({ finding, number, rec, answers, answered, onAnswer, onShowPage }: { finding: Finding; number: number; rec: SetupRecommendation; answers: FactAnswers; answered: boolean; onAnswer: (fact: SetupBookFactId, value: string) => void; onShowPage: (page: number) => void }) {
  const { i18n } = useLingui()
  const words = useSettingWords()
  const [correcting, setCorrecting] = useState(false)
  const fact = "fact" in finding ? finding.fact : null
  const tone = answered ? "done" : "plain"
  const topic = finding.key === "text" ? i18n._(TOPIC_TEXT) : finding.key === "pages" ? i18n._(TOPIC_PAGES) : i18n._(FACT_TOPIC[finding.key])
  const summary =
    finding.key === "text"
      ? i18n._(TEXT_LAYER[rec.measured.textLayer]!)
      : finding.key === "pages"
        ? RULE_WHY[finding.rule]
          ? i18n._(RULE_WHY[finding.rule]!)
          : finding.rule
        : i18n._(FACT_SHORT[finding.key][answers[finding.key]]!)
  const drives = fact ? settingsDrivenBy(rec, answers, fact.id) : []
  const other = fact?.secondOpinion && fact.secondOpinion !== answers[fact.id] ? fact.secondOpinion : null
  const hasWhy = !!(fact?.reason || other || drives.length || finding.pages.length || (finding.key === "text" && rec.measured.language))

  return (
    <Paper tone={PAPER[tone]}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className={cn("mt-px grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-bold shadow-sm", BADGE[tone])}>
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-70">
            {topic}
            {answered && (
              <span className="ml-2 rounded-full bg-emerald-600/15 px-1.5 py-px text-[10px] tracking-[0.04em] text-emerald-800 normal-case dark:text-emerald-200">
                {finding.asked ? <Trans>You answered</Trans> : <Trans>Corrected by you</Trans>}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[16px] font-semibold leading-snug">{summary}</p>
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
            {hasWhy && (
              <Why className="w-full">
                {finding.key === "text" && rec.measured.language && (
                  <p className="text-[12.5px]">
                    <Trans>Written in {languageName(rec.measured.language, i18n.locale)}.</Trans>
                  </p>
                )}
                {fact?.reason && <p className="text-[12.5px] italic leading-snug opacity-85">&ldquo;{fact.reason}&rdquo;</p>}
                {other && fact && (
                  <p className="text-[12px] leading-snug opacity-75">
                    <Trans>The other reading said &ldquo;{i18n._(FACT_SHORT[fact.id][other]!)}&rdquo;.</Trans>
                  </p>
                )}
                {drives.length > 0 && (
                  <p className="text-[12px] font-medium opacity-75">
                    <Trans>Sets: {drives.map((id) => words.name(id)).join(", ")}</Trans>
                  </p>
                )}
                <PageChips pages={finding.pages} onShowPage={onShowPage} />
              </Why>
            )}
            {fact && (
              <button type="button" aria-expanded={correcting} onClick={() => setCorrecting((c) => !c)} className="text-[12.5px] font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
                {correcting ? <Trans>Keep it as it is</Trans> : <Trans>Not right?</Trans>}
              </button>
            )}
          </div>
          {fact && (
            <Collapsible shown={correcting}>
              <div inert={!correcting} className="pt-3">
                <FactOptions
                  rec={rec}
                  fact={fact}
                  answers={answers}
                  checked={answers[fact.id]}
                  legend={i18n._(FACT_QUESTION[fact.id])}
                  compact
                  onPick={(v) => {
                    onAnswer(fact.id, v)
                    setCorrecting(false)
                  }}
                />
              </div>
            </Collapsible>
          )}
        </div>
      </div>
    </Paper>
  )
}
