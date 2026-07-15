import { useEffect } from "react"
import { X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { NO_DRAG_REGION } from "@/constants"

interface ImageLightboxProps {
  src: string
  alt?: string
  caption?: string
  onClose: () => void
}

/**
 * Full-viewport image viewer. Click the backdrop or press Escape to close.
 */
export function ImageLightbox({ src, alt, caption, onClose }: ImageLightboxProps) {
  const { t } = useLingui()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
      style={NO_DRAG_REGION}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
        aria-label={t`Close`}
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="flex flex-col items-center gap-3 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt ?? ""}
          className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl bg-white/5"
        />
        {caption && (
          <p className="text-xs text-white/70 max-w-2xl text-center px-3">{caption}</p>
        )}
      </div>
    </div>
  )
}
