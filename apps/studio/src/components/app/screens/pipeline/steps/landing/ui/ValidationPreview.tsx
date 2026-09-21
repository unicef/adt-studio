import type { ReactNode } from "react"
import { ArrowDown, Contrast, FileCheck2, Heading, ImageOff, ShieldCheck } from "lucide-react"
import { Trans } from "@lingui/react/macro"

interface Finding {
  key: string
  icon: ReactNode
  rule: ReactNode
  severity: ReactNode
  tone: "serious" | "moderate" | "review"
  pages: ReactNode
}

const TONE: Record<Finding["tone"], string> = {
  serious: "bg-orange-100 text-orange-700",
  moderate: "bg-amber-100 text-amber-700",
  review: "bg-emerald-100 text-emerald-700",
}

export function ValidationPreview() {
  const findings: Finding[] = [
    {
      key: "alt",
      icon: <ImageOff className="size-2.5" strokeWidth={2.25} />,
      rule: <Trans>image-alt</Trans>,
      severity: <Trans>serious</Trans>,
      tone: "serious",
      pages: <Trans>4 pages</Trans>,
    },
    {
      key: "contrast",
      icon: <Contrast className="size-2.5" strokeWidth={2.25} />,
      rule: <Trans>color-contrast</Trans>,
      severity: <Trans>moderate</Trans>,
      tone: "moderate",
      pages: <Trans>11 pages</Trans>,
    },
    {
      key: "heading",
      icon: <Heading className="size-2.5" strokeWidth={2.25} />,
      rule: <Trans>p-as-heading</Trans>,
      severity: <Trans>review</Trans>,
      tone: "review",
      pages: <Trans>1 page</Trans>,
    },
  ]

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden ">
      <div className="flex h-full w-full flex-col gap-3 px-5 py-4">
        <div className="flex w-full shrink-0 flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            <FileCheck2 className="size-3.5 text-emerald-600" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Trans>Packaged Book</Trans>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {["index.html", "pg002.html", "pg003.html", "qz001.html"].map((file) => (
              <div
                key={file}
                className="rounded-md bg-background px-2 py-1 font-mono text-[9px] font-medium leading-none text-emerald-700 ring-1 ring-emerald-200"
              >
                {file}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center" aria-hidden>
          <div className="h-2 w-px bg-emerald-200" />
          <div className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <ArrowDown className="size-3" strokeWidth={2.5} />
          </div>
          <div className="h-2 w-px bg-emerald-200" />
        </div>

        <div className="flex w-full min-h-0 flex-1 flex-col items-stretch gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <Trans>Accessibility Findings</Trans>
          </span>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {findings.map((finding) => (
              <div
                key={finding.key}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">{finding.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-emerald-800">
                    {finding.rule}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide ${TONE[finding.tone]}`}
                  >
                    {finding.severity}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-2.5 text-emerald-300" strokeWidth={2.5} />
                  <span className="text-[9px] font-medium text-emerald-600/80">
                    <Trans>found on {finding.pages}</Trans>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-400">···</span>
          <span className="text-[10px] font-medium text-emerald-600/70">
            <Trans>each finding links to the page it came from</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}
