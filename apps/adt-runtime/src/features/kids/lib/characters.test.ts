import { describe, expect, it } from "vitest"
import type { BuddyArt } from "@/features/kids/assets/buddies/buddy-art"
import {
  KIDS_CHARACTERS,
  getCharacter,
  getPalette,
} from "./characters"

function expectValidBuddyArt(art: BuddyArt) {
  expect(art.id.length).toBeGreaterThan(0)
  expect(art.svg).toContain("<svg")
  expect(art.palettes.length).toBeGreaterThanOrEqual(4)
  expect(art.palettes[0].id).toBe("classic")

  const paletteIds = art.palettes.map((palette) => palette.id)
  expect(new Set(paletteIds).size).toBe(paletteIds.length)

  for (const palette of art.palettes) {
    expect(palette.labelKey).toBe(`kids-palette-${palette.id}`)
    expect(palette.labelFallback.length).toBeGreaterThan(0)
    expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/i)
    expect(palette.secondary).toMatch(/^#[0-9A-F]{6}$/i)
    expect(palette.accent).toMatch(/^#[0-9A-F]{6}$/i)
  }
}

describe("KIDS_CHARACTERS", () => {
  it("contains the approved characters in order with unique ids", () => {
    const ids = KIDS_CHARACTERS.map((character) => character.id)

    expect(ids).toEqual(["dino", "robot", "bunny", "cat", "alien"])
    expect(new Set(ids).size).toBe(KIDS_CHARACTERS.length)
  })

  it("defines labels, default names, and valid layered art", () => {
    expect(
      KIDS_CHARACTERS.map((character) => character.defaultNameFallback),
    ).toEqual(["Rex", "Bolt", "Pip", "Luna", "Zibby"])

    for (const character of KIDS_CHARACTERS) {
      expect(character.labelKey).toBe(`kids-character-${character.id}`)
      expect(character.defaultNameKey).toBe(
        `kids-character-${character.id}-default-name`,
      )
      expectValidBuddyArt(character.art)
    }
  })
})

describe("character lookup", () => {
  it("falls back to the first character for unknown ids", () => {
    expect(getCharacter("nope")).toBe(KIDS_CHARACTERS[0])
  })

  it("returns the requested palette or the classic palette by default", () => {
    const dino = getCharacter("dino")
    const alternate = dino.art.palettes[1]

    expect(getPalette(dino.art, alternate.id)).toBe(alternate)
    expect(getPalette(dino.art, "nope")).toBe(dino.art.palettes[0])
    expect(getPalette(dino.art, undefined)).toBe(dino.art.palettes[0])
  })
})
