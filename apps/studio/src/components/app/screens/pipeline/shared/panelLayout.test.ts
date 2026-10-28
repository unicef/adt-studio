import { describe, expect, it } from "vitest"
import {
  MIN_CANVAS_WIDTH,
  PANEL_TIERS,
  RAIL_LEFT_CLASS,
  RAIL_WIDTH_CLASS,
  RIGHT_PANEL_WIDTH_CLASS,
  fitPanels,
  panelWidths,
} from "./panelLayout"

function tierClass(property: string, pick: (tier: (typeof PANEL_TIERS)[number]) => number) {
  return PANEL_TIERS.map((tier) =>
    tier.minViewport === 0 ? `${property}-[${pick(tier)}px]` : `min-[${tier.minViewport}px]:${property}-[${pick(tier)}px]`,
  ).join(" ")
}

describe("panelWidths", () => {
  it("narrows the panels on small windows and widens them on big ones", () => {
    expect(panelWidths(1280)).toEqual({ rail: 232, right: 296 })
    expect(panelWidths(1536)).toEqual({ rail: 232, right: 296 })
    expect(panelWidths(1920)).toEqual({ rail: 256, right: 326 })
    expect(panelWidths(2560)).toEqual({ rail: 320, right: 400 })
    expect(panelWidths(5120)).toEqual({ rail: 320, right: 400 })
  })

  it("matches the Tailwind classes that size the panels", () => {
    expect(RAIL_WIDTH_CLASS).toBe(tierClass("w", (tier) => tier.rail))
    expect(RAIL_LEFT_CLASS).toBe(tierClass("left", (tier) => tier.rail))
    expect(RIGHT_PANEL_WIDTH_CLASS).toBe(tierClass("w", (tier) => tier.right))
  })
})

describe("fitPanels", () => {
  const fit = (row: number) => fitPanels(row, panelWidths(row))

  it("hides the right panel first when the canvas would drop below the minimum", () => {
    expect(fit(1280)).toEqual({ ai: true, rail: false })
    expect(1280 - panelWidths(1280).rail).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH)
  })

  it("keeps both panels from 1366 up", () => {
    for (const row of [1366, 1440, 1536, 1728, 1920, 2560, 3840]) {
      expect(fit(row)).toEqual({ ai: false, rail: false })
      const { rail, right } = panelWidths(row)
      expect(row - rail - right).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH)
    }
  })

  it("hides the rail as well once even the rail alone would squeeze the canvas", () => {
    expect(fit(1000)).toEqual({ ai: true, rail: true })
    expect(fit(1032)).toEqual({ ai: true, rail: false })
  })

  it("keeps the right panel when the user has collapsed the rail and the canvas still fits", () => {
    expect(fitPanels(1280, panelWidths(1280), false)).toEqual({ ai: false, rail: false })
    expect(fitPanels(1000, panelWidths(1000), false)).toEqual({ ai: true, rail: true })
  })

  it("counts the rail as gone once it is itself hidden to fit", () => {
    expect(fitPanels(1050, { rail: 300, right: 240 }, true)).toEqual({ ai: false, rail: true })
  })

  it("takes the minimum canvas width as a parameter", () => {
    expect(fitPanels(1400, { rail: 256, right: 326 }, true, 900)).toEqual({ ai: true, rail: false })
  })
})
