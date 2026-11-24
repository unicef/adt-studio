import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import type { EngineClient } from "./client"
import { askedFacts, proposedAnswers, settingsFor, SETTING_IDS } from "./answers"
import { FACT_QUESTION, RULE_WHY } from "./words"
import type { SetupClient } from "../recommendation/client"
import type { Decision, Recommendation, SetupResult } from "../recommendation/contract"

const DISAGREE = msg`The two AI readings disagree here.`

/**
 * The prototype's screens speak the one-shot recommender's shape (a choice, a reason, a confidence
 * and maybe an alternative per setting). This maps an engine E3 answer onto it:
 * - the reason is the rule that fired, in plain words;
 * - a setting gets an alternative when a fact the engine asks about would change it, using the
 *   second reading's answer for that fact, and `medium` confidence; otherwise `high`.
 * The E3 answer itself travels along as `engine`, and its `id` links the book to it on create.
 */
export function toSetupResult(rec: SetupRecommendation, i18n: I18n, userLanguage: string): SetupResult & { id: string; engine: SetupRecommendation } {
  const answers = proposedAnswers(rec)
  const now = settingsFor(rec, answers)
  const alternatives = new Map<SetupSettingId, { value: string | boolean; why: string }>()
  for (const fact of askedFacts(rec)) {
    if (!fact.secondOpinion || fact.secondOpinion === fact.value) continue
    const then = settingsFor(rec, { ...answers, [fact.id]: fact.secondOpinion })
    for (const id of SETTING_IDS) {
      if (alternatives.has(id) || then[id]?.value === now[id]?.value) continue
      const why = [i18n._(DISAGREE), i18n._(FACT_QUESTION[fact.id]), fact.reason].filter(Boolean).join(" ")
      alternatives.set(id, { value: then[id]!.value, why })
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
    timing: { analyzerMs: rec.timings.profileMs, inferenceMs: rec.timings.factsMs, totalMs: rec.timings.totalMs },
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
