import { describe, expect, it } from "vitest"
import {
  SpeechConfig,
  SpeechFileEntry,
  SpeechFailedEntry,
  TTSOutput,
  VoiceMapEntry,
  VoiceSlots,
  VoicesConfig,
  parseVoicesConfigEntries,
  isTtsExcluded,
  normalizeVoiceMapEntry,
  resolveEntryVoiceSlot,
  voiceSlotEntryId,
  parseVoiceSlotEntryId,
  sortSpeechEntries,
} from "../speech.js"
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

  describe("SpeechConfig secondary voices", () => {
    it("accepts a per-language secondary provider, model, and voice", () => {
      expect(
        SpeechConfig.safeParse({
          secondary_voices: {
            "es-UY": {
              provider: "gemini",
              model: "gemini-2.5-flash-preview-tts",
              voice: "Puck",
            },
          },
        }).success,
      ).toBe(true)
    })

    it("rejects unsupported providers and empty voices", () => {
      expect(
        SpeechConfig.safeParse({
          secondary_voices: {
            "es-UY": { provider: "unsupported", voice: "" },
          },
        }).success,
      ).toBe(false)
    })
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

// ---------------------------------------------------------------------------
// Dual voice slots
// ---------------------------------------------------------------------------

describe("voiceSlotEntryId / parseVoiceSlotEntryId", () => {
  it("preserves the bare textId for the primary slot (legacy compatible)", () => {
    expect(voiceSlotEntryId("pg001_t001", "primary")).toBe("pg001_t001")
    expect(voiceSlotEntryId("pg001_t001")).toBe("pg001_t001")
    expect(voiceSlotEntryId("pg001_t001", undefined)).toBe("pg001_t001")
    expect(voiceSlotEntryId("pg001_t001", null)).toBe("pg001_t001")
  })

  it("suffixes the secondary slot", () => {
    expect(voiceSlotEntryId("pg001_t001", "secondary")).toBe("pg001_t001--secondary")
  })

  it("round-trips through parseVoiceSlotEntryId", () => {
    expect(parseVoiceSlotEntryId("pg001_t001")).toEqual({
      textId: "pg001_t001",
      voiceSlot: "primary",
    })
    expect(parseVoiceSlotEntryId("pg001_t001--secondary")).toEqual({
      textId: "pg001_t001",
      voiceSlot: "secondary",
    })
  })
})

describe("normalizeVoiceMapEntry", () => {
  it("normalizes a legacy scalar string to a primary-only mapping", () => {
    expect(normalizeVoiceMapEntry("alloy")).toEqual({ primary: { voice: "alloy" } })
  })

  it("passes through a canonical slots object unchanged", () => {
    const entry: VoiceMapEntry = {
      primary: { voice: "alloy", label: "Alloy" },
      secondary: { voice: "shimmer", label: "Shimmer" },
    }
    expect(normalizeVoiceMapEntry(entry)).toEqual(entry)
  })
})

describe("resolveEntryVoiceSlot", () => {
  it("treats a missing voiceSlot as primary", () => {
    expect(resolveEntryVoiceSlot(undefined)).toBe("primary")
    expect(resolveEntryVoiceSlot(null)).toBe("primary")
    expect(resolveEntryVoiceSlot({})).toBe("primary")
  })

  it("returns the explicit voiceSlot when set", () => {
    expect(resolveEntryVoiceSlot({ voiceSlot: "secondary" })).toBe("secondary")
    expect(resolveEntryVoiceSlot({ voiceSlot: "primary" })).toBe("primary")
  })
})

describe("VoiceSlots / VoiceMapEntry schema", () => {
  it("accepts a canonical primary/secondary mapping", () => {
    const result = VoiceSlots.safeParse({
      primary: { voice: "alloy", label: "Alloy" },
      secondary: { voice: "shimmer", label: "Shimmer" },
    })
    expect(result.success).toBe(true)
  })

  it("requires a primary voice", () => {
    const result = VoiceSlots.safeParse({ secondary: { voice: "shimmer" } })
    expect(result.success).toBe(false)
  })

  it("rejects empty voice identifiers and labels", () => {
    expect(VoiceSlots.safeParse({ primary: { voice: " " } }).success).toBe(false)
    expect(
      VoiceSlots.safeParse({ primary: { voice: "alloy", label: " " } }).success,
    ).toBe(false)
  })

  it("VoiceMapEntry accepts both legacy scalars and canonical objects", () => {
    expect(VoiceMapEntry.safeParse("alloy").success).toBe(true)
    expect(
      VoiceMapEntry.safeParse({ primary: { voice: "alloy" } }).success
    ).toBe(true)
  })
})

describe("VoicesConfig", () => {
  it("parses a whole voices.yaml document mixing legacy and canonical entries", () => {
    const result = VoicesConfig.safeParse({
      openai: {
        default: "alloy",
        en: { primary: { voice: "alloy" }, secondary: { voice: "shimmer" } },
        es: "coral",
      },
    })

    expect(result.success).toBe(true)
  })
})

describe("parseVoicesConfigEntries", () => {
  it("preserves valid mappings when a sibling entry is invalid", () => {
    const result = parseVoicesConfigEntries({
      openai: {
        es: "coral",
        en: { secondary: { voice: "shimmer" } },
      },
    })
    expect(result.data).toEqual({ openai: { es: "coral" } })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ provider: "openai", language: "en" }),
    )
  })
})

