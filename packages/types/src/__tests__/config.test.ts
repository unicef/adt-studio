import { describe, expect, it } from "vitest"
import { AppConfig, RenderStrategyConfig } from "../config.js"

describe("RenderStrategyConfig", () => {
  it("allows answer_prompt for activity render types", () => {
    const result = RenderStrategyConfig.safeParse({
      render_type: "activity",
      config: {
        prompt: "activity_multiple_choice",
        answer_prompt: "activity_multiple_choice_answers",
      },
    })
    expect(result.success).toBe(true)
  })

  it("rejects answer_prompt for non-activity render types", () => {
    const result = RenderStrategyConfig.safeParse({
      render_type: "llm",
      config: {
        prompt: "web_generation_html",
        answer_prompt: "activity_multiple_choice_answers",
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["config", "answer_prompt"])
      expect(result.error.issues[0]?.message).toContain("only supported for render_type: activity")
    }
  })
})

describe("AppConfig", () => {
  it("fails when a non-activity render strategy includes answer_prompt", () => {
    const result = AppConfig.safeParse({
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      render_strategies: {
        bad_strategy: {
          render_type: "template",
          config: {
            template: "two_column_render",
            answer_prompt: "activity_multiple_choice_answers",
          },
        },
      },
    })
    expect(result.success).toBe(false)
  })
})
