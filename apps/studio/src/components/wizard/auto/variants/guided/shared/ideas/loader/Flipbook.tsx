import { Thumb } from "./parts"

const LEAVES = 5

/**
 * c16: the book's first real pages riffle over one by one in 3D, 0.18 s apart, onto a dimmed left
 * page, then start again. Still, it is the first page on its own. Decoration only.
 */
export function Flipbook({ file, pageCount }: { file: File; pageCount: number }) {
  const leaves = Array.from({ length: Math.min(LEAVES, Math.max(1, pageCount)) }, (_, i) => i + 1)
  return (
    <span aria-hidden className="lcl-book relative ml-[92px] block h-[128px] w-[98px] shrink-0">
      <span className="lcl-back absolute inset-0">
        <Thumb file={file} page={1} width={112} className="lcl-page size-full rounded-[4px] [&>img]:-scale-x-100" />
      </span>
      {leaves.map((page, i) => (
        <span key={page} className="lcl-leaf" style={{ animationDelay: `${i * 0.18}s`, zIndex: leaves.length - i }}>
          <Thumb file={file} page={page} width={112} className="lcl-page size-full rounded-[4px]" />
        </span>
      ))}
    </span>
  )
}
