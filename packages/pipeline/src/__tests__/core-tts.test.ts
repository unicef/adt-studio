import { describe, expect, it, vi } from "vitest"
import { fileURLToPath } from "node:url"
import type { LLMModel } from "@adt/llm"
import {
  buildCoreTtsPreparationConfig,
  coreTtsInputBasis,
  getCoreTtsPreparationLocales,
  loadCoreTtsProfiles,
  prepareCoreTtsCatalog,
  resolveCoreTtsProfile,
  resolveCoreTtsSpeechCatalog,
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
  it.each(["missing", "mismatched"])("preserves usable speech with %s input evidence during deterministic fallback", async (evidence) => {
    const entries = [{ id: "t1", text: "Display text" }]
    const profile = { key: "default", guidance: "Normalize." }
    const previous = await prepareCoreTtsCatalog({ entries, language: "en", config, profile,
      llmModel: modelWith([{ id: "t1", speech_text: "Retained speech", transformation_kinds: [], failure_reason: null }]) })
    if (evidence === "missing") delete previous.entries[0].input
    else previous.entries[0].speechText = "Untracked correction"
    const result = resolveCoreTtsSpeechCatalog({ entries: [{ ...entries[0], text: "Changed display" }], language: "en", config, profile, previous })
    expect(result.entries[0]).toEqual(previous.entries[0])
  })

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

  it("declares display fallback after a raw-LaTeX conversion failure", async () => {
    const result = await prepareCoreTtsCatalog({
      entries: [{ id: "t1", text: "$\\frac{1}{2}$" }],
      language: "en",
      config,
      profile: { key: "default", guidance: "Normalize." },
      llmModel: modelWith([{ id: "t1", speech_text: "$\\frac{1}{2}$", transformation_kinds: [], failure_reason: null }]),
    })
    expect(result.entries[0]).toMatchObject({ status: "failed", speechText: "$\\frac{1}{2}$", fallbackReason: "failed" })
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


describe("speech fallback and retry admission", () => {
  const entries = [{ id: "t1", text: "Bonjour" }, { id: "t2", text: "Monde" }]
  const profile = { key: "fr", guidance: "Normalize for French speech." }
  it("disabled normalization consumes only the display text, not a neighbor or unused model/prompt", () => {
    const disabled = { ...config, languageNormalization: false, latexToSpeech: false }
    const before = coreTtsInputBasis({ entries, index: 0, language: "fr", config: disabled, profile })
    const after = coreTtsInputBasis({ entries: [entries[0], { ...entries[1], text: "Changed neighbor" }], index: 0, language: "fr", config: { ...disabled, modelId: "other", promptName: "other" }, profile })
    expect(after.signature).toBe(before.signature)
    expect(after.input.next_display_text).toBeNull()
  })
  it("declares missing fallback without a provider, preserves manual text after changes, and makes disabled normalization clean", () => {
    const fallback = resolveCoreTtsSpeechCatalog({ entries, language: "fr", config, profile })
    expect(fallback.entries.map((entry) => entry.speechText)).toEqual(["Bonjour", "Monde"])
    expect(fallback.entries.every((entry) => entry.fallbackReason === "missing")).toBe(true)
    fallback.entries[0].generation.mode = "manual"
    fallback.entries[0].speechText = "My pronunciation"
    const changed = resolveCoreTtsSpeechCatalog({ entries: [{ id: "t1", text: "Salut" }], language: "fr", config, profile, previous: fallback })
    expect(changed.entries[0].speechText).toBe("My pronunciation")
    const disabled = resolveCoreTtsSpeechCatalog({ entries, language: "fr", config: { ...config, languageNormalization: false, latexToSpeech: false }, profile })
    expect(disabled.entries.every((entry) => entry.status === "ready" && !entry.fallbackReason)).toBe(true)
  })
  it("reuses unchanged fallback and attempts preparation only on explicit retry or relevant input change", async () => {
    const fallback = resolveCoreTtsSpeechCatalog({ entries, language: "fr", config, profile })
    const llm = modelWith([{ id: "t1", speech_text: "Bonjour", transformation_kinds: [], failure_reason: null }])
    const unchanged = await prepareCoreTtsCatalog({ entries, language: "fr", config, profile, previous: fallback, llmModel: llm })
    expect(llm.generateObject).not.toHaveBeenCalled()
    expect(unchanged.entries).toEqual(fallback.entries)
    const retry = await prepareCoreTtsCatalog({ entries, language: "fr", config, profile, previous: fallback, llmModel: llm, retryIds: ["t1"] })
    expect(llm.generateObject).toHaveBeenCalledTimes(1)
    expect(retry.entries[0]).toMatchObject({ speechText: "Bonjour", status: "ready" })
    expect(retry.entries[0].fallbackReason).toBeUndefined()
    expect(retry.entries[1]).toEqual(fallback.entries[1])
  })
  it("keeps every phrase on exhausted batch failure without adding retries", async () => {
    const llm = modelWith([])
    vi.mocked(llm.generateObject).mockRejectedValue(new Error("provider unavailable"))
    const result = await prepareCoreTtsCatalog({ entries, language: "fr", config: { ...config, batchSize: 1 }, profile, llmModel: llm })
    expect(llm.generateObject).toHaveBeenCalledTimes(2)
    expect(result.entries.map((entry) => entry.speechText)).toEqual(["Bonjour", "Monde"])
    expect(result.entries.every((entry) => entry.fallbackReason === "failed")).toBe(true)
  })
  it("rejects a cancelled late result instead of declaring fallback", async () => {
    const controller = new AbortController()
    const llm = modelWith([])
    vi.mocked(llm.generateObject).mockImplementation(async () => { controller.abort(); throw new Error("late error") })
    await expect(prepareCoreTtsCatalog({ entries, language: "fr", config, profile, llmModel: llm, signal: controller.signal })).rejects.toThrow()
  })
})
