import { describe, expect, it } from "vitest"
import {
  AppConfig,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ELEVENLABS_SHIPPED_VOICE_NAMES,
  RenderStrategyConfig,
} from "../config.js"
import { resolveTranslationEvaluationConfig } from "../translation-evaluation.js"

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
      structure_types: { paragraph: "Paragraph" },
      role_types: { heading: "Heading" },
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


  it("accepts reviewer_validation catalog overrides", () => {
    const result = AppConfig.safeParse({
      structure_types: { paragraph: "Paragraph" },
      role_types: { heading: "Heading" },
      reviewer_validation: {
        enabled: true,
        identification_fields: [
          {
            id: "reviewer-name",
            label: "Reviewer name",
            type: "text",
            required: true,
          },
        ],
        instructions: [
          {
            id: "workflow",
            title: "Workflow",
            body: "Review pages in order.",
          },
        ],
        sections: [
          {
            id: "custom-checks",
            label: "Custom checks",
            criteria: [
              {
                id: "custom-criterion",
                label: "Custom criterion",
                guidance: "Check this custom requirement.",
              },
            ],
          },
        ],
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reviewer_validation?.enabled).toBe(true)
      expect(result.data.reviewer_validation?.sections?.[0]?.id).toBe("custom-checks")
    }
  })

  it("accepts translation evaluation judge settings", () => {
    const result = AppConfig.safeParse({
      structure_types: { paragraph: "Paragraph" },
      role_types: { heading: "Heading" },
      translation_evaluation: {
        enable_translation_evaluation: true,
        judge_model: "openai:gpt-4.1",
        max_retries: 2,
        batch_size: 1,
        temperature: 0.1,
        strictness: "strict",
        severity_threshold: "low",
        issue_types: ["meaning", "terminology"],
        generate_suggestions: true,
        only_suggest_when_confident: true,
        context: {
          book_metadata: true,
          visible_page_entries: true,
          source_language: true,
          target_language: true,
        },
        judge_instructions: "Review translations carefully.",
      },
    })

    expect(result.success).toBe(true)
  })

  it("resolves translation evaluation defaults", () => {
    const resolved = resolveTranslationEvaluationConfig(undefined)

    expect(resolved.enable_translation_evaluation).toBe(true)
    expect(resolved.strictness).toBe("balanced")
    expect(resolved.severity_threshold).toBe("medium")
    expect(resolved.generate_suggestions).toBe(true)
    expect(resolved.context.book_metadata).toBe(true)
    expect(resolved).not.toHaveProperty("batch_size")
  })

})

describe("ELEVENLABS_SHIPPED_VOICE_NAMES", () => {
  it("names the default voice", () => {
    expect(ELEVENLABS_SHIPPED_VOICE_NAMES[DEFAULT_ELEVENLABS_VOICE_ID]).toBe("Rachel")
  })
})
