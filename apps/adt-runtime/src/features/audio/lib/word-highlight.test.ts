// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
  findDisplayWordIndicesAtTime,
  mapWordTimestampsToDisplayWords,
  setWordHighlights,
  unwrapWordsForElement,
  wrapWordsForElement,
} from "./word-highlight"

function highlightedWords(element: HTMLElement): string[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>("[data-word-index].bg-yellow-300"),
    (word) => word.textContent ?? "",
  )
}

describe("normalized speech word highlighting", () => {
  it("keeps one display word highlighted across an expanded spoken phrase", () => {
    const element = document.createElement("p")
    element.textContent = "I have 25 apples."
    const timestamps = mapWordTimestampsToDisplayWords(
      element.textContent,
      "I have twenty five apples.",
      [
        { text: "I", start: 0, end: 0.2 },
        { text: "have", start: 0.2, end: 0.5 },
        { text: "twenty", start: 0.5, end: 0.8 },
        { text: "five", start: 0.8, end: 1.1 },
        { text: "apples", start: 1.1, end: 1.5 },
      ],
    )

    expect(timestamps).not.toBeNull()
    wrapWordsForElement(element, element.textContent)

    setWordHighlights(
      element,
      findDisplayWordIndicesAtTime(timestamps ?? [], 0.65),
    )
    expect(highlightedWords(element)).toEqual(["25"])

    setWordHighlights(
      element,
      findDisplayWordIndicesAtTime(timestamps ?? [], 0.95),
    )
    expect(highlightedWords(element)).toEqual(["25"])
  })

  it("highlights multiple display words represented by one spoken word", () => {
    const element = document.createElement("p")
    element.innerHTML = "Please <em>do not</em> stop."
    const displayText = element.textContent ?? ""
    const timestamps = mapWordTimestampsToDisplayWords(
      displayText,
      "Please don't stop.",
      [
        { text: "Please", start: 0, end: 0.4 },
        { text: "don't", start: 0.4, end: 0.8 },
        { text: "stop", start: 0.8, end: 1.1 },
      ],
    )

    wrapWordsForElement(element, displayText)
    setWordHighlights(
      element,
      findDisplayWordIndicesAtTime(timestamps ?? [], 0.6),
    )
    expect(highlightedWords(element)).toEqual(["do", "not"])

    unwrapWordsForElement(element)
    expect(element.innerHTML).toBe("Please <em>do not</em> stop.")
  })

  it("keeps MathML intact and highlights its outer visual wrapper", () => {
    const element = document.createElement("p")
    element.innerHTML =
      'Value <math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>.'
    const originalMath = element.querySelector("math")
    const displayText = element.textContent ?? ""
    const timestamps = mapWordTimestampsToDisplayWords(
      displayText,
      "Value x squared.",
      [
        { text: "Value", start: 0, end: 0.4 },
        { text: "x", start: 0.4, end: 0.7 },
        { text: "squared", start: 0.7, end: 1.1 },
      ],
    )

    wrapWordsForElement(element, displayText)
    expect(element.querySelector("math")).toBe(originalMath)

    setWordHighlights(
      element,
      findDisplayWordIndicesAtTime(timestamps ?? [], 0.85),
    )
    const mathWrapper = element.querySelector<HTMLElement>(
      "[data-word-indices]",
    )
    expect(mathWrapper).not.toBeNull()
    expect(mathWrapper?.classList.contains("bg-yellow-300")).toBe(true)
    expect(mathWrapper?.querySelector("math")).toBe(originalMath)
  })
})
