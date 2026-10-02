import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Lab-only segmented switch used by the prototype screens (bottom-right stack). */
export function LabToggle<T extends string | boolean>({ label, value, onChange, options }: { label: ReactNode; value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex items-center gap-1 rounded-full border bg-card/90 p-1 text-[12px] font-medium shadow-lg backdrop-blur">
      <span className="px-2 text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button key={String(option.value)} type="button" onClick={() => onChange(option.value)} className={cn("rounded-full px-3 py-1 transition-colors", value === option.value ? "bg-brand-600 text-primary-foreground" : "hover:bg-muted")}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function LabButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border bg-card/90 px-3.5 py-2 text-[12px] font-medium shadow-lg backdrop-blur transition-colors hover:bg-muted">
      {children}
    </button>
  )
}
