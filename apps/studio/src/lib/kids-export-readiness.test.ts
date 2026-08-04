import { describe, expect, it } from "vitest"
import { getKidsExportReadiness } from "./kids-export-readiness"

describe("getKidsExportReadiness", () => {
  it("requires setup, interface parity, every buddy voice, and narration", () => {
    const readiness = getKidsExportReadiness({
      config: { enabled: true, buddies: ["cat", "robot"] },
      interfaceStatus: {
        ready: true,
        sourceKeyCount: 2,
        languages: [
          { language: "en", ready: true, missingKeys: [] },
          { language: "fr", ready: true, missingKeys: [] },
        ],
      },
      voiceStatus: {
        languages: [
          {
            language: "en",
            hasPack: true,
            clipCount: 20,
            characters: ["cat", "robot"],
            completeCharacters: ["cat", "robot"],
            narratorReady: true,
          },
          {
            language: "fr",
            hasPack: true,
            clipCount: 10,
            characters: ["cat"],
            completeCharacters: ["cat"],
            narratorReady: true,
          },
        ],
      },
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.missingVoiceLanguages).toEqual(["fr"])
    expect(readiness.readyVoiceLanguageCount).toBe(1)
  })

  it("reports ready when all configured tracks are complete", () => {
    const readiness = getKidsExportReadiness({
      config: { enabled: true, buddies: ["cat"] },
      interfaceStatus: {
        ready: true,
        sourceKeyCount: 1,
        languages: [{ language: "en", ready: true, missingKeys: [] }],
      },
      voiceStatus: {
        languages: [
          {
            language: "en",
            hasPack: true,
            clipCount: 10,
            characters: ["cat"],
            completeCharacters: ["cat"],
            narratorReady: true,
          },
        ],
      },
    })

    expect(readiness.ready).toBe(true)
  })
})
