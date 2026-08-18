import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileText, ScanText, Sparkles, Languages, ShieldCheck, Package, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Node {
  icon: typeof FileText
  disc: string
  label: ReactNode
  sub: ReactNode
}

const NODES: Node[] = [
  { icon: FileText, disc: "bg-muted text-muted-foreground", label: <Trans>PDF</Trans>, sub: <Trans>Your file</Trans> },
  { icon: ScanText, disc: "bg-stage-extract text-white", label: <Trans>Extract</Trans>, sub: <Trans>Pages & structure</Trans> },
  { icon: Sparkles, disc: "bg-stage-captions text-white", label: <Trans>Enhance</Trans>, sub: <Trans>Narrate & caption</Trans> },
  { icon: Languages, disc: "bg-stage-translate text-white", label: <Trans>Localize</Trans>, sub: <Trans>Translate & simplify</Trans> },
  { icon: ShieldCheck, disc: "bg-stage-validation text-white", label: <Trans>Validate</Trans>, sub: <Trans>WCAG checks</Trans> },
  { icon: Package, disc: "bg-stage-export text-white", label: <Trans>Bundle</Trans>, sub: <Trans>Ready to share</Trans> },
]

/** Home first-run bottom row: the PDF→bundle pipeline as a single horizontal strip. */
export function PipelineStrip() {
  const navigate = useNavigate()
  return (
    <>
      <div className="mb-4 mt-[22px] flex items-baseline">
        <div>
          <div className="text-[15px] font-bold">
            <Trans>How it works</Trans>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Trans>One pipeline runs each stage in order — fully transparent, easy to rerun.</Trans>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/onboarding" })}
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Trans>Read the docs</Trans>
          <ArrowUpRight className="size-3" />
        </button>
      </div>

      <div className="rounded-2xl border bg-card px-6 py-7 shadow-sm">
        <div className="relative">
          <div
            aria-hidden
            className="absolute left-[7%] right-[7%] top-[24px] h-[3px] rounded-full opacity-90"
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
                  <span
                    className={cn(
                      "grid size-12 place-items-center rounded-2xl shadow-md ring-4 ring-card transition-transform duration-200 hover:-translate-y-0.5",
                      n.disc,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="mt-2.5 text-[12.5px] font-semibold">{n.label}</span>
                  <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{n.sub}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </>
  )
}
