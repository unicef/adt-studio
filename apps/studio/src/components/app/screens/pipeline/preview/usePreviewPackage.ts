import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePackageAdtStatus } from "@/hooks/use-books"

export type PreviewPackageStatus = "packaging" | "ready" | "error"

export interface PreviewPackage {
  status: PreviewPackageStatus
  /** Cache-bust segment of the packaged bundle URL; null until it is ready. */
  version: string | null
  error: string | null
  repackage: () => void
}

function readPackageVersion(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null
  const version = (result as { version?: unknown }).version
  return typeof version === "string" && version.length > 0 ? version : null
}

/**
 * Drives the package-then-serve cycle the preview needs. Packaging is requested
 * every time the preview opens so it reflects the latest storyboard edits — the
 * API answers synchronously on a cache hit, so an unchanged book costs a round
 * trip rather than a rebuild.
 */
export function usePreviewPackage(label: string, enabled: boolean): PreviewPackage {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { getTask } = useBookTasks(label)
  const [version, setVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)

  const { data: packageStatus } = usePackageAdtStatus(label, {
    refetchInterval: pendingVersion && !version ? 1_000 : false,
  })

  const settle = useCallback(
    (next: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "adt-pages"] }),
        queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]).then(() => {
        setPendingVersion(null)
        setVersion(next)
      }),
    [queryClient, label],
  )

  const repackage = useCallback(() => {
    setVersion(null)
    setError(null)
    setTaskId(null)
    setPendingVersion(null)
    void (async () => {
      try {
        const result = await api.packageAdt(label)
        const fallback = String(Date.now())
        if (result.taskId) {
          setTaskId(result.taskId)
          setPendingVersion(result.version ?? null)
        } else {
          await settle(result.version ?? fallback)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t`Packaging failed`)
      }
    })()
  }, [label, settle, t])

  const startedRef = useRef(false)
  useEffect(() => {
    if (!enabled || startedRef.current) return
    startedRef.current = true
    repackage()
  }, [enabled, repackage])

  useEffect(() => {
    if (!taskId) return
    const task = getTask(taskId)
    if (!task) return
    if (task.status === "completed") {
      setTaskId(null)
      void settle(readPackageVersion(task.result) ?? pendingVersion ?? String(Date.now()))
    } else if (task.status === "failed") {
      setTaskId(null)
      setError(task.error ?? t`Packaging failed`)
    }
  }, [taskId, getTask, settle, pendingVersion, t])

  // Fallback completion signal: the task list can miss the transition when the
  // packaging finishes between polls, which would otherwise strand the spinner.
  useEffect(() => {
    if (!pendingVersion || version) return
    if (!packageStatus?.hasAdt || packageStatus.version !== pendingVersion) return
    setTaskId(null)
    void settle(pendingVersion)
  }, [packageStatus?.hasAdt, packageStatus?.version, pendingVersion, version, settle])

  return {
    status: error ? "error" : version ? "ready" : "packaging",
    version,
    error,
    repackage,
  }
}
