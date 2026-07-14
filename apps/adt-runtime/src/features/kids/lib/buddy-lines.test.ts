import { describe, expect, it } from "vitest"
import {
  BUDDY_LINES,
  getSpeakableLines,
} from "@/features/kids/lib/buddy-lines"
import { KIDS_CHARACTER_IDS } from "@/features/kids/lib/characters"

describe("buddy-lines", () => {
  it("uses kids- prefixed keys with non-empty fallbacks everywhere", () => {
    for (const line of Object.values(BUDDY_LINES)) {
      expect(line.key).toMatch(/^kids-/)
      expect(line.fallback.length).toBeGreaterThan(0)
    }
  })

  it("points every voiceKey at another line's own clip", () => {
    const clipKeys = new Set(
      Object.values(BUDDY_LINES)
        .filter((line) => !("voiceKey" in line))
        .map((line) => line.key),
    )
    for (const line of Object.values(BUDDY_LINES)) {
      if ("voiceKey" in line) {
        expect(clipKeys.has(line.voiceKey)).toBe(true)
      }
    }
  })

  it("enumerates a per-character work list without voiceKey aliases", () => {
    for (const id of KIDS_CHARACTER_IDS) {
      const lines = getSpeakableLines(id)
      expect(lines.length).toBeGreaterThan(Object.keys(BUDDY_LINES).length / 2)
      expect(lines.every((line) => !line.voiceKey)).toBe(true)
      const keys = lines.map((line) => line.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
