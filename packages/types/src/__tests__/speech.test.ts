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
