import { useQuizzes } from "@/hooks/use-quizzes"
import { QuizzesLandingPage } from "./QuizzesLandingPage"
import { QuizzesView } from "./QuizzesView"

export function QuizzesIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const { data } = useQuizzes(bookLabel)
  const hasQuizzes = (data?.quizzes?.quizzes?.length ?? 0) > 0

  if (!hasQuizzes) {
    return <QuizzesLandingPage bookLabel={bookLabel} />
  }

  return <QuizzesView bookLabel={bookLabel} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />
}
