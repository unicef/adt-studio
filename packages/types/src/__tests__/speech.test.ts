import { describe, expect, it } from "vitest"
import { SpeechConfig, TTSOutput, isTtsExcluded } from "../speech.js"
import { getTextCatalogCategory } from "../text-catalog.js"

describe("getTextCatalogCategory", () => {
  it("classifies catalog entry ids by their conventions", () => {
    expect(getTextCatalogCategory("pg001_t001")).toBe("text")
    expect(getTextCatalogCategory("qz001_que")).toBe("text")
    expect(getTextCatalogCategory("pg001_im001")).toBe("captions")
    expect(getTextCatalogCategory("pg001_sec001_ans_a")).toBe("answers")
    expect(getTextCatalogCategory("gl001")).toBe("glossary")
    expect(getTextCatalogCategory("gl001_def")).toBe("glossary")
    expect(getTextCatalogCategory("gl_manual_1")).toBe("glossary")
    expect(getTextCatalogCategory("pg001_t001_easy_read")).toBe("easy-read")
  })

  it("prefers easy-read over the source entry's category", () => {
    expect(getTextCatalogCategory("pg001_im001_easy_read")).toBe("easy-read")
    expect(getTextCatalogCategory("gl001_easy_read")).toBe("easy-read")
  })
})

describe("isTtsExcluded", () => {
  it("is not excluded without config", () => {
    expect(isTtsExcluded("pg001_t001")).toBe(false)
    expect(isTtsExcluded("pg001_t001", {})).toBe(false)
    expect(isTtsExcluded("pg001_t001", null)).toBe(false)
  })

  it("excludes individually muted ids", () => {
    const config = { excluded_text_ids: ["pg001_t002"] }
    expect(isTtsExcluded("pg001_t002", config)).toBe(true)
    expect(isTtsExcluded("pg001_t001", config)).toBe(false)
  })

  it("mutes the easy-read variant of a muted source entry", () => {
    const config = { excluded_text_ids: ["pg001_t002"] }
    expect(isTtsExcluded("pg001_t002_easy_read", config)).toBe(true)
    expect(isTtsExcluded("pg001_t001_easy_read", config)).toBe(false)
  })

  it("excludes whole categories", () => {
    const config = { excluded_categories: ["captions", "glossary"] }
    expect(isTtsExcluded("pg001_im001", config)).toBe(true)
    expect(isTtsExcluded("gl001_def", config)).toBe(true)
    expect(isTtsExcluded("pg001_t001", config)).toBe(false)
    expect(isTtsExcluded("pg001_sec001_ans_a", config)).toBe(false)
  })

  it("applies the source entry's excluded category to its easy-read variant", () => {
    const config = { excluded_categories: ["captions"] }
    expect(isTtsExcluded("pg001_im001_easy_read", config)).toBe(true)
    expect(isTtsExcluded("pg001_t001_easy_read", config)).toBe(false)
  })

  it("excludes all easy-read variants when the easy-read category is muted", () => {
    const config = { excluded_categories: ["easy-read"] }
    expect(isTtsExcluded("pg001_t001_easy_read", config)).toBe(true)
    expect(isTtsExcluded("pg001_t001", config)).toBe(false)
  })
})

describe("SpeechConfig exclusions", () => {
  it("accepts exclusion fields", () => {
    const result = SpeechConfig.safeParse({
      excluded_categories: ["captions", "easy-read"],
      excluded_text_ids: ["pg001_t001"],
    })
    expect(result.success).toBe(true)
  })

  it("rejects unknown categories", () => {
    const result = SpeechConfig.safeParse({
      excluded_categories: ["page-numbers"],
    })
    expect(result.success).toBe(false)
  })
})

describe("SpeechConfig ElevenLabs options", () => {
  it("accepts elevenlabs_use_context and elevenlabs_apply_text_normalization", () => {
    const result = SpeechConfig.safeParse({
      elevenlabs_use_context: true,
      elevenlabs_apply_text_normalization: "on",
    })
    expect(result.success).toBe(true)
  })

  it("defaults both fields to unset when omitted", () => {
    const result = SpeechConfig.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.elevenlabs_use_context).toBeUndefined()
      expect(result.data.elevenlabs_apply_text_normalization).toBeUndefined()
    }
  })

  it("rejects an invalid elevenlabs_apply_text_normalization value", () => {
    const result = SpeechConfig.safeParse({
      elevenlabs_apply_text_normalization: "always",
    })
    expect(result.success).toBe(false)
  })

  it("accepts the voice_settings tuning fields", () => {
    const result = SpeechConfig.safeParse({
      elevenlabs_stability: 0.7,
      elevenlabs_similarity_boost: 0.5,
      elevenlabs_style: 0,
      elevenlabs_use_speaker_boost: true,
      elevenlabs_speed: 1,
    })
    expect(result.success).toBe(true)
  })

  it("leaves the voice_settings tuning fields unset when omitted", () => {
    const result = SpeechConfig.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.elevenlabs_stability).toBeUndefined()
      expect(result.data.elevenlabs_style).toBeUndefined()
      expect(result.data.elevenlabs_speed).toBeUndefined()
    }
  })

  // An out-of-range value written to config.yaml would make AppConfig.parse
  // throw on the next load, breaking the whole book.
  it.each([
    ["elevenlabs_stability", 1.5],
    ["elevenlabs_stability", -0.1],
    ["elevenlabs_similarity_boost", 2],
    ["elevenlabs_style", 1.1],
    ["elevenlabs_speed", 0.5],
    ["elevenlabs_speed", 1.5],
  ])("rejects out-of-range %s = %s", (field, value) => {
    expect(SpeechConfig.safeParse({ [field]: value }).success).toBe(false)
  })
})

describe("TTSOutput", () => {
  const entry = {
    textId: "pg001_t001",
    language: "en",
    fileName: "pg001_t001.mp3",
    voice: "alloy",
    model: "gpt-4o-mini-tts",
    cached: false,
  }

  it("accepts output without failures (existing data)", () => {
    const result = TTSOutput.safeParse({
      entries: [entry],
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(result.success).toBe(true)
  })

  it("accepts per-item failures", () => {
    const result = TTSOutput.safeParse({
      entries: [entry],
      generatedAt: "2026-01-01T00:00:00.000Z",
      failed: [{ textId: "pg001_t002", error: "Gemini rate limit" }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.failed).toHaveLength(1)
    }
  })
})
