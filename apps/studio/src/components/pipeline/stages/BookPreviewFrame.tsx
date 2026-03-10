import { useRef, useMemo, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import DOMPurify from "dompurify"
import { BASE_URL } from "@/api/client"

// In Tauri, BASE_URL is "http://localhost:3001/api"; extract the origin so the iframe
// can resolve relative image URLs (stored in the DB) via a <base> tag (see Lesson #2).
// Use new URL().origin instead of string slicing — immune to path changes (Lesson #11).
const IFRAME_BASE = BASE_URL.startsWith("http") ? new URL(BASE_URL).origin : ""

/** Build the URL prefix for adt-preview asset routes for the given book. */
function previewAssetsUrl(bookLabel: string): string {
  return `${BASE_URL}/books/${bookLabel}/adt-preview`
}

/** Fixed viewport width the iframe renders at — matches a typical desktop preview.
 *  The iframe is scaled down via CSS transform to fit the actual panel width. */
const RENDER_WIDTH = 1280

export interface BookPreviewFrameHandle {
  /** Get the iframe element's bounding rect in the viewport */
  getIframeRect: () => DOMRect | null
}

export interface BookPreviewFrameProps {
  html: string
  /** Book label — used to load the correct Tailwind CSS and font assets from the API */
  bookLabel: string
  className?: string
  /** Enable interactive mode — click/edit elements with data-id attributes */
  editable?: boolean
  /** data-id values of pruned elements — shown faded/greyed in the preview */
  prunedDataIds?: string[]
  /** Elements that have been edited — shows subtle indicator + original on hover */
  changedElements?: Array<{ dataId: string; originalText?: string }>
  /** Called when a data-id element is clicked (single click) */
  onSelectElement?: (dataId: string, rect: DOMRect) => void
  /** Called when a text element is edited (blur/Enter after contenteditable) */
  onTextChanged?: (dataId: string, newText: string, fullHtml: string) => void
  /** When true (default), applies data-background-color to the iframe body */
  applyBodyBackground?: boolean
}

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Uses the same CSS, fonts, and body layout as the preview so rendering is pixel-identical.
 *
 * The iframe always renders at a fixed desktop-width viewport (RENDER_WIDTH) then
 * scales down via CSS transform to fit the available panel width. This ensures
 * responsive breakpoints, overlay positions, and image sizing match the preview.
 *
 * When `editable` is true, injects interactive scripts that allow clicking and
 * editing data-id elements, communicating changes back via postMessage.
 */
export const BookPreviewFrame = forwardRef<BookPreviewFrameHandle, BookPreviewFrameProps>(function BookPreviewFrame({
  html,
  bookLabel,
  className,
  editable = false,
  prunedDataIds,
  changedElements,
  onSelectElement,
  onTextChanged,
  applyBodyBackground,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getIframeRect: () => iframeRef.current?.getBoundingClientRect() ?? null,
  }))
  const [iframeReady, setIframeReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(800)
  const readyRef = useRef(false)
  const latestHtmlRef = useRef("")
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html])
  latestHtmlRef.current = sanitizedHtml

  // Interactive script injected into the iframe when editable=true
  const interactiveScript = editable
    ? `<script>
(function() {
  var selected = null;
  var editing = null;

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }

  function clearSelection() {
    if (selected) {
      selected.style.outline = '';
      selected.style.outlineOffset = '';
    }
    selected = null;
  }

  function selectElement(el) {
    clearSelection();
    selected = el;
    el.style.outline = '2px solid rgba(59,130,246,0.8)';
    el.style.outlineOffset = '2px';
    var isImg = el.tagName === 'IMG';
    parent.postMessage({
      type: isImg ? 'select-image' : 'select',
      dataId: el.getAttribute('data-id'),
      rect: getRect(el)
    }, '*');
  }

  function startEditing(el) {
    if (el.tagName === 'IMG') return;
    editing = el;
    el.contentEditable = 'true';
    el.style.outline = '2px solid rgba(59,130,246,1)';
    el.style.outlineOffset = '2px';
    el.focus();
    parent.postMessage({ type: 'editing', dataId: el.getAttribute('data-id') }, '*');
  }

  function finishEditing() {
    if (!editing) return;
    var el = editing;
    editing = null;
    el.contentEditable = 'false';
    el.style.outline = '';
    el.style.outlineOffset = '';
    var section = document.querySelector('section');
    var fullHtml;
    if (section) {
      fullHtml = section.outerHTML;
    } else {
      var content = document.getElementById('content');
      fullHtml = content ? content.outerHTML : document.body.innerHTML;
    }
    parent.postMessage({
      type: 'text-changed',
      dataId: el.getAttribute('data-id'),
      newText: el.textContent || '',
      fullHtml: fullHtml
    }, '*');
  }

  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-id]');
    if (!el) {
      if (editing) finishEditing();
      clearSelection();
      parent.postMessage({ type: 'deselect' }, '*');
      return;
    }
    if (editing && editing !== el) finishEditing();
    selectElement(el);
    // Single-click on text enters edit mode immediately; images just select
    if (el.tagName !== 'IMG') startEditing(el);
  });

  document.addEventListener('keydown', function(e) {
    if (editing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishEditing();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        editing.contentEditable = 'false';
        editing.style.outline = '';
        editing.style.outlineOffset = '';
        editing = null;
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    }
  });
})();
<\/script>`
    : ""

  // Interactive hover styles
  const interactiveStyles = editable
    ? `[data-id] { cursor: pointer; transition: outline 0.1s; }
    [data-id]:hover { outline: 2px solid rgba(59,130,246,0.3); outline-offset: 2px; }
    img[data-id] { position: relative; z-index: 1; }`
    : ""

  // Stable shell — loaded once, never changes.
  // Mirrors the preview's renderPageHtml output: same CSS, fonts, body classes.
  const assetsPrefix = previewAssetsUrl(bookLabel)
  const srcdoc = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
  ${IFRAME_BASE ? `<base href="${IFRAME_BASE}">` : ""}
  <meta charset="utf-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <link href="${assetsPrefix}/content/tailwind_output.css" rel="stylesheet">
  <link href="${assetsPrefix}/assets/fonts.css" rel="stylesheet">
  <link href="${assetsPrefix}/assets/libs/fontawesome/css/all.min.css" rel="stylesheet">
  <style>
    ${interactiveStyles}
  </style>