describe("SpeechFileEntry voiceSlot/voiceLabel", () => {
  it("accepts legacy entries without voiceSlot/voiceLabel", () => {
    const result = SpeechFileEntry.safeParse({
      textId: "pg001_t001",
      language: "en",
      fileName: "pg001_t001.mp3",
      voice: "alloy",
      model: "gpt-4o-mini-tts",
      cached: false,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a secondary entry with a voiceLabel", () => {
    const result = SpeechFileEntry.safeParse({
      textId: "pg001_t001",
      language: "en",
      fileName: "pg001_t001--secondary.mp3",
      voice: "shimmer",
      model: "gpt-4o-mini-tts",
      cached: false,
      voiceSlot: "secondary",
      voiceLabel: "Shimmer",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid voiceSlot value", () => {
    const result = SpeechFileEntry.safeParse({
      textId: "pg001_t001",
      language: "en",
      fileName: "pg001_t001.mp3",
      voice: "alloy",
      model: "gpt-4o-mini-tts",
      cached: false,
      voiceSlot: "tertiary",
    })
    expect(result.success).toBe(false)
  })
})

describe("SpeechFailedEntry voiceSlot", () => {
  it("accepts a failure without voiceSlot (legacy)", () => {
    expect(
      SpeechFailedEntry.safeParse({ textId: "pg001_t002", error: "boom" }).success
    ).toBe(true)
  })

  it("accepts a failure with an explicit secondary voiceSlot", () => {
    expect(
      SpeechFailedEntry.safeParse({
        textId: "pg001_t002",
        error: "boom",
        voiceSlot: "secondary",
      }).success
    ).toBe(true)
  })
})

describe("sortSpeechEntries", () => {
  const entry = (textId: string, voiceSlot?: "primary" | "secondary") => ({
    textId,
    ...(voiceSlot ? { voiceSlot } : {}),
  })
  const shape = (entries: ReturnType<typeof entry>[]) =>
    entries.map((e) => [e.textId, e.voiceSlot ?? "primary"])

  it("orders by catalog position, primary before its secondary", () => {
    // Interleaved the way a mixed reuse/regenerate run produces them.
    const sorted = sortSpeechEntries(
      [
        entry("pg001_t002", "secondary"),
        entry("pg001_t001", "secondary"),
        entry("pg001_t002"),
        entry("pg001_t001"),
      ],
      ["pg001_t001", "pg001_t002"],
    )

    expect(shape(sorted)).toEqual([
      ["pg001_t001", "primary"],
      ["pg001_t001", "secondary"],
      ["pg001_t002", "primary"],
      ["pg001_t002", "secondary"],
    ])
  })

  it("treats a missing voiceSlot as primary", () => {
    const sorted = sortSpeechEntries(
      [entry("pg001_t001", "secondary"), entry("pg001_t001")],
      ["pg001_t001"],
    )

    expect(shape(sorted)).toEqual([
      ["pg001_t001", "primary"],
      ["pg001_t001", "secondary"],
    ])
  })

  it("sorts ids missing from the catalog to the tail, keeping their order", () => {
    const sorted = sortSpeechEntries(
      [entry("orphan_b"), entry("pg001_t001"), entry("orphan_a")],
      ["pg001_t001"],
    )

    expect(sorted.map((e) => e.textId)).toEqual(["pg001_t001", "orphan_b", "orphan_a"])
  })

  it("handles an empty catalog without reordering", () => {
    const sorted = sortSpeechEntries([entry("b"), entry("a")], [])

    expect(sorted.map((e) => e.textId)).toEqual(["b", "a"])
  })

  it("does not mutate the input array", () => {
    const input = [entry("pg001_t002"), entry("pg001_t001")]

    sortSpeechEntries(input, ["pg001_t001", "pg001_t002"])

    expect(input.map((e) => e.textId)).toEqual(["pg001_t002", "pg001_t001"])
  })
})
