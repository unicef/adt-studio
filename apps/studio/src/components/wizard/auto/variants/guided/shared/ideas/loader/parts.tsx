import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../../../../core/pdf/usePageThumb"
import type { EngineRun } from "../../../../../engine/useEngineRun"

/** One real page of the book, or a plain page while it renders. */
export function Thumb({ file, page, className, width = 80 }: { file: File; page: number; className?: string; width?: number }) {
  const src = usePageThumb(file, page, width)
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-white", className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText className="size-4 text-slate-300" />}
    </span>
  )
}

/** `n` real page numbers spread through the book (1-based, no repeats when the book is short). */
export function spreadPages(pageCount: number, n: number): number[] {
  const total = Math.max(1, pageCount)
  if (total <= n) return Array.from({ length: total }, (_, i) => i + 1)
  return Array.from({ length: n }, (_, i) => Math.min(total, 1 + Math.round((i * (total - 1)) / n)))
}

/**
 * Whole seconds since the engine started on this book. It is a real count, never a progress
 * estimate; it stops where it was once the run ends.
 */
export function useSeconds(run: EngineRun): number {
  const startedAt = run.status === "running" ? run.startedAt : null
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (startedAt == null) return
    const tick = () => setSeconds(Math.floor((performance.now() - startedAt) / 1000))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [startedAt])
  return seconds
}