</head>
<body class="min-h-screen flex items-center justify-center">
${interactiveScript}
</body>
</html>`,
    [editable, assetsPrefix]
  )

  // Listen for postMessage from iframe
  const callbacksRef = useRef({ onSelectElement, onTextChanged })
  callbacksRef.current = { onSelectElement, onTextChanged }

  const handleMessage = useCallback((e: MessageEvent) => {
    const iframe = iframeRef.current
    if (!iframe || e.source !== iframe.contentWindow) return
    const { type, dataId, rect, newText, fullHtml } = e.data ?? {}
    if (type === "select" || type === "select-image") {
      callbacksRef.current.onSelectElement?.(dataId, rect)
    } else if (type === "text-changed") {
      callbacksRef.current.onTextChanged?.(dataId, newText, fullHtml)
    } else if (type === "deselect") {
      callbacksRef.current.onSelectElement?.("", {} as DOMRect)
    }
  }, [])

  useEffect(() => {
    if (!editable) return
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [editable, handleMessage])

  /** Measure the intrinsic content height of the iframe document. */
  function measureHeight() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    const h = doc.body.scrollHeight
    if (h > 0) setContentHeight(h)
  }

  /** Inject HTML into the iframe body (preserving the interactive script). */
  function injectContent(newHtml: string) {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc?.body) return

    // Preserve the interactive script if present
    const scriptEl = doc.body.querySelector("script")
    // Wrap in the same <div id="content"> wrapper that renderPageHtml uses
    // in the preview. This matters because the body is display:flex and the
    // wrapper acts as a block-level flex child around the section HTML.
    doc.body.innerHTML = `<div id="content">${newHtml}</div>`
    if (scriptEl && editable) {
      doc.body.appendChild(scriptEl)
    }

    // Apply data-background-color from content to iframe body
    if (applyBodyBackground !== false) {
      const bgEl = doc.querySelector("[data-background-color]")
      doc.body.style.backgroundColor = bgEl?.getAttribute("data-background-color") ?? ""
    } else {
      doc.body.style.backgroundColor = ""
    }

    // Measure after fonts + images settle
    requestAnimationFrame(() => {
      measureHeight()
      if (doc.fonts?.ready) {
        doc.fonts.ready.then(measureHeight)
      }
    })

    doc.querySelectorAll("img").forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", measureHeight, { once: true })
        img.addEventListener("error", measureHeight, { once: true })
      }
    })

    if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
    measureTimerRef.current = setTimeout(measureHeight, 500)
  }

  // When html prop changes, update the body directly (no iframe reload)
  useEffect(() => {
    if (readyRef.current) injectContent(sanitizedHtml)
  }, [sanitizedHtml, applyBodyBackground])

  // Inject/update pruned element styles into the iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const styleId = "adt-pruned-styles"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
    if (!prunedDataIds?.length) {
      styleEl?.remove()
      return
    }
    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }
    const selectors = prunedDataIds.map((id) => `[data-id="${id}"]`).join(",\n")
    styleEl.textContent = `${selectors} { opacity: 0.3; filter: grayscale(1); transition: opacity 0.3s, filter 0.3s; }`
  }, [prunedDataIds, iframeReady])

  // Inject/update changed-element indicators + hover tooltips
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const styleId = "adt-changed-styles"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null

    // Clean up previous title attributes
    doc.querySelectorAll("[data-adt-changed]").forEach((el) => {
      el.removeAttribute("title")
      el.removeAttribute("data-adt-changed")
    })

    if (!changedElements?.length) {
      styleEl?.remove()
      return
    }

    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }

    const selectors = changedElements.map((c) => `[data-id="${c.dataId}"]`).join(",\n")
    styleEl.textContent = `
