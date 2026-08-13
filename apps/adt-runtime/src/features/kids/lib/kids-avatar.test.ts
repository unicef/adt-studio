import { describe, it, expect } from "vitest"
import {
  DEFAULT_KIDS_AVATAR,
  randomKidsAvatar,
  type KidsAvatarConfig,
} from "@adt/types/kids"
import { kidsAvatarSvg } from "./kids-avatar"

describe("kidsAvatarSvg", () => {
  it("renders the default avatar to a self-contained SVG offline", () => {
    const svg = kidsAvatarSvg(DEFAULT_KIDS_AVATAR)
    expect(svg).toContain("<svg")
    expect(svg).toContain('width="100%"')
    // No external references — the art is inlined.
    expect(svg).not.toMatch(/xlink:href="http/)
  })

  it("omits optional parts when their id is empty", () => {
    const bald: KidsAvatarConfig = {
      ...DEFAULT_KIDS_AVATAR,
      hair: "",
      glasses: "",
      earrings: "",
      features: "",
    }
    // Renders without throwing and still produces a face.
    expect(kidsAvatarSvg(bald)).toContain("<svg")
  })

  it("randomKidsAvatar produces a fully-populated required config", () => {
    for (let i = 0; i < 20; i++) {
      const a = randomKidsAvatar()
      expect(a.skinColor).toBeTruthy()
      expect(a.hairColor).toBeTruthy()
      expect(a.eyes).toBeTruthy()
      expect(a.eyebrows).toBeTruthy()
      expect(a.mouth).toBeTruthy()
      expect(a.backgroundColor).toBeTruthy()
      expect(kidsAvatarSvg(a)).toContain("<svg")
    }
  })
})
