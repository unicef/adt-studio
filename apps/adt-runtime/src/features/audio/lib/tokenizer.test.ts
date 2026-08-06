import { describe, expect, it } from "vitest"

import {
  buildWordRenderPlan,
  createApproximateWordTimestamps,
  getHighlightDisplayText,
  isWordHighlightEnabled,
  normalizeGlossaryText,
  shouldUseBlockPlaybackHighlight,
} from "./tokenizer"
import { speechTextRequiresBlockHighlight } from "./word-highlight"

describe("tts tokenizer", () => {
  it("preserves punctuation and spacing in the render plan", () => {
    const text = 'During lunch, she buys food. "Always."'
    const plan = buildWordRenderPlan(text)

    expect(plan.map((s) => s.text).join("")).toBe(text)
    expect(plan.filter((s) => s.type === "word").map((s) => s.text)).toEqual([
      "During",
      "lunch",
      "she",
      "buys",
      "food",
      "Always",
    ])
  })

  it("keeps the original text stream when word counts don't line up exactly", () => {
    const text = "Hello, world."
    const plan = buildWordRenderPlan(text)

    expect(plan.map((s) => s.text).join("")).toBe(text)
    expect(plan.filter((s) => s.type === "word")).toHaveLength(2)
  })

  it("ignores punctuation-only tokens when estimating timings", () => {
    const timestamps = createApproximateWordTimestamps("Hello -- world!", 2.4)

    expect(timestamps.map((t) => t.text)).toEqual(["Hello", "world"])
    expect(timestamps[0].start).toBe(0)
    expect(timestamps.at(-1)?.end).toBe(2.4)
  })

  it("normalizes glossary text using only highlightable words", () => {
    expect(normalizeGlossaryText('"Bosque tropical!"')).toBe("bosque tropical")
  })

  it("treats word highlighting as active only when both toggles allow it", () => {
    expect(isWordHighlightEnabled(true, true)).toBe(true)
    expect(isWordHighlightEnabled(true, false)).toBe(false)
    expect(isWordHighlightEnabled(false, true)).toBe(false)
  })

  it("suppresses block playback highlights for spoken text when word highlighting is enabled", () => {
    expect(shouldUseBlockPlaybackHighlight({ tagName: "P" }, true, true)).toBe(false)
    expect(shouldUseBlockPlaybackHighlight({ tagName: "IMG" }, true, true)).toBe(true)
    expect(shouldUseBlockPlaybackHighlight({ tagName: "TEXTAREA" }, true, true)).toBe(true)
    expect(shouldUseBlockPlaybackHighlight({ tagName: "P" }, true, false)).toBe(true)
    expect(shouldUseBlockPlaybackHighlight({ tagName: "P" }, false, true)).toBe(true)
  })

  it("uses block highlighting when prepared speech differs from display text", () => {
    expect(speechTextRequiresBlockHighlight("$\\frac{1}{2}$", "one half")).toBe(true)
    expect(speechTextRequiresBlockHighlight("Hello", "Hello")).toBe(false)
    expect(speechTextRequiresBlockHighlight("Hello", undefined)).toBe(false)
  })

  it("prefers the current DOM text for display so punctuation stays visible", () => {
    expect(getHighlightDisplayText({ textContent: "Hello, world." }, "Hello world")).toBe(
      "Hello, world.",
    )
    expect(getHighlightDisplayText({ textContent: "" }, "Hello, world.")).toBe(
      "Hello, world.",
    )
  })
})
