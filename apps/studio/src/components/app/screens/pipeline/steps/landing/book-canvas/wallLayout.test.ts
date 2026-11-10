import { describe, expect, it } from "vitest"
import { canvasColumns, fitFor, wallCell } from "./wallLayout"

const PORTRAIT = 1169 / 1568
const SPREAD = 2326 / 1560
const LANDSCAPE = 1190 / 840
const A4 = 595 / 842

describe("canvasColumns", () => {
  it("keeps the fitted columns for portrait pages", () => {
    expect(canvasColumns(4, 650 / 812)).toBe(4)
    expect(canvasColumns(4, A4)).toBe(4)
    expect(canvasColumns(6, PORTRAIT)).toBe(6)
  })

  it("halves the columns for two-page spreads", () => {
    expect(canvasColumns(4, PORTRAIT * 2)).toBe(2)
    expect(canvasColumns(6, SPREAD)).toBe(3)
  })

  it("gives landscape PDF pages wider cells", () => {
    expect(canvasColumns(4, LANDSCAPE)).toBe(2)
    expect(canvasColumns(5, LANDSCAPE)).toBe(3)
    expect(canvasColumns(6, LANDSCAPE)).toBe(3)
  })

  it("never drops below one column, even for landscape spreads", () => {
    expect(canvasColumns(2, LANDSCAPE * 2)).toBe(1)
    expect(canvasColumns(1, LANDSCAPE)).toBe(1)
  })
})

describe("fitFor", () => {
  it("covers only when the page matches its box", () => {
    expect(fitFor(LANDSCAPE, LANDSCAPE)).toBe("cover")
    expect(fitFor(0.7, 0.75)).toBe("contain")
    expect(fitFor(SPREAD, PORTRAIT)).toBe("contain")
  })
})

describe("wallCell", () => {
  it("fills a landscape wall with landscape pages, uncropped", () => {
    expect(wallCell({ pageRatio: LANDSCAPE, wallRatio: LANDSCAPE, first: true, columns: 2 })).toEqual({ span: 1, half: null, ratio: LANDSCAPE, fit: "cover" })
  })

  it("puts a single page of a spread book on the right half when it opens the book", () => {
    expect(wallCell({ pageRatio: PORTRAIT, wallRatio: SPREAD, first: true, columns: 2 })).toMatchObject({ span: 1, half: "end", ratio: SPREAD / 2 })
  })

  it("puts any later single page of a spread book on the left half", () => {
    expect(wallCell({ pageRatio: PORTRAIT, wallRatio: SPREAD, first: false, columns: 2 })).toMatchObject({ span: 1, half: "start" })
  })

  it("never crops a single page whose ratio differs from half a spread", () => {
    expect(wallCell({ pageRatio: A4, wallRatio: SPREAD, first: true, columns: 2 }).fit).toBe("contain")
  })

  it("lets a spread span two columns of a portrait wall", () => {
    expect(wallCell({ pageRatio: SPREAD, wallRatio: PORTRAIT, first: false, columns: 4 })).toEqual({ span: 2, half: null, ratio: PORTRAIT, fit: "contain" })
  })

  it("keeps a spread in one column when the wall only has one", () => {
    expect(wallCell({ pageRatio: SPREAD, wallRatio: PORTRAIT, first: false, columns: 1 })).toEqual({ span: 1, half: null, ratio: PORTRAIT, fit: "contain" })
  })

  it("contains a portrait page whose ratio differs from the wall", () => {
    expect(wallCell({ pageRatio: A4, wallRatio: PORTRAIT, first: false, columns: 4 }).fit).toBe("contain")
  })
})
