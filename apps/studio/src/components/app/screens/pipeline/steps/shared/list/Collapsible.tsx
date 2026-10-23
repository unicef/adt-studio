import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function Collapsible({ open, children, id, className }: { open: boolean; children: ReactNode; id?: string; className?: string }) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

export function CollapseChevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180", className)} />
}
