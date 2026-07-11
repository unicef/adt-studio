import { describe, expect, it } from "vitest"
import {
  getPickPhrases,
  pickRandomPhrase,
} from "@/features/kids/lib/buddy-phrases"
import { KIDS_CHARACTER_IDS } from "@/features/kids/lib/characters"

describe("buddy-phrases", () => {
  it("provides a non-empty pick pool for every character", () => {
    for (const id of KIDS_CHARACTER_IDS) {
      const phrases = getPickPhrases(id)
      expect(phrases.length).toBeGreaterThan(0)
      for (const phrase of phrases) {
        expect(phrase.key).toMatch(/^kids-/)
        expect(phrase.fallback.length).toBeGreaterThan(0)
      }
    }
  })

  it("gives characters distinct pools via character-specific phrases", () => {
    const dino = getPickPhrases("dino").map((phrase) => phrase.key)
    const robot = getPickPhrases("robot").map((phrase) => phrase.key)
    expect(dino).not.toEqual(robot)
  })

  it("never repeats the current phrase when the pool has alternatives", () => {
    const phrases = getPickPhrases("dino")
    const current = phrases[0]
    for (let i = 0; i < 25; i++) {
      expect(pickRandomPhrase(phrases, current).key).not.toBe(current.key)
    }
  })

  it("returns the only phrase even when it matches current", () => {
    const only = [{ key: "kids-x", fallback: "X" }]
    expect(pickRandomPhrase(only, only[0])).toBe(only[0])
  })
})
