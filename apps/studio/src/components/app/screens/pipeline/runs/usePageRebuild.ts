import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/sonner"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { bookTasksKey, useBookTasks } from "@/hooks/use-book-tasks"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useLabRebuildSim } from "@/components/app/lab/rebuildSim"

const RE_RENDER_KIND = "re-render"
const NO_IDS: ReadonlySet<string> = new Set()

export interface PageRebuild {
  rebuild: (pageIds: string[]) => void
  rebuilding: ReadonlySet<string>
  canRebuild: boolean
  disabledReason: string | null
}

/**
 * Rebuilds individual storyboard pages from their current sections — one page
 * through the single-page re-render, several as one batch task — instead of
 * re-running the whole Storyboard stage.
 */
export function usePageRebuild(label: string): PageRebuild {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { apiKey, hasApiKey } = useApiKey()
  const { tasks } = useBookTasks(label)
  const storyboardState = useBookRun().stageState("storyboard")
  const sim = useLabRebuildSim(label)
  const [submitting, setSubmitting] = useState<ReadonlySet<string>>(NO_IDS)
  const [batches, setBatches] = useState<Record<string, string[]>>({})
  const settled = useRef(new Set<string>())

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
    invalidateStoryboardDependents(queryClient, label)
  }, [queryClient, label])

  useEffect(() => {
    let changed = false
    for (const task of tasks) {
      const pageIds = batches[task.taskId]
      if (!pageIds || settled.current.has(task.taskId)) continue
      if (task.status !== "completed" && task.status !== "failed") continue
      settled.current.add(task.taskId)
      changed = true
      if (task.status === "failed") toast.error(task.error ?? t`Rebuilding the pages failed.`)
    }
    if (changed) refresh()
  }, [tasks, batches, refresh, t])

  const rebuilding = useMemo(() => {
    const ids = new Set(submitting)
    for (const task of tasks) {
      if (task.kind !== RE_RENDER_KIND || (task.status !== "running" && task.status !== "queued")) continue
      for (const id of batches[task.taskId] ?? (task.pageId ? [task.pageId] : [])) ids.add(id)
    }
    if (sim) for (const id of sim.rebuilding) ids.add(id)
    return ids
  }, [submitting, tasks, batches, sim])

  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const disabledReason = sim
    ? null
    : storyboardRunning
      ? t`Wait for the storyboard to finish building`
      : !hasApiKey
        ? t`Add an API key in Book settings to rebuild pages.`
        : null

  const rebuild = useCallback(
    (pageIds: string[]) => {
      const ids = pageIds.filter((id) => !rebuilding.has(id))
      if (ids.length === 0 || disabledReason) return
      if (sim) {
        sim.rebuild(ids)
        return
      }
      setSubmitting((previous) => new Set([...previous, ...ids]))
      const request = ids.length === 1 ? api.reRenderPage(label, ids[0], apiKey) : api.reRenderPages(label, ids, apiKey)
      request
        .then((response) => {
          const taskId = response.taskId
          if (taskId) setBatches((previous) => ({ ...previous, [taskId]: ids }))
          else refresh()
          void queryClient.invalidateQueries({ queryKey: bookTasksKey(label) })
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : t`Rebuilding the pages failed.`)
        })
        .finally(() => {
          setSubmitting((previous) => {
            const next = new Set(previous)
            for (const id of ids) next.delete(id)
            return next
          })
        })
    },
    [rebuilding, disabledReason, sim, label, apiKey, refresh, queryClient, t],
  )

  return { rebuild, rebuilding, canRebuild: !disabledReason, disabledReason }
}
