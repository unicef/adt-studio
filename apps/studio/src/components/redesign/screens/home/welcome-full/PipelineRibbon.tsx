import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { FileText, ScanText, Sparkles, Languages, ShieldCheck, Package, Plus, BookText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WelcomeVariantProps } from "./DropZoneLauncher"

type Node = { icon: typeof FileText; disc: string; label: ReactNode; sub: ReactNode }

const NODES: Node[] = [
  { icon: FileText, disc: "bg-muted text-muted-foreground", label: <Trans>PDF</Trans>, sub: <Trans>Your file</Trans> },
  { icon: ScanText, disc: "bg-stage-extract text-white", label: <Trans>Extract</Trans>, sub: <Trans>Pages & structure</Trans> },
  { icon: Sparkles, disc: "bg-stage-captions text-white", label: <Trans>Enhance</Trans>, sub: <Trans>Narrate & caption</Trans> },
  { icon: Languages, disc: "bg-stage-translate text-white", label: <Trans>Localize</Trans>, sub: <Trans>Translate & simplify</Trans> },
  { icon: ShieldCheck, disc: "bg-stage-validation text-white", label: <Trans>Validate</Trans>, sub: <Trans>WCAG checks</Trans> },
  { icon: Package, disc: "bg-stage-export text-white", label: <Trans>Bundle</Trans>, sub: <Trans>Ready to share</Trans> },
]

export function PipelineRibbon({ onAddBook, onOpenDocs }: WelcomeVariantProps) {
  return (
    <div className="flex h-full flex-col justify-center px-10 py-10 lg:px-16">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-brand-600">
        <Trans>How it works</Trans>
      </div>
      <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em]">
        <Trans>One pipeline, PDF to accessible book.</Trans>
      </h1>
      <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-muted-foreground">
        <Trans>Add a file and each stage runs in order, fully inspectable and easy to rerun. Nothing to configure to get started.</Trans>
      </p>

      <div className="relative mt-10 mb-9">
        <div
          aria-hidden
          className="absolute left-[6%] right-[6%] top-[28px] h-[3px] rounded-full opacity-90"
          style={{
            background:
              "linear-gradient(90deg, var(--color-stage-extract), var(--color-stage-captions), var(--color-stage-translate), var(--color-stage-validation), var(--color-stage-export))",
          }}
        />
        <ol className="relative flex items-start justify-between">
          {NODES.map((n, i) => {
            const Icon = n.icon
            return (
              <li key={i} className="flex w-0 grow basis-0 flex-col items-center text-center">
                <span className={cn("grid size-14 place-items-center rounded-2xl shadow-md ring-4 ring-background transition-transform duration-200 hover:-translate-y-0.5", n.disc)}>
                  <Icon className="size-6" />
                </span>
                <span className="mt-2.5 text-[12.5px] font-semibold">{n.label}</span>
                <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{n.sub}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          onClick={onAddBook}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition-transform duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus className="size-4" />
          <Trans>Add your first book</Trans>
        </button>
        <button
          type="button"
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <BookText className="size-3.5" />
          <Trans>Read the docs</Trans>
        </button>
      </div>
    </div>
  )
}
