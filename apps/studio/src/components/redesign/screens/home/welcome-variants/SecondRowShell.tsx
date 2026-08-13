import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"


export function SampleEyebrow({ children }: { children?: ReactNode }) {
  return (
    <Badge variant="info" className="gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
      <Sparkles className="size-3" />
      {children ?? <Trans>Sample book</Trans>}
    </Badge>
  )
}

export function SecondRowHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode
  description: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="mb-4 mt-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {aside ? <div className="hidden shrink-0 sm:block">{aside}</div> : null}
    </div>
  )
}

export function SamplePanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card bg-gradient-to-br from-brand-500/[0.06] via-transparent to-transparent",
        className,
      )}
    >
      {children}
    </div>
  )
}
