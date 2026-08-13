import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useSettingsLayout } from "./SettingsLayoutContext"

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  const { layout } = useSettingsLayout()
  return (
    <div
      className={cn(
        layout === "dense"
          ? "flex flex-col"
          : "rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SettingsHeading({ children }: { children: ReactNode }) {
  const { layout } = useSettingsLayout()
  if (layout === "sections") {
    return (
      <h2 className="sticky top-12 z-[2] -mx-[34px] mb-3 border-b border-border/70 bg-background/85 px-[34px] py-2 text-lg font-semibold tracking-[-0.01em] backdrop-blur">
        {children}
      </h2>
    )
  }
  return <div className="mb-1 text-2xl font-bold tracking-[-0.02em]">{children}</div>
}

export function SettingsLead({ children }: { children: ReactNode }) {
  const { layout } = useSettingsLayout()
  return (
    <div
      className={cn(
        "text-[13.5px] text-muted-foreground",
        layout === "sections" ? "mb-4" : "mb-[22px]",
      )}
    >
      {children}
    </div>
  )
}

export interface SettingRowProps {
  title: ReactNode
  subtitle: ReactNode
  alignStart?: boolean
  anchorId?: string
  children: ReactNode
}

export function SettingRow({ title, subtitle, alignStart, anchorId, children }: SettingRowProps) {
  const { layout } = useSettingsLayout()
  const dense = layout === "dense"
  return (
    <div
      id={anchorId}
      className={cn(
        "flex scroll-mt-24 border-t first:border-t-0",
        dense ? "gap-4 py-3" : "gap-5 py-[18px]",
        alignStart ? "items-start" : "items-center",
      )}
    >
      <div className="flex-1">
        <div className={cn("font-semibold", dense ? "text-[13px]" : "text-sm")}>{title}</div>
        <p
          className={cn(
            "mt-0.5 leading-normal text-muted-foreground",
            dense ? "text-[12px]" : "text-[12.5px]",
          )}
        >
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}
