import { describe, expect, it, vi } from "vitest"
import { fileURLToPath } from "node:url"
import type { LLMModel } from "@adt/llm"
import {
  buildCoreTtsPreparationConfig,
  getCoreTtsPreparationLocales,
  loadCoreTtsProfiles,
  prepareCoreTtsCatalog,
  resolveCoreTtsProfile,
} from "../core-tts.js"

const config = {
  modelId: "openai:gpt-5.4",
  promptName: "core_tts_preparation",
  maxRetries: 0,
  batchSize: 50,
  latexToSpeech: true,
  languageNormalization: true,
}

function modelWith(entries: unknown[]): LLMModel {
  return {
    renderPrompt: vi.fn(),
    generateObject: vi.fn().mockResolvedValue({
      object: { entries },
      cached: false,
    }),
  }
}

describe("resolveCoreTtsProfile", () => {
  const profiles = { default: "default", sw: "base", "sw-tz": "exact" }

  it("resolves exact locale, base locale, then default", () => {
    expect(resolveCoreTtsProfile("sw_TZ", profiles)).toEqual({ key: "sw-tz", guidance: "exact" })
    expect(resolveCoreTtsProfile("sw-KE", profiles)).toEqual({ key: "sw", guidance: "base" })
    expect(resolveCoreTtsProfile("fr", profiles)).toEqual({ key: "default", guidance: "default" })
  })

  it("retains the Tanzanian Kiswahili normalization and pronunciation cases", () => {
    const configDir = fileURLToPath(new URL("../../../../config/", import.meta.url))
    const guidance = loadCoreTtsProfiles(configDir)["sw-tz"]

    expect(guidance).toContain('whole-word occurrence of "nne"')
    expect(guidance).toContain('output "n-ne"')
    expect(guidance).toContain("[ˈn̩.nɛ]")
    expect(guidance).toContain('whole-word occurrence of "mmoja"')
    expect(guidance).toContain('output "m-moja"')
    expect(guidance).toContain("[m̩.ˈmɔ.dʒa]")
    expect(guidance).toContain('"kipengele a"')
    expect(guidance).toContain("structural labels")
    expect(guidance).toContain("Roman-numeral ranges")
    expect(guidance).toContain('minus sign as "toa"')
  })
})

describe("Core TTS configuration", () => {
  it("honors an explicit language-normalization opt-out", () => {
    expect(
      buildCoreTtsPreparationConfig({
        core_tts: { language_normalization: false },
      }).languageNormalization,
    ).toBe(false)
  })

  it("prepares same-base regional outputs from source display text", () => {
    expect(
      getCoreTtsPreparationLocales(["en", "en_GB", "fr", "en-GB"], "en"),
    ).toEqual([
      { language: "en-GB", usesSourceDisplayText: true },
      { language: "fr", usesSourceDisplayText: false },
    ])
  })
})

describe("prepareCoreTtsCatalog", () => {
  it("uses one structured call for LaTeX and normalization", async () => {
    const llm = modelWith([{ id: "t1", speech_text: "one half", transformation_kinds: ["latex-to-speech", "language-normalization"], failure_reason: null }])
    const result = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "$\\frac{1}{2}$" }],
      language: "en",
      config,
      profile: { key: "default", guidance: "Normalize for spoken English." },
      llmModel: llm,
      now: "2026-08-05T00:00:00.000Z",
    })

    expect(llm.generateObject).toHaveBeenCalledTimes(1)
    expect(result.entries[0]).toMatchObject({
      displayText: "$\\frac{1}{2}$",
      speechText: "one half",
      changed: true,
      status: "ready",
    })
  })

  it("prepares simple dollar-delimited math without language normalization", async () => {
    const llm = modelWith([{ id: "t1", speech_text: "x plus one", transformation_kinds: ["latex-to-speech"], failure_reason: null }])
    const result = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "$x+1$" }],
      language: "en",
      config: { ...config, languageNormalization: false },
      profile: { key: "default", guidance: "" },
      llmModel: llm,
    })

    expect(llm.generateObject).toHaveBeenCalledTimes(1)
    expect(result.entries[0]).toMatchObject({
      displayText: "$x+1$",
      speechText: "x plus one",
      transformations: ["latex-to-speech"],
      status: "ready",
    })
  })

  it("withholds a detected raw-LaTeX conversion failure", async () => {
    const result = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "$\\frac{1}{2}$" }],
      language: "en",
      config,
      profile: { key: "default", guidance: "Normalize." },
      llmModel: modelWith([{ id: "t1", speech_text: "$\\frac{1}{2}$", transformation_kinds: [], failure_reason: null }]),
    })
    expect(result.entries[0]).toMatchObject({ status: "failed", speechText: null })
  })

  it("passes prepared source and target display text as target context", async () => {
    const llm = modelWith([{ id: "t1", speech_text: "un medio", transformation_kinds: ["language-normalization"], failure_reason: null }])
    await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "1/2" }],
      language: "es",
      config,
      profile: { key: "default", guidance: "Normalize." },
      llmModel: llm,
      sourceContext: new Map([["t1", { displayText: "$\\frac{1}{2}$", speechText: "one half" }]]),
    })
    expect(vi.mocked(llm.generateObject).mock.calls[0]?.[0].context).toMatchObject({
      entries: [{ display_text: "1/2", source_speech_text: "one half" }],
    })
  })

  it("preserves a manual edit when display text is unchanged", async () => {
    const previous = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "25" }],
      language: "en",
      config: { ...config, languageNormalization: false },
      profile: { key: "default", guidance: "" },
      llmModel: modelWith([]),
    })
    previous.entries[0] = {
      ...previous.entries[0],
      speechText: "twenty-five",
      changed: true,
      generation: { ...previous.entries[0].generation, mode: "manual" },
    }
    const llm = modelWith([])
    const result = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "25" }],
      language: "en",
      config,
      profile: { key: "default", guidance: "Normalize." },
      llmModel: llm,
      previous,
    })
    expect(result.entries[0]?.speechText).toBe("twenty-five")
    expect(llm.generateObject).not.toHaveBeenCalled()
  })
})
