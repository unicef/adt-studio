import { spreadPages, Thumb } from "./shared"

/** c12: three real pages; a glowing line walks down each in turn and leaves a soft tint. Decoration only. */
export function ScanPages({ file, pageCount }: { file: File; pageCount: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-2.5">
      {spreadPages(pageCount, 3).map((page, i) => (
        <span key={page} className="relative overflow-hidden rounded-[6px] shadow-[0_12px_24px_-14px_rgba(15,23,42,0.55)] ring-1 ring-border">
          <Thumb file={file} page={page} className="h-[100px] w-[75px]" />
          <span className="lcl-scan-tint" style={{ animationDelay: `${i * 0.8}s` }} />
          <span className="lcl-scan-line" style={{ animationDelay: `${i * 0.8}s` }} />
        </span>
      ))}
    </span>
  )
}
