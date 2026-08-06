import { describe, expect, it } from "vitest"
import { CoreTtsCatalogOutput, containsLatexSpeechCandidate } from "../core-tts.js"

describe("CoreTtsCatalogOutput", () => {
  it("accepts a failed conversion with no provider text", () => {
    const parsed = CoreTtsCatalogOutput.parse({
      language: "en",
      generatedAt: "2026-08-05T00:00:00.000Z",
      entries: [{
        id: "t1",
        displayText: "$\\frac{1}{2}$",
        speechText: null,
        changed: false,
        transformations: ["latex-to-speech"],
        status: "failed",
        failureReason: "Raw LaTeX remained in the prepared text.",
        generation: {
          mode: "generated",
          generatedAt: "2026-08-05T00:00:00.000Z",
          model: "openai:gpt-5.4",
          prompt: "core_tts_preparation",
          enabledTransformations: ["latex-to-speech"],
          sourceTextHash: "source",
          contextHash: "context",
        },
      }],
    })
    expect(parsed.entries[0]?.status).toBe("failed")
  })
})

describe("containsLatexSpeechCandidate", () => {
  it.each([
    "$\\frac{2}{5}$",
    "Area = $\\pi r^2$",
    "= 616\\ \\mathrm{mm}^2",
    "$x$",
    "$x+1$",
    "$x = 1$",
    "$1/2$",
    "$x - 1$",
    "The book costs $5; solve $x+1$.",
  ])("detects %s", (text) => {
    expect(containsLatexSpeechCandidate(text)).toBe(true)
  })

  it.each([
    "The book costs $5 and the pen costs $10.",
    "Save the file to C:\\text\\notes.txt",
    "Dong Xu$^{1,2}$ Zhangfan Yang$^{3}$",
    "Type \\frac{1}{2} to make a fraction in LaTeX.",
    "The \\sqrt command draws a square root sign.",
    "About 2/3 of the class passed.",
  ])("rejects false positive %s", (text) => {
    expect(containsLatexSpeechCandidate(text)).toBe(false)
  })
})
