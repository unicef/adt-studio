import { describe, expect, it } from "vitest"
import { DINO_BUDDY } from "./dino"
import { ROBOT_BUDDY } from "./robot"
import { buddyPaletteVars, type BuddyArt } from "./buddy-art"

const BUDDIES = [DINO_BUDDY, ROBOT_BUDDY] as const
const REQUIRED_PARTS = ["body", "head", "eyes", "mouth"] as const
const REQUIRED_ANCHORS = ["hat", "eyes", "neck"] as const
const HEX_COLOR = /^#[0-9A-F]{6}$/i

function rootSvgCount(svg: string) {
  return (svg.match(/<svg\b/g) ?? []).length
}

function hasDataPart(svg: string, part: string) {
  return new RegExp(`<g\\b[^>]*data-part="${part}"[^>]*>`).test(svg)
}

function hasAnchor(svg: string, anchor: string) {
  return new RegExp(
    `<g\\b(?=[^>]*data-anchor="${anchor}")(?=[^>]*transform="translate\\([^"]+\\)")[^>]*/>`,
  ).test(svg)
}

function varUsages(svg: string) {
  return svg.match(/var\(--buddy-[^)]+\)/g) ?? []
}

function expectValidSvgContract(art: BuddyArt) {
  expect(rootSvgCount(art.svg)).toBe(1)
  expect(art.svg).toMatch(
    /^<svg\b(?=[^>]*\bviewBox="0 0 120 120")(?!(?=[^>]*\bwidth=))(?!(?=[^>]*\bheight=))[^>]*>/,
  )
  expect(art.svg).not.toMatch(/<(style|script|image)\b/i)
  expect(art.svg).not.toMatch(/xlink:href/i)

  for (const part of REQUIRED_PARTS) {
    expect(hasDataPart(art.svg, part), `${art.id} missing ${part}`).toBe(true)
  }

  for (const anchor of REQUIRED_ANCHORS) {
    expect(hasAnchor(art.svg, anchor), `${art.id} missing ${anchor}`).toBe(true)
  }

  for (const usage of varUsages(art.svg)) {
    expect(usage, `${art.id} CSS var needs fallback`).toMatch(
      /^var\(--buddy-(primary|secondary|accent), #[0-9A-F]{6}\)$/i,
    )
  }
}

function expectValidPalettes(art: BuddyArt) {
  const ids = art.palettes.map((palette) => palette.id)

  expect(art.palettes).toHaveLength(4)
  expect(ids[0]).toBe("classic")
  expect(new Set(ids).size).toBe(ids.length)

  for (const palette of art.palettes) {
    expect(palette.labelKey).toBe(`kids-palette-${palette.id}`)
    expect(palette.primary).toMatch(HEX_COLOR)
    expect(palette.secondary).toMatch(HEX_COLOR)
    expect(palette.accent).toMatch(HEX_COLOR)
  }
}

describe("buddy art anatomy", () => {
  it("follows the layered SVG contract for every pilot character", () => {
    for (const art of BUDDIES) {
      expectValidSvgContract(art)
    }
  })

  it("defines valid palette presets for every pilot character", () => {
    for (const art of BUDDIES) {
      expectValidPalettes(art)
    }
  })
})

describe("buddyPaletteVars", () => {
  it("maps color slots to CSS custom properties", () => {
    expect(
      buddyPaletteVars({
        primary: "#112233",
        secondary: "#445566",
        accent: "#778899",
      }),
    ).toEqual({
      "--buddy-primary": "#112233",
      "--buddy-secondary": "#445566",
      "--buddy-accent": "#778899",
    })
  })
})
