import type { AdaptationRules, Student } from "@adt/types"

/**
 * Data-driven accessibility planning. Strategy names deliberately describe an
 * adaptation, not a diagnosis, so future profiles do not require code changes.
 */
export interface AccessibilityPlan {
  rules: AdaptationRules
  recommendations: string[]
  profileIds: string[]
}

export function buildAccessibilityPlan(student: Student): AccessibilityPlan {
  const rules: AdaptationRules = {}
  const recommendations = new Set<string>()
  for (const profile of student.accessibilityProfiles) {
    for (const [rule, enabled] of Object.entries(profile.adaptations)) {
      rules[rule] = Boolean(rules[rule] || enabled)
    }
    for (const recommendation of profile.recommendations) recommendations.add(recommendation)
  }
  return { rules, recommendations: [...recommendations], profileIds: student.accessibilityProfiles.map((profile) => profile.id) }
}

export function personalizationPromptContext(plan: AccessibilityPlan): string {
  const enabledRules = Object.entries(plan.rules).filter(([, enabled]) => enabled).map(([rule]) => rule)
  return [
    "Create an accessible version of this learning material.",
    enabledRules.length ? `Apply these adaptations: ${enabledRules.join(", ")}.` : "Preserve the original material without additional adaptations.",
    plan.recommendations.length ? `Teaching recommendations: ${plan.recommendations.join(" ")}` : "",
  ].filter(Boolean).join("\n")
}
