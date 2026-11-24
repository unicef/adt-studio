import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../core/pdf/usePageThumb"

function Page({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 84)
  return (
    <span className="relative grid h-[176px] w-[132px] shrink-0 place-items-center overflow-hidden rounded-[6px] bg-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/10">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText className="size-5 text-slate-300" />}
      <span className="absolute bottom-1.5 right-1.5 rounded-full bg-slate-900/60 px-1.5 text-[10px] font-semibold tabular-nums text-white">{page}</span>
    </span>
  )
}

/**
 * The book's real pages drifting under a reading light while the engine works. It shows that the
 * pages are being looked at, never how far along it is: the engine reports no progress.
 */
export function Scanner({ file, pageCount, stopped }: { file: File; pageCount: number; stopped?: boolean }) {
  const pages = Array.from({ length: Math.min(10, Math.max(1, pageCount)) }, (_, i) => i + 1)
  return (
    <div aria-hidden className={cn("relative h-[212px] overflow-hidden rounded-[22px] bg-gradient-to-b from-brand-50/80 to-muted/40 ring-1 ring-border transition-[filter] duration-500", stopped && "grayscale")}>
      <div className={cn("absolute inset-y-0 left-0 flex w-max items-center gap-4 px-2", !stopped && "lc-flow")}>
        {[...pages, ...pages].map((p, i) => (
          <Page key={i} file={file} page={p} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-card to-transparent" />
      {!stopped && (
        <div className="lc-beam pointer-events-none absolute inset-y-3 left-1/2 w-[150px] -ml-[75px]">
          <div className="absolute inset-0 rounded-[14px] bg-brand-400/10 ring-2 ring-brand-400/60 backdrop-brightness-110" />
          <div className="lc-glow absolute inset-y-0 left-1/2 w-[3px] -ml-[1.5px] rounded-full bg-brand-500 shadow-[0_0_24px_6px_rgba(43,127,255,0.55)]" />
        </div>
      )}
    </div>
  )
}
