import { describe, expect, it } from "vitest"
import { fitColumns } from "./useCanvasFit"

const PAD_X = 64
const PAD_TOP = 32

const fitCanvas = (width: number, height: number) => fitColumns(width - PAD_X, height - PAD_TOP)

describe("fitColumns", () => {
  it.each([
    ["1440×900", 944, 832, 4],
    ["1920×1080", 1424, 1012, 5],
    ["2560×1440", 2064, 1372, 6],
  ])("fits the measured Not-run canvas at %s", (_viewport, width, height, columns) => {
    expect(fitCanvas(width, height)).toBe(columns)
  })

  it("falls back to 6 columns before the canvas has a size", () => {
    expect(fitColumns(0, 800)).toBe(6)
    expect(fitColumns(800, 0)).toBe(6)
    expect(fitColumns(-10, -10)).toBe(6)
  })

  it("never drops below 2 columns", () => {
    expect(fitColumns(120, 2000)).toBe(2)
    expect(fitColumns(40, 300)).toBe(2)
  })
})
