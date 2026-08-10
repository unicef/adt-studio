import { describe, it, expect } from "vitest"
import { formatSectionId, parseSectionId, MAX_SECTION_SEQ } from "../page-sectioning.js"

describe("formatSectionId", () => {
  it("zero-pads the sequence to three digits", () => {
    expect(formatSectionId("pg003", 1)).toBe("pg003_sec001")
    expect(formatSectionId("pg003", 42)).toBe("pg003_sec042")
    expect(formatSectionId("pg003", MAX_SECTION_SEQ)).toBe("pg003_sec999")
  })

  it("preserves spread page ids", () => {
    expect(formatSectionId("pg003004", 2)).toBe("pg003004_sec002")
  })
})

describe("parseSectionId", () => {
  it("round-trips formatSectionId", () => {
    expect(parseSectionId(formatSectionId("pg003", 7))).toEqual({ pageId: "pg003", seq: 7 })
    expect(parseSectionId(formatSectionId("pg003004", 12))).toEqual({
      pageId: "pg003004",
      seq: 12,
    })
  })

  it("accepts ids whose page id contains underscores", () => {
    expect(parseSectionId("test-book_p1_sec002")).toEqual({ pageId: "test-book_p1", seq: 2 })
  })

  it("returns null for ids of other kinds", () => {
    // Quiz, glossary page and TOC ids must not be mistaken for section ids.
    expect(parseSectionId("qz001")).toBeNull()
    expect(parseSectionId("glp001")).toBeNull()
    expect(parseSectionId("toc_001")).toBeNull()
    expect(parseSectionId("pg003")).toBeNull()
    expect(parseSectionId("pg003_sec")).toBeNull()
  })
})
