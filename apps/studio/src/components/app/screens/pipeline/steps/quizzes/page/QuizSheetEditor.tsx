import { Trans } from "@lingui/react/macro"
import { QuizEditor } from "../QuizEditor"
import type { QuizRowContext } from "../QuizRowItem"
import { RemoveQuizButton } from "../RemoveQuizButton"
import type { PageQuiz } from "./pageQuizzes"

export function QuizSheetEditor({ item, ctx, onRemoved }: { item: PageQuiz; ctx: QuizRowContext; onRemoved: () => void }) {
  const { quiz, position } = item
  const range = ctx.rangeOf(quiz)
  const afterNumber = ctx.pageNumbers.get(quiz.afterPageId)
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <p className="min-w-0 flex-1">
          {range && afterNumber != null ? (
            <Trans>
              Made from pages {range}. Readers see it after page {afterNumber}.
            </Trans>
          ) : afterNumber != null ? (
            <Trans>Readers see it after page {afterNumber}.</Trans>
          ) : null}
        </p>
        <RemoveQuizButton
          position={position}
          disabled={ctx.locked}
          look="labelled"
          onRemove={() => {
            ctx.onRemove(quiz.quizId)
            onRemoved()
          }}
        />
      </div>
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
    </div>
  )
}
