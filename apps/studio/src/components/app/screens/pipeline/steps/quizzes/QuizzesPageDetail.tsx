import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useListView } from "../shared/list/useListView"
import { PageDetailFrame } from "../shared/page-detail/PageDetailFrame"
import { QuizRowItem, type QuizRowContext } from "./QuizRowItem"
import type { QuizRow } from "./quizRows"

export function QuizzesPageDetail({
  label,
  pageId,
  pageNumber,
  quizzes,
  positionOf,
  ctx,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  pageNumber: number
  quizzes: QuizRow[]
  positionOf: (quiz: QuizRow) => number
  ctx: QuizRowContext
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const view = useListView("quizzes")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <PageDetailFrame
      label={label}
      pageId={pageId}
      pageNumber={pageNumber}
      meta={t`${plural(quizzes.length, { one: "# question after this page", other: "# questions after this page" })}`}
      prevPageId={prevPageId}
      nextPageId={nextPageId}
      onStep={onStep}
      onClose={onClose}
      state={quizzes.length === 0 ? "empty" : "ready"}
      emptyMessage={t`No questions come after this page.`}
    >
      <div className="flex flex-col gap-1.5">
        {quizzes.map((quiz) => (
          <QuizRowItem
            key={quiz.quizId}
            quiz={quiz}
            position={positionOf(quiz)}
            ctx={ctx}
            expanded={view === "cards" || !collapsed.has(quiz.quizId)}
            onToggle={view === "cards" ? undefined : () => toggle(quiz.quizId)}
          />
        ))}
      </div>
    </PageDetailFrame>
  )
}
