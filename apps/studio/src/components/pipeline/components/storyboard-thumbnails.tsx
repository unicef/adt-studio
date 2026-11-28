import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createStoryboardThumbnailQueue } from "./storyboard-thumbnail-queue"

type Queue = ReturnType<typeof createStoryboardThumbnailQueue>
const ThumbnailContext = createContext<{ queue: Queue; ready: () => void } | null>(null)
const noop = () => {}

/** A navigation gets a fresh token even when returning to a previously visited page. */
export function StoryboardThumbnailProvider({ scopeKey, waitForPreview, children }: {
  scopeKey: string; waitForPreview: boolean; children: ReactNode
}) {
  const [queue] = useState(createStoryboardThumbnailQueue)
  const scope = useMemo(() => ({ scopeKey }), [scopeKey])
  useLayoutEffect(() => { queue.setScope(scope, waitForPreview) }, [queue, scope, waitForPreview])
  const ready = useCallback(() => queue.ready(scope), [queue, scope])
  const value = useMemo(() => ({ queue, ready }), [queue, ready])
  return <ThumbnailContext.Provider value={value}>{children}</ThumbnailContext.Provider>
}

/** Terminal/alternate views release immediately; a main preview calls this after painting. */
export function useStoryboardPreviewReady(noPreview = false) {
  const ready = useContext(ThumbnailContext)?.ready ?? noop
  useEffect(() => { if (noPreview) ready() }, [noPreview, ready])
  return ready
}

export function useStoryboardThumbnail(requestKey: string | null, priority: number) {
  const queue = useContext(ThumbnailContext)?.queue
  const identity = useMemo(() => ({ requestKey, queue }), [requestKey, queue])
  const [admitted, setAdmitted] = useState<{ identity: typeof identity; finish: () => void } | null>(null)
  const ticket = useRef<ReturnType<Queue["enqueue"]> | null>(null)
  useEffect(() => {
    if (!queue || !requestKey) return
    const job = queue.enqueue(priority, finish => setAdmitted({ identity, finish }))
    ticket.current = job
    return () => { job.cancel(); ticket.current = null }
    // Priority changes reorder queued work without restarting an in-flight image.
  }, [queue, identity, requestKey])
  useEffect(() => { ticket.current?.prioritize(priority) }, [priority])
  return {
    enabled: !!requestKey && (!queue || admitted?.identity === identity),
    finish: admitted?.identity === identity ? admitted.finish : noop,
  }
}
