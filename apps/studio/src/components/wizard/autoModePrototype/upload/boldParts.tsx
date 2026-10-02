import { useEffect, useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, BookOpen, Check, FileText, HardDrive, Loader2, Trash2, Upload } from "lucide-react"
import { cn, formatBytes } from "@/lib/utils"
import type { UploadFlow } from "./useUploadFlow"
import "./upload.css"
import { BackButton, PrimaryButton } from "../ui"

export function Subtitle({ flow, className }: { flow: UploadFlow; className?: string }) {
  return (
    <div className={cn("grid max-w-xl text-center [&>*]:col-start-1 [&>*]:row-start-1", className)}>
      <p className={cn("transition-[opacity,filter] ease-out", flow.showCard ? "pointer-events-none opacity-0 blur-[2px] duration-150" : "opacity-100 delay-150 duration-300")}>
        <Trans>Upload the source PDF of your book and we&apos;ll turn it into an Accessible Digital Textbook with interactive activities and adaptive layouts.</Trans>
      </p>
      <p className={cn("transition-[opacity,filter] ease-out", flow.showCard ? "opacity-100 delay-150 duration-300" : "pointer-events-none opacity-0 blur-[2px] duration-150")}>
        <Trans>Review the source PDF details below and continue to configure how your book will be converted into an Accessible Digital Textbook.</Trans>
      </p>
    </div>
  )
}

/** What the drop target says: idle, reading, accepted, or error. */
export function DropMessage({ flow, idle }: { flow: UploadFlow; idle: ReactNode }) {
  if (flow.error)
    return (
      <span className="inline-flex items-center gap-2 text-[14px] font-medium text-destructive">
        <AlertCircle className="size-4" />
        {flow.error}
      </span>
    )
  if (flow.accepted)
    return (
      <span className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-brand-700 animate-in fade-in zoom-in-95 duration-300">
        <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_6px_18px_rgba(43,127,255,0.45)]">
          <Check className="size-4 stroke-[3]" />
        </span>
        <Trans>PDF accepted</Trans>
      </span>
    )
  if (flow.loading)
    return (
      <span className="inline-flex items-center gap-2 text-[14px] font-medium text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-brand-600" />
        <Trans>Reading PDF…</Trans>
      </span>
    )
  return <>{idle}</>
}

export function Cover({ flow, className }: { flow: UploadFlow; className?: string }) {
  return flow.cover ? (
    <img src={flow.cover} alt={flow.title} className={cn("rounded-md object-contain", className)} />
  ) : (
    <div className={cn("grid aspect-[3/4] place-items-center rounded-md bg-gradient-to-br from-muted to-muted/60", className)}>
      <BookOpen className="size-10 text-muted-foreground/60" />
    </div>
  )
}

const STAGGER = "animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-brand-600 shadow-sm">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[20px] font-bold leading-tight tracking-[-0.01em]">{value}</span>
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </span>
    </div>
  )
}

/** Title, file name, page count and size as stat tiles, then Replace / remove. Staggers in when `animated`. */
export function BookDetails({ flow, className, titleClassName, animated, delay = 380 }: { flow: UploadFlow; className?: string; titleClassName?: string; animated?: boolean; delay?: number }) {
  const { t } = useLingui()
  const [base] = useState(delay)
  const pageCount = flow.pageCount
  if (!flow.file) return null
  const stagger = (ms: number) => (animated ? { className: STAGGER, style: { animationDelay: `${base + ms}ms` } } : {})
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div {...stagger(0)}>
        <p className={cn("line-clamp-2 text-[22px] font-bold leading-tight tracking-[-0.015em]", titleClassName)}>{flow.title}</p>
        <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{flow.file.name}</p>
      </div>
      <div {...stagger(80)}>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat
            icon={<FileText className="size-[18px]" />}
            value={pageCount > 0 ? pageCount : <Loader2 className="my-1 size-5 animate-spin text-brand-600" />}
            label={pageCount > 0 ? <Plural value={pageCount} one="page" other="pages" /> : <Trans>Counting pages…</Trans>}
          />
          <Stat icon={<HardDrive className="size-[18px]" />} value={formatBytes(flow.file.size)} label={<Trans>File size</Trans>} />
        </div>
      </div>
      <div className={cn("mt-6 flex items-center gap-2", animated && STAGGER)} style={animated ? { animationDelay: `${base + 160}ms` } : undefined}>
        <button type="button" onClick={flow.openPicker} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium transition-colors hover:border-brand-300 hover:bg-brand-50/60 active:scale-[0.97]">
          <Upload className="size-3.5" />
          <Trans>Replace PDF</Trans>
        </button>
        <button type="button" onClick={flow.clear} aria-label={t`Remove PDF`} className="grid size-9 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive active:scale-[0.97]">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

export function BoldActions({ flow, className }: { flow: UploadFlow; className?: string }) {
  const [ready, setReady] = useState(flow.showCard)
  useEffect(() => {
    if (!flow.showCard || flow.replacing) return setReady(false)
    const id = window.setTimeout(() => setReady(true), 620)
    return () => window.clearTimeout(id)
  }, [flow.showCard, flow.replacing])
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BackButton onClick={flow.onBack} />
      <PrimaryButton onClick={flow.onContinue} disabled={!ready} pulse={ready}>
        <Trans>Continue</Trans>
      </PrimaryButton>
    </div>
  )
}
