/**
 * Applies a book's reader UI (Studio "Reader" step) to the running chrome.
 *
 * Packaging already bakes the token stylesheet into the bundle's CSS, so a
 * shipped book paints correctly from the first frame. This module covers the
 * two cases the static CSS cannot:
 *
 *   - the layout half (dock rail, drawer panels), which lives in atoms;
 *   - live editing: while Studio shows the book in its Reader step it posts
 *     every change into the preview iframe, and the chrome follows without a
 *     repackage.
 */
import { getDefaultStore } from "jotai"
import { buildReaderUiCss, type ReaderUi } from "@adt/types/reader-ui"
import { readerUiAtom } from "@/shared/state/ui.atoms"

export const READER_UI_STYLE_ID = "adt-reader-ui"
export const READER_UI_MESSAGE = "adt-studio/reader-ui"

function writeStyle(ui: ReaderUi | null): void {
  if (typeof document === "undefined") return
  const css = buildReaderUiCss(ui)
  let el = document.getElementById(READER_UI_STYLE_ID) as HTMLStyleElement | null
  if (!css) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("style")
    el.id = READER_UI_STYLE_ID
    // Appended last so it outranks the copy baked into tailwind_output.css,
    // which is what a live edit has to replace. Created after page-head.ts
    // claimed the page's styles, so a page swap leaves it alone.
    document.head.appendChild(el)
  }
  el.textContent = css
}

export function applyReaderUi(ui: ReaderUi | null | undefined): void {
  const next = ui ?? null
  getDefaultStore().set(readerUiAtom, next)
  writeStyle(next)
}

function isReaderUiMessage(data: unknown): data is { type: string; readerUi: ReaderUi | null } {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>
  return (
    d.type === READER_UI_MESSAGE &&
    (d.readerUi === null || (typeof d.readerUi === "object" && d.readerUi !== undefined))
  )
}

/**
 * Follow live reader-UI edits from the Studio page hosting this preview.
 * Only messages from the direct parent are honoured, and only while the
 * runtime actually runs inside a frame. Values still go through
 * `buildReaderUiCss`, which drops anything that is not a plain colour.
 */
export function subscribeReaderUiPreview(): () => void {
  if (typeof window === "undefined" || window.parent === window) return () => {}
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    if (!isReaderUiMessage(event.data)) return
    applyReaderUi(event.data.readerUi)
  }
  window.addEventListener("message", handler)
  // Tell the editor we are listening, so it can send the current draft even
  // when this page loaded after its last change (navigation, repackage).
  window.parent.postMessage({ type: "adt-runtime/reader-ui-ready" }, "*")
  return () => window.removeEventListener("message", handler)
}
