import { useId, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { QuizOption } from "@/api/client"
import { cn } from "@/lib/utils"
import { DraftField } from "../shared/list/DraftField"
import { QuizThumbs } from "./QuizThumbs"
import { optionLetter, type QuizRow } from "./quizRows"

export function QuizEditor({
  label,
  quiz,
  hex,
  locked,
  pageNumbers,
  ratio,
  range,
  onQuiz,
  onOption,
  onOpenThumb,
}: {
  label: string
  quiz: QuizRow
  hex: string
  locked: boolean
  pageNumbers: ReadonlyMap<string, number>
  ratio: number
  range: string
  onQuiz: (patch: Partial<QuizRow>) => void
  onOption: (index: number, patch: Partial<QuizOption>) => void
  onOpenThumb: (pageId: string) => void
}) {
  const { t } = useLingui()
  const ids = useId()
  const [why, setWhy] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-question`} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Trans>Question</Trans>
        </label>
        <DraftField id={`${ids}-question`} multiline value={quiz.question} disabled={locked} ariaLabel={t`Question`} onCommit={(question) => onQuiz({ question })} />
      </div>

      <div
        role="radiogroup"
        aria-label={t`Correct answer`}
        onKeyDown={(event) => {
          const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0
          if (!step || locked) return
          event.preventDefault()
          const count = quiz.options.length
          const next = (quiz.answerIndex + step + count) % count
          onQuiz({ answerIndex: next })
          event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus()
        }}
        className="flex flex-col gap-2"
      >
        <span aria-hidden className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Trans>Answers</Trans>
        </span>
        {quiz.options.map((option, index) => {
          const correct = index === quiz.answerIndex
          const letter = optionLetter(index)
          return (
            <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={correct}
                tabIndex={correct ? 0 : -1}
                aria-label={t`${letter}: ${option.text}`}
                disabled={locked}
                onClick={() => onQuiz({ answerIndex: index })}
                className={cn(
                  "mt-1.5 flex h-6 items-center gap-1.5 rounded-full border px-1.5 text-[11px] font-semibold transition-colors disabled:cursor-default",
                  correct ? "text-white" : "text-foreground hover:bg-muted",
                )}
                style={correct ? { background: hex, borderColor: hex } : undefined}
              >
                <span aria-hidden className={cn("grid size-3 place-items-center rounded-full border", correct ? "border-white" : "border-muted-foreground")}>
                  {correct && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                {letter}
              </button>
              <DraftField
                value={option.text}
                disabled={locked}
                ariaLabel={t`Answer ${letter}`}
                onCommit={(text) => onOption(index, { text })}
              />
              <DraftField
                multiline
                value={option.explanation}
                disabled={locked}
                ariaLabel={t`Feedback for answer ${letter}`}
                placeholder={correct ? t`Feedback when answered correctly…` : t`Feedback when this answer is picked…`}
                onCommit={(explanation) => onOption(index, { explanation })}
                className="text-[12px] text-muted-foreground focus:text-foreground"
              />
            </div>
          )
        })}
      </div>

      {quiz.reasoning && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={why}
            onClick={() => setWhy((value) => !value)}
            className="flex w-fit items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", why && "rotate-90")} />
            <Trans>Why this question</Trans>
          </button>
          <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none", why ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!why}>
            <p className="min-h-0 overflow-hidden text-[12px] leading-relaxed text-muted-foreground">{quiz.reasoning}</p>
          </div>
        </div>
      )}

      {quiz.pageIds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {range ? <Trans>Made from pages {range}</Trans> : <Trans>Made from pages</Trans>}
          </span>
          <QuizThumbs label={label} pageIds={quiz.pageIds} pageNumbers={pageNumbers} ratio={ratio} size="lg" onOpen={onOpenThumb} />
        </div>
      )}
    </div>
  )
}
