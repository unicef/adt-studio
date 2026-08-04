import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export const CARD = "rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm"
export const HEADING = "mb-1 text-2xl font-bold tracking-[-0.02em]"
export const LEAD = "mb-[22px] text-[13.5px] text-muted-foreground"

export interface SettingRowProps {
  title: ReactNode
  subtitle: ReactNode
  alignStart?: boolean
  children: ReactNode
}

export function SettingRow({ title, subtitle, alignStart, children }: SettingRowProps) {
  return (
    <div className={cn("flex gap-5 border-t py-[18px] first:border-t-0", alignStart ? "items-start" : "items-center")}>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
