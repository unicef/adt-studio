import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export const INSPECTOR_GRID = cn("grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,26%)]")
export const INSPECTOR_PAGE_CELL = cn("relative min-h-[420px] min-w-0 lg:min-h-0")
export const INSPECTOR_PAGE_CARD = cn("absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl border bg-card p-5 shadow-sm [container-type:size]")
export const INSPECTOR_PANEL = cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm")
export const INSPECTOR_PANEL_BODY = cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]")

export function InspectorInfoLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("-mt-2 shrink-0 font-mono text-[11px] text-muted-foreground/80", className)}>{children}</p>
}

export function InspectorLayout({ page, sheet, panel }: { page: ReactNode; sheet?: ReactNode; panel: ReactNode }) {
  return (
    <div className={INSPECTOR_GRID}>
      <div className={INSPECTOR_PAGE_CELL}>
        <div className={INSPECTOR_PAGE_CARD}>{page}</div>
        {sheet}
      </div>
      <aside className={INSPECTOR_PANEL}>
        <div className={INSPECTOR_PANEL_BODY}>{panel}</div>
      </aside>
    </div>
  )
}
