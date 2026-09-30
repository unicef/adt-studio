import { describe, expect, it } from "vitest"

import {
  buildWordRenderPlan,
  createApproximateWordTimestamps,
  getHighlightDisplayText,
  isWordHighlightEnabled,
  normalizeGlossaryText,
  shouldUseBlockPlaybackHighlight,
} from "./tokenizer"
import {
  buildSpeechDisplayWordAlignment,
  findDisplayWordIndicesAtTime,
  mapWordTimestampsToDisplayWords,
} from "./word-highlight"

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

  it("maps expanded normalized words to the original display characters", () => {
    const alignment = buildSpeechDisplayWordAlignment(
      "I have 25 apples.",
      "I have twenty five apples.",
    )

    expect(alignment?.map((word) => word.displayWordIndices)).toEqual([
      [0],
      [1],
      [2],
      [2],
      [3],
    ])
    expect(alignment?.[2].displayRanges).toEqual([
      { wordIndex: 2, start: 7, end: 9 },
    ])
  })

  it("maps one spoken contraction to both display words", () => {
    const alignment = buildSpeechDisplayWordAlignment(
      "Please do not stop.",
      "Please don't stop.",
    )

    expect(alignment?.map((word) => word.displayWordIndices)).toEqual([
      [0],
      [1, 2],
      [3],
    ])
  })

  it("projects Whisper tokens through prepared speech onto display words", () => {
    const mapped = mapWordTimestampsToDisplayWords(
      "I have 25 apples.",
      "I have twenty five apples.",
      [
        { text: "I", start: 0, end: 0.2 },
        { text: "have", start: 0.2, end: 0.5 },
        { text: "twenty-five", start: 0.5, end: 1.1 },
        { text: "apples", start: 1.1, end: 1.5 },
      ],
    )

    expect(mapped?.map((word) => word.displayWordIndices)).toEqual([
      [0],
      [1],
      [2],
      [3],
    ])
    expect(findDisplayWordIndicesAtTime(mapped ?? [], 0.8)).toEqual([2])
  })

  it("returns no word alignment when the display has no highlightable text", () => {
    expect(buildSpeechDisplayWordAlignment("—", "dash")).toBeNull()
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
