import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import { QuizRowItem, type QuizRowContext } from "./QuizRowItem"
import type { ListedQuiz } from "./useQuizList"

export const QuizList = forwardRef<
  HTMLDivElement,
  {
    rows: ListedQuiz[]
    ctx: QuizRowContext
    cards: boolean
    expanded: ReadonlySet<string>
    onToggle: (key: string) => void
    flashKey: string | null
  }
>(function QuizList({ rows, ctx, cards, expanded, onToggle, flashKey }, ref) {
  return (
    <div ref={ref} className="flex flex-col">
      {rows.map(({ quiz, position, removed, leaving }) => (
        <div
          key={quiz.quizId}
          inert={leaving}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
          )}
        >
          <div className={cn("min-h-0", leaving && "overflow-hidden")}>
            <div className="pb-1.5">
              <QuizRowItem
                quiz={quiz}
                position={position}
                ctx={ctx}
                removed={removed}
                flash={flashKey === quiz.quizId}
                expanded={cards || expanded.has(quiz.quizId)}
                onToggle={cards ? undefined : () => onToggle(quiz.quizId)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
})
