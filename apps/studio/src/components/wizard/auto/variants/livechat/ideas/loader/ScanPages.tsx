import { spreadPages, Thumb } from "./shared"

/**
 * c12: three real pages side by side; a glowing brand line sweeps down each in turn, 0.8 s apart,
 * and leaves a soft tint that fades before the next pass. Still, the pages just sit there. Decoration only.
 */
export function ScanPages({ file, pageCount }: { file: File; pageCount: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-[18px]">
      {spreadPages(pageCount, 3).map((page, i) => (
        <span key={page} className="lcl-page relative overflow-hidden rounded-[4px]">
          <Thumb file={file} page={page} width={96} className="h-[112px] w-[84px]" />
          <span className="lcl-scan-tint" style={{ animationDelay: `${i * 0.8}s` }} />
          <span className="lcl-scan-line" style={{ animationDelay: `${i * 0.8}s` }} />
        </span>
      ))}
    </span>
  )
}
