import { useId, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

export function StyleAccordion({ label, open, onOpenChange, action, children }: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  action?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return <section className="border-b">
    <div className="flex items-center gap-2 py-1">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}>
        <ChevronRight aria-hidden className={`size-3 shrink-0 ${open ? "rotate-90" : ""}`} />
        {label}
      </button>
      {action}
    </div>
    <div id={id} role="region" aria-label={label} hidden={!open} className="pb-3">
      {open && children}
    </div>
  </section>
}
