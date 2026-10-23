import { Check, Trash2 } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { optionLetter, type QuizRow } from "./quizRows"

export function QuizLead({ position, afterNumber, onOpenAfter }: { position: number; afterNumber: number | undefined; onOpenAfter: () => void }) {
  const { t } = useLingui()
  return (
    <>
      <span className="w-7 font-mono text-[11px] tabular-nums text-muted-foreground">{t`Q${position}`}</span>
      <button
        type="button"
        onClick={onOpenAfter}
        aria-label={afterNumber != null ? t`Placed after page ${afterNumber}. Open that page` : t`Open the page it follows`}
        className="inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10.5px] tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {t`after p.${afterNumber ?? "?"}`}
      </button>
    </>
  )
}

export function QuizSummary({ quiz }: { quiz: QuizRow }) {
  return <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{quiz.question}</span>
}

export function CorrectAnswerChip({ quiz }: { quiz: QuizRow }) {
  const { t } = useLingui()
  const letter = optionLetter(quiz.answerIndex)
  const answer = quiz.options[quiz.answerIndex]?.text ?? ""
  return (
    <span
      role="img"
      aria-label={t`Correct answer: ${letter}, ${answer}`}
      title={answer}
      className="inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 text-[10.5px] font-semibold text-foreground"
    >
      {letter}
      <Check aria-hidden className="size-3 text-emerald-600 dark:text-emerald-400" />
    </span>
  )
}

export function RemoveQuizButton({ disabled, onRemove, position }: { disabled: boolean; onRemove: () => void; position: number }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRemove}
      aria-label={t`Remove question ${position}`}
      className="grid size-7 place-items-center rounded-md text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:text-muted-foreground"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}
