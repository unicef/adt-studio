import { ArrowRight, Camera, Ruler } from "lucide-react"
import { cn } from "@/lib/utils"
import { SeverityBadge } from "./SeverityBadge"
import type { Finding } from "./types"

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

export function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  return (
    <li
      id={finding.id}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm transition-[border-color,box-shadow] duration-200",
        "hover:border-brand-300 hover:shadow-md motion-reduce:transition-none",
        EASE,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <code className="min-w-0 break-all font-mono text-[12px] font-medium text-brand-700">{finding.where}</code>
          </div>
          <p className="mt-2 text-[14px] font-semibold leading-snug">{finding.problem}</p>

          {finding.evidence ? (
            <p className="mt-2 flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <Ruler className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{finding.evidence}</span>
            </p>
          ) : null}

          <p className="mt-2 flex gap-2 text-[13px] leading-relaxed">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
            <span>{finding.fix}</span>
          </p>

          {finding.shots?.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Camera className="size-3 text-muted-foreground" aria-hidden />
              {finding.shots.map((shot) => (
                <span
                  key={shot}
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                >
                  {shot}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
