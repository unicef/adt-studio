import { describe, expect, it } from "vitest"
import { taskModelApplies, withApplicableTaskModels, type AppConfig } from "../index.js"

const base = {
  structure_types: {},
  role_types: {},
  page_sectioning: { prompt: "page_sectioning", model: "openai:gpt-6.1-sol", reasoning_effort: "medium", max_refinements: 0 },
  glossary: { model: "openai:gpt-6-luna" },
  metadata: { model: "anthropic:claude-sonnet-4-5" },
  translation: { model: "openai:gpt-4o" },
  visual_review: { model: "openai:gpt-6.1-sol", reasoning_effort: "medium" },
  render_strategies: {
    llm: { render_type: "llm", config: { prompt: "web_generation_html", max_retries: 5 } },
    activity_matching: {
      render_type: "activity",
      config: { prompt: "activity_matching", model: "openai:gpt-6.1-sol", reasoning_effort: "medium", max_retries: 5 },
    },
  },
} as unknown as AppConfig

describe("Shipped Luna/Sol task pins under another provider's default (#964 review)", () => {
  it("applies a shipped Luna/Sol pin only while the default LLM is an OpenAI model", () => {
    expect(taskModelApplies("openai:gpt-6.1-sol", "openai:gpt-6-luna")).toBe(true)
    expect(taskModelApplies("openai:gpt-6.1-sol", "anthropic:claude-sonnet-4-5")).toBe(false)
    expect(taskModelApplies("anthropic:claude-opus-4", "google:gemini-3-pro")).toBe(true)
    // A task set to another OpenAI model was chosen on purpose and keeps it.
    expect(taskModelApplies("openai:gpt-4o", "ollama:llama3")).toBe(true)
    expect(taskModelApplies(undefined, "anthropic:claude-sonnet-4-5")).toBe(true)
  })

  it("keeps every pin while the default is an OpenAI model", () => {
    expect(withApplicableTaskModels({ ...base, default_model: "openai:gpt-6-luna" })).toEqual({ ...base, default_model: "openai:gpt-6-luna" })
    expect(withApplicableTaskModels(base)).toBe(base)
  })

  it("drops the shipped pins and their efforts under another provider's default, keeping everything else", () => {
    const config = withApplicableTaskModels({ ...base, default_model: "anthropic:claude-sonnet-4-5" })
    expect(config.page_sectioning).toEqual({ prompt: "page_sectioning", max_refinements: 0 })
    expect(config.glossary).toEqual({})
    expect(config.visual_review).toEqual({})
    expect(config.metadata).toEqual({ model: "anthropic:claude-sonnet-4-5" })
    expect(config.translation).toEqual({ model: "openai:gpt-4o" })
    expect(config.render_strategies?.activity_matching.config).toEqual({ prompt: "activity_matching", max_retries: 5 })
    expect(config.render_strategies?.llm).toBe(base.render_strategies?.llm)
    // The input is not mutated.
    expect(base.page_sectioning?.model).toBe("openai:gpt-6.1-sol")
  })

  it("drops a shipped render fallback under another provider's default, and keeps any other", () => {
    const withFallback = (model: string) =>
      ({
        ...base,
        render_strategies: {
          llm: {
            render_type: "llm",
            config: { prompt: "web_generation_html", max_retries: 5, fallback: { model, reasoning_effort: "medium", after_attempts: 2 } },
          },
        },
      }) as unknown as AppConfig
    const shipped = withFallback("openai:gpt-6.1-sol")
    expect(withApplicableTaskModels({ ...shipped, default_model: "openai:gpt-6-luna" }).render_strategies?.llm.config?.fallback)
      .toEqual({ model: "openai:gpt-6.1-sol", reasoning_effort: "medium", after_attempts: 2 })
    expect(withApplicableTaskModels({ ...shipped, default_model: "anthropic:claude-sonnet-4-5" }).render_strategies?.llm.config)
      .toEqual({ prompt: "web_generation_html", max_retries: 5 })
    // A fallback the user chose keeps applying, as any other non-shipped pin does.
    const chosen = withFallback("anthropic:claude-opus-4")
    expect(withApplicableTaskModels({ ...chosen, default_model: "google:gemini-3-pro" }).render_strategies?.llm.config?.fallback?.model)
      .toBe("anthropic:claude-opus-4")
  })
})
