import { useEffect, useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, FileQuestion, Loader2 } from "lucide-react"
import { useQuizzes } from "@/hooks/use-quizzes"
import { cn } from "@/lib/utils"
import type { DashThread } from "./dashboard-data"
import type { CommentLocation } from "./FeedbackPage"
import { Message } from "./FeedbackPage"
import { initialOf } from "./helpers"
import { quizPartOf, type QuizPart } from "./quiz-comments"

const OPTION_LETTERS = ["A", "B", "C"] as const

/**
 * The quiz a comment was left on, drawn from the book's quiz data: the question, the three
 * options with the answer marked, and the part the reader pointed at ringed and pinned.
 *
 * A quiz is not a Storyboard page, so the page preview has nothing to render for it; its text
 * is what the reader saw, and it is what the author would change in the Quizzes step.
 */
export function QuizCommentPreview({
  bookLabel,
  thread,
  threads,
  onSelectThread,
  onLocate,
}: {
  bookLabel: string
  thread: DashThread
  /** Every comment on this quiz, so the others show as quieter pins. */
  threads: DashThread[]
  onSelectThread: (id: string) => void
  onLocate: (id: string, location: CommentLocation) => void
}) {
  const { t } = useLingui()
  const quizzes = useQuizzes(bookLabel)
  const quizId = thread.quiz?.id ?? ""
  const quiz = quizzes.data?.quizzes?.quizzes.find((candidate) => candidate.quizId === quizId) ?? null
  const part = quizPartOf(thread.anchor, quizId)

  useEffect(() => {
    if (quizzes.isPending) {
      onLocate(thread.id, { kind: "loading" })
      return
    }
    if (!quiz) {
      onLocate(thread.id, { kind: "unavailable" })
      return
    }
    if (part === null) {
      onLocate(thread.id, { kind: thread.anchor ? "moved" : "page" })
      return
    }
    const text = part.kind === "question" ? quiz.question : quiz.options[part.index]?.text
    onLocate(thread.id, text === undefined ? { kind: "moved" } : { kind: "placed", quote: text, picture: false })
  }, [onLocate, part?.kind, part?.kind === "option" ? part.index : -1, quiz, quizzes.isPending, thread.anchor, thread.id])

  /** Which comments sit on which part, so each part carries its own pins. */
  const pinsByPart = useMemo(() => {
    const byPart = new Map<string, DashThread[]>()
    for (const other of threads) {
      const key = partKey(quizPartOf(other.anchor, quizId))
      byPart.set(key, [...(byPart.get(key) ?? []), other])
    }
    return byPart
  }, [quizId, threads])

  if (quizzes.isPending) {
    return (
      <Message icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
        <Trans>Opening the quiz…</Trans>
      </Message>
    )
  }

  if (!quiz) {
    return (
      <Message icon={<FileQuestion className="size-5" aria-hidden="true" />}>
        <Trans>This quiz isn't in the book anymore — it may have been removed since the reader saw it.</Trans>
      </Message>
    )
  }

  const selectedKey = partKey(part)
  const pins = (key: string) => (
    <Pins
      threads={pinsByPart.get(key) ?? []}
      selectedId={thread.id}
      onSelect={onSelectThread}
      label={(name) => t`Comment by ${name}`}
    />
  )

  return (
    <div className="relative flex flex-col gap-5 px-8 pb-8 pt-7">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{thread.pageLabel}</span>
        {pins("whole")}
      </div>

      <Part highlighted={selectedKey === "question"} flashKey={thread.id}>
        <p className="pr-8 text-lg font-semibold leading-snug text-foreground">{quiz.question}</p>
        <span className="absolute right-2 top-2">{pins("question")}</span>
      </Part>

      <ol className="flex list-none flex-col gap-2 p-0">
        {quiz.options.map((option, index) => {
          const key = partKey({ kind: "option", index })
          const correct = index === quiz.answerIndex
          return (
            <li key={index}>
              <Part highlighted={selectedKey === key} flashKey={thread.id} bordered>
                <span className="flex items-start gap-3 pr-8">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      correct ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "text-muted-foreground",
                    )}
                  >
                    {OPTION_LETTERS[index] ?? index + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5 text-sm leading-snug text-foreground">{option.text}</span>
                  {correct ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <Check className="size-3" aria-hidden="true" />
                      <Trans>Answer</Trans>
                    </span>
                  ) : null}
                </span>
                <span className="absolute right-2 top-2">{pins(key)}</span>
              </Part>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function partKey(part: QuizPart | null): string {
  if (part === null) return "whole"
  return part.kind === "question" ? "question" : `option-${part.index}`
}

function Part({
  highlighted,
  flashKey,
  bordered = false,
  children,
}: {
  highlighted: boolean
  flashKey: string
  bordered?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg px-4 py-3 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none",
        bordered && "border",
        highlighted && "bg-brand-50/60 dark:bg-brand-500/10",
      )}
    >
      {children}
      {highlighted ? (
        <span
          key={flashKey}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-[10px] ring-2 ring-brand-500 motion-safe:animate-[feedback-pin-flash_1.8s_ease-out_forwards] motion-reduce:opacity-40"
        />
      ) : null}
    </div>
  )
}

function Pins({
  threads,
  selectedId,
  onSelect,
  label,
}: {
  threads: DashThread[]
  selectedId: string
  onSelect: (id: string) => void
  label: (name: string) => string
}) {
  if (threads.length === 0) return null
  return (
    <span className="flex -space-x-1.5">
      {threads.map((other) => {
        const selected = other.id === selectedId
        return (
          <button
            key={other.id}
            type="button"
            onClick={() => onSelect(other.id)}
            aria-label={label(other.authorName)}
            aria-current={selected}
            style={{ backgroundColor: other.authorColor }}
            className={cn(
              "flex items-center justify-center rounded-full rounded-bl-none font-bold text-white shadow-md ring-2 ring-white transition-[transform,opacity] duration-200 hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 motion-reduce:transition-none",
              selected ? "z-10 size-7 text-xs ring-4 ring-brand-200" : "size-6 text-[11px] opacity-70",
              other.resolved && !selected && "opacity-40 saturate-50",
            )}
          >
            {initialOf(other.authorName)}
          </button>
        )
      })}
    </span>
  )
}
