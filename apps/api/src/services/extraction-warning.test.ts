import { describe, it, expect } from "vitest"
import {
  classifyExtractionWarning,
  flattenVisibleSectioningText,
  MIN_RECOVERED_TEXT_CHARS,
} from "./extraction-warning.js"

const longText = "x".repeat(MIN_RECOVERED_TEXT_CHARS)

describe("classifyExtractionWarning", () => {
  it("flags empty extract text when Sectioning recovered enough text", () => {
    expect(classifyExtractionWarning("", longText)).toBe("text-layer-missing")
  })

  it("treats whitespace-only extract text as empty", () => {
    expect(classifyExtractionWarning("  \n\t ", longText)).toBe("text-layer-missing")
  })

  it("does not flag when the extract text layer has content", () => {
    expect(classifyExtractionWarning("Real extracted text", longText)).toBeNull()
  })

  it("does not flag when Sectioning recovered too little text (blank/illustration page)", () => {
    expect(classifyExtractionWarning("", "hi")).toBeNull()
  })

  it("counts only non-whitespace recovered characters against the threshold", () => {
    const padded = "a b c\n".repeat(10) // many chars, but whitespace-heavy
    const nonWs = padded.replace(/\s+/g, "").length
    expect(nonWs).toBeGreaterThanOrEqual(MIN_RECOVERED_TEXT_CHARS)
    expect(classifyExtractionWarning("", padded)).toBe("text-layer-missing")
  })

  it("does not flag when Sectioning has not run (no recovered text)", () => {
    expect(classifyExtractionWarning("", null)).toBeNull()
    expect(classifyExtractionWarning("", undefined)).toBeNull()
  })
})

describe("flattenVisibleSectioningText", () => {
  it("returns empty string for missing sections", () => {
    expect(flattenVisibleSectioningText(undefined)).toBe("")
    expect(flattenVisibleSectioningText(null)).toBe("")
  })

  it("collects text from nested nodes, skipping pruned sections and leaves", () => {
    const sections = [
      {
        isPruned: false,
        nodes: [
          { text: "Title" },
          { children: [{ text: "Body" }, { isPruned: true, text: "hidden leaf" }] },
        ],
      },
      { isPruned: true, nodes: [{ text: "pruned section" }] },
    ]
    expect(flattenVisibleSectioningText(sections)).toBe("Title\nBody")
  })
})
