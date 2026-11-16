import { describe, expect, it } from "vitest"
import { isQuizSectionId, quizPartOf } from "./quiz-comments"

const anchor = (selector: string) => ({ selector, xOffsetPct: 50, yOffsetPct: 50 })

describe("quiz comments", () => {
  it("recognises a quiz page's section id and nothing else", () => {
    expect(isQuizSectionId("qz004")).toBe(true)
    expect(isQuizSectionId("qz1000")).toBe(true)
    expect(isQuizSectionId("pg005_sec001")).toBe(false)
    expect(isQuizSectionId("qz004_que")).toBe(false)
  })

  it("reads the question and the options from the anchor", () => {
    expect(quizPartOf(anchor('#content [data-id="qz004_que"]'), "qz004")).toEqual({ kind: "question" })
    expect(quizPartOf(anchor('#content [data-id="qz004_o2"]'), "qz004")).toEqual({ kind: "option", index: 2 })
    expect(quizPartOf(anchor('#content [data-id="qz004_o1_exp"]'), "qz004")).toEqual({ kind: "option", index: 1 })
  })

  it("treats the whole quiz, another quiz's part, and no anchor as the quiz as a whole", () => {
    expect(quizPartOf(anchor("#content"), "qz004")).toBeNull()
    expect(quizPartOf(anchor('#content [data-id="qz001_que"]'), "qz004")).toBeNull()
    expect(quizPartOf(null, "qz004")).toBeNull()
  })
})
