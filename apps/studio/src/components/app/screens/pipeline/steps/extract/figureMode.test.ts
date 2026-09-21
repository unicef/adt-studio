import { describe, it, expect } from "vitest"
import { readFigureExtractionMode } from "./figureMode"

describe("readFigureExtractionMode", () => {
  it("prefers an explicit figure_extraction_mode", () => {
    expect(
      readFigureExtractionMode({
        figure_extraction_mode: "auto",
        vector_text_grouping: false,
      }),
    ).toBe("auto")
    expect(readFigureExtractionMode({ figure_extraction_mode: "off" })).toBe("off")
  })

  it("maps legacy vector_text_grouping=false to off", () => {
    expect(readFigureExtractionMode({ vector_text_grouping: false })).toBe("off")
  })

  it("maps legacy vector_text_grouping=true or unset to all", () => {
    expect(readFigureExtractionMode({ vector_text_grouping: true })).toBe("all")
    expect(readFigureExtractionMode({})).toBe("all")
  })

  it("falls back to legacy when the explicit mode is invalid", () => {
    expect(
      readFigureExtractionMode({
        figure_extraction_mode: "everything",
        vector_text_grouping: false,
      }),
    ).toBe("off")
    expect(readFigureExtractionMode({ figure_extraction_mode: 3 })).toBe("all")
  })
})
