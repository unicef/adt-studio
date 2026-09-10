import { describe, it, expect } from "vitest"
import {
  computeEntryTimeRanges,
  buildPageTranscript,
  chunkBatchEntries,
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

describe("chunkBatchEntries", () => {
  const entries = [
    { id: "a", text: "aaaa" },
    { id: "b", text: "bbbb" },
    { id: "c", text: "cccc" },
  ]

  it("keeps one request per page when no cap is set", () => {
    expect(chunkBatchEntries(entries, undefined)).toEqual([entries])
    expect(chunkBatchEntries(entries, 0)).toEqual([entries])
  })

  it("never splits an entry, even one longer than the cap", () => {
    const long = [{ id: "a", text: "x".repeat(500) }, { id: "b", text: "y" }]
    const chunks = chunkBatchEntries(long, 100)
    expect(chunks).toEqual([[long[0]], [long[1]]])
  })

  it("measures against the transcript actually sent, separators included", () => {
    // "aaaa\n\nbbbb" is 10 chars — one over a cap of 9 — even though the two
    // texts alone are only 8. Measuring raw text would wrongly fit them.
    const chunks = chunkBatchEntries(entries.slice(0, 2), 9)
    expect(chunks).toHaveLength(2)
    expect(chunkBatchEntries(entries.slice(0, 2), 10)).toHaveLength(1)
  })

  it("preserves every entry, in order", () => {
    for (const cap of [5, 10, 12, 40]) {
      expect(chunkBatchEntries(entries, cap).flat()).toEqual(entries)
    }
  })

  it("returns nothing for no entries", () => {
    expect(chunkBatchEntries([], 100)).toEqual([])
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

describe("computeEntryTimeRanges alignment reporting", () => {
  // Regression for issue #846. When a page transcript is longer than what
  // Gemini actually narrates, the trailing entries have no audio and Whisper
  // packs whatever it did hear onto near-identical timestamps. The clamp that
  // keeps boundaries monotonic then collapses those entries to zero width,
  // and the old code sliced and wrote them as if they were real audio.
  it("marks entries whose audio was never narrated as collapsed", () => {
    const entries = [
      { id: "e1", text: "uno dos" },
      { id: "e2", text: "tres cuatro" },
      { id: "e3", text: "cinco seis" },
      { id: "e4", text: "siete ocho" },
    ]
    const whisperWords = [
      W("uno", 0.0, 0.18),
      W("dos", 0.2, 0.38),
      // The narration stopped here; everything below lands in the tail.
      W("tres", 1.9, 1.92),
      W("cuatro", 1.9, 1.93),
      W("cinco", 1.9, 1.94),
      W("seis", 1.9, 1.95),
      W("siete", 1.96, 1.98),
      W("ocho", 1.96, 1.99),
    ]

    const ranges = computeEntryTimeRanges(entries, whisperWords, 2.0)

    const collapsed = ranges.filter((r) => r.alignment === "collapsed")
    // e2 collapses: e3's first heard word shares e2's onset, so e2 has no span.
    expect(collapsed.map((r) => r.id)).toEqual(["e2"])
    expect(collapsed.every((r) => r.end === r.start)).toBe(true)
    // Still a valid tiling — the flags are advisory, not a behaviour change.
    expect(ranges[0].start).toBe(0)
    expect(ranges.at(-1)!.end).toBe(2.0)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].start)
      expect(ranges[i].start).toBe(ranges[i - 1].end)
    }
  })

  it("reports aligned ranges and matched token counts on a clean transcript", () => {
    const ranges = computeEntryTimeRanges(
      [
        { id: "a", text: "Hello world" },
        { id: "b", text: "Goodbye now" },
      ],
      [W("Hello", 0, 0.4), W("world", 0.4, 0.8), W("Goodbye", 1.0, 1.4), W("now", 1.4, 1.8)],
      2.0,
    )

    expect(ranges.map((r) => r.alignment)).toEqual(["aligned", "aligned"])
    expect(ranges.map((r) => r.matchedTokens)).toEqual([2, 2])
  })

  it("interpolates, rather than collapsing, an entry Whisper simply missed", () => {
    const ranges = computeEntryTimeRanges(
      [
        { id: "a", text: "Hello world" },
        { id: "b", text: "mumbled aside" },
        { id: "c", text: "Goodbye now" },
      ],
      [W("Hello", 0, 0.4), W("world", 0.4, 0.8), W("Goodbye", 2.0, 2.4), W("now", 2.4, 2.8)],
      3.0,
    )

    expect(ranges[1].alignment).toBe("interpolated")
    expect(ranges[1].matchedTokens).toBe(0)
    // Interpolated is still usable audio — it must not be zero width.
    expect(ranges[1].end).toBeGreaterThan(ranges[1].start)
  })
})

describe("computeEntryTimeRanges", () => {
  it("splits at the next entry's first-word onset (clean transcript)", () => {
    const entries = [
      { id: "a", text: "Hello world" },
      { id: "b", text: "Goodbye now" },
    ]
    const words = [W("Hello", 0, 0.5), W("world", 0.5, 1.0), W("Goodbye", 1.2, 1.8), W("now", 1.8, 2.2)]
    const ranges = computeEntryTimeRanges(entries, words, 2.2)
    expect(ranges).toMatchObject([
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
    expect(ranges[0]).toMatchObject({ id: "a", start: 0, end: 1.2 })
    expect(ranges[1]).toMatchObject({ id: "b", start: 1.2, end: 2.2 })
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
    expect(ranges).toMatchObject([{ id: "solo", start: 0, end: 2.0 }])
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
