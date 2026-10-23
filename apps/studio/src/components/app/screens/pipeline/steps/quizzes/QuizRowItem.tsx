import { memo } from "react"
import type { QuizOption } from "@/api/client"
import { ExpandableRow } from "../shared/list/ExpandableRow"
import { QuizEditor } from "./QuizEditor"
import { CorrectAnswerChip, QuizLead, QuizSummary, RemoveQuizButton } from "./QuizRowParts"
import { QuizThumbs } from "./QuizThumbs"
import type { QuizRow } from "./quizRows"

export interface QuizRowContext {
  label: string
  hex: string
  locked: boolean
  ratio: number
  pageNumbers: ReadonlyMap<string, number>
  isEdited: (quiz: QuizRow) => boolean
  onOpenPage: (pageId: string) => void
  onOpenThumb: (pageId: string) => void
  onQuiz: (key: string, patch: Partial<QuizRow>) => void
  onOption: (key: string, index: number, patch: Partial<QuizOption>) => void
  onRemove: (key: string) => void
}

export const QuizRowItem = memo(function QuizRowItem({
  quiz,
  position,
  ctx,
  expanded,
  onToggle,
}: {
  quiz: QuizRow
  position: number
  ctx: QuizRowContext
  expanded: boolean
  onToggle?: () => void
}) {
  return (
    <ExpandableRow
      id={quiz.quizId}
      accent={ctx.hex}
      expanded={expanded}
      onToggle={onToggle}
      edited={ctx.isEdited(quiz)}
      lead={<QuizLead position={position} afterNumber={ctx.pageNumbers.get(quiz.afterPageId)} onOpenAfter={() => ctx.onOpenPage(quiz.afterPageId)} />}
      summary={<QuizSummary quiz={quiz} />}
      actions={
        <>
          <CorrectAnswerChip quiz={quiz} />
          <QuizThumbs label={ctx.label} pageIds={quiz.pageIds} pageNumbers={ctx.pageNumbers} ratio={ctx.ratio} size="sm" onOpen={ctx.onOpenThumb} />
          <RemoveQuizButton position={position} disabled={ctx.locked} onRemove={() => ctx.onRemove(quiz.quizId)} />
        </>
      }
    >
      <QuizEditor
        label={ctx.label}
        quiz={quiz}
        hex={ctx.hex}
        locked={ctx.locked}
        pageNumbers={ctx.pageNumbers}
        ratio={ctx.ratio}
        onQuiz={(patch) => ctx.onQuiz(quiz.quizId, patch)}
        onOption={(index, patch) => ctx.onOption(quiz.quizId, index, patch)}
        onOpenThumb={ctx.onOpenThumb}
      />
    </ExpandableRow>
  )
})
