import { useLingui } from "@lingui/react/macro"
import { HelpCircle } from "lucide-react"
import type { QuizItem } from "@/api/client"
import { cn } from "@/lib/utils"

export interface QuizRailRowProps {
  quiz: QuizItem
  /** Page the quiz follows, when it is still in the book. */
  pageNumber: number | null
  active: boolean
  onSelect: () => void
}

/** Miniature of the rendered quiz: one bar per option, the answer highlighted. */
function QuizThumb({ quiz, active }: { quiz: QuizItem; active: boolean }) {
  return (
    <span
      className={cn(
        "relative grid h-[70px] w-[52px] shrink-0 content-center gap-1 overflow-hidden rounded-[5px] bg-white px-1.5",
        active ? "ring-1 ring-orange-400" : "ring-1 ring-orange-200",
      )}
    >
      {quiz.options.map((_, index) => {
        const correct = index === quiz.answerIndex
        return (
          <span
            key={index}
            className={cn(
              "flex h-2 items-center gap-1 rounded-sm px-1",
              correct ? "bg-emerald-100" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "size-1 shrink-0 rounded-full",
                correct ? "bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
            <span
              className={cn(
                "h-0.5 flex-1 rounded-full",
                correct ? "bg-emerald-400/70" : "bg-muted-foreground/20",
              )}
            />
          </span>
        )
      })}
      <span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full bg-orange-500 text-white">
        <HelpCircle className="size-2.5" />
      </span>
    </span>
  )
}

/** Quizzes are their own storyboard pages, so they get their own rail row,
 *  right after the page they follow. */
export function QuizRailRow({ quiz, pageNumber, active, onSelect }: QuizRailRowProps) {
  const { t } = useLingui()

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      title={
        pageNumber == null
          ? t`Quiz ${quiz.quizIndex + 1}`
          : t`Quiz after page ${pageNumber}`
      }
      className={cn(
        "flex gap-2.5 rounded-[9px] p-2 text-left transition-colors",
        active
          ? "bg-orange-50 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:ring-orange-900"
          : "hover:bg-muted",
      )}
    >
      <QuizThumb quiz={quiz} active={active} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span
          className={cn("text-xs font-semibold", active && "text-orange-700 dark:text-orange-300")}
        >
          {t`Quiz`}
        </span>
        <span className="line-clamp-2 text-[11px] text-muted-foreground">{quiz.question}</span>
        {pageNumber != null && (
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {t`after page ${pageNumber}`}
          </span>
        )}
      </div>
    </button>
  )
}
