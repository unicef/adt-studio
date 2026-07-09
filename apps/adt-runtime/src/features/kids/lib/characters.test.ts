import { describe, expect, it } from "vitest"
import { characterAvatar } from "@/features/kids/assets/character-art"
import {
  KIDS_CHARACTERS,
  getCharacter,
  resolveAvatar,
} from "./characters"

describe("KIDS_CHARACTERS", () => {
  it("contains the expected characters in order with unique ids", () => {
    const ids = KIDS_CHARACTERS.map((character) => character.id)

    expect(ids).toEqual([
      "dino",
      "robot",
      "parrot",
      "unicorn",
      "dragon",
      "alien",
      "princess",
    ])
    expect(new Set(ids).size).toBe(KIDS_CHARACTERS.length)
  })

  it("has art and unique looks for every character", () => {
    for (const character of KIDS_CHARACTERS) {
      const lookIds = character.looks.map((look) => look.id)

      expect(character.art.length).toBeGreaterThan(0)
      expect(character.looks.length).toBeGreaterThanOrEqual(4)
      expect(new Set(lookIds).size).toBe(lookIds.length)
    }
  })

  it("uses art variants instead of filters for princess looks", () => {
    const princess = getCharacter("princess")

    expect(princess.looks).toHaveLength(6)
    for (const look of princess.looks) {
      expect(look.art).toBeTruthy()
      expect(look.filter).toBeUndefined()
    }
  })

  it("injects color before hue rotation for alien recolors", () => {
    const alien = getCharacter("alien")
    const recolors = alien.looks.filter((look) => look.id !== "classic")

    expect(recolors.length).toBeGreaterThan(0)
    for (const look of recolors) {
      expect(look.filter?.startsWith("sepia(1) saturate(2.5)")).toBe(true)
    }
  })
})

describe("character lookup", () => {
  it("falls back to the first character for unknown ids", () => {
    expect(getCharacter("nope")).toBe(KIDS_CHARACTERS[0])
  })

  it("falls back to the first look when resolving an unknown look id", () => {
    const dino = getCharacter("dino")

    expect(resolveAvatar("dino", "nope")).toEqual(characterAvatar(dino.art))
  })
})
