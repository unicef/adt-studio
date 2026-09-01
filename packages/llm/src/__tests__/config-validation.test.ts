import { describe, expect, it } from "vitest"
import { DEFAULT_LLM_MODEL_ID, type AppConfig } from "@adt/types"
import {
  assertConfigModels,
  collectConfigModelChecks,
  collectStageRunModelChecks,
  validateConfigModels,
} from "../config-validation.js"
import { AiProviderError } from "../ports/errors.js"
import { getDefaultProviderRegistry } from "../providers/index.js"

const registry = getDefaultProviderRegistry()

function config(overrides: Partial<AppConfig>): AppConfig {
  return overrides as AppConfig
}

describe("collectConfigModelChecks", () => {
  it("collects checks with the expected modality per field", () => {
    const checks = collectConfigModelChecks(
      config({
        default_model: "openai:gpt-5.4",
        agents: { model: "anthropic:claude-opus-4" },
        default_image_generation_model: "openai:gpt-image-1",
        translation: { model: "openai:gpt-5.4" },
        image_translation: { image_model: "openai:gpt-image-1" },
      } as Partial<AppConfig>),
    )

    expect(checks).toEqual(
      expect.arrayContaining([
        { field: "default_model", modelId: "openai:gpt-5.4", modality: "structured-text" },
        { field: "agents.model", modelId: "anthropic:claude-opus-4", modality: "agent" },
        {
          field: "default_image_generation_model",
          modelId: "openai:gpt-image-1",
          modality: "image",
        },
        { field: "translation.model", modelId: "openai:gpt-5.4", modality: "structured-text" },
        {
          field: "image_translation.image_model",
          modelId: "openai:gpt-image-1",
          modality: "image",
        },
      ]),
    )
  })

  it("skips fields that are not set", () => {
    expect(collectConfigModelChecks(config({}))).toEqual([])
  })
})

describe("collectStageRunModelChecks", () => {
  it("returns no checks for a run whose stages make no structured-text call", () => {
    const checks = collectStageRunModelChecks(
      config({
        default_model: "openai:gpt-5.4",
        translation: { model: "anthropic:claude-opus-4" },
      } as Partial<AppConfig>),
      ["speech"],
    )
    expect(checks).toEqual([])
  })

  it("validates the default plus every configured override for an LLM-step run", () => {
    const checks = collectStageRunModelChecks(
      config({
        default_model: "openai:gpt-5.4",
        translation: { model: "anthropic:claude-opus-4" },
      } as Partial<AppConfig>),
      ["sectioning"],
    )
    expect(checks).toEqual([
      { field: "default_model", modelId: "openai:gpt-5.4", modality: "structured-text" },
      {
        field: "translation.model",
        modelId: "anthropic:claude-opus-4",
        modality: "structured-text",
      },
    ])
  })

  it("falls back to the platform default model when the config sets none", () => {
    expect(collectStageRunModelChecks(config({}), ["storyboard"])).toEqual([
      { field: "default_model", modelId: DEFAULT_LLM_MODEL_ID, modality: "structured-text" },
    ])
  })
})

describe("validateConfigModels", () => {
  it("returns no issues for a valid config", () => {
    const issues = validateConfigModels(
      registry,
      config({
        default_model: "openai:gpt-5.4",
        agents: { model: "anthropic:claude-opus-4" },
        default_image_generation_model: "openai:gpt-image-1",
      } as Partial<AppConfig>),
    )
    expect(issues).toEqual([])
  })

  it("flags an unknown provider", () => {
    const issues = validateConfigModels(
      registry,
      config({ default_model: "bogus:some-model" }),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: "default_model", code: "unknown-provider" })
  })

  it("flags a provider that does not support the modality", () => {
    const issues = validateConfigModels(
      registry,
      config({ default_image_generation_model: "anthropic:claude-opus-4" }),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      field: "default_image_generation_model",
      code: "unsupported-modality",
    })
  })
})

describe("assertConfigModels", () => {
  it("does not throw for a valid config", () => {
    expect(() =>
      assertConfigModels(registry, config({ default_model: "openai:gpt-5.4" })),
    ).not.toThrow()
  })

  it("throws an AiProviderError prefixed with the field name", () => {
    try {
      assertConfigModels(registry, config({ default_model: "bogus:some-model" }))
      expect.unreachable("expected assertConfigModels to throw")
    } catch (error) {
      expect(AiProviderError.is(error)).toBe(true)
      expect((error as AiProviderError).message).toMatch(/^default_model: /)
      expect((error as AiProviderError).code).toBe("unknown-provider")
    }
  })
})
