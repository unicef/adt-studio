import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import type { EngineClient } from "./client"
import { askedFacts, FACT_OPTIONS, proposedAnswers, settingsFor, SETTING_IDS } from "./answers"
import { FACT_QUESTION, RULE_WHY } from "./words"
import type { SetupClient } from "../recommendation/client"
import type { Decision, Recommendation, SetupResult } from "../recommendation/contract"

const DISAGREE = msg`The two AI readings disagree here.`
const FEW_PAGES = msg`The AI found only a few pages of the book's main content to read.`

/**
 * The prototype's screens speak the one-shot recommender's shape (a choice, a reason, a confidence
 * and maybe an alternative per setting). This maps an engine E3 answer onto it:
 * - the reason is the rule that fired, in plain words;
 * - a setting gets an alternative when a fact the engine asks about would change it, and `medium`
 *   confidence; otherwise `high`. The alternative is the second reading's answer for that fact when
 *   the readings disagree; when the engine asks because it saw few body pages, it is the first other
 *   answer that changes the setting.
 * The E3 answer itself travels along as `engine`, and its `id` links the book to it on create.
 */
export function toSetupResult(rec: SetupRecommendation, i18n: I18n, userLanguage: string): SetupResult & { id: string; engine: SetupRecommendation } {
  const answers = proposedAnswers(rec)
  const now = settingsFor(rec, answers)
  const alternatives = new Map<SetupSettingId, { value: string | boolean; why: string }>()
  for (const fact of askedFacts(rec)) {
    const disagree = !!fact.secondOpinion && fact.secondOpinion !== fact.value
    const others = disagree ? [fact.secondOpinion!] : fact.askReason === "few-body-pages" ? FACT_OPTIONS[fact.id].filter((v) => v !== fact.value) : []
    const why = [i18n._(disagree ? DISAGREE : FEW_PAGES), i18n._(FACT_QUESTION[fact.id]), fact.reason].filter(Boolean).join(" ")
    for (const other of others) {
      const then = settingsFor(rec, { ...answers, [fact.id]: other })
      for (const id of SETTING_IDS) {
        if (alternatives.has(id) || then[id]?.value === now[id]?.value) continue
        alternatives.set(id, { value: then[id]!.value, why })
      }
    }
  }
  const asChoice = (id: SetupSettingId, v: string | boolean) => (id === "activitiesGenerator" ? (v ? "enabled" : "disabled") : String(v))
  const decision = (id: SetupSettingId): Decision => {
    const pick = now[id]!
    const alt = alternatives.get(id)
    const why = RULE_WHY[pick.rule]
    return {
      choice: asChoice(id, pick.value),
      confidence: alt ? "medium" : "high",
      reason: why ? i18n._(why) : pick.rule,
      alternative: alt ? asChoice(id, alt.value) : null,
      ambiguityReason: alt ? alt.why : null,
      evidencePages: [...new Set(rec.settingEvidence[id] ?? [])].sort((a, b) => a - b),
    } as Decision
  }
  const recommendation = Object.fromEntries(SETTING_IDS.map((id) => [id, decision(id)])) as Recommendation
  return {
    id: rec.id,
    engine: rec,
    provider: rec.model.split(":")[0] ?? "",
    model: rec.model,
    promptVersion: `engine-${rec.engine}`,
    userLanguage,
    recommendation,
    usage: { inputTokens: rec.usage.inputTokens, outputTokens: rec.usage.outputTokens, totalTokens: rec.usage.inputTokens + rec.usage.outputTokens },
    // The two readings run side by side, so the AI's time is the longer one (`factsMs` is the measurement, no AI).
    timing: { analyzerMs: rec.timings.profileMs, inferenceMs: Math.max(rec.timings.questionsMs ?? 0, rec.timings.labelsMs ?? 0), totalMs: rec.timings.totalMs },
  }
}

/** The prototype's `SetupClient`, answered by the engine. */
export function engineSetupClient(engine: EngineClient, i18n: I18n): SetupClient {
  return {
    async recommend(request, signal) {
      return toSetupResult(await engine.recommend(request.file, signal), i18n, request.userLanguage)
    },
  }
}
