import { describe, expect, it } from "vitest"
import { getQuizzes, optionLetter, sameQuiz, setQuizzes, withOption, type QuizDoc } from "./quizRows"

const doc: QuizDoc = {
  generatedAt: "2026-01-01",
  language: "pt",
  pagesPerQuiz: 3,
  quizzes: [
    { quizId: "qz001", quizIndex: 0, afterPageId: "pg003", pageIds: ["pg001"], question: "One?", options: [{ text: "a", explanation: "x" }, { text: "b", explanation: "y" }], answerIndex: 0, reasoning: "" },
    { quizId: "qz002", quizIndex: 1, afterPageId: "pg006", pageIds: ["pg004"], question: "Two?", options: [{ text: "c", explanation: "z" }], answerIndex: 0, reasoning: "" },
    { quizId: "qz003", quizIndex: 2, afterPageId: "pg009", pageIds: ["pg007"], question: "Three?", options: [{ text: "d", explanation: "w" }], answerIndex: 0, reasoning: "" },
  ],
}

describe("quiz rows", () => {
  it("keeps quiz ids and renumbers positions on save", () => {
    const [first, , third] = getQuizzes(doc)
    const saved = setQuizzes(doc, [third, first])
    expect(saved.quizzes.map((quiz) => [quiz.quizId, quiz.quizIndex])).toEqual([
      ["qz003", 0],
      ["qz001", 1],
    ])
  })

  it("edits one option without touching the rest", () => {
    const next = withOption(doc.quizzes[0], 1, { explanation: "new" })
    expect(next.options).toEqual([{ text: "a", explanation: "x" }, { text: "b", explanation: "new" }])
    expect(sameQuiz(doc.quizzes[0], next)).toBe(false)
    expect(sameQuiz(doc.quizzes[0], { ...doc.quizzes[0], quizIndex: 9 })).toBe(true)
  })

  it("letters answers A, B, C", () => {
    expect([0, 1, 2].map(optionLetter)).toEqual(["A", "B", "C"])
  })
})
