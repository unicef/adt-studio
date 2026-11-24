import { FileText } from "lucide-react"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import "./chat.css"

function Page({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 64)
  return (
    <span className="relative grid h-[88px] w-[66px] place-items-center overflow-hidden bg-white">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText className="size-4 text-slate-300" />}
    </span>
  )
}

/** While the engine reads: two real pages of the book, open, with a soft light passing over them. Decoration only. */
export function Reading({ file, pageCount }: { file: File; pageCount: number }) {
  const first = Math.min(2, Math.max(1, pageCount - 1))
  return (
    <span aria-hidden className="relative flex w-fit overflow-hidden rounded-[6px] shadow-[0_12px_28px_-14px_rgba(15,23,42,0.5)] ring-1 ring-border">
      <Page file={file} page={first} />
      <span className="w-px bg-slate-300" />
      <Page file={file} page={Math.min(pageCount, first + 1)} />
      <span className="chat-scan pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-brand-400/35 to-transparent" />
    </span>
  )
}
