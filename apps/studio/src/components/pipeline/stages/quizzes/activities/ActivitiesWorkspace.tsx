import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { usePages, usePage, usePageImage } from "@/hooks/use-pages"
import { useApiKey, useBookAgentAvailability, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { bookTasksKey, useBookTasks } from "@/hooks/use-book-tasks"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useBookRun } from "@/hooks/use-book-run"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Eye, ImageOff, Loader2 } from "lucide-react"
import { GenerateActivityDialog } from "../../storyboard/components/GenerateActivityDialog"
import { ActivityResults } from "./ActivityResults"

export function ActivitiesWorkspace({ bookLabel, selectedPageId }: {
  bookLabel: string
  selectedPageId?: string
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const pagesQuery = usePages(bookLabel)
  const pages = pagesQuery.data ?? []
  const [chosenPageId, setChosenPageId] = useState(selectedPageId ?? "")
  const pageId = pages.find((page) => page.pageId === chosenPageId)?.pageId
    ?? pages.find((page) => page.hasRendering)?.pageId ?? pages[0]?.pageId ?? ""
  const pageQuery = usePage(bookLabel, pageId)
  const page = pageQuery.data
  const [isSourcePreviewRequested, setIsSourcePreviewRequested] = useState(false)
  const pageImageQuery = usePageImage(bookLabel, pageId, { enabled: isSourcePreviewRequested })
  const { apiKey } = useApiKey()
  const hasAgent = useBookAgentAvailability(bookLabel)
  const hasTextProvider = useBookStructuredTextAvailability(bookLabel)
  const { isRunning } = useBookRun()
  const { getTask, isTaskRunning } = useBookTasks(bookLabel)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const completedTask = useRef<string | null>(null)
  const task = taskId ? getTask(taskId) : undefined
  const [recreating, setRecreating] = useState(false)

  useEffect(() => {
    if (selectedPageId) setChosenPageId(selectedPageId)
  }, [selectedPageId])

  const generate = useMutation({
    mutationFn: ({ description, options }: {
      description: string
      options: Parameters<typeof api.agentGenerateActivity>[4]
    }) => api.agentGenerateActivity(bookLabel, pageId, description, apiKey, options),
    onSuccess: (result) => {
      setTaskId(result.taskId ?? null)
      void queryClient.invalidateQueries({ queryKey: bookTasksKey(bookLabel) })
      if (!result.taskId) void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
    },
  })

  const remove = useMutation({
    mutationFn: (sectionIndex: number) => api.deleteSection(bookLabel, pageId, sectionIndex),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] }),
        queryClient.invalidateQueries({ queryKey: ["editable-activities", bookLabel, pageId] }),
        invalidateStoryboardDependents(queryClient, bookLabel),
      ])
    },
  })
  const recreate = useMutation({
    onMutate: () => {
      generate.reset()
      setTaskId(null)
    },
    mutationFn: async ({ sectionIndex, feedback }: { sectionIndex: number; feedback: string }) => {
      // AI editing preserves custom activity scripts; re-rendering from the
      // sectioning tree would discard their interaction code.
      const result = await api.aiEditSection(bookLabel, pageId, sectionIndex, feedback, apiKey)
      if (!result.taskId) throw new Error(t`Could not start activity recreation. Please try again.`)
      return result
    },
    onSuccess: async (result) => {
      setRecreating(true)
      setTaskId(result.taskId ?? null)
      await queryClient.invalidateQueries({ queryKey: bookTasksKey(bookLabel) })
    },
  })

  useEffect(() => {
    if (!task || task.status === "running" || task.status === "queued" || completedTask.current === task.taskId) return
    completedTask.current = task.taskId
    // Polling also refreshes the results if the completion SSE event was missed.
    void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
    void queryClient.invalidateQueries({ queryKey: ["editable-activities", bookLabel] })
    void invalidateStoryboardDependents(queryClient, bookLabel)
  }, [task, queryClient, bookLabel])

  // A task can leave the task list after completion. Only a task known to be
  // queued or running may block a new request; treating a missing task as
  // active leaves the Create activity button disabled indefinitely.
  const busy = isRunning || generate.isPending || remove.isPending || recreate.isPending || isTaskRunning(undefined, pageId)
    || task?.status === "running" || task?.status === "queued"
  const rendered = !!page?.rendering?.sections.length
  const fixedLayout = page?.rendering?.sections.some((section) => section.sectionType === "fixed-layout-page")
  const canGenerate = hasAgent && rendered && !fixedLayout && !busy && !pageQuery.isError
  const error = generate.error?.message ?? (task?.status === "failed" ? task.error : null)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5">
      <header>
        <h1 className="text-2xl font-semibold">{t`Activities`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t`Create interactive exercises from a book page, then preview and edit them. Keyboard access and clear feedback are included in every generation request.`}
        </p>
      </header>
      {pagesQuery.isLoading && <p role="status">{t`Loading pages…`}</p>}
      {(pagesQuery.isError || pageQuery.isError) && (
        <div role="alert" className="rounded-md border border-destructive p-3">
          <p>{t`Could not load the pages.`}</p>
          <Button variant="outline" onClick={() => { void pagesQuery.refetch(); void pageQuery.refetch() }}>{t`Try again`}</Button>
        </div>
      )}
      {!pagesQuery.isLoading && !pagesQuery.isError && pages.length === 0 && <p>{t`Extract the book to choose a source page.`}</p>}
      {pages.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="activity-source-page" className="mb-1 block text-sm font-medium">{t`Source page`}</label>
            <div className="flex gap-2">
              <select id="activity-source-page" value={pageId} disabled={busy} onChange={(event) => {
                setChosenPageId(event.target.value)
                setTaskId(null)
                setRecreating(false)
                generate.reset()
              }} className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                {pages.map((source) => <option key={source.pageId} value={source.pageId}>{t`Page ${source.pageNumber}`}</option>)}
              </select>
              <HoverCard openDelay={150} closeDelay={100} onOpenChange={setIsSourcePreviewRequested}>
                <HoverCardTrigger asChild>
                  <button type="button" disabled={busy} onFocus={() => setIsSourcePreviewRequested(true)}
                    aria-label={t`Preview source page ${page?.pageNumber ?? ""}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
                    <Eye aria-hidden="true" className="size-4" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="end" className="w-72 overflow-hidden">
                  <div className="border-b px-3 py-2 text-sm font-medium">{t`Source page preview`}</div>
                  {pageImageQuery.data?.imageBase64 ? (
                    <img src={`data:image/png;base64,${pageImageQuery.data.imageBase64}`}
                      alt={t`Source page ${page?.pageNumber ?? ""} preview`}
                      className="max-h-96 w-full bg-muted object-contain" />
                  ) : pageImageQuery.isError ? (
                    <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                      <ImageOff aria-hidden="true" className="size-5" />
                      <span>{t`Source page image is unavailable.`}</span>
                    </div>
                  ) : (
                    <div className="flex min-h-36 items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      <span>{t`Loading source page preview...`}</span>
                    </div>
                  )}
                </HoverCardContent>
              </HoverCard>
            </div>
          </div>
          <Button className="min-h-11" disabled={!canGenerate} onClick={() => setDialogOpen(true)}>{t`Create activity`}</Button>
          <Link to="/books/$label/$step/$pageId" params={{ label: bookLabel, step: "storyboard", pageId }} className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm underline underline-offset-4">{t`Open page editor`}</Link>
        </div>
      )}
      {page && (!rendered || fixedLayout) && <p role="status">{t`Render this page in Storyboard using a reflowable layout before adding activities.`}</p>}
      {!hasAgent && <p>{t`Connect an AI provider to generate activities.`}</p>}
      {(generate.isPending || isTaskRunning("generate-activity", pageId)) && <p role="status">{t`Generating activity… You can follow its progress in Tasks.`}</p>}
      {(recreate.isPending || isTaskRunning("ai-edit", pageId) || (recreating && (task?.status === "running" || task?.status === "queued"))) && <p role="status">{t`Recreating activity… You can follow its progress in Tasks.`}</p>}
      {remove.isPending && <p role="status">{t`Deleting activity…`}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {page && <ActivityResults key={pageId} bookLabel={bookLabel} page={page}
        disabled={busy || pageQuery.isError}
        canRecreate={hasTextProvider && rendered && !fixedLayout}
        onDelete={(sectionIndex) => remove.mutateAsync(sectionIndex)}
        onRecreate={(sectionIndex, feedback) => recreate.mutateAsync({ sectionIndex, feedback })} />}
      {dialogOpen && page && <GenerateActivityDialog
        anchorPageId={pageId}
        anchorPageNumber={page.pageNumber}
        onClose={() => setDialogOpen(false)}
        onSubmit={(description, options) => {
          if (!canGenerate) return
          setDialogOpen(false)
          setTaskId(null)
          setRecreating(false)
          generate.mutate({ description, options })
        }}
      />}
    </div>
  )
}
