import { describe, expect, it } from "vitest"

import {
  buildDisplayWordSegments,
  mapTimedWordsToDisplayWords,
} from "./speech-highlight-alignment"

describe("speech highlight alignment", () => {
  it("keeps normalized number words linked to the displayed number", () => {
    expect(
      mapTimedWordsToDisplayWords("I have 25 apples.", [
        { word: "I" },
        { word: "have" },
        { word: "twenty" },
        { word: "five" },
        { word: "apples" },
      ]),
    ).toEqual([[0], [1], [2], [2], [3]])
  })

  it("aligns Swahili normalization without language-specific assumptions", () => {
    expect(
      mapTimedWordsToDisplayWords("Kipengele IV kinaanza.", [
        { word: "Kipengele" },
        { word: "cha" },
        { word: "nne" },
        { word: "kinaanza" },
      ]),
    ).toEqual([[0], [1], [1], [2]])
  })

  it("maps spoken LaTeX wording onto the visible formula tokens", () => {
    expect(
      mapTimedWordsToDisplayWords("Value $x^2$.", [
        { word: "Value" },
        { word: "x" },
        { word: "squared" },
      ]),
    ).toEqual([[0], [1], [2]])
  })

  it("preserves punctuation and whitespace in the display render plan", () => {
    const text = "N-ne, kisha 25."
    expect(buildDisplayWordSegments(text).map((segment) => segment.text).join(""))
      .toBe(text)
  })

  it("aligns long paragraphs without allocating an unbounded LCS matrix", () => {
    const words = Array.from({ length: 501 }, (_, index) => `word${index}`)
    const mapping = mapTimedWordsToDisplayWords(
      words.join(" "),
      words.map((word) => ({ word })),
    )

    expect(mapping).toHaveLength(words.length)
    expect(mapping?.[0]).toEqual([0])
    expect(mapping?.[words.length - 1]).toEqual([words.length - 1])
  })
})
