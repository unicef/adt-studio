/** Keys the canvas owns even while a preview holds focus. */
function isForwardedKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight"
}

/** Elements inside a preview that drive their own arrow keys: text fields and
 *  the activity widgets (option radiogroups, drag-and-drop tiles, blanks). */
function ownsArrowKeys(target: EventTarget | null): boolean {
  const element = target as (Element & { isContentEditable?: boolean }) | null
  if (!element || typeof element.closest !== "function") return false
  const tag = element.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (element.isContentEditable) return true
  return element.closest("[data-activity-item], [role='radiogroup']") !== null
}

/**
 * A preview renders in its own document, so once the reader clicks inside it
 * the arrow keys never reach the host and the embedded runtime turns the page
 * *within* the frame instead. Listening on the preview document in the capture
 * phase takes the key back: the original event is cancelled (which the runtime
 * respects — it bails on `defaultPrevented`) and replayed on the host document,
 * where the canvas hotkeys pick it up.
 *
 * Only same-origin previews can be reached this way. The desktop build serves
 * the API from its own port, so there the frame is left alone and the arrow
 * keys work whenever focus is outside it.
 */
export function bridgeIframeKeys(frame: HTMLIFrameElement): () => void {
  const frameDocument = frame.contentDocument
  if (!frameDocument) return () => {}

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (!isForwardedKey(event.key)) return
    if (ownsArrowKeys(event.target)) return

    event.preventDefault()
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: event.key, bubbles: true, cancelable: true }),
    )
  }

  frameDocument.addEventListener("keydown", onKeyDown, true)
  return () => frameDocument.removeEventListener("keydown", onKeyDown, true)
}
