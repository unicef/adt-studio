import { describe, expect, it } from "vitest"
import { buildActivityGenerationSystemPrompt } from "../prompts/activity-generation.js"
import { TEMPLATED_ACTIVITY_TYPES } from "../tools/activity-schema.js"

describe("inclusive activity generation", () => {
  it("AC-3: retains inclusive guidance for legacy callers that disable the old toggle", () => {
    const prompt = buildActivityGenerationSystemPrompt({ inclusiveDesign: false })
    expect(prompt).toContain("## Inclusive design")
    expect(prompt).toContain("click/tap fallback")
    expect(prompt).toContain("preserve its original language, wording, numbers and learning objective")
    expect(prompt).not.toContain('role="activity"')
  })

  it("keeps the requested tool restriction with mandatory inclusive guidance", () => {
    for (const mode of ["templated", "custom"] as const) {
      const prompt = buildActivityGenerationSystemPrompt({ mode, inclusiveDesign: false })
      expect(prompt).toContain("## Inclusive design")
      expect(prompt).toContain("## Tool restriction for this run")
      expect(prompt).toContain(mode === "templated" ? "createCustomSection is disabled" : "createTemplatedActivity is disabled")
    }
    expect(TEMPLATED_ACTIVITY_TYPES).toContain("activity_multi_select")
    expect(TEMPLATED_ACTIVITY_TYPES).toContain("activity_underline_text")
  })
})
