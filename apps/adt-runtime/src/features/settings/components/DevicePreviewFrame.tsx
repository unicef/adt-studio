import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { effectiveDeviceAtom } from "@/features/comments/state/follow.atoms"
import { DEVICE_PREVIEW_WIDTHS, type DevicePreview } from "@/shared/state/ui.atoms"

const FRAME_CLASS = "adt-device-frame"
const SCREEN_CLASS = "adt-device-screen"

/**
 * Wraps the book's content in a device frame, the way the Studio's preview and storyboard do.
 *
 * The widths are the Studio's own (`DEVICE_WIDTHS`: 375 phone, 768 tablet) so a reviewer
 * checking a layout here and an author checking it there are looking at the same thing.
 *
 * The width comes from `effectiveDeviceAtom`, so a reader following somebody else is shown the
 * width *they* are reading at rather than their own.
 *
 * `#content` is wrapped rather than merely narrowed because a bezel needs an element of its own,
 * and every page is a separate document — the wrapper is rebuilt on each load, which is also
 * what makes tearing it down on exit safe. The book's own DOM is otherwise untouched: `#content`
 * keeps its id, its children and its position in the document, so the anchor engine and every
 * other feature that queries it are unaffected.
 */
export function DevicePreviewFrame() {
  const preview = useAtomValue(effectiveDeviceAtom) as DevicePreview

  useEffect(() => {
    const content = document.getElementById("content")
    if (!content) return

    const unwrap = (): void => {
      const screen = content.parentElement
      if (!screen?.classList.contains(SCREEN_CLASS)) return
      const frame = screen.parentElement
      frame?.parentElement?.insertBefore(content, frame)
      frame?.remove()
      document.body.removeAttribute("data-device-preview")
    }

    const apply = (): void => {
      const width = preview === "full" ? null : DEVICE_PREVIEW_WIDTHS[preview]
      /** Previewing a phone on a phone would letterbox a reader inside their own screen. The
       *  frame is for the reviewer on a laptop, and never narrows anybody's real device. */
      if (width === null || window.innerWidth <= width) {
        unwrap()
        return
      }

      const existing = content.parentElement
      if (existing?.classList.contains(SCREEN_CLASS)) {
        const frame = existing.parentElement
        if (frame?.dataset.device === preview) return
        unwrap()
      }

      const frame = document.createElement("div")
      frame.className = FRAME_CLASS
      frame.dataset.device = preview
      frame.setAttribute("aria-hidden", "false")
      frame.style.setProperty("--device-preview-width", `${width}px`)

      const screen = document.createElement("div")
      screen.className = SCREEN_CLASS

      content.parentElement?.insertBefore(frame, content)
      frame.appendChild(screen)
      screen.appendChild(content)
      document.body.setAttribute("data-device-preview", preview)
    }

    apply()
    window.addEventListener("resize", apply)
    return () => {
      window.removeEventListener("resize", apply)
      unwrap()
    }
  }, [preview])

  return null
}