${selectors} {
  position: relative;
  box-shadow: -3px 0 0 0 rgba(245, 158, 11, 0.6);
  transition: box-shadow 0.3s;
}
${selectors}:hover {
  box-shadow: -3px 0 0 0 rgba(245, 158, 11, 1);
}`

    // Set title attribute on changed elements for native hover tooltip
    for (const { dataId, originalText } of changedElements) {
      const el = doc.querySelector(`[data-id="${dataId}"]`)
      if (el && originalText) {
        el.setAttribute("data-adt-changed", "true")
        const preview = originalText.length > 120 ? originalText.slice(0, 120) + "…" : originalText
        el.setAttribute("title", `Original: ${preview}`)
      } else if (el) {
        el.setAttribute("data-adt-changed", "true")
      }
    }
  }, [changedElements, iframeReady])

  // Compute scale factor when wrapper resizes
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const availableWidth = entry.contentRect.width
      setScale(Math.min(1, availableWidth / RENDER_WIDTH))
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  // One-time iframe setup
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      const start = () => {
        readyRef.current = true
        setIframeReady(true)
        injectContent(latestHtmlRef.current)
      }

      if (doc.fonts?.ready) {
        doc.fonts.ready.then(start)
      } else {
        start()
      }

      // Forward arrow key events to parent so navigation still works
      // (only in non-editable mode; editable mode handles keys in the injected script)
      if (!editable) {
        doc.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }))
          }
        })
      }
    }

    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
      readyRef.current = false
      setIframeReady(false)
    }
  }, [])

  const scaledHeight = contentHeight * scale

  return (
    <div ref={wrapperRef} className={className} style={{ height: scaledHeight, overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        scrolling="no"
        style={{
          width: RENDER_WIDTH,
          height: contentHeight,
          border: "none",
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      />
    </div>
  )
})
