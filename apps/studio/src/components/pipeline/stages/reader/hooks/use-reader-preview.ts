import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ReaderUi } from "@adt/types"
import { api, getAdtUrl } from "@/api/client"
import { usePackageAdtStatus } from "@/hooks/use-books"
import { useBookTasks } from "@/hooks/use-book-tasks"

/** Wire protocol with `apps/adt-runtime/src/features/reader-ui/runtime/reader-ui.ts`. */
const READER_UI_MESSAGE = "adt-studio/reader-ui"
const READER_UI_READY = "adt-runtime/reader-ui-ready"

export type ReaderPreviewState = "packaging" | "ready" | "error"

export interface ReaderPreview {
  state: ReaderPreviewState
  error: string | null
  src: string | null
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onLoad: () => void
  repackage: () => void
}

/**
 * The packaged book, shown in an iframe with the editor's draft pushed into
 * its runtime over `postMessage` — every change appears at once, no repackage.
 *
 * Packaging runs once on mount, like the Preview step: on an unchanged book it
 * is a cache hit that returns immediately, and it guarantees the iframe runs a
 * runtime new enough to listen for the draft.
 */
export function useReaderPreview(bookLabel: string, draft: ReaderUi, enabled: boolean): ReaderPreview {
  const queryClient = useQueryClient()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const draftRef = useRef(draft)
  const ranRef = useRef(false)
  const [state, setState] = useState<ReaderPreviewState>("packaging")
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)
  const { getTask } = useBookTasks(bookLabel)
  const { data: status } = usePackageAdtStatus(bookLabel, {
    refetchInterval: pendingVersion ? 1_000 : false,
  })

  const finish = useCallback(
    (next: string) => {
      setPendingTaskId(null)
      setPendingVersion(null)
      setVersion(next)
      setState("ready")
      void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] })
    },
    [bookLabel, queryClient],
  )

  const repackage = useCallback(async () => {
    setState("packaging")
    setError(null)
    try {
      const result = await api.packageAdt(bookLabel)
      const nextVersion = result.version ?? String(Date.now())
      if (result.taskId) {
        setPendingTaskId(result.taskId)
        setPendingVersion(nextVersion)
      } else {
        await queryClient.invalidateQueries({ queryKey: ["package-adt-status", bookLabel] })
        finish(nextVersion)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState("error")
    }
  }, [bookLabel, finish, queryClient])

  useEffect(() => {
    if (!enabled || ranRef.current) return
    ranRef.current = true
    void repackage()
  }, [enabled, repackage])

  // Finish on whichever arrives first: the task's completion or the status
  // endpoint reporting the new build.
  useEffect(() => {
    if (!pendingTaskId) return
    const task = getTask(pendingTaskId)
    if (task?.status === "failed") {
      setPendingTaskId(null)
      setPendingVersion(null)
      // Without a message from the task the frame shows its own fallback.
      setError(task.error ?? null)
      setState("error")
    } else if (task?.status === "completed" && pendingVersion) {
      finish(pendingVersion)
    }
  }, [finish, getTask, pendingTaskId, pendingVersion])

  useEffect(() => {
    if (!pendingVersion || !status?.hasAdt || status.version !== pendingVersion) return
    finish(pendingVersion)
  }, [finish, pendingVersion, status?.hasAdt, status?.version])

  const send = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: READER_UI_MESSAGE, readerUi: draftRef.current },
      "*",
    )
  }, [])

  // Push every edit. The ref is what the ready handshake and onLoad read.
  useEffect(() => {
    draftRef.current = draft
    if (state === "ready") send()
  }, [draft, send, state])

  // The runtime announces itself once booted (also after every navigation
  // inside the preview); answer with the current draft.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as { type?: unknown } | null
      if (data?.type === READER_UI_READY) send()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [send])

  return {
    state,
    error,
    src: version ? `${getAdtUrl(bookLabel)}/v-${version}/` : null,
    iframeRef,
    onLoad: send,
    repackage: () => void repackage(),
  }
}
