import { describe, expect, it } from "vitest"
import { KIDS_CHARACTERS, getCharacter } from "./characters"

describe("KIDS_CHARACTERS", () => {
  it("contains the approved characters in order with unique ids", () => {
    const ids = KIDS_CHARACTERS.map((character) => character.id)

    expect(ids).toEqual(["dino", "robot", "bunny", "cat", "alien"])
    expect(new Set(ids).size).toBe(KIDS_CHARACTERS.length)
  })

  it("defines labels and default names", () => {
    expect(
      KIDS_CHARACTERS.map((character) => character.defaultNameFallback),
    ).toEqual(["Rex", "Bolt", "Pip", "Luna", "Zibby"])

    for (const character of KIDS_CHARACTERS) {
      expect(character.labelKey).toBe(`kids-character-${character.id}`)
      expect(character.defaultNameKey).toBe(
        `kids-character-${character.id}-default-name`,
      )
    }
  })
})

describe("character lookup", () => {
  it("falls back to the first character for unknown ids", () => {
    expect(getCharacter("nope")).toBe(KIDS_CHARACTERS[0])
  })
})
