import { useCallback, useMemo, useState } from "react"
import type { QuizItem } from "@/api/client"
import { useQuizzes } from "@/hooks/use-quizzes"
import type { PipelinePage } from "./usePipelineState"

export interface WorkspaceSelection {
  quizzes: QuizItem[]
  quizVersion: number | null
  activePage: PipelinePage | null
  activeQuiz: QuizItem | null
  selectPage: (pageId: string) => void
  selectQuiz: (quizIndex: number) => void
}

export interface WorkspaceSelectionOptions {
  label: string
  pages: PipelinePage[]
  pageId: string | null
  onSelectPage: (pageId: string) => void
  guard: (action: () => void) => void
}

export function useWorkspaceSelection({
  label,
  pages,
  pageId,
  onSelectPage,
  guard,
}: WorkspaceSelectionOptions): WorkspaceSelection {
  const [selectedQuizIndex, setSelectedQuizIndex] = useState<number | null>(null)
  const quizzesQuery = useQuizzes(label)
  const quizzes = useMemo(
    () => quizzesQuery.data?.quizzes?.quizzes ?? [],
    [quizzesQuery.data],
  )

  const activePage = useMemo(
    () => pages.find((page) => page.pageId === pageId) ?? pages[0] ?? null,
    [pages, pageId],
  )

  const activeQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.quizIndex === selectedQuizIndex) ?? null,
    [quizzes, selectedQuizIndex],
  )

  const selectPage = useCallback(
    (nextPageId: string) =>
      guard(() => {
        setSelectedQuizIndex(null)
        onSelectPage(nextPageId)
      }),
    [guard, onSelectPage],
  )

  const selectQuiz = useCallback(
    (quizIndex: number) => guard(() => setSelectedQuizIndex(quizIndex)),
    [guard],
  )

  return {
    quizzes,
    quizVersion: quizzesQuery.data?.version ?? null,
    activePage,
    activeQuiz,
    selectPage,
    selectQuiz,
  }
}
