import { useRef, useMemo, useEffect, useState } from "react"
import DOMPurify from "dompurify"

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Loads the iframe shell once (Tailwind CDN + fonts), then swaps body innerHTML
 * when the html prop changes — avoids full-page reloads and the reflow cascade they cause.
 * The section HTML itself contains the <div id="content"> container with styling.
 *
 * Height measurement is deferred until after fonts settle to prevent the visible
 * "slow collapse" caused by intermediate reflows during font loading.
 */
export function BookPreviewFrame({ html, className }: { html: string; className?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(300)
  const readyRef = useRef(false)
  const latestHtmlRef = useRef("")
  const settledRef = useRef(false)

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html])
  latestHtmlRef.current = sanitizedHtml

  // Stable shell — loaded once, never changes
  const srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300..800;1,300..800&display=swap");
    body { margin: 0; }
    body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select {
      font-family: "Merriweather", serif;
    }
  </style>
</head>
<body>
</body>
</html>`

  /** Measure the intrinsic content height of the iframe document. */
  function measureHeight() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    // Temporarily collapse the root element so scrollHeight reflects
    // the intrinsic content height, not the iframe viewport height.
    doc.documentElement.style.height = "0"
    const h = doc.documentElement.scrollHeight
    doc.documentElement.style.height = ""
    if (h > 0) setHeight(h)
  }

  /** Inject HTML into the iframe body, then measure height once fonts are settled. */
  function injectAndMeasure(newHtml: string) {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc?.body) return

    settledRef.current = false
    doc.body.innerHTML = newHtml

    // Wait one frame so the browser queues font loads for the new content,
    // then wait for fonts.ready so we measure the final layout.
    requestAnimationFrame(() => {
      const settle = () => {
        settledRef.current = true
        measureHeight()
      }

      if (doc.fonts?.ready) {
        doc.fonts.ready.then(settle)
      } else {
        settle()
      }
    })
  }

  // When html prop changes, update the body directly (no iframe reload)
  useEffect(() => {
    if (readyRef.current) injectAndMeasure(sanitizedHtml)
  }, [sanitizedHtml])

  // One-time iframe setup
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      // Wait for Tailwind CDN + initial font CSS to load
      const start = () => {
        readyRef.current = true
        injectAndMeasure(latestHtmlRef.current)
      }

      if (doc.fonts?.ready) {
        doc.fonts.ready.then(start)
      } else {
        start()
      }

      // Forward arrow key events to parent so navigation still works
      doc.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }))
        }
      })
    }

    // Re-measure on window resize (e.g. browser resize changes iframe width)
    const onResize = () => {
      if (settledRef.current) measureHeight()
    }
    window.addEventListener("resize", onResize)

    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      window.removeEventListener("resize", onResize)
      readyRef.current = false
    }
  }, [])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      className={className}
      scrolling="no"
      style={{ width: "100%", height, overflow: "hidden" }}
    />
  )
}
