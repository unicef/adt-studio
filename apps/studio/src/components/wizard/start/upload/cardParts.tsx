import { useEffect, useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, BookOpen, Check, FileText, HardDrive, Loader2, Trash2, Upload } from "lucide-react"
import { cn, formatBytes } from "@/lib/utils"
import type { UploadFlow } from "./useUploadFlow"
import { ScopeField } from "../../core/fields/ScopeField"
import "../../core/flow.css"
import { BackButton, PrimaryButton } from "../../core/ui"

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

const CHOOSE_ANOTHER = "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4"

/** A file that can't be used: what's wrong in one line, then what to do about it. */
function Problem({ title, body }: { title: ReactNode; body: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1.5 text-center animate-[am-fade-up_0.3s_ease-out_both] motion-reduce:animate-none">
      <span className="text-[19px] font-semibold tracking-[-0.01em]">{title}</span>
      <span className="max-w-[460px] text-[13.5px] leading-relaxed text-muted-foreground">{body}</span>
    </span>
  )
}

/** What the drop target says: idle, reading, accepted, or why the file can't be used. */
export function DropMessage({ flow, idle }: { flow: UploadFlow; idle: ReactNode }) {
  if (flow.rejected && !flow.showCard)
    return (
      <Problem
        key={flow.rejectedAt}
        title={<Trans>That file isn&apos;t a PDF</Trans>}
        body={
          <Trans>
            Only PDF files can be converted. <span className={CHOOSE_ANOTHER}>Choose a PDF</span>.
          </Trans>
        }
      />
    )
  if (flow.error === "password")
    return (
      <Problem
        title={<Trans>This PDF is password-protected</Trans>}
        body={
          <Trans>
            Remove the password and upload it again, or <span className={CHOOSE_ANOTHER}>choose another file</span>.
          </Trans>
        }
      />
    )
  if (flow.error)
    return (
      <Problem
        title={<Trans>We couldn&apos;t open this PDF</Trans>}
        body={
          <Trans>
            The file may be damaged. Export it again, or <span className={CHOOSE_ANOTHER}>choose another file</span>.
          </Trans>
        }
      />
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

const STAGGER = "animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"

/** Title, file name, page count and size, how much of the book to convert, then Replace / remove. Staggers in when `animated`. */
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
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
          <FileText className="size-3.5" />
          {pageCount > 0 ? <Plural value={pageCount} one="# page" other="# pages" /> : <Trans>Counting pages…</Trans>}
          <span aria-hidden>·</span>
          <HardDrive className="size-3.5" />
          {formatBytes(flow.file.size)}
        </p>
        <ScopeField className="mt-5" />
      </div>
      <div className={cn("mt-6 flex items-center gap-2", animated && STAGGER)} style={animated ? { animationDelay: `${base + 160}ms` } : undefined}>
        <button type="button" onClick={flow.openPicker} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-[13px] font-medium transition-colors hover:border-brand-300 hover:bg-brand-50/60 active:scale-[0.97]">
          <Upload className="size-3.5" />
          <Trans>Replace PDF</Trans>
        </button>
        <button type="button" onClick={flow.clear} aria-label={t`Remove PDF`} className="grid size-9 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive active:scale-[0.97]">
          <Trash2 className="size-3.5" />
        </button>
        <span role="status" className={cn("ml-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-destructive transition-opacity duration-300", flow.rejected ? "opacity-100" : "opacity-0")}>
          {flow.rejected && (
            <>
              <AlertCircle className="size-3.5" />
              <Trans>That file isn&apos;t a PDF</Trans>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

export function UploadActions({ flow, className }: { flow: UploadFlow; className?: string }) {
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
