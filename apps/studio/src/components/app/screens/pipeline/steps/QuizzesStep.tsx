import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, Plus, Search, X } from "lucide-react"
import type { QuizItem, QuizOption } from "@/api/client"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useApiKey } from "@/hooks/use-api-key"
import { useStageStatus } from "@/hooks/use-stage-status"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"
import { AddQuizDialog } from "@/components/pipeline/stages/quizzes/AddQuizDialog"
import { useSaveQuizzes } from "./shared/mutations"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { DetailNavButton, SaveError, StepBody, StepEmptyHint, StepRail } from "./shared/ui"
import { QuizCard } from "./quizzes/QuizCard"
import type { StepProps } from "./shared/types"

export function QuizzesStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const query = useQuizzes(label)
  const save = useSaveQuizzes(label)
  const saveQuizzes = save.mutate

  const { hasApiKey } = useApiKey()
  const quizzesStatus = useStageStatus("quizzes")

  const output = query.data?.quizzes ?? null
  const quizzes = useMemo(() => output?.quizzes ?? [], [output])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)
  const [search, setSearch] = useState("")

  const pageNumbers = useMemo(() => {
    const map = new Map<string, number>()
    for (const page of pages) map.set(page.pageId, page.pageNumber)
    return map
  }, [pages])

  const byPage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const quiz of quizzes) counts.set(quiz.afterPageId, (counts.get(quiz.afterPageId) ?? 0) + 1)
    return [...counts.entries()].map(([pageId, count]) => ({
      key: pageId,
      title: t`After page ${pageNumbers.get(pageId) ?? "—"}`,
      count,
    }))
  }, [quizzes, pageNumbers, t])

  const patchQuiz = useCallback(
    (quizIndex: number, changes: Partial<QuizItem>) => {
      if (!output) return
      saveQuizzes({
        ...output,
        quizzes: output.quizzes.map((q) => (q.quizIndex === quizIndex ? { ...q, ...changes } : q)),
      })
    },
    [output, saveQuizzes],
  )

  const patchOption = useCallback(
    (quizIndex: number, optionIndex: number, changes: Partial<QuizOption>) => {
      if (!output) return
      saveQuizzes({
        ...output,
        quizzes: output.quizzes.map((q) =>
          q.quizIndex === quizIndex
            ? {
                ...q,
                options: q.options.map((o, i) => (i === optionIndex ? { ...o, ...changes } : o)),
              }
            : q,
        ),
      })
    },
    [output, saveQuizzes],
  )

  const openPage = useCallback((pageId: string) => setLightboxPageId(pageId), [])
  const requestDelete = useCallback((quizIndex: number) => setConfirmDeleteIndex(quizIndex), [])

  // Removes the quiz and renumbers quizIndex (it's positional). A deleted quiz
  // can still be recovered from the version history.
  const deleteQuiz = useCallback(
    (quizIndex: number) => {
      if (!output) return
      saveQuizzes(
        {
          ...output,
          quizzes: output.quizzes
            .filter((q) => q.quizIndex !== quizIndex)
            .map((q, i) => ({ ...q, quizIndex: i })),
        },
        { onSettled: () => setConfirmDeleteIndex(null) },
      )
    },
    [output, saveQuizzes],
  )

  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: quizzes.length > 0 })
  if (loading) return <StepLoading {...props} />
  if (quizzes.length === 0) return <StepEmpty {...props} />

  const byActivePage = activePageId
    ? quizzes.filter((q) => q.afterPageId === activePageId)
    : quizzes
  const normalizedSearch = search.trim().toLowerCase()
  const shown = normalizedSearch
    ? byActivePage.filter((q) =>
        [q.question, ...q.options.flatMap((o) => [o.text, o.explanation])]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : byActivePage

  return (
    <StepShell
      {...props}
      chips={[t`${quizzes.length} questions`, t`every ${output?.pagesPerQuiz ?? 1} pages`]}
      canApply={quizzes.length > 0}
      bodyViewportClassName="[&>div]:!my-0"
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
      <StepBody
        title={<Trans>Quizzes</Trans>}
        meta={t`${quizzes.length} questions`}
        actions={
          <>
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t`Search questions, answers, or explanations…`}
                aria-label={t`Search questions or options…`}
                className="h-8 w-full rounded-lg border bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-brand-400 focus:outline-none focus:shadow-[0_0_0_3px_var(--brand-50)]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t`Clear search`}
                  className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <DetailNavButton
              icon={Plus}
              label={
                !hasApiKey
                  ? t`Add an API key in Book settings to add a quiz.`
                  : quizzesStatus.isRunning
                    ? t`Quizzes are generating. Wait for the run to finish before adding a quiz.`
                    : t`Add quiz`
              }
              onClick={() => setShowAdd(true)}
              disabled={!hasApiKey || quizzesStatus.isRunning}
            >
              <Trans>Add quiz</Trans>
            </DetailNavButton>
          </>
        }
      >
        <SaveError error={save.error} />

        {shown.length === 0 ? (
          <StepEmptyHint>
            {normalizedSearch ? (
              <span className="flex flex-col items-center gap-2">
                <Trans>No quizzes match your search</Trans>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="font-medium underline-offset-2 hover:underline"
                  style={{ color: plugin.hex }}
                >
                  <Trans>Clear search</Trans>
                </button>
              </span>
            ) : (
              <Trans>No questions for this page.</Trans>
            )}
          </StepEmptyHint>
        ) : (
          shown.map((quiz) => (
            <QuizCard
              key={quiz.quizIndex}
              label={label}
              quiz={quiz}
              accent={plugin.hex}
              pageNumbers={pageNumbers}
              saving={save.isPending}
              onPatchQuiz={patchQuiz}
              onPatchOption={patchOption}
              onOpenPage={openPage}
              onRequestDelete={requestDelete}
            />
          ))
        )}
      </StepBody>

      <PageLightbox
        bookLabel={label}
        pageId={lightboxPageId}
        open={lightboxPageId != null}
        onOpenChange={(open) => {
          if (!open) setLightboxPageId(null)
        }}
      />

      <AddQuizDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        bookLabel={label}
        onCreated={() => setShowAdd(false)}
      />

      <Dialog
        open={confirmDeleteIndex != null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setConfirmDeleteIndex(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Delete this quiz?</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                This quiz will be removed from the book. You can still restore it from the version
                history.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteIndex(null)}
              disabled={save.isPending}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteIndex != null && deleteQuiz(confirmDeleteIndex)}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                  <Trans>Deleting…</Trans>
                </>
              ) : (
                <Trans>Delete quiz</Trans>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepShell>
  )
}
