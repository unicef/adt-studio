import type { QuizRow } from "../quizRows"
import type { ListedQuiz } from "../useQuizList"

export interface PageQuiz extends ListedQuiz {
  madeFrom: boolean
  shownAfter: boolean
}

export const quizPagesOf = (quiz: QuizRow): readonly string[] => [...new Set([...quiz.pageIds, quiz.afterPageId])]

export function quizzesOnPage(rows: readonly ListedQuiz[], pageId: string): PageQuiz[] {
  return rows.flatMap((row) => {
    const madeFrom = row.quiz.pageIds.includes(pageId)
    const shownAfter = row.quiz.afterPageId === pageId
    return madeFrom || shownAfter ? [{ ...row, madeFrom, shownAfter }] : []
  })
}
