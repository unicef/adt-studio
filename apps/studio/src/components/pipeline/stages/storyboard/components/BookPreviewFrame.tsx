import { useRef, useMemo, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import DOMPurify from "dompurify"
import { BASE_URL, getBookFontFileUrl } from "@/api/client"
import { useBookFonts } from "@/hooks/use-book-fonts"
import type { DeviceView } from "./style-editor/device-breakpoint"
import {
  getDeviceFrame,
  getTargetVisibleWidth,
} from "./style-editor/device-chrome"
import { IPhoneFrame } from "./style-editor/device-frames/iphone-frame"
import { IPadFrame } from "./style-editor/device-frames/ipad-frame"
import {
  demoteFirstHeadingIfPromoted,
  promoteFirstHeadingToH1,
  reconstructHtmlWithEdit,
  removeElementFromSourceHtml,
  serializeContentWrapper,
} from "./iframe-html"
import {
  type ComputedTypographyStyles,
  lineHeightToMultiplier,
  normalizeTextAlign,
  parsePx,
  rgbToHex,
  weightToToken,
} from "./iframe-computed-styles"
import { INTERACTIVE_SCRIPT, INTERACTIVE_STYLES } from "./iframe-interactive"
import {
  anchorKey,
  anchorSelector,
  parseAnchor,
  parseAnchorKey,
  resolveVisibleTarget,
  type ActivityAnchor,
} from "./activity-link"
import { primaryFontFamily, googleFontsCss2Url, FIXED_LAYOUT_MAX_SCALE } from "@adt/types"

export type { ComputedTypographyStyles }

// In Desktop version, BASE_URL is "http://localhost:3001/api"; extract the origin so the iframe
// can resolve relative image URLs (stored in the DB) via a <base> tag (see Lesson #2).
// Use new URL().origin instead of string slicing — immune to path changes (Lesson #11).
const IFRAME_BASE = BASE_URL.startsWith("http") ? new URL(BASE_URL).origin : ""

/** Build the URL prefix for adt-preview asset routes for the given book. */
function previewAssetsUrl(bookLabel: string): string {
  return `${BASE_URL}/books/${bookLabel}/adt-preview`
}

/** Default render-width when no `width` prop is supplied — matches a typical
 *  desktop preview. The iframe is scaled down via CSS transform to fit the
 *  actual panel width. */
const DEFAULT_RENDER_WIDTH = 1280

const TRANSIENT_ATTRS = [
  "data-adt-selected",
  "data-adt-editing",
  "data-adt-linked",
  "data-adt-preview",
  "data-adt-link-hover",
  "contenteditable",
] as const

function stripTransientAttributes(doc: Document): void {
  doc.querySelectorAll(TRANSIENT_ATTRS.map((a) => `[${a}]`).join(", ")).forEach((el) => {
    for (const attr of TRANSIENT_ATTRS) el.removeAttribute(attr)
  })
}

/** Parse a pixel value (e.g. "612px") to a number, or null for non-px values. */
function parsePxStyle(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  return match ? parseFloat(match[1]) : null
}

export interface BookPreviewFrameHandle {
  /** Get the iframe element's bounding rect in the viewport */
  getIframeRect: () => DOMRect | null
  /** Regenerate Tailwind CSS including the given extra HTML, then inject into iframe.
   *  Use after AI edits introduce new Tailwind classes not yet in the DB. */
  refreshCss: (extraHtml: string) => Promise<void>
  /** Read the Tailwind classes on an element by data-id */
  getElementClasses: (dataId: string) => string[]
  /** Set the full class list on an element by data-id. Returns updated full HTML, or null. */
  setElementClasses: (dataId: string, classes: string[]) => string | null
  /** Set (or remove, when value is empty) a single inline CSS property on an
   *  element by data-id. Returns updated full HTML, or null. Used for styling
   *  that must win over class/cascade rules (e.g. per-element font-family). */
  setElementStyleProp: (dataId: string, property: string, value: string) => string | null
  /** Resolve an iframe element by data-id, remove its counterpart from the
   *  unsanitized source HTML, and mirror the removal in the live DOM. Returns
   *  the updated source HTML plus the real (non-transient) data-ids found in
   *  the removed subtree, or null when the element cannot be resolved safely.
   *  Needed for containers whose transient `_el#` id exists only in the live
   *  iframe. The reported ids let the caller drop matching sectioning leaves. */
  removeElement: (dataId: string) => { html: string; removedDataIds: string[] } | null
  /** Re-inject the current `html` prop into the iframe, discarding any in-iframe
   *  DOM mutations (e.g. live `setElementClasses` edits). Used when the parent
   *  wants to revert to the saved state without changing the html prop. */
  resetContent: () => void
  /** Read the iframe's getComputedStyle for the inheritable text properties
   *  used by the Typography inspector. Returns nulls when the element isn't
   *  in the iframe yet or a value can't be parsed. */
  getComputedTypographyStyles: (dataId: string) => ComputedTypographyStyles
  getAnchorViewportRect: (anchor: ActivityAnchor) => DOMRect | null
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
  /** Called when a data-id element is clicked (single click).
   *  tagName is provided for container elements (div, section, etc.) that don't have a pre-existing data-id. */
  onSelectElement?: (dataId: string, rect: DOMRect, tagName?: string) => void
  /** Called when a text element is edited (blur/Enter after contenteditable) */
  onTextChanged?: (dataId: string, newText: string, fullHtml: string) => void
  /** When true (default), applies data-background-color to the iframe body */
  applyBodyBackground?: boolean
  /** data-id of the currently selected element; re-applied after each body rebuild. */
  selectedDataId?: string | null
  /** Inner viewport width the iframe renders at; the wrapper scales it to fit. */
  renderWidth?: number
  /** Optional visible-height cap. The complete page/device frame scales down
   *  to fit instead of introducing a scroll region. */
  maxVisibleHeight?: number
  /** When set, draws device chrome (bezel + rounded corners) around the iframe. */
  deviceView?: DeviceView
  /** Reports the iframe's current on-screen width in CSS pixels (renderWidth × scale).
   *  Updates whenever the canvas resizes — useful for showing the active viewport size. */
  onVisibleWidthChange?: (width: number) => void
  /** Link mode — clicks resolve to an activity anchor and are reported via
   *  `onLinkSelect` instead of opening the inline editor. Mutually exclusive
   *  with `editable`; the page becomes a click-to-locate map. */
  linkMode?: boolean
  /** Anchor to outline solid — the editor's committed selection. */
  linkedAnchor?: ActivityAnchor | null
  /** Anchor to outline dashed — a transient preview (the editor's pointer is
   *  over the matching field). Ignored when it equals `linkedAnchor`. */
  previewAnchor?: ActivityAnchor | null
  /** Fired when an element is clicked in link mode; null when the click
   *  landed on nothing addressable. */
  onLinkSelect?: (anchor: ActivityAnchor | null) => void
  /** Fired as the pointer crosses addressable elements in link mode. Purely a
   *  preview signal — the consumer decides whether to act on it. */
  onLinkHover?: (anchor: ActivityAnchor | null) => void
  /** Resolved reflowable base-font CSS chain (e.g. `'Atkinson
   *  Hyperlegible','Merriweather',sans-serif`). When set, the shell loads the
   *  family from Google Fonts and overrides the global Merriweather, matching
   *  packaged output. Omit for fixed-layout (keeps per-span fonts). */
  bodyFontFamily?: string
  /** Fires once the iframe has loaded, fonts are ready, and content injected —
   *  useful for revealing the frame after a loading skeleton. */
  onReady?: () => void
  /** Lightweight read-only mode for tiny previews: don't block first paint on
   *  web-font loading and skip LaTeX→MathML conversion. Approximate but fast. */
  thumbnail?: boolean
  /** Recompile Tailwind for this frame's own HTML once ready, so a version
   *  whose classes aren't in the shared tailwind_output.css still renders
   *  correctly. Needed for accurate version previews (adds one CSS request). */
  autoRefreshCss?: boolean
}

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Uses the same CSS, fonts, and body layout as the preview so rendering is pixel-identical.
 *
 * The iframe renders reflowable content at a fixed desktop-width viewport
 * (DEFAULT_RENDER_WIDTH) — fixed-layout pages render at their own pixel
 * dimensions — then scales via CSS transform to fit the available panel width. This ensures
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
  selectedDataId,
  renderWidth = DEFAULT_RENDER_WIDTH,
  maxVisibleHeight,
  deviceView,
  onVisibleWidthChange,
  linkMode = false,
  linkedAnchor,
  previewAnchor,
  onLinkSelect,
  onLinkHover,
  bodyFontFamily,
  onReady,
  thumbnail = false,
  autoRefreshCss = false,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const refreshIdRef = useRef(0)

  const assetsPrefix = previewAssetsUrl(bookLabel)

  // Recompile Tailwind for the given HTML and inject the result, so classes not
  // present in the static tailwind_output.css (e.g. classes unique to another
  // version) still get styled. Called imperatively by the live editor, and
  // self-triggered by preview frames via `autoRefreshCss`.
  const refreshCssInternal = useCallback(async (extraHtml: string, signal?: AbortSignal) => {
    const id = ++refreshIdRef.current
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const res = await fetch(`${assetsPrefix}/content/tailwind_output.css`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraHtml }),
      signal,
    })
    if (id !== refreshIdRef.current || !res.ok) return
    const css = await res.text()
    if (id !== refreshIdRef.current) return
    const styleId = "adt-dynamic-css"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }
    styleEl.textContent = css
    // Resolve only after the post-CSS height is measured, so callers that
    // reveal on completion (autoRefreshCss) don't flash a pre-reflow layout.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        const main = doc.querySelector("main")
        const h = (main ?? doc.body)?.scrollHeight
        if (h && h > 0) setContentHeight(h)
        resolve()
      })
    )
  }, [assetsPrefix])

  useImperativeHandle(ref, () => ({
    getIframeRect: () => iframeRef.current?.getBoundingClientRect() ?? null,
    refreshCss: refreshCssInternal,
    getElementClasses: (dataId: string): string[] => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return []
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return []
      return Array.from(el.classList)
    },
    setElementClasses: (dataId: string, classes: string[]): string | null => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return null
      el.className = classes.join(" ")
      // Don't strip `_el#` data-ids here — the inspector relies on them across
      // edits in a session. They're stripped only at API persist time.
      stripTransientAttributes(doc)
      const wrapper = doc.getElementById("content")
      const html = wrapper ? serializeContentWrapper(wrapper) : doc.body.innerHTML
      el.setAttribute("data-adt-selected", "true")
      return demoteFirstHeadingIfPromoted(html, sanitizedHtmlRef.current)
    },
    setElementStyleProp: (dataId: string, property: string, value: string): string | null => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return null
      if (value) el.style.setProperty(property, value)
      else el.style.removeProperty(property)
      stripTransientAttributes(doc)
      const wrapper = doc.getElementById("content")
      const html = wrapper ? serializeContentWrapper(wrapper) : doc.body.innerHTML
      el.setAttribute("data-adt-selected", "true")
      return demoteFirstHeadingIfPromoted(html, sanitizedHtmlRef.current)
    },
    removeElement: (dataId: string): { html: string; removedDataIds: string[] } | null => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return null
      const liveRoot = doc.getElementById("content") ?? doc.body
      const removed = removeElementFromSourceHtml(sourceHtmlRef.current, liveRoot, el)
      if (!removed) return null
      el.remove()
      stripTransientAttributes(doc)
      return removed
    },
    resetContent: () => {
      if (readyRef.current) injectContent(latestHtmlRef.current)
    },
    getComputedTypographyStyles: (dataId: string): ComputedTypographyStyles => {
      const empty: ComputedTypographyStyles = {
        fontSize: null,
        color: null,
        fontWeight: null,
        lineHeight: null,
        textAlign: null,
        fontFamily: null,
        inlineFontFamily: null,
      }
      const doc = iframeRef.current?.contentDocument
      const win = doc?.defaultView
      if (!doc || !win) return empty
      const el = doc.querySelector(
        `[data-id="${CSS.escape(dataId)}"]`,
      ) as HTMLElement | null
      if (!el) return empty
      const s = win.getComputedStyle(el)
      const fontSize = parsePx(s.fontSize)
      // The font is declared on the inner styled run(s) (fixed-layout
      // `data-segments` spans), not the paragraph itself — so walk into the
      // first descendant that carries a font-family and read its resolved
      // family. Fall back to the element's own computed family.
      const fontEl =
        (el.querySelector('[style*="font-family"]') as HTMLElement | null) ?? el
      const family = primaryFontFamily(win.getComputedStyle(fontEl).fontFamily)
      const inlineFamily = primaryFontFamily(fontEl.style.fontFamily || el.style.fontFamily || "")
      return {
        fontSize,
        color: rgbToHex(s.color),
        fontWeight: weightToToken(s.fontWeight),
        lineHeight: lineHeightToMultiplier(s.lineHeight, fontSize),
        textAlign: normalizeTextAlign(s.textAlign),
        fontFamily: family || null,
        inlineFontFamily: inlineFamily || null,
      }
    },
    getAnchorViewportRect: (anchor: ActivityAnchor): DOMRect | null => {
      const doc = iframeRef.current?.contentDocument
      const iframeRect = iframeRef.current?.getBoundingClientRect()
      if (!doc || !iframeRect) return null
      const el = doc.querySelector(anchorSelector(anchor))
      if (!el) return null
      const r = resolveVisibleTarget(el).getBoundingClientRect()
      return new DOMRect(
        iframeRect.left + r.left * scale,
        iframeRect.top + r.top * scale,
        r.width * scale,
        r.height * scale,
      )
    },
  }))
  const [iframeReady, setIframeReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(800)
  /**
   * When the page is fixed-layout, `#content` has explicit pixel width/height
   * (viewport coords from the renderer). Scaling off these instead of the
   * fixed `DEFAULT_RENDER_WIDTH` makes the content fill the available preview area.
   * `referenceWidth` is the book-wide widest page (a full spread in spread
   * mode), stamped on `#content` as `data-fl-reference-width`; scaling off it
   * — rather than this page's own width — keeps every page at one uniform
   * scale, so a single cover/end page renders centered at half-width instead
   * of being upscaled 2× to fill the panel. Falls back to the page's own
   * width when the attribute is absent (older content / ad-hoc renders).
   * null for reflowable pages.
   */
  const [fixedLayoutSize, setFixedLayoutSize] = useState<{ width: number; height: number; referenceWidth: number } | null>(null)
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_RENDER_WIDTH)
  const readyRef = useRef(false)
  const latestHtmlRef = useRef("")
  const sourceHtmlRef = useRef("")
  const sanitizedHtmlRef = useRef("")
  const originalTextsRef = useRef<Record<string, string>>({})
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(html, { FORBID_ATTR: ["contenteditable"] }),
    [html],
  )
  // Convert LaTeX to MathML for display via the API — the underlying data stays as LaTeX.
  // Start with sanitized HTML immediately, then update when the API responds.
  const [displayHtml, setDisplayHtml] = useState(sanitizedHtml)
  useEffect(() => {
    setDisplayHtml(sanitizedHtml)
    if (thumbnail) return // skip math conversion round-trip for tiny previews
    let cancelled = false
    fetch(`${assetsPrefix}/convert-math`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: sanitizedHtml }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { html: string } | null) => {
        if (!cancelled && data?.html && data.html !== sanitizedHtml) {
          setDisplayHtml(data.html)
        }
      })
      .catch(() => {}) // fallback: display without math conversion
    return () => { cancelled = true }
  }, [sanitizedHtml, assetsPrefix, thumbnail])
  latestHtmlRef.current = displayHtml
  sourceHtmlRef.current = html
  sanitizedHtmlRef.current = sanitizedHtml

  // Build a map of data-id → original LaTeX innerHTML so the iframe can swap
  // MathML back to LaTeX when the user clicks to edit an element.
  useMemo(() => {
    const map: Record<string, string> = {}
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${sanitizedHtml}</div>`, "text/html")
    doc.querySelectorAll("[data-id]").forEach((el) => {
      const id = el.getAttribute("data-id")
      if (id) map[id] = el.innerHTML
    })
    originalTextsRef.current = map
  }, [sanitizedHtml])

  // Auto-fit script — loaded by URL from the shared assets/adt/auto-fit.js
  // so studio storyboard, packaged-book pages, and PreviewView all run
  // the same code. (We can't inline a per-page script in storyboard
  // anyway because DOMPurify strips the <script> tags before innerHTML
  // injection.) The shared script exposes window.__adtRunAutoFit so
  // injectContent can trigger another pass after content swaps.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const autoFitScript = `<script src="${assetsPrefix}/assets/auto-fit.js"></script>`
  const { data: bookFontsData } = useBookFonts(bookLabel)
  // Attached book fonts are injected into the live iframe head by an effect
  // below — NOT baked into `srcdoc` — so attaching a font (which refetches this
  // data) doesn't change `srcdoc` and reload the iframe. A reload would discard
  // unsaved in-iframe edits, e.g. a just-applied per-element font.
  const bookGoogleFontsUrl = useMemo(
    () =>
      googleFontsCss2Url(
        (bookFontsData?.fonts ?? [])
          .filter((f) => f.source === "google")
          .map((f) => f.family),
      ),
    [bookFontsData],
  )
  const bookUploadFacesCss = useMemo(() => {
    /* eslint-disable lingui/no-unlocalized-strings -- CSS, not user-visible text */
    return (bookFontsData?.fonts ?? [])
      .filter((f) => f.source === "upload")
      .flatMap((f) =>
        f.faces.map(
          (face) => `@font-face {
  font-family: ${JSON.stringify(f.family)};
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url(${JSON.stringify(getBookFontFileUrl(bookLabel, f.id, face.file))});
  ${face.unicodeRange ? `unicode-range: ${face.unicodeRange};` : ""}
}`,
        ),
      )
      .join("\n")
    /* eslint-enable lingui/no-unlocalized-strings */
  }, [bookFontsData, bookLabel])
  // Reflowable base-font override: load the family from Google Fonts and
  // re-declare the global element font (last in <head> so it wins over
  // fonts.css's Merriweather rule). Mirrors renderPageHtml's injection so the
  // preview matches packaged output. Omitted for fixed-layout (no prop).
  const fontOverride = useMemo(() => {
    if (!bodyFontFamily) return ""
    const url = googleFontsCss2Url([primaryFontFamily(bodyFontFamily)])
    const link = url ? `\n  <link href="${url}" rel="stylesheet">` : ""
    // eslint-disable-next-line lingui/no-unlocalized-strings
    return `${link}\n  <style>\n    body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select { font-family: ${bodyFontFamily}; }\n  </style>`
  }, [bodyFontFamily])
  // Stable shell — loaded once, never changes.
  // Mirrors the preview's renderPageHtml output: same CSS, fonts, body classes.
  const srcdoc = useMemo(
    // eslint-disable-next-line lingui/no-unlocalized-strings
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
    ${INTERACTIVE_STYLES}
  </style>${fontOverride}
</head>
<body class="min-h-screen flex items-center justify-center">
${INTERACTIVE_SCRIPT}
${autoFitScript}
</body>
</html>`,
    // autoFitScript embeds assetsPrefix; INTERACTIVE_SCRIPT/INTERACTIVE_STYLES
    // are stable module constants. Re-memoise when the prefix (auto-fit URL) or
    // the reflowable font override changes. Attached book fonts are injected
    // dynamically (see effect below), so they intentionally don't reload here.
    [assetsPrefix, autoFitScript, fontOverride]
  )

  // Listen for postMessage from iframe
  const callbacksRef = useRef({ onSelectElement, onTextChanged, onLinkSelect, onLinkHover })
  callbacksRef.current = { onSelectElement, onTextChanged, onLinkSelect, onLinkHover }

  const handleMessage = useCallback((e: MessageEvent) => {
    const iframe = iframeRef.current
    if (!iframe || e.source !== iframe.contentWindow) return
    const data = e.data ?? {}
    if (typeof data !== "object" || !data.type) return
    const { type, dataId, rect, newText, editedInnerHtml, tagName, kind, id } = data
    if (type === "link-select") {
      callbacksRef.current.onLinkSelect?.(parseAnchor(kind, id))
    } else if (type === "link-hover") {
      callbacksRef.current.onLinkHover?.(parseAnchor(kind, id))
    } else if (type === "select" || type === "select-image" || type === "select-container") {
      callbacksRef.current.onSelectElement?.(dataId, rect, tagName)
    } else if (type === "text-changed") {
      // Splice the edited element's innerHTML into the original LaTeX-form HTML
      // so the edited element keeps the styled child spans contentEditable
      // preserved (e.g. fixed-layout colour runs), while non-edited siblings
      // stay in LaTeX form (not MathML). Drop the edit if reconstruction fails
      // — the iframe's rendered MathML must never reach persistence.
      const reconstructed = reconstructHtmlWithEdit(
        sanitizedHtmlRef.current,
        dataId,
        editedInnerHtml ?? newText,
      )
      if (reconstructed === null) {
        console.warn(
          `[adt] Text edit dropped for data-id=${dataId} — could not reconstruct from source HTML.`,
        )
        return
      }
      callbacksRef.current.onTextChanged?.(dataId, newText, reconstructed)
    } else if (type === "deselect") {
      callbacksRef.current.onSelectElement?.("", {} as DOMRect)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [handleMessage])

  /** Measure the intrinsic content height of the iframe document. We measure
   *  the inner <main> rather than <body> because the body uses `min-h-screen`
   *  + flex centering for desktop layout, which inflates body.scrollHeight to
   *  the iframe viewport even when the actual content is shorter. */
  function measureHeight() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    // Fixed-layout detection: `#content` with explicit pixel width + height.
    // Our fixed-layout renderer emits `<div id="content" style="...width:Wpx;height:Hpx...">`.
    const contentEl = doc.getElementById("content") as HTMLElement | null
    const styleW = contentEl ? parsePxStyle(contentEl.style.width) : null
    const styleH = contentEl ? parsePxStyle(contentEl.style.height) : null
    if (contentEl && styleW !== null && styleH !== null) {
      const refRaw = contentEl.dataset.flReferenceWidth
      const ref = refRaw ? parseFloat(refRaw) : NaN
      const referenceWidth = Number.isFinite(ref) && ref > 0 ? ref : styleW
      setFixedLayoutSize({ width: styleW, height: styleH, referenceWidth })
      return
    }

    setFixedLayoutSize(null)
    const main = doc.querySelector("main")
    const h = (main ?? doc.body).scrollHeight
    if (h > 0) setContentHeight(h)
  }

  /** Inject HTML into the iframe body (preserving the interactive script). */
  function injectContent(newHtml: string) {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc?.body) return

    // Preserve the interactive + auto-fit shell scripts. They were
    // injected once into the srcdoc body and would be wiped when we
    // replace innerHTML below; the appended copies don't re-execute
    // (script re-insertion doesn't run them) but they keep the DOM
    // structure consistent with what the shell expects.
    const scriptEls = Array.from(doc.body.querySelectorAll("script"))
    const normalizedHtml = promoteFirstHeadingToH1(newHtml)
    // Mirror the packaged page shell closely: a page-level <main> containing
    // either the existing #content wrapper or a generated one.
    const hasOwnMain = /^\s*<main\b/.test(normalizedHtml)
    const hasOwnWrapper = /^\s*<div\b[^>]*\bid="content"/.test(normalizedHtml)
    const contentHtml = hasOwnWrapper ? normalizedHtml : `<div id="content">${normalizedHtml}</div>`
    doc.body.innerHTML = hasOwnMain ? normalizedHtml : `<main class="w-full">${contentHtml}</main>`
    for (const s of scriptEls) {
      doc.body.appendChild(s)
    }

    // Inject original LaTeX texts so startEditing can swap MathML → LaTeX
    const textsEl = doc.createElement("script")
    textsEl.id = "adt-original-texts"
    textsEl.textContent = `window.__origTexts=${JSON.stringify(originalTextsRef.current)};`
    doc.body.appendChild(textsEl)

    // Apply data-background-color from content to iframe body
    if (applyBodyBackground !== false) {
      const bgEl = doc.querySelector("[data-background-color]")
      doc.body.style.backgroundColor = bgEl?.getAttribute("data-background-color") ?? ""
    } else {
      doc.body.style.backgroundColor = ""
    }

    // Force synchronous reflow so the browser repaints the scaled iframe
    // immediately after innerHTML changes (fixes delayed style rendering).
    void doc.body.offsetHeight

    // Trigger the shell-level auto-fit on the freshly injected content.
    // The function was defined once when the iframe shell loaded; we call
    // it via rAF so layout for the new innerHTML has flushed.
    //
    // We need TWO passes (mirroring auto-fit.js's own initial-load schedule):
    //   1. Immediately after layout, in case fonts are already loaded.
    //   2. After document.fonts.ready resolves for the just-injected content.
    //
    // The shell parses with an empty body, so its first fonts.ready resolves
    // *before* any text is on the page — auto-fit.js's own post-fonts-ready
    // hook therefore runs against an empty body and never re-fires for the
    // injected content. Without the explicit second pass here, auto-fit
    // measures against fallback-font metrics (Times for Palatino, etc.) and
    // shrinks paragraphs that fit fine in the actual rendered font.
    const runFit = () => {
      const w = iframe?.contentWindow as (Window & { __adtRunAutoFit?: () => void }) | null
      if (typeof w?.__adtRunAutoFit !== "function") {
        // eslint-disable-next-line no-console, lingui/no-unlocalized-strings
        console.warn("[BookPreviewFrame] __adtRunAutoFit is not defined on iframe contentWindow — auto-fit script did not load/execute. assetsPrefix:", assetsPrefix)
        return
      }
      w.__adtRunAutoFit()
    }
    requestAnimationFrame(runFit)
    if (doc.fonts?.ready) {
      doc.fonts.ready.then(() => requestAnimationFrame(runFit))
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

  // injectContent re-measures synchronously, so don't reset contentHeight
  // here — collapsing to 800 first causes a layout jump on every commit.
  useEffect(() => {
    if (readyRef.current) injectContent(displayHtml)
  }, [displayHtml, applyBodyBackground])

  // Re-stamp the selection attribute after every body rebuild. Must run
  // after the inject effect above (declaration order matters).
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll("[data-adt-selected]").forEach((el) => {
      if (el.getAttribute("data-id") !== selectedDataId) {
        el.removeAttribute("data-adt-selected")
      }
    })
    if (!selectedDataId) return
    const el = doc.querySelector(`[data-id="${CSS.escape(selectedDataId)}"]`)
    if (el) el.setAttribute("data-adt-selected", "true")
  }, [selectedDataId, displayHtml, iframeReady])

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    doc.body.dataset.editable = editable && !linkMode ? "true" : "false"
    doc.body.dataset.linkMode = linkMode ? "true" : "false"
  }, [editable, linkMode, iframeReady])

  const linkedKey = linkedAnchor ? anchorKey(linkedAnchor) : ""
  const previewKey = previewAnchor ? anchorKey(previewAnchor) : ""
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll("[data-adt-linked], [data-adt-preview]").forEach((el) => {
      el.removeAttribute("data-adt-linked")
      el.removeAttribute("data-adt-preview")
    })
    const stamp = (key: string, attr: string) => {
      const anchor = parseAnchorKey(key)
      if (!anchor) return
      const el = doc.querySelector(anchorSelector(anchor))
      if (el) resolveVisibleTarget(el).setAttribute(attr, "true")
    }
    if (previewKey && previewKey !== linkedKey) stamp(previewKey, "data-adt-preview")
    stamp(linkedKey, "data-adt-linked")
  }, [linkedKey, previewKey, displayHtml, iframeReady])

  // Suppress the iframe's own scrollbar in desktop view (where the iframe is
  // sized to its content and the host container provides the scroll). Phone
  // and tablet frames keep the default since their fixed-height chrome relies
  // on internal scrolling.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const desktop = !deviceView || deviceView === "desktop"
    const value = desktop ? "hidden" : ""
    if (doc.documentElement) doc.documentElement.style.overflow = value
    if (doc.body) doc.body.style.overflow = value
  }, [deviceView, iframeReady])

  // Fixed-layout pages overlay positioned text on top of full-page images
  // via DOM order. The editable-mode `img[data-id] { z-index: 1 }` rule (used
  // for image-selection outlines in reflowable books) would lift those images
  // above the text and bury it — neutralise the z-index for fixed-layout pages.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const styleId = "adt-fixed-layout-styles"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
    if (!fixedLayoutSize) {
      styleEl?.remove()
      return
    }
    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings
    styleEl.textContent = `body[data-editable="true"] img[data-id] { z-index: auto; }`
  }, [fixedLayoutSize, iframeReady])

  // Inject/update the attached book fonts (Google <link> + uploaded @font-face)
  // into the live iframe head. Done here rather than in `srcdoc` so attaching a
  // font doesn't reload the iframe and wipe unsaved inline edits (see the
  // bookGoogleFontsUrl/bookUploadFacesCss memos above).
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const linkId = "adt-book-fonts-link"
    let linkEl = doc.getElementById(linkId) as HTMLLinkElement | null
    if (bookGoogleFontsUrl) {
      if (!linkEl) {
        linkEl = doc.createElement("link")
        linkEl.id = linkId
        linkEl.rel = "stylesheet"
        doc.head.appendChild(linkEl)
      }
      if (linkEl.getAttribute("href") !== bookGoogleFontsUrl) {
        linkEl.setAttribute("href", bookGoogleFontsUrl)
      }
    } else {
      linkEl?.remove()
    }
    const styleId = "adt-book-fonts-faces"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
    if (bookUploadFacesCss) {
      if (!styleEl) {
        styleEl = doc.createElement("style")
        styleEl.id = styleId
        doc.head.appendChild(styleEl)
      }
      if (styleEl.textContent !== bookUploadFacesCss) styleEl.textContent = bookUploadFacesCss
    } else {
      styleEl?.remove()
    }
  }, [bookGoogleFontsUrl, bookUploadFacesCss, iframeReady])

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
    // eslint-disable-next-line lingui/no-unlocalized-strings
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
    // eslint-disable-next-line lingui/no-unlocalized-strings
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

  const frame = useMemo(() => getDeviceFrame(deviceView, renderWidth), [deviceView, renderWidth])
  const targetVisibleWidth = getTargetVisibleWidth(deviceView)
  const baseWidth = frame.chromeWidth

  // Track the wrapper width; the scale effect below recomputes scale from it,
  // branching on mode (fixed-layout page vs reflowable / device-frame).
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setAvailableWidth(entry.contentRect.width)
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  // Fixed-layout: scale off the book-wide reference (spread) width so every
  // page shares one scale — a full spread fills the panel, a single cover/end
  // page renders centered at its natural fraction (e.g. half) of the panel
  // rather than being upscaled to fill it. Small books (reference width below
  // the panel) still upscale up to FIXED_LAYOUT_MAX_SCALE so they don't render
  // boxed — the same cap the packaged reader's fit script uses, so the preview
  // reads at the size edited here.
  // Reflowable: fit to the device-frame base width, desktop capped at 1× and
  // mobile/tablet grown up to a target visible width for legibility.
  useEffect(() => {
    if (fixedLayoutSize) {
      const heightScale = maxVisibleHeight
        ? maxVisibleHeight / fixedLayoutSize.height
        : Number.POSITIVE_INFINITY
      setScale(
        Math.min(
          FIXED_LAYOUT_MAX_SCALE,
          availableWidth / fixedLayoutSize.referenceWidth,
          heightScale
        )
      )
      return
    }
    const fitScale = Math.max(0, availableWidth / baseWidth)
    const cap =
      deviceView === "desktop" || deviceView === undefined
        ? 1
        : targetVisibleWidth / baseWidth
    const naturalHeight =
      deviceView === "desktop" || deviceView === undefined
        ? contentHeight
        : frame.chromeHeight
    const heightScale =
      maxVisibleHeight && naturalHeight > 0
        ? maxVisibleHeight / naturalHeight
        : Number.POSITIVE_INFINITY
    setScale(Math.min(cap, fitScale, heightScale))
  }, [
    availableWidth,
    fixedLayoutSize,
    baseWidth,
    targetVisibleWidth,
    deviceView,
    contentHeight,
    frame.chromeHeight,
    maxVisibleHeight,
  ])

  // Ref callback so the iframe re-initializes whenever the conditional
  // device-frame branch swaps it out (toggling Desktop ↔ Mobile ↔ Tablet
  // remounts the <iframe> element). Without this, the new iframe never
  // gets its load listener attached and the preview shows white until the
  // section is re-selected.
  const initIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe
    if (!iframe) {
      readyRef.current = false
      setIframeReady(false)
      return
    }

    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      const start = () => {
        readyRef.current = true
        setIframeReady(true)
        injectContent(latestHtmlRef.current)
      }
      // Thumbnails render read-only at tiny scale — don't block first paint on
      // web-font loading (fonts swap in a beat later, invisible at that size).
      if (thumbnail || !doc.fonts?.ready) {
        start()
      } else {
        doc.fonts.ready.then(start)
      }
    }

    iframe.addEventListener("load", onLoad)
  }, [])

  // Tear down measurement timer on unmount.
  useEffect(() => {
    return () => {
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
    }
  }, [])

  const visibleWidth = Math.round((fixedLayoutSize?.width ?? renderWidth) * scale)
  useEffect(() => {
    onVisibleWidthChange?.(visibleWidth)
  }, [visibleWidth, onVisibleWidthChange])

  // Keep onReady in a ref so the reveal effect can fire it without re-running
  // (and re-POSTing the CSS recompile) on every render.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Reveal the frame once ready. For preview frames that self-recompile their
  // CSS (autoRefreshCss), defer "ready" until the recompiled styles are injected
  // and the post-reflow height is measured — otherwise the content paints with
  // the base stylesheet and visibly reflows when the correct CSS lands.
  useEffect(() => {
    if (!iframeReady) return
    if (!autoRefreshCss) {
      onReadyRef.current?.()
      return
    }
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      try {
        await refreshCssInternal(sanitizedHtmlRef.current, controller.signal)
      } catch {
        // The base stylesheet is still usable. Revealing it is preferable to
        // leaving a compare pane stuck when the preview CSS request disconnects.
      } finally {
        if (!cancelled) onReadyRef.current?.()
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [iframeReady, autoRefreshCss, refreshCssInternal])

  // Fixed-layout pages carry explicit pixel dimensions and ignore device
  // chrome. Reflowable: mobile/tablet keep their fixed device-screen height
  // (the chrome is meant to look like a real phone/tablet); desktop has no
  // chrome — making the iframe content-tall avoids the dead space
  // `min-h-screen flex items-center` produces when a section is shorter than
  // the canvas.
  const isDesktop = !deviceView || deviceView === "desktop"
  const iframeWidth = fixedLayoutSize?.width ?? frame.screenWidth
  const iframeHeight = fixedLayoutSize?.height ?? (isDesktop ? contentHeight : frame.screenHeight)
  const visibleHeight = fixedLayoutSize
    ? fixedLayoutSize.height * scale
    : isDesktop
      ? contentHeight * scale
      : frame.chromeHeight * scale

  const iframeNode = (
    <iframe
      ref={initIframe}
      srcDoc={srcdoc}
      className="block"
      style={{
        width: iframeWidth,
        height: iframeHeight,
        border: "none",
      }}
    />
  )

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        height: visibleHeight,
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transformOrigin: "50% 0",
          transform: `scale(${scale})`,
        }}
      >
        {deviceView === "mobile" ? (
          <IPhoneFrame width={frame.chromeWidth}>{iframeNode}</IPhoneFrame>
        ) : deviceView === "tablet" ? (
          <IPadFrame screenWidth={frame.screenWidth} screenHeight={frame.screenHeight}>
            {iframeNode}
          </IPadFrame>
        ) : (
          <div
            style={{
              width: iframeWidth,
              height: iframeHeight,
              overflow: "hidden",
            }}
          >
            {iframeNode}
          </div>
        )}
      </div>
    </div>
  )
})
