import { Check } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { MUTED_PRIMARY } from "../shared/ui"
import { optionLetter, type QuizRow } from "./quizRows"

export function QuizLead({ position, afterNumber, onOpenAfter }: { position: number; afterNumber: number | undefined; onOpenAfter: () => void }) {
  const { t } = useLingui()
  const label = afterNumber != null ? t`Shown after page ${afterNumber}. Open page ${afterNumber}` : t`Open the page it follows`
  return (
    <>
      <span className="w-7 font-mono text-[11px] tabular-nums text-muted-foreground">{t`Q${position}`}</span>
      <button
        type="button"
        onClick={onOpenAfter}
        aria-label={label}
        title={label}
        className="inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10.5px] tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {t`after p.${afterNumber ?? "?"}`}
      </button>
    </>
  )
}

export function QuizSummary({ quiz, removed = false }: { quiz: QuizRow; removed?: boolean }) {
  return (
    <span className={cn("line-clamp-2 text-[13px] font-medium leading-snug transition-colors duration-200", removed ? MUTED_PRIMARY : "text-foreground")}>
      {quiz.question}
    </span>
  )
}

export function CorrectAnswerChip({ quiz }: { quiz: QuizRow }) {
  const { t } = useLingui()
  const letter = optionLetter(quiz.answerIndex)
  const answer = quiz.options[quiz.answerIndex]?.text ?? ""
  return (
    <span
      role="img"
      aria-label={t`Correct answer: ${letter}, ${answer}`}
      title={t`Correct answer: ${answer}`}
      className="inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 text-[10.5px] font-semibold text-foreground"
    >
      {letter}
      <Check aria-hidden className="size-3 text-emerald-600 dark:text-emerald-400" />
    </span>
  )
}
