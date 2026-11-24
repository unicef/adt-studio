import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { BookImage, Hourglass, ScanLine, Sparkles } from "lucide-react"
import { DeviceToggle } from "../../../decide/strategies"
import { cn } from "@/lib/utils"
import { BookDevice, fitScale } from "./BookDevice"
import type { Device, Shown } from "./layouts"
import { useDescribe } from "./pages"
import { useBox } from "./useBox"
import "../preview.css"

export type StageMode = "reading" | "ready" | "other"

/** The light line that sweeps the page while the engine reads it. */
function Scan() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[22%] animate-[am-pf-scan_2.6s_cubic-bezier(0.45,0,0.55,1)_infinite] bg-[linear-gradient(180deg,transparent,rgba(43,127,255,0.07)_75%,rgba(43,127,255,0.4)_99%,transparent)] motion-reduce:hidden" />
      <span className="absolute inset-0 bg-brand-500/[0.04]" />
    </span>
  )
}

/** What the preview is, said lightly: the page as printed while reading, then an illustration of the layout. */
function HonestChip({ mode, shown, pages }: { mode: StageMode; shown: Shown; pages: number[] }) {
  const ai = shown.renderStrategy === "llm" || shown.renderStrategy === "llm-overlay"
  const page = pages.join("–")
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold shadow-sm ring-1", mode === "reading" ? "bg-card text-muted-foreground ring-border" : "bg-card text-foreground ring-brand-200")}>
      {mode === "reading" ? <ScanLine className="size-3.5 shrink-0 text-brand-600" /> : ai ? <Sparkles className="size-3.5 shrink-0 text-brand-600" /> : <BookImage className="size-3.5 shrink-0 text-brand-600" />}
      <span className="truncate">
        {mode === "reading" ? (
          <Trans>Your page {page}, as printed</Trans>
        ) : ai ? (
          <Trans>Illustration · page {page} · the AI lays out each page when it converts</Trans>
        ) : (
          <Trans>Illustration · made from your page {page}</Trans>
        )}
      </span>
    </span>
  )
}

/**
 * The big preview: the finished book on a computer or a phone, made from the book's own page. It
 * fills whatever space it has. `children` takes its place (a question, an error); `footer` holds the
 * chips under it.
 */
export function Stage({ mode, device, onDevice, shown, pages, srcs, slow, onManual, footer, children }: { mode: StageMode; device: Device; onDevice: (d: Device) => void; shown: Shown; pages: number[]; srcs: (string | undefined)[]; slow?: boolean; onManual: () => void; footer?: ReactNode; children?: ReactNode }) {
  const { ref, box } = useBox()
  const describe = useDescribe()
  const pad = box.w < 600 ? 24 : 40
  const scale = fitScale(device, box.w - pad - 4, box.h - pad - 4)
  const signature = `${device}|${pages.join(",")}|${shown.renderStrategy}|${shown.sectioningMode}|${shown.activitiesGenerator}|${shown.figureExtraction}`
  return (
    <div className="relative flex min-h-[580px] flex-1 flex-col overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-50 via-muted/50 to-brand-100/70 ring-1 ring-brand-100 lg:min-h-0">
      {!children && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-4">
          <HonestChip mode={mode} shown={shown} pages={pages} />
          <DeviceToggle value={device} onChange={onDevice} />
        </div>
      )}
      {children ?? (
        <div ref={ref} className="relative grid min-h-0 flex-1 place-items-center p-3 sm:p-5">
          {box.w > 0 && (
            <div key={signature} className="animate-[am-pf-morph_0.55s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
              <BookDevice device={device} scale={scale} shown={shown} srcs={srcs} label={describe(shown, device, pages)} overlay={mode === "reading" ? <Scan /> : undefined} />
            </div>
          )}
          {slow && (
            <p className="absolute inset-x-3 bottom-3 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-card/95 px-4 py-2 text-center text-[13px] text-muted-foreground shadow-md ring-1 ring-border backdrop-blur">
              <Hourglass className="size-3.5" />
              <Trans>This is taking longer than usual.</Trans>
              <button type="button" onClick={onManual} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
                <Trans>Set it up myself</Trans>
              </button>
            </p>
          )}
        </div>
      )}
      {!children && footer}
    </div>
  )
}
