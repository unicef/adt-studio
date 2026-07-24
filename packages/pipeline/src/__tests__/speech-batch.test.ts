import { describe, it, expect } from "vitest"
import {
  computeEntryTimeRanges,
  buildPageTranscript,
  supportsPageBatchedSpeech,
} from "../speech-batch.js"

const W = (word: string, start: number, end: number) => ({ word, start, end })

describe("buildPageTranscript", () => {
  it("joins entry texts with blank lines and drops empties", () => {
    const t = buildPageTranscript([
      { id: "a", text: "Hello world" },
      { id: "b", text: "  " },
      { id: "c", text: "Goodbye now" },
    ])
    expect(t).toBe("Hello world\n\nGoodbye now")
  })
})

describe("supportsPageBatchedSpeech", () => {
  it.each(["zh", "zh-CN", "zh_TW", "th", "th-TH"])(
    "keeps %s on per-entry TTS",
    (language) => {
      expect(supportsPageBatchedSpeech(language)).toBe(false)
    },
  )

  it.each(["en", "en-JM", "es-UY", "fr"])(
    "allows page batching for %s",
    (language) => {
      expect(supportsPageBatchedSpeech(language)).toBe(true)
    },
  )
})

describe("computeEntryTimeRanges", () => {
  it("splits at the next entry's first-word onset (clean transcript)", () => {
    const entries = [
      { id: "a", text: "Hello world" },
      { id: "b", text: "Goodbye now" },
    ]
    const words = [W("Hello", 0, 0.5), W("world", 0.5, 1.0), W("Goodbye", 1.2, 1.8), W("now", 1.8, 2.2)]
    const ranges = computeEntryTimeRanges(entries, words, 2.2)
    expect(ranges).toEqual([
      { id: "a", start: 0, end: 1.2 },
      { id: "b", start: 1.2, end: 2.2 },
    ])
  })

  it("is robust to a Whisper-dropped word", () => {
    const entries = [
      { id: "a", text: "Hello world" },
      { id: "b", text: "Goodbye now" },
    ]
    // "world" missing from the transcript
    const words = [W("Hello", 0, 0.5), W("Goodbye", 1.2, 1.8), W("now", 1.8, 2.2)]
    const ranges = computeEntryTimeRanges(entries, words, 2.2)
    expect(ranges[0]).toEqual({ id: "a", start: 0, end: 1.2 })
    expect(ranges[1]).toEqual({ id: "b", start: 1.2, end: 2.2 })
  })

  it("always tiles [0, totalDuration] monotonically for 3 entries", () => {
    const entries = [
      { id: "a", text: "one two" },
      { id: "b", text: "three four" },
      { id: "c", text: "five six" },
    ]
    const words = [
      W("one", 0, 0.4), W("two", 0.4, 0.9),
      W("three", 1.0, 1.5), W("four", 1.5, 2.0),
      W("five", 2.1, 2.6), W("six", 2.6, 3.0),
    ]
    const ranges = computeEntryTimeRanges(entries, words, 3.0)
    expect(ranges[0].start).toBe(0)
    expect(ranges[ranges.length - 1].end).toBe(3.0)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].start).toBe(ranges[i - 1].end) // contiguous
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].start) // monotonic
    }
  })

  it("interpolates an entry Whisper couldn't transcribe at all", () => {
    const entries = [
      { id: "a", text: "alpha beta" },
      { id: "b", text: "zzz qqq" }, // gibberish never appears in transcript
      { id: "c", text: "gamma delta" },
    ]
    const words = [
      W("alpha", 0, 0.5), W("beta", 0.5, 1.0),
      W("gamma", 2.0, 2.5), W("delta", 2.5, 3.0),
    ]
    const ranges = computeEntryTimeRanges(entries, words, 3.0)
    // b lands between a and c, in order, in-bounds.
    expect(ranges[1].start).toBeGreaterThanOrEqual(ranges[0].start)
    expect(ranges[2].start).toBeGreaterThanOrEqual(ranges[1].start)
    expect(ranges[2].end).toBe(3.0)
  })

  it("returns the whole file for a single entry", () => {
    const ranges = computeEntryTimeRanges([{ id: "solo", text: "hi there" }], [W("hi", 0, 1)], 2.0)
    expect(ranges).toEqual([{ id: "solo", start: 0, end: 2.0 }])
  })

  it("handles an empty Whisper result by degrading to interpolation", () => {
    const entries = [
      { id: "a", text: "one" },
      { id: "b", text: "two" },
    ]
    const ranges = computeEntryTimeRanges(entries, [], 2.0)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].start).toBe(0)
    expect(ranges[1].end).toBe(2.0)
  })
})
