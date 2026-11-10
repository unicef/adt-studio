import type { QuizItem, QuizOption, QuizzesResponse } from "@/api/client"

export type QuizDoc = NonNullable<QuizzesResponse["quizzes"]>
export type QuizRow = QuizDoc["quizzes"][number]

export const getQuizzes = (doc: QuizDoc): QuizRow[] => doc.quizzes
export const setQuizzes = (doc: QuizDoc, quizzes: QuizRow[]): QuizDoc => ({
  ...doc,
  quizzes: quizzes.map((quiz, index) => ({ ...quiz, quizIndex: index })),
})
export const quizKey = (quiz: QuizRow): string => quiz.quizId

export function sameQuiz(a: QuizItem, b: QuizItem): boolean {
  return (
    a.question === b.question &&
    a.answerIndex === b.answerIndex &&
    a.afterPageId === b.afterPageId &&
    a.options.length === b.options.length &&
    a.options.every((option, index) => option.text === b.options[index].text && option.explanation === b.options[index].explanation)
  )
}

export function withOption(quiz: QuizRow, optionIndex: number, patch: Partial<QuizOption>): QuizRow {
  return { ...quiz, options: quiz.options.map((option, index) => (index === optionIndex ? { ...option, ...patch } : option)) }
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

export function quizMatches(quiz: QuizRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return [quiz.question, ...quiz.options.flatMap((option) => [option.text, option.explanation])].join(" ").toLocaleLowerCase().includes(needle)
}
