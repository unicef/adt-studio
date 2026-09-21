function isForwardedKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight"
}

function ownsArrowKeys(target: EventTarget | null): boolean {
  const element = target as (Element & { isContentEditable?: boolean }) | null
  if (!element || typeof element.closest !== "function") return false
  const tag = element.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (element.isContentEditable) return true
  return element.closest("[data-activity-item], [role='radiogroup']") !== null
}

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
