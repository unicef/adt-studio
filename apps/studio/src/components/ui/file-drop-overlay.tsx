import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Upload, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type OverlayState = "idle" | "dragging" | "error"

interface UseFileDropZoneOptions {
  /** Return true if the file should be accepted */
  accept: (file: File) => boolean
  /** Called with the accepted file */
  onAccept: (file: File) => void
  /** How long to show the error state (ms). Default 2000 */
  errorDuration?: number
  /** Disable accepting files while another operation owns the screen. */
  enabled?: boolean
}

export function useFileDropZone({
  accept,
  onAccept,
  errorDuration = 2000,
  enabled = true,
}: UseFileDropZoneOptions) {
  const [overlay, setOverlay] = useState<OverlayState>("idle")
  const overlayRef = useRef<OverlayState>("idle")
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setOverlayState(s: OverlayState) {
    overlayRef.current = s
    setOverlay(s)
  }

  const acceptDrop = useCallback(
    (f: File | undefined) => {
      if (!enabled || !f) return
      if (!accept(f)) {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
        setOverlayState("error")
        errorTimerRef.current = setTimeout(() => setOverlayState("idle"), errorDuration)
        return
      }
      setOverlayState("idle")
      onAccept(f)
    },
    [accept, onAccept, errorDuration, enabled],
  )

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (enabled && e.dataTransfer?.types.includes("Files")) setOverlayState("dragging")
    }
    function onDragLeave(e: DragEvent) {
      if (e.relatedTarget === null && overlayRef.current !== "error") setOverlayState("idle")
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      if (enabled) acceptDrop(e.dataTransfer?.files[0])
    }

    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [acceptDrop, enabled])

  return { overlay }
}

interface FileDropOverlayProps {
  overlay: OverlayState
  /** Label shown during drag (e.g. "Drop PDF here") */
  dropLabel: ReactNode
  /** Label shown on type mismatch (e.g. "Only PDF files are supported") */
  errorLabel: ReactNode
  /** Accent color class for the drag state border/icon/text. Default "amber" */
  accent?: "amber" | "blue"
}

/* eslint-disable lingui/no-unlocalized-strings */
const accentMap = {
  amber: {
    border: "border-amber-400/60",
    icon: "text-amber-500",
    text: "text-amber-600",
  },
  blue: {
    border: "border-blue-400/60",
    icon: "text-[#2b7fff]",
    text: "text-[#2b7fff]",
  },
} as const
/* eslint-enable lingui/no-unlocalized-strings */

export function FileDropOverlay({
  overlay,
  dropLabel,
  errorLabel,
  accent = "amber",
}: FileDropOverlayProps) {
  const colors = accentMap[accent]

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 m-1 flex flex-col items-center justify-center rounded-lg pointer-events-none",
        "transition-[opacity,background-color,border-color,backdrop-filter] duration-300 ease-out",
        overlay === "idle" && "border-2 border-transparent opacity-0",
        overlay === "dragging" &&
          cn("border-2 border-dashed bg-white/50 backdrop-blur-[2px] opacity-100", colors.border),
        overlay === "error" &&
          "border-2 border-dashed border-red-400/60 bg-white/50 backdrop-blur-[2px] opacity-100",
      )}
      aria-hidden
    >
      <div className="grid min-h-[5.5rem] w-full max-w-md place-items-center px-4">
        <div
          className={cn(
            "col-start-1 row-start-1 flex flex-col items-center gap-3 transition-all duration-300 ease-out",
            overlay === "error"
              ? "pointer-events-none scale-95 opacity-0"
              : "scale-100 opacity-100",
          )}
        >
          <Upload
            className={cn(
              "h-10 w-10 transition-transform duration-300 ease-out",
              colors.icon,
              overlay === "dragging" ? "scale-100" : "scale-75",
            )}
          />
          <span className={cn("text-base font-semibold", colors.text)}>
            {dropLabel}
          </span>
        </div>
        <div
          className={cn(
            "col-start-1 row-start-1 flex flex-col items-center gap-3 transition-all duration-300 ease-out",
            overlay === "error"
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0",
          )}
        >
          <XCircle className="h-10 w-10 text-[#ef4444]" />
          <span className="text-center text-base font-semibold text-[#ef4444]">
            {errorLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
