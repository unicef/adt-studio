import { CheckCircle2 } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { QuizItem, QuizOption } from "@/api/client"
import { InlineDiff } from "@/components/pipeline/components/InlineDiff"

function ChangeTag({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`ml-1 shrink-0 rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide ring-1 ${className}`}
    >
      {label}
    </span>
  )
}

const CORRECT_TAG = "bg-emerald-100 text-emerald-700 ring-emerald-300"
const AMBER_TAG = "bg-amber-100 text-amber-700 ring-amber-300"

function QuizDiffOption({
  option,
  previous,
  isCorrect,
  answerMoved,
  wasCorrect,
}: {
  option: QuizOption
  previous?: QuizOption
  isCorrect: boolean
  answerMoved: boolean
  wasCorrect: boolean
}) {
  const { t } = useLingui()
  const textChanged = previous != null && previous.text !== option.text
  const explanationChanged = previous != null && previous.explanation !== option.explanation
  const becameCorrect = answerMoved && isCorrect

  return (
    <span
      className={`flex items-start gap-1.5 rounded px-1.5 py-1 text-[11px] ${
        isCorrect
          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
          : wasCorrect
            ? "text-muted-foreground ring-1 ring-amber-200"
            : "text-muted-foreground"
      }`}
    >
      {isCorrect ? (
        <CheckCircle2 className="mt-px size-3 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <span className="mt-0.5 size-3 shrink-0 rounded-full border border-muted-foreground/40" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-medium text-foreground/90">
          {textChanged && previous ? (
            <InlineDiff before={previous.text} after={option.text} />
          ) : (
            option.text
          )}
        </span>
        {option.explanation || previous?.explanation ? (
          <span className="border-t border-border/60 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {explanationChanged && previous ? (
              <InlineDiff before={previous.explanation} after={option.explanation} />
            ) : (
              option.explanation
            )}
          </span>
        ) : null}
      </span>
      {becameCorrect ? (
        <ChangeTag label={t`now correct`} className={CORRECT_TAG} />
      ) : wasCorrect ? (
        <ChangeTag label={t`was correct`} className={AMBER_TAG} />
      ) : textChanged || explanationChanged ? (
        <ChangeTag label={t`edited`} className={AMBER_TAG} />
      ) : null}
    </span>
  )
}

/**
 * One quiz as it reads inside the version-compare list: the question with its
 * previous wording struck through when it changed, then every option marked for
 * text edits and for the correct answer moving.
 */
export function QuizVersionDiffItem({
  quiz,
  previous,
}: {
  quiz: QuizItem
  previous?: QuizItem
}) {
  const questionChanged = previous != null && previous.question !== quiz.question
  const answerMoved = previous != null && previous.answerIndex !== quiz.answerIndex

  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-col">
        {questionChanged && previous ? (
          <span className="text-[11px] text-muted-foreground line-through decoration-rose-400/70">
            {previous.question}
          </span>
        ) : null}
        <span className="font-medium text-foreground">{quiz.question}</span>
      </span>
      <span className="flex flex-col gap-1">
        {/* Options are compared positionally against the previous version, but
            keyed by their text: a snapshot list that is never reordered in
            place, so identity follows the content, not the slot. */}
        {quiz.options.map((option, index) => (
          <QuizDiffOption
            key={option.text}
            option={option}
            previous={previous?.options[index]}
            isCorrect={index === quiz.answerIndex}
            answerMoved={answerMoved}
            wasCorrect={answerMoved && previous != null && index === previous.answerIndex}
          />
        ))}
      </span>
    </span>
  )
}
