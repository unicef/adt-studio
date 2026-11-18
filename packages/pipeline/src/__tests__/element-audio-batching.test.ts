import { describe, expect, it } from "vitest"
import type { SpeechConfig, TextCatalogEntry } from "@adt/types"
import { coreTtsInputBasis, preparationNeighbors } from "../core-tts.js"
import {
  findAdjacentSpeechText,
  isBatchableSpeechEntry,
  isPageBatchableSpeech,
  speechPageId,
} from "../speech.js"

const speechConfig = (over: Partial<SpeechConfig> = {}): SpeechConfig => over as SpeechConfig

const entry = (id: string, text: string): TextCatalogEntry => ({ id, text })

describe("speechPageId — element audio", () => {
  it("AC-17: returns undefined for _audio ids", () => {
    expect(speechPageId("pg001_im001_audio", ["pg001"])).toBeUndefined()
    expect(speechPageId("pg001_im001_audio")).toBeUndefined()
  })

  it("AC-17: keeps the _easy_read exclusion", () => {
    expect(speechPageId("pg001_im001_easy_read", ["pg001"])).toBeUndefined()
  })

  it("AC-17: still resolves normal ids from locations first and the prefix second", () => {
    expect(speechPageId("pg001_t001", ["pg002"])).toBe("pg002")
    expect(speechPageId("pg001_t001")).toBe("pg001")
  })
})

describe("isBatchableSpeechEntry — element audio", () => {
  it("AC-17: is false without a page, even for Gemini with batching on", () => {
    expect(isBatchableSpeechEntry(undefined, "gemini", "en", speechConfig({ batch_by_page: true }))).toBe(false)
  })

  it("AC-17: is false for a non-Gemini provider", () => {
    expect(isBatchableSpeechEntry("pg001", "openai", "en", speechConfig({ batch_by_page: true }))).toBe(false)
  })

  it("AC-17: is false for an unsupported language", () => {
    expect(isBatchableSpeechEntry("pg001", "gemini", "zh", speechConfig({ batch_by_page: true }))).toBe(false)
  })

  it("AC-17: is false when batching is off", () => {
    expect(isBatchableSpeechEntry("pg001", "gemini", "en", speechConfig({ batch_by_page: false }))).toBe(false)
  })

  it("AC-17: is true for Gemini + batching + supported language + page", () => {
    expect(isBatchableSpeechEntry("pg001", "gemini", "en", speechConfig({ batch_by_page: true }))).toBe(true)
    expect(isBatchableSpeechEntry("pg001", "gemini", "es-UY", speechConfig({ batch_by_page: true }))).toBe(true)
  })

  it("AC-17: the per-voice form matches the per-entry provider/config decision", () => {
    expect(isPageBatchableSpeech("gemini", "en", speechConfig({ batch_by_page: true }))).toBe(true)
    expect(isPageBatchableSpeech("openai", "en", speechConfig({ batch_by_page: true }))).toBe(false)
    expect(isPageBatchableSpeech("gemini", "zh", speechConfig({ batch_by_page: true }))).toBe(false)
    expect(isPageBatchableSpeech("gemini", "en", speechConfig({ batch_by_page: false }))).toBe(false)
  })
})

describe("preparation neighbours — element audio", () => {
  const entries = [
    entry("pg001_t001", "A"),
    entry("pg001_im001_audio", "Mago"),
    entry("pg001_t002", "B"),
  ]

  it("AC-15: preparationNeighbors skips the synthetic entry", () => {
    expect(preparationNeighbors(entries, 0).map((item) => item.id)).toEqual(["pg001_t001", "pg001_t002"])
  })

  it("AC-25: the authored entry takes no preparation neighbours", () => {
    expect(preparationNeighbors(entries, 1).map((item) => item.id)).toEqual(["pg001_im001_audio"])
  })

  it("AC-15: findAdjacentSpeechText skips the synthetic entry", () => {
    expect(findAdjacentSpeechText(entries, 0, 1, speechConfig())).toBe("B")
    expect(findAdjacentSpeechText(entries, 2, -1, speechConfig())).toBe("A")
  })

  it("AC-25: findAdjacentSpeechText returns undefined for the authored entry", () => {
    expect(findAdjacentSpeechText(entries, 1, 1, speechConfig())).toBeUndefined()
    expect(findAdjacentSpeechText(entries, 1, -1, speechConfig())).toBeUndefined()
  })

  it("AC-15: coreTtsInputBasis produces the same signature with and without a synthetic neighbour", () => {
    const config = {
      latexToSpeech: false,
      languageNormalization: true,
      modelId: "test-model",
      promptName: "speech-prep",
      promptSignature: "speech-prep-signature",
    }
    const profile = { guidance: "Normalize the text." }
    const withoutAudio = coreTtsInputBasis({
      entries: [entries[0], entries[2]],
      index: 0,
      language: "en",
      config: config as never,
      profile: profile as never,
    })
    const withAudio = coreTtsInputBasis({
      entries,
      index: 0,
      language: "en",
      config: config as never,
      profile: profile as never,
    })

    expect(withAudio.input.next_display_text).toBe("B")
    expect(withAudio.signature).toBe(withoutAudio.signature)
  })

  it("AC-25: the authored entry's preparation signature does not depend on real neighbours", () => {
    const config = {
      latexToSpeech: false,
      languageNormalization: true,
      modelId: "test-model",
      promptName: "speech-prep",
      promptSignature: "speech-prep-signature",
    }
    const profile = { guidance: "Normalize the text." }
    const withBoth = coreTtsInputBasis({
      entries,
      index: 1,
      language: "en",
      config: config as never,
      profile: profile as never,
    })
    const withoutNeighbours = coreTtsInputBasis({
      entries: [entries[0], entries[1]],
      index: 1,
      language: "en",
      config: config as never,
      profile: profile as never,
    })

    expect(withBoth.input.previous_display_text).toBeNull()
    expect(withBoth.input.next_display_text).toBeNull()
    expect(withBoth.signature).toBe(withoutNeighbours.signature)
  })
})
