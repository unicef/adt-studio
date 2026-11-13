import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"
import {
  previewBridgeReaderMessageSchema,
  type PreviewBridgePage,
  type PreviewBridgeStudioMessage,
  type PreviewHighlightSeverity,
} from "@adt/types"

/**
 * Studio's half of the preview channel (`@adt/types` `preview-bridge`; the
 * reader's half is `apps/adt-runtime/src/app/preview-bridge.ts`).
 *
 * The preview iframe runs book content, which the desktop app keeps on another
 * origin, so its document is never read from here. The reader announces each page it opens,
 * on boot and after every in-place page turn, and `onPage` receives it. The
 * returned functions ask the reader to outline elements or open another page.
 *
 * `highlight` is called on every pointer move over a finding, so it only posts
 * when the outline would change. What the reader shows is tracked from both
 * sides: a page turn, or the pointer entering the preview, makes the reader
 * drop its outline and say so, and hovering the same finding then outlines it
 * again.
 *
 * Only messages from this iframe's window and from the preview's own origin
 * are accepted, and requests are posted to that origin alone.
 */
export function usePreviewBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  previewSrc: string,
  onPage: (page: PreviewBridgePage) => void,
): {
  highlight: (targets: string[], severity: PreviewHighlightSeverity) => void
  navigate: (href: string) => void
} {
  const previewOrigin = useMemo(() => resolvePreviewOrigin(previewSrc), [previewSrc])
  const onPageRef = useRef(onPage)
  onPageRef.current = onPage
  const outlineRef = useRef<string | null>(null)

  useEffect(() => {
    if (!previewOrigin) return
    const handler = (event: MessageEvent): void => {
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || event.source !== frameWindow) return
      if (event.origin !== previewOrigin) return
      const parsed = previewBridgeReaderMessageSchema.safeParse(event.data)
      if (!parsed.success) return
      outlineRef.current = null
      if (parsed.data.type === "adt-preview/page") onPageRef.current(parsed.data.page)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [iframeRef, previewOrigin])

  const post = useCallback((message: PreviewBridgeStudioMessage) => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow || !previewOrigin) return
    frameWindow.postMessage(message, previewOrigin)
  }, [iframeRef, previewOrigin])

  const highlight = useCallback((targets: string[], severity: PreviewHighlightSeverity) => {
    const outline = targets.length > 0 ? JSON.stringify([targets, severity]) : null
    if (outline !== null && outline === outlineRef.current) return
    outlineRef.current = outline
    post({ type: "adt-preview/highlight", targets, severity })
  }, [post])
  const navigate = useCallback(
    (href: string) => post({ type: "adt-preview/navigate", href }),
    [post],
  )

  return { highlight, navigate }
}

function resolvePreviewOrigin(previewSrc: string): string | null {
  try {
    return new URL(previewSrc, window.location.href).origin
  } catch {
    return null
  }
}
