/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import { useState } from "react"
import { useLingui } from "@lingui/react"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_IDS, FACT_OPTIONS, SETTING_IDS, proposedAnswers, settingsFor, type FactAnswers } from "../engine/answers"
import { RULE_WHY } from "../engine/words"
import { Card, Pages, Tag, WIZARD_NAME, wizardValue } from "./parts"

/**
 * Step 3 as a playground: the four facts go in, the six settings come out. The engine sends the
 * settings for every combination (`settingsByFacts`), so changing a fact here just looks one up,
 * which is exactly what the Add Book screen does when the user answers a question.
 */
export function Rulebook({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const { i18n } = useLingui()
  const proposed = proposedAnswers(rec)
  const [answers, setAnswers] = useState<FactAnswers>(proposed)
  const now = settingsFor(rec, answers)
  const base = settingsFor(rec, proposed)
  const edited = FACT_IDS.some((f) => answers[f] !== proposed[f])
  const fact = (id: SetupBookFactId) => rec.facts.find((f) => f.id === id)

  return (
    <Card
      step="3"
      title="Rulebook: facts → settings"
      kind="rules"
      aside={
        edited && (
          <button type="button" onClick={() => setAnswers(proposed)} className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold hover:bg-muted/70">
            Reset to the engine's facts
          </button>
        )
      }
    >
      <p className="mb-4 max-w-[760px] text-[13.5px] text-muted-foreground">
        No AI here. A fixed table maps the 4 facts (plus the measured page storage and text layer) to the 6 settings. The response carries all {Object.keys(rec.settingsByFacts).length} combinations, so the UI never re-implements a rule: try another answer below.
      </p>
      <div className="mb-5 grid grid-cols-4 gap-3">
        {FACT_IDS.map((id) => {
          const f = fact(id)
          return (
            <div key={id} className="rounded-xl bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{id}</span>
                {f?.ask && <Tag tone="warn">asked</Tag>}
              </div>
              <div className="flex flex-wrap gap-1">
                {FACT_OPTIONS[id].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [id]: v }))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition-colors",
                      answers[id] === v ? "bg-foreground text-background ring-foreground" : "ring-border hover:bg-muted",
                      v === f?.secondOpinion && v !== f?.value && answers[id] !== v && "ring-amber-400",
                    )}
                    title={v === f?.value ? "Page-label reading" : v === f?.secondOpinion ? "Questions reading" : undefined}
                  >
                    {v}
                    {v === f?.value && " ●"}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <table className="w-full text-left text-[13.5px]">
        <thead className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-semibold">Setting</th>
            <th className="py-2 pr-3 font-semibold">Value</th>
            <th className="py-2 pr-3 font-semibold">Rule that fired</th>
            <th className="py-2 font-semibold">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {SETTING_IDS.map((id) => {
            const pick = now[id]!
            const changed = pick.value !== base[id]?.value
            const why = RULE_WHY[pick.rule]
            return (
              <tr key={id} className={cn("border-b border-border/60 align-top transition-colors", changed && "bg-amber-50 dark:bg-amber-500/10")}>
                <td className="py-2.5 pr-3 font-semibold">
                  {WIZARD_NAME[id]}
                  {rec.lockedSettings.includes(id) && (
                    <span className="ml-1.5" title="Can't be changed after the book is imported">
                      <Tag tone="bad">locked at import</Tag>
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <Tag tone={changed ? "warn" : "info"}>{wizardValue(id, pick.value)}</Tag>
                  <code className="ml-1.5 text-[11px] text-muted-foreground">{String(pick.value)}</code>
                  {changed && <span className="ml-1.5 text-[12px] text-muted-foreground">was {wizardValue(id, base[id]?.value)}</span>}
                </td>
                <td className="py-2.5 pr-3">
                  <code className="text-[12px] text-muted-foreground">{pick.rule}</code>
                  {why && <div className="text-[13px]">{i18n._(why)}</div>}
                </td>
                <td className="py-2.5">{edited ? <span className="text-[12px] text-muted-foreground">—</span> : <Pages file={file} pages={rec.settingEvidence[id] ?? []} width={40} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
