import { useRef, useMemo, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import DOMPurify from "dompurify"

export interface BookPreviewFrameHandle {
  /** Get the iframe element's bounding rect in the viewport */
  getIframeRect: () => DOMRect | null
}

export interface BookPreviewFrameProps {
  html: string
  className?: string
  /** Enable interactive mode — click/edit elements with data-id attributes */
  editable?: boolean
  /** Called when a data-id element is clicked (single click) */
  onSelectElement?: (dataId: string, rect: DOMRect) => void
  /** Called when a text element is edited (blur/Enter after contenteditable) */
  onTextChanged?: (dataId: string, newText: string, fullHtml: string) => void
}

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Loads the iframe shell once (Tailwind CDN + fonts), then swaps body innerHTML
 * when the html prop changes — avoids full-page reloads and the reflow cascade they cause.
 * The section HTML itself contains the <div id="content"> container with styling.
 *
 * When `editable` is true, injects interactive scripts that allow clicking and
 * editing data-id elements, communicating changes back via postMessage.
 *
 * Height measurement is deferred until after fonts settle to prevent the visible
 * "slow collapse" caused by intermediate reflows during font loading.
 */
export const BookPreviewFrame = forwardRef<BookPreviewFrameHandle, BookPreviewFrameProps>(function BookPreviewFrame({
  html,
  className,
  editable = false,
  onSelectElement,
  onTextChanged,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useImperativeHandle(ref, () => ({
    getIframeRect: () => iframeRef.current?.getBoundingClientRect() ?? null,
  }))
  const [height, setHeight] = useState(300)
  const readyRef = useRef(false)
  const latestHtmlRef = useRef("")
  const settledRef = useRef(false)

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
  });

  document.addEventListener('dblclick', function(e) {
    var el = e.target.closest('[data-id]');
    if (el) startEditing(el);
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
    [data-id]:hover { outline: 2px solid rgba(59,130,246,0.3); outline-offset: 2px; }`
    : ""

  // Stable shell — loaded once, never changes
  const srcdoc = useMemo(
    () => `<!DOCTYPE html>
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
    ${interactiveStyles}
  </style>
</head>
<body>
${interactiveScript}
</body>
</html>`,
    [editable]
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

    // Preserve the interactive script if present
    const scriptEl = doc.body.querySelector("script")
    doc.body.innerHTML = newHtml
    if (scriptEl && editable) {
      doc.body.appendChild(scriptEl)
    }

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
      // (only in non-editable mode; editable mode handles keys in the injected script)
      if (!editable) {
        doc.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }))
          }
        })
      }
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
})
