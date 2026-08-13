import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm", className)}>
      {children}
    </div>
  )
}

export function SettingsHeading({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-2xl font-bold tracking-[-0.02em]">{children}</div>
}

export function SettingsLead({ children }: { children: ReactNode }) {
  return <div className="mb-[22px] text-[13.5px] text-muted-foreground">{children}</div>
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
