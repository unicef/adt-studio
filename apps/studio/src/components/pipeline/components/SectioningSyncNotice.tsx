import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import type { SectioningSynchronization, SectionSyncStatus } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useBookTasks, bookTasksKey } from "@/hooks/use-book-tasks"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useFloatingSaveDirtyEntries } from "./floating-save"
import { OutputReview } from "./OutputReview"
import { Button } from "@/components/ui/button"

/** Server-derived only: save flags and task success never dismiss this notice. */
export function SectioningSyncNotice({ synchronization, bookLabel, pageId, showStoryboardLink = false }: {
  synchronization?: SectioningSynchronization
  bookLabel: string
  pageId: string
  showStoryboardLink?: boolean
}) {
  const { t } = useLingui()
  if (!synchronization) return null
  const affected = synchronization.sections.filter((section) => section.status !== "current" && section.status !== "text-patched")
  const fixed = synchronization.layout === "fixed"
  if (!fixed && affected.length === 0 && synchronization.diagnostics.length === 0) return null
  const repairable = affected.filter((section) => section.action === "repair").map((section) => section.sectionId)
  const requiresReview = affected.some((section) => section.action === "review")

  const description = (status: SectionSyncStatus): string => {
    switch (status) {
      case "text-drift": return t`Saved source text differs from the preview.`
      case "protected-divergence": return t`Rendered text is protected or differs from its source. Review it before replacing it.`
      case "structural-drift": return t`The section structure or identity no longer matches the rendering.`
      case "invalid-rendering": return t`The rendering is missing or cannot be matched safely.`
      case "fixed-layout-unmapped": return t`Semantic text does not update the positioned page.`
      default: return t`The relationship between this source and the saved rendering is unverified.`
    }
  }

  return (
    <aside role="status" aria-live="polite" aria-label={t`Sectioning and Storyboard correspondence`} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2">
      <p className="font-semibold">{fixed ? t`Fixed-layout text editing` : t`Storyboard correspondence needs review`}</p>
      <p>{fixed
        ? t`Text edits in Sectioning change semantic content, but do not change the visible positioned page. Use Storyboard to edit that page. Rerendering semantic text cannot synchronize it.`
        : t`Your saved source is retained. Review the affected sections below; repair is available only where their identity and generated origin are verified.`}</p>
      {!fixed && affected.length > 0 && (
        <ul className="max-h-32 overflow-y-auto list-disc pl-4 space-y-1">
          {affected.map((section, index) => (
            <li key={`${section.sectionId}:${index}`}><span className="font-mono">{section.sectionId}</span>{": "}{description(section.status)}</li>
          ))}
        </ul>
      )}
      {synchronization.diagnostics.length > 0 && <p><Trans>Some source or rendering data could not be verified. Review this page in Storyboard.</Trans></p>}
      {!fixed && repairable.length > 0 && <SectioningRepairAction key={`${bookLabel}:${pageId}`} bookLabel={bookLabel} pageId={pageId} synchronization={synchronization} sectionIds={repairable} />}
      {!fixed && requiresReview && <OutputReview bookLabel={bookLabel} id={pageId} kinds={["storyboard"]} allowGeneration={false} />}
      {(showStoryboardLink || requiresReview) && (
        <Link className="inline-block underline focus-visible:outline-2 focus-visible:outline-offset-2" to="/books/$label/$step/$pageId" params={{ label: bookLabel, step: "storyboard", pageId }}>
          <Trans>Open Storyboard</Trans>
        </Link>
      )}
    </aside>
  )
}

function SectioningRepairAction({ bookLabel, pageId, synchronization, sectionIds }: {
  bookLabel: string; pageId: string; synchronization: SectioningSynchronization; sectionIds: string[]
}) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const hasProvider = useBookStructuredTextAvailability(bookLabel)
  const queryClient = useQueryClient()
  const { tasks, dataUpdatedAt, isFetching } = useBookTasks(bookLabel)
  const drafts = useFloatingSaveDirtyEntries()
  const dirty = drafts.length > 0
  const [submitting, setSubmitting] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submittedAt = useRef(0)
  const absentSnapshots = useRef({ taskId: "", lastUpdated: 0, count: 0 })
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const ownTask = tasks.find((task) => task.taskId === taskId)
  const activeTask = tasks.find((task) => task.pageId === pageId && task.kind === "re-render" && (task.status === "queued" || task.status === "running"))
  useEffect(() => { if (activeTask && !taskId) setTaskId(activeTask.taskId) }, [activeTask, taskId])
  const pending = submitting || !!activeTask || (!!taskId && !ownTask)
  useEffect(() => {
    if (!taskId || ownTask || isFetching || !dataUpdatedAt || dataUpdatedAt <= submittedAt.current) return
    const previous = absentSnapshots.current
    if (previous.taskId === taskId && previous.lastUpdated === dataUpdatedAt) return
    const count = previous.taskId === taskId ? previous.count + 1 : 1
    absentSnapshots.current = { taskId, lastUpdated: dataUpdatedAt, count }
    // One missing response can race task admission. Two fresh task snapshots
    // establish that this server cannot report the task (for example restart).
    if (count < 2) return
    setTaskId(null)
    setError(t`Repair status is unavailable. The saved rendering and drift are retained. Refresh or retry the repair.`)
    void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
  }, [taskId, ownTask, isFetching, dataUpdatedAt, queryClient, bookLabel, t])
  const completed = useRef<string | null>(null)
  useEffect(() => {
    if (!ownTask || ownTask.status === "queued" || ownTask.status === "running" || completed.current === ownTask.taskId) return
    completed.current = ownTask.taskId
    if (ownTask.status === "failed") setError(ownTask.error ?? t`Repair failed. The previous rendering is retained.`)
    // Task completion is not proof of synchronization. Refresh the authoritative
    // page snapshot; keep its notice until GET confirms committed correspondence.
    void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
    invalidateStoryboardDependents(queryClient, bookLabel)
  }, [ownTask, queryClient, bookLabel, t])
  const repair = async () => {
    if (pending || dirty) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.repairSectioningSynchronization(bookLabel, pageId, apiKey, {
        baseVersion: synchronization.sourceVersion ?? 0,
        renderingVersion: synchronization.renderingVersion ?? 0,
        sectionIds,
      })
      if (!mounted.current) return
      if (result.taskId) {
        submittedAt.current = Date.now()
        absentSnapshots.current = { taskId: result.taskId, lastUpdated: 0, count: 0 }
        setTaskId(result.taskId)
      }
      void queryClient.invalidateQueries({ queryKey: bookTasksKey(bookLabel) })
      void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : t`Repair failed. The previous rendering is retained.`)
      void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }
  return <div className="space-y-2">
    <p><Trans>Repair regenerates only these sections and may use paid generation:</Trans> <span className="font-mono">{sectionIds.join(", ")}</span></p>
    {pending && <p><Trans>Repair is queued or running. The saved preview remains unchanged until verified output is committed.</Trans></p>}
    {dirty && <p><Trans>Save or discard your draft before repairing these sections.</Trans></p>}
    {!hasProvider && <p><Trans>Configure a generation provider before repairing these sections.</Trans></p>}
    {error && <p role="alert">{error}</p>}
    <Button size="sm" variant="outline" disabled={pending || dirty || !hasProvider} onClick={() => void repair()}><Trans>Repair listed sections</Trans></Button>
  </div>
}
