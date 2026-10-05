import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export function ComingSoon({ label, title, className }: { label?: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/60 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      <Clock className="size-2.5" />
      {label ?? <Trans>Soon</Trans>}
    </span>
  )
}

export function ComingSoonBanner({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed border-amber-400/50 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <Clock className="size-3.5 shrink-0" />
      <span>{children ?? <Trans>Previewed here — enabled once the AI-agnostic update ships.</Trans>}</span>
    </div>
  )
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm", className)}>
      {children}
    </div>
  )
}

export function SettingsHeading({ children }: { children: ReactNode }) {
  return <h1 className="mb-1 text-2xl font-bold tracking-[-0.02em]">{children}</h1>
}

export function SettingsLead({ children }: { children: ReactNode }) {
  return <p className="mb-[22px] text-[13.5px] text-muted-foreground">{children}</p>
}

export interface SettingRowProps {
  title: ReactNode
  subtitle: ReactNode
  alignStart?: boolean
  anchorId?: string
  children: ReactNode
}

export function SettingRow({ title, subtitle, alignStart, anchorId, children }: SettingRowProps) {
  return (
    <div
      id={anchorId}
      className={cn(
        "flex scroll-mt-24 gap-5 border-t py-[18px] first:border-t-0",
        alignStart ? "items-start" : "items-center",
      )}
    >
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
