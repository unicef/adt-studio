import { useAtomValue } from "jotai"
import { useEffect } from "react"
import {
  DEVICE_PREVIEW_WIDTHS,
  devicePreviewAtom,
  type DevicePreview,
} from "@/shared/state/ui.atoms"

/**
 * Clamps the book's content column to a device width.
 *
 * It writes an attribute and a custom property on `<body>` rather than rendering a wrapper: the
 * book's own `#content` is not ours to re-parent, and every page is a separate document, so a
 * declarative rule in `globals.css` is the only version that survives a page turn without a
 * flash of full-width layout.
 *
 * The clamp is skipped whenever the window is already narrower than the target. Previewing a
 * phone on a phone would otherwise letterbox a reader into a frame smaller than their screen —
 * and this feature is for the reviewer on a laptop, never for the reader.
 */
export function DevicePreviewFrame() {
  const preview = useAtomValue(devicePreviewAtom) as DevicePreview

  useEffect(() => {
    const body = document.body
    if (!body) return

    const apply = (): void => {
      const width = preview === "full" ? null : DEVICE_PREVIEW_WIDTHS[preview]
      if (width === null || window.innerWidth <= width) {
        body.removeAttribute("data-device-preview")
        body.style.removeProperty("--device-preview-width")
        return
      }
      body.setAttribute("data-device-preview", preview)
      body.style.setProperty("--device-preview-width", `${width}px`)
    }

    apply()
    window.addEventListener("resize", apply)
    return () => {
      window.removeEventListener("resize", apply)
      body.removeAttribute("data-device-preview")
      body.style.removeProperty("--device-preview-width")
    }
  }, [preview])

  return null
}
