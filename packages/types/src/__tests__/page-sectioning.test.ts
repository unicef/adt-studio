import { describe, it, expect } from "vitest"
import {
  formatSectionId,
  parseSectionId,
  parseAnySectionId,
  MAX_SECTION_SEQ,
} from "../page-sectioning.js"

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

describe("parseAnySectionId", () => {
  it("parses canonical ids and reports them as such", () => {
    expect(parseAnySectionId("pg003_sec007")).toEqual({ pageId: "pg003", seq: 7, legacy: false })
  })

  it("parses the legacy `_sN` shape the agent tools used to mint", () => {
    expect(parseAnySectionId("pg003_s2")).toEqual({ pageId: "pg003", seq: 2, legacy: true })
  })

  it("splits at the last separator, so page ids containing `_s` survive", () => {
    expect(parseAnySectionId("bk_stuff_p1_sec002")).toEqual({
      pageId: "bk_stuff_p1",
      seq: 2,
      legacy: false,
    })
    expect(parseAnySectionId("bk_stuff_p1_s2")).toEqual({
      pageId: "bk_stuff_p1",
      seq: 2,
      legacy: true,
    })
  })

  it("still rejects ids of other kinds", () => {
    // Widening the shape must not start accepting quiz or glossary ids.
    expect(parseAnySectionId("qz001")).toBeNull()
    expect(parseAnySectionId("glp001")).toBeNull()
    expect(parseAnySectionId("gl001")).toBeNull()
    expect(parseAnySectionId("pg003")).toBeNull()
    expect(parseAnySectionId("pg003_sec")).toBeNull()
    expect(parseAnySectionId("pg003_slide3")).toBeNull()
  })
})
