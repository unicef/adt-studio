import { memo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { QuizOption } from "@/api/client"
import { ExpandableRow } from "../shared/list/ExpandableRow"
import { QUIET_CHIP } from "../shared/ui"
import { QuizEditor } from "./QuizEditor"
import { CorrectAnswerChip, QuizLead, QuizSummary } from "./QuizRowParts"
import { QuizThumbs } from "./QuizThumbs"
import { RemoveQuizButton, UndoRemoveButton } from "./RemoveQuizButton"
import type { QuizRow } from "./quizRows"

export interface QuizRowContext {
  label: string
  hex: string
  locked: boolean
  ratio: number
  pageNumbers: ReadonlyMap<string, number>
  rangeOf: (quiz: QuizRow) => string
  isEdited: (quiz: QuizRow) => boolean
  onOpenPage: (pageId: string) => void
  onOpenThumb: (pageId: string) => void
  onQuiz: (key: string, patch: Partial<QuizRow>) => void
  onOption: (key: string, index: number, patch: Partial<QuizOption>) => void
  onRemove: (key: string) => void
  onUndo: (key: string) => void
}

export const QuizRowItem = memo(function QuizRowItem({
  quiz,
  position,
  ctx,
  expanded,
  onToggle,
  removed = false,
  flash = false,
}: {
  quiz: QuizRow
  position: number
  ctx: QuizRowContext
  expanded: boolean
  onToggle?: () => void
  removed?: boolean
  flash?: boolean
}) {
  const { t } = useLingui()
  const range = ctx.rangeOf(quiz)
  return (
    <ExpandableRow
      id={quiz.quizId}
      accent={ctx.hex}
      expanded={expanded && !removed}
      onToggle={onToggle}
      muted={removed}
      mutedLabel={t`Removed: leaves the book when you save`}
      edited={!removed && ctx.isEdited(quiz)}
      flash={flash}
      lead={<QuizLead position={position} afterNumber={ctx.pageNumbers.get(quiz.afterPageId)} onOpenAfter={() => ctx.onOpenPage(quiz.afterPageId)} />}
      summary={<QuizSummary quiz={quiz} removed={removed} />}
      actions={
        removed ? (
          <>
            <span className={QUIET_CHIP}>{t`Removed`}</span>
            <UndoRemoveButton position={position} disabled={ctx.locked} onUndo={() => ctx.onUndo(quiz.quizId)} />
          </>
        ) : (
          <>
            <CorrectAnswerChip quiz={quiz} />
            <QuizThumbs label={ctx.label} pageIds={quiz.pageIds} pageNumbers={ctx.pageNumbers} ratio={ctx.ratio} size="sm" range={range} onOpen={ctx.onOpenThumb} />
            <RemoveQuizButton position={position} disabled={ctx.locked} onRemove={() => ctx.onRemove(quiz.quizId)} />
          </>
        )
      }
    >
      {removed ? undefined : (
        <QuizEditor
          label={ctx.label}
          quiz={quiz}
          hex={ctx.hex}
          locked={ctx.locked}
          pageNumbers={ctx.pageNumbers}
          ratio={ctx.ratio}
          range={range}
          onQuiz={(patch) => ctx.onQuiz(quiz.quizId, patch)}
          onOption={(index, patch) => ctx.onOption(quiz.quizId, index, patch)}
          onOpenThumb={ctx.onOpenThumb}
        />
      )}
    </ExpandableRow>
  )
})
