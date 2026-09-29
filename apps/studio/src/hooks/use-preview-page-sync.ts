import { useCallback, useEffect, useRef, type RefObject } from "react"

/**
 * Keep a caller's notion of "which page is the preview showing" in step with
 * the reader running inside the iframe.
 *
 * An iframe `load` event only fires for a real document navigation. Served over
 * HTTP the reader turns pages in place — the document survives, so `load` fires
 * once and never again, and anything derived from the preview's current page
 * silently freezes on whichever page it opened with. The reader announces each
 * in-place turn on its own document with `adt:page-changed` instead (the same
 * event the generated SCORM adapter listens for).
 *
 * Returns the handler to pass as the iframe's `onLoad`. Both paths matter and
 * both are wired: `load` still covers hard navigation — the preview's own
 * "go to page" control, and `file://` bundles, which never soft-navigate — and
 * the listener is re-subscribed on every load because a hard navigation
 * replaces the document it was attached to.
 */
export function usePreviewPageSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  sync: () => void,
): () => void {
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const handleLoad = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null

    sync()

    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.addEventListener("adt:page-changed", sync)
    unsubscribeRef.current = () => doc.removeEventListener("adt:page-changed", sync)
  }, [iframeRef, sync])

  useEffect(() => () => unsubscribeRef.current?.(), [])

  return handleLoad
}
