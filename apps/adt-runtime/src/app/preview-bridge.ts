/**
 * The reader's half of the Studio preview channel (`@adt/types`
 * `preview-bridge`).
 *
 * Studio's Preview keeps this document on another origin, so it cannot read
 * which page is open, outline an accessibility finding's elements or turn the
 * page itself. The reader does all three on its behalf: it announces the open
 * page on boot and after every page turn, and applies the highlight and
 * navigate requests Studio posts back.
 *
 * Only active inside a Studio preview iframe. Requests are accepted from the
 * parent window alone, and navigation never leaves the reader's own origin.
 *
 * Requests are checked by hand rather than with the `@adt/types` Zod schemas:
 * importing a schema would pull Zod and every other schema into the runtime
 * bundle that ships inside each exported book.
 */
import type {
  PreviewBridgePage,
  PreviewBridgeReaderMessage,
  PreviewBridgeStudioMessage,
  PreviewHighlightSeverity,
} from "@adt/types"
import { navigateToPage } from "@/features/navigation/lib/page-swap"

const PREVIEW_PATH = /\/books\/[^/]+\/adt\//

const HIGHLIGHT_STYLE_ID = "adt-preview-a11y-highlights"
const HIGHLIGHT_ATTR = "data-adt-a11y-hover"
const HIGHLIGHT_SEVERITY_ATTR = "data-adt-a11y-hover-severity"
const HIGHLIGHT_PAGE_ATTR = "data-adt-a11y-hover-page"

const HIGHLIGHT_COLORS: Record<PreviewHighlightSeverity, { rgb: string; ring: number; pageRing: number }> = {
  critical: { rgb: "239, 68, 68", ring: 0.28, pageRing: 0.24 },
  serious: { rgb: "249, 115, 22", ring: 0.28, pageRing: 0.22 },
  moderate: { rgb: "234, 179, 8", ring: 0.3, pageRing: 0.22 },
  minor: { rgb: "96, 165, 250", ring: 0.28, pageRing: 0.22 },
  unknown: { rgb: "107, 114, 128", ring: 0.24, pageRing: 0.2 },
}

function readPreviewPage(): PreviewBridgePage {
  return {
    sectionId: document.querySelector('meta[name="title-id"]')?.getAttribute("content") ?? null,
    href: window.location.pathname,
    title: document.title || null,
    hasImages: document.querySelector("img") !== null,
    hasActivity: document.querySelector('[data-section-type^="activity_"]') !== null,
    signLanguageEnabled: document.querySelector("#sl-quick-toggle-button, #sign-language-video") !== null,
  }
}

let highlightActive = false

function clearHighlight(): void {
  highlightActive = false
  for (const el of Array.from(document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`))) {
    el.removeAttribute(HIGHLIGHT_ATTR)
    el.removeAttribute(HIGHLIGHT_SEVERITY_ATTR)
  }
  document.documentElement.removeAttribute(HIGHLIGHT_PAGE_ATTR)
  document.body?.removeAttribute(HIGHLIGHT_PAGE_ATTR)
}

function highlightTargets(targets: string[], severity: PreviewHighlightSeverity): void {
  clearHighlight()
  if (targets.length === 0) return
  ensureHighlightStyles()
  highlightActive = true
  for (const selector of targets) {
    const elements = querySelectorAllSafe(selector)
    const hasRootMatch =
      selector.trim().toLowerCase() === "html" || elements.some((el) => el === document.documentElement)
    if (hasRootMatch) {
      document.documentElement.setAttribute(HIGHLIGHT_PAGE_ATTR, severity)
      document.body?.setAttribute(HIGHLIGHT_PAGE_ATTR, severity)
    }
    for (const el of elements) {
      el.setAttribute(HIGHLIGHT_ATTR, "true")
      el.setAttribute(HIGHLIGHT_SEVERITY_ATTR, severity)
    }
  }
}

/** A request from Studio, or null when `data` is not one. */
export function parseStudioMessage(data: unknown): PreviewBridgeStudioMessage | null {
  if (!data || typeof data !== "object") return null
  const message = data as Record<string, unknown>
  if (message.type === "adt-preview/highlight") {
    const { targets, severity } = message
    if (!Array.isArray(targets) || !targets.every((target) => typeof target === "string")) return null
    if (typeof severity !== "string" || !Object.prototype.hasOwnProperty.call(HIGHLIGHT_COLORS, severity)) return null
    return { type: message.type, targets, severity: severity as PreviewHighlightSeverity }
  }
  if (message.type === "adt-preview/navigate") {
    const { href } = message
    if (typeof href !== "string" || href.length === 0) return null
    return { type: message.type, href }
  }
  return null
}

/** The page `href` points at, or null when it would leave the reader's origin. */
export function resolvePreviewNavigation(href: string): string | null {
  let target: URL
  try {
    target = new URL(href.replace(/^\/+/, ""), window.location.href)
  } catch {
    return null
  }
  return target.origin === window.location.origin ? target.href : null
}

export function subscribePreviewBridge(): () => void {
  if (typeof window === "undefined") return () => {}
  if (window.parent === window) return () => {}
  if (!PREVIEW_PATH.test(window.location.pathname)) return () => {}

  const post = (message: PreviewBridgeReaderMessage): void => {
    window.parent.postMessage(message, "*")
  }

  const announce = (): void => {
    post({ type: "adt-preview/page", page: readPreviewPage() })
  }

  const onPageChanged = (): void => {
    clearHighlight()
    announce()
  }

  // Studio clears the outline when the pointer leaves a finding, but a pointer
  // that crosses straight into this frame can skip the event that tells it
  // so. A pointer inside the reader means no finding is hovered any more; Studio
  // is told so that hovering the same finding again outlines it again.
  const onPointerMove = (): void => {
    if (!highlightActive) return
    clearHighlight()
    post({ type: "adt-preview/highlight-cleared" })
  }

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window.parent) return
    const message = parseStudioMessage(event.data)
    if (!message) return
    if (message.type === "adt-preview/highlight") {
      highlightTargets(message.targets, message.severity)
      return
    }
    const target = resolvePreviewNavigation(message.href)
    if (target) navigateToPage(target)
  }

  document.addEventListener("adt:page-changed", onPageChanged)
  document.addEventListener("pointermove", onPointerMove)
  window.addEventListener("message", onMessage)
  announce()

  return () => {
    document.removeEventListener("adt:page-changed", onPageChanged)
    document.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("message", onMessage)
  }
}

function ensureHighlightStyles(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return
  const rules = Object.entries(HIGHLIGHT_COLORS).map(([severity, { rgb, ring, pageRing }]) => `
    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="${severity}"] {
      outline-color: rgba(${rgb}, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(${rgb}, ${ring}) !important;
    }

    body[${HIGHLIGHT_PAGE_ATTR}="${severity}"]::before {
      border-color: rgba(${rgb}, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(${rgb}, ${pageRing});
    }
  `)
  const style = document.createElement("style")
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = `
    [${HIGHLIGHT_ATTR}="true"] {
      outline-width: 2px !important;
      outline-style: solid !important;
      outline-offset: 2px !important;
      transition: outline-color 120ms ease, box-shadow 120ms ease;
    }

    body[${HIGHLIGHT_PAGE_ATTR}]::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      border: 4px solid transparent;
      box-sizing: border-box;
      z-index: 2147483647;
    }
    ${rules.join("")}
  `
  document.head.appendChild(style)
}

function querySelectorAllSafe(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector))
  } catch {
    return []
  }
}
