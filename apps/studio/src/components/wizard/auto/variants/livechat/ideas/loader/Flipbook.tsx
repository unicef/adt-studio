import { Thumb } from "./shared"

const LEAVES = 5

/** c16: the book's first pages turn over one by one, like a flipbook. Still, it is the first page on top. Decoration only. */
export function Flipbook({ file, pageCount }: { file: File; pageCount: number }) {
  const leaves = Array.from({ length: Math.min(LEAVES, Math.max(1, pageCount)) }, (_, i) => i + 1)
  const under = Math.min(pageCount, leaves.length + 1)
  return (
    <span aria-hidden className="lcl-book relative ml-[84px] block h-[112px] w-[84px] shrink-0">
      <Thumb file={file} page={under} className="absolute inset-0 rounded-r-[5px] ring-1 ring-border" />
      {leaves.map((page, i) => (
        <span key={page} className="lcl-leaf" style={{ animationDelay: `${i * 0.2}s`, zIndex: leaves.length - i }}>
          <Thumb file={file} page={page} className="lcl-face absolute inset-0 rounded-r-[5px] ring-1 ring-border" />
          <span className="lcl-face lcl-face-back rounded-l-[5px] bg-gradient-to-l from-slate-100 to-white ring-1 ring-border" />
        </span>
      ))}
      <span className="pointer-events-none absolute -bottom-2 left-[-70px] right-[-6px] h-3 rounded-full bg-slate-900/10 blur-md" />
    </span>
  )
}
