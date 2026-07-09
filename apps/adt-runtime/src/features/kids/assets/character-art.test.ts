import { describe, expect, it } from "vitest"
import { DINO_ART, characterAvatar } from "./character-art"

describe("characterAvatar", () => {
  it("returns an SVG data URI that decodes back to the original art", () => {
    const avatar = characterAvatar(DINO_ART)
    const prefix = "data:image/svg+xml,"

    expect(avatar.src.startsWith(prefix)).toBe(true)
    expect(decodeURIComponent(avatar.src.slice(prefix.length))).toBe(DINO_ART)
  })

  it("includes the optional filter when provided", () => {
    expect(characterAvatar(DINO_ART, "hue-rotate(90deg)").filter).toBe(
      "hue-rotate(90deg)",
    )
  })
})
