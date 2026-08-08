import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Circle } from "lucide-react"
import type { QuizItem } from "@/api/client"
import { useQuizzes } from "@/hooks/use-quizzes"
import { cn } from "@/lib/utils"
import { tint } from "../plugins"
import { useSaveQuizzes } from "./mutations"
import { StepEmpty, StepLoading, StepShell } from "./StepShell"
import { EditableText, SaveError, StepBody, StepCard, StepEmptyHint, StepRail } from "./ui"
import type { StepProps } from "./types"

export function QuizzesStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const query = useQuizzes(label)
  const save = useSaveQuizzes(label)

  const output = query.data?.quizzes ?? null
  const quizzes = useMemo(() => output?.quizzes ?? [], [output])
  const [activePageId, setActivePageId] = useState<string | null>(null)

  const pageNumbers = useMemo(() => {
    const map = new Map<string, number>()
    for (const page of pages) map.set(page.pageId, page.pageNumber)
    return map
  }, [pages])

  const pageNumber = (pageId: string): string =>
    pageNumbers.has(pageId) ? String(pageNumbers.get(pageId)) : "—"

  const byPage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const quiz of quizzes) counts.set(quiz.afterPageId, (counts.get(quiz.afterPageId) ?? 0) + 1)
    return [...counts.entries()].map(([pageId, count]) => ({
      key: pageId,
      title: t`After page ${pageNumbers.get(pageId) ?? "—"}`,
      count,
    }))
  }, [quizzes, pageNumbers, t])

  const persist = (next: QuizItem[]) => {
    if (!output) return
    save.mutate({ ...output, quizzes: next })
  }

  const patchQuiz = (quizIndex: number, changes: Partial<QuizItem>) => {
    persist(quizzes.map((q) => (q.quizIndex === quizIndex ? { ...q, ...changes } : q)))
  }

  const patchOption = (quizIndex: number, optionIndex: number, text: string) => {
    const quiz = quizzes.find((q) => q.quizIndex === quizIndex)
    if (!quiz) return
    patchQuiz(quizIndex, {
      options: quiz.options.map((o, i) => (i === optionIndex ? { ...o, text } : o)),
    })
  }

  if (query.isLoading) return <StepLoading {...props} />
  if (quizzes.length === 0) return <StepEmpty {...props} />

  const shown = activePageId ? quizzes.filter((q) => q.afterPageId === activePageId) : quizzes

  return (
    <StepShell
      {...props}
      chips={[t`${quizzes.length} questions`, t`every ${output?.pagesPerQuiz ?? 1} pages`]}
      canApply={quizzes.length > 0}
      rail={
        <StepRail
          heading={<Trans>Questions by page</Trans>}
          hex={plugin.hex}
          entries={byPage}
          activeKey={activePageId}
          onSelect={(key) => setActivePageId((cur) => (cur === key ? null : key))}
          footer={<Trans>Select a page to filter. Click again to show all.</Trans>}
        />
      }
    >
      <StepBody title={<Trans>Quizzes</Trans>} meta={t`${quizzes.length} questions`}>
        <SaveError error={save.error} />

        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No questions for this page.</Trans>
          </StepEmptyHint>
        ) : (
          shown.map((quiz) => (
            <StepCard key={quiz.quizIndex} accent={plugin.hex}>
              <div className="flex items-start gap-2">
                <span className="mt-1 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {t`after page ${pageNumber(quiz.afterPageId)}`}
                </span>
                <EditableText
                  value={quiz.question}
                  ariaLabel={t`question`}
                  multiline={false}
                  isSaving={save.isPending}
                  onSave={(question) => patchQuiz(quiz.quizIndex, { question })}
                  className="text-[13.5px] font-semibold"
                />
              </div>

              <ul className="flex flex-col gap-1">
                {quiz.options.map((option, index) => {
                  const correct = index === quiz.answerIndex
                  return (
                    <li key={index} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => patchQuiz(quiz.quizIndex, { answerIndex: index })}
                        aria-label={t`Mark option ${index + 1} as the correct answer`}
                        aria-pressed={correct}
                        className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors"
                        style={
                          correct
                            ? { background: plugin.hex, borderColor: plugin.hex, color: "white" }
                            : undefined
                        }
                      >
                        {correct ? <Check className="size-2.5" strokeWidth={4} /> : <Circle className="size-2 opacity-0" />}
                      </button>
                      <EditableText
                        value={option.text}
                        ariaLabel={t`option ${index + 1}`}
                        multiline={false}
                        isSaving={save.isPending}
                        onSave={(text) => patchOption(quiz.quizIndex, index, text)}
                        className={cn("text-[12.5px]", correct && "font-semibold")}
                      />
                    </li>
                  )
                })}
              </ul>

              {quiz.reasoning && (
                <p
                  className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
                  style={{ background: tint(plugin.hex, 0.06) }}
                >
                  {quiz.reasoning}
                </p>
              )}
            </StepCard>
          ))
        )}
      </StepBody>
    </StepShell>
  )
}
