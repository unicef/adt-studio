import { FileText } from "lucide-react"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import "./scan.css"

/** `n` real page numbers spread through the book (1-based, no repeats when the book is short). */
function spreadPages(pageCount: number, n: number): number[] {
  const total = Math.max(1, pageCount)
  if (total <= n) return Array.from({ length: total }, (_, i) => i + 1)
  return Array.from({ length: n }, (_, i) => Math.min(total, 1 + Math.round((i * (total - 1)) / n)))
}

function Thumb({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 96)
  return (
    <span className="relative grid h-[76px] w-[57px] shrink-0 sm:h-[112px] sm:w-[84px] place-items-center overflow-hidden bg-white">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText className="size-4 text-slate-300" />}
    </span>
  )
}

/**
 * While the engine reads: three real pages side by side; a thin brand line sweeps down each in
 * turn, 0.8 s apart. It is only a line, so the page stays readable under it. Still, the pages just
 * sit there. Decoration only.
 */
export function ScanPages({ file, pageCount }: { file: File; pageCount: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-2 sm:gap-[18px]">
      {spreadPages(pageCount, 3).map((page, i) => (
        <span key={page} className="relative overflow-hidden rounded-[4px] shadow-[0_1px_2px_rgb(15_23_42/0.18),0_6px_16px_-8px_rgb(15_23_42/0.25)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.5),0_6px_16px_-8px_rgb(0_0_0/0.6)]">
          <Thumb file={file} page={page} />
          <span className="scan-line" style={{ animationDelay: `${i * 0.8}s` }} />
        </span>
      ))}
    </span>
  )
}
