import { describe, expect, it } from "vitest"
import type { SpeechConfig, TextCatalogEntry } from "@adt/types"
import { coreTtsInputBasis, preparationNeighbors } from "../core-tts.js"
import { adjacentSpeechContextId } from "../output-catalog.js"
import { collectElementAudioTextIds } from "../element-audio-ids.js"
import {
  findAdjacentSpeechText,
  isBatchableSpeechEntry,
  isPageBatchableSpeech,
  speechPageId,
} from "../speech.js"

const speechConfig = (over: Partial<SpeechConfig> = {}): SpeechConfig => over as SpeechConfig

const entry = (id: string, text: string): TextCatalogEntry => ({ id, text })

/** Only this id was authored in the element-audio artifact. */
const authored = new Set(["pg001_im001_audio"])

describe("collectElementAudioTextIds", () => {
  it("derives the synthetic ids from the artifact rows only", () => {
    const storage = {
      getNodeItemIds: (node: string) => (node === "element-audio" ? ["pg001", "pg002"] : []),
      getLatestNodeData: (node: string, pageId: string) =>
        node === "element-audio"
          ? {
              data: {
                entries:
                  pageId === "pg001"
                    ? [{ nodeId: "pg001_im001", text: "Mago" }]
                    : [
                        { nodeId: "pg002_im002", text: "Maga" },
                        { nodeId: "pg002_t001", text: "not an image" },
                        { nodeId: "", text: "invalid" },
                      ],
              },
            }
          : null,
    } as never

    expect([...collectElementAudioTextIds(storage)].sort()).toEqual([
      "pg001_im001_audio",
      "pg002_im002_audio",
    ])
  })
})

describe("speechPageId - element audio", () => {
  it("AC-17: returns undefined only for ids authored in the artifact", () => {
    expect(speechPageId("pg001_im001_audio", ["pg001"], authored)).toBeUndefined()
    expect(speechPageId("pg001_im001_audio", [], authored)).toBeUndefined()
  })

  it("AC-17: keeps the _easy_read exclusion", () => {
    expect(speechPageId("pg001_im001_easy_read", ["pg001"])).toBeUndefined()
  })

  it("AC-14: a legacy image id ending in _audio still resolves its page", () => {
    expect(speechPageId("pg003_im007_audio", ["pg003"])).toBe("pg003")
    expect(speechPageId("pg003_im007_audio", ["pg003"], new Set(["pg003_im007_audio"]))).toBeUndefined()
  })

  it("AC-17: still resolves normal ids from locations first and the prefix second", () => {
    expect(speechPageId("pg001_t001", ["pg002"])).toBe("pg002")
    expect(speechPageId("pg001_t001")).toBe("pg001")
  })
})

