import type { QuizItem } from "@/api/client"
import type { PipelinePage } from "@/components/redesign/screens/pipeline/shared/usePipelineState"

export type RailItem =
  | { kind: "page"; pageId: string }
  | { kind: "quiz"; quizIndex: number }

/** A quiz is a storyboard page of its own, listed after the page it follows. */
export function groupQuizzesByPage(quizzes: QuizItem[]): Map<string, QuizItem[]> {
  const byPage = new Map<string, QuizItem[]>()
  for (const quiz of quizzes) {
    const list = byPage.get(quiz.afterPageId) ?? []
    list.push(quiz)
    byPage.set(quiz.afterPageId, list)
  }
  return byPage
}

/** The rail read top to bottom — the order the arrow keys walk. */
export function buildRailOrder(pages: PipelinePage[], quizzes: QuizItem[]): RailItem[] {
  const quizzesByPage = groupQuizzesByPage(quizzes)
  const order: RailItem[] = []
  for (const page of pages) {
    order.push({ kind: "page", pageId: page.pageId })
    for (const quiz of quizzesByPage.get(page.pageId) ?? []) {
      order.push({ kind: "quiz", quizIndex: quiz.quizIndex })
    }
  }
  return order
}