describe("isBatchableSpeechEntry - element audio", () => {
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

describe("preparation neighbours - element audio", () => {
  const entries = [
    entry("pg001_t001", "A"),
    entry("pg001_im001_audio", "Mago"),
    entry("pg001_t002", "B"),
  ]

  it("AC-15: preparationNeighbors skips the authored entry", () => {
    expect(preparationNeighbors(entries, 0, authored).map((item) => item.id)).toEqual(["pg001_t001", "pg001_t002"])
  })

  it("AC-25: the authored entry takes no preparation neighbours", () => {
    expect(preparationNeighbors(entries, 1, authored).map((item) => item.id)).toEqual(["pg001_im001_audio"])
  })

  it("AC-14: a legacy image id ending in _audio is a normal preparation neighbour", () => {
    const legacy = [
      entry("pg003_t001", "A"),
      entry("pg003_im007_audio", "Mago"),
      entry("pg003_t002", "B"),
    ]
    expect(preparationNeighbors(legacy, 0).map((item) => item.id)).toEqual(["pg003_t001", "pg003_im007_audio"])
    expect(preparationNeighbors(legacy, 1).map((item) => item.id)).toEqual([
      "pg003_t001",
      "pg003_im007_audio",
      "pg003_t002",
    ])
    expect(preparationNeighbors(legacy, 0, new Set(["pg003_im007_audio"])).map((item) => item.id)).toEqual([
      "pg003_t001",
      "pg003_t002",
    ])
  })

  it("AC-25: preparationNeighbors tolerates an out-of-range index", () => {
    expect(preparationNeighbors([], 0)).toEqual([])
    expect(preparationNeighbors(entries, 99, authored)).toEqual([])
  })

  it("AC-25: the adjacent ElevenLabs context never resolves to the authored entry", () => {
    const withSameText = [
      entry("pg001_t001", "A"),
      entry("pg001_im001_audio", "B"),
      entry("pg001_t002", "B"),
    ]
    expect(adjacentSpeechContextId(withSameText, 0, 1, "B", authored)).toBe("pg001_t002")
    expect(adjacentSpeechContextId(withSameText, 2, -1, "A", authored)).toBe("pg001_t001")
  })

  it("AC-14: a legacy _audio image can be the adjacent context", () => {
    const legacy = [
      entry("pg003_t001", "A"),
      entry("pg003_im007_audio", "B"),
      entry("pg003_t002", "B"),
    ]
    expect(adjacentSpeechContextId(legacy, 0, 1, "B")).toBe("pg003_im007_audio")
    expect(adjacentSpeechContextId(legacy, 0, 1, "B", new Set(["pg003_im007_audio"]))).toBe("pg003_t002")
  })

  it("AC-15: findAdjacentSpeechText skips the authored entry", () => {
    expect(findAdjacentSpeechText(entries, 0, 1, speechConfig(), authored)).toBe("B")
    expect(findAdjacentSpeechText(entries, 2, -1, speechConfig(), authored)).toBe("A")
  })

  it("AC-14: a legacy _audio image participates in adjacent speech", () => {
    const legacy = [
      entry("pg003_t001", "A"),
      entry("pg003_im007_audio", "Mago"),
      entry("pg003_t002", "B"),
    ]
    expect(findAdjacentSpeechText(legacy, 0, 1, speechConfig())).toBe("Mago")
    expect(findAdjacentSpeechText(legacy, 0, 1, speechConfig(), new Set(["pg003_im007_audio"]))).toBe("B")
  })

  it("AC-25: findAdjacentSpeechText returns undefined for the authored entry", () => {
    expect(findAdjacentSpeechText(entries, 1, 1, speechConfig(), authored)).toBeUndefined()
    expect(findAdjacentSpeechText(entries, 1, -1, speechConfig(), authored)).toBeUndefined()
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
      authoredElementAudioIds: authored,
    })
    const withAudio = coreTtsInputBasis({
      entries,
      index: 0,
      language: "en",
      config: config as never,
      profile: profile as never,
      authoredElementAudioIds: authored,
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
      authoredElementAudioIds: authored,
    })
    const withoutNeighbours = coreTtsInputBasis({
      entries: [entries[0], entries[1]],
      index: 1,
      language: "en",
      config: config as never,
      profile: profile as never,
      authoredElementAudioIds: authored,
    })

    expect(withBoth.input.previous_display_text).toBeNull()
    expect(withBoth.input.next_display_text).toBeNull()
    expect(withBoth.signature).toBe(withoutNeighbours.signature)
  })

  it("AC-14: a legacy _audio image contributes preparation neighbour context", () => {
    const config = {
      latexToSpeech: false,
      languageNormalization: true,
      modelId: "test-model",
      promptName: "speech-prep",
      promptSignature: "speech-prep-signature",
    }
    const profile = { guidance: "Normalize the text." }
    const legacy = [
      entry("pg003_t001", "A"),
      entry("pg003_im007_audio", "Mago"),
      entry("pg003_t002", "B"),
    ]
    const legacyBasis = coreTtsInputBasis({
      entries: legacy,
      index: 1,
      language: "en",
      config: config as never,
      profile: profile as never,
    })
    expect(legacyBasis.input.previous_display_text).toBe("A")
    expect(legacyBasis.input.next_display_text).toBe("B")

    const authoredBasis = coreTtsInputBasis({
      entries: legacy,
      index: 1,
      language: "en",
      config: config as never,
      profile: profile as never,
      authoredElementAudioIds: new Set(["pg003_im007_audio"]),
    })
    expect(authoredBasis.input.previous_display_text).toBeNull()
    expect(authoredBasis.input.next_display_text).toBeNull()
  })
})
