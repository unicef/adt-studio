import { useId, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useLiving } from "./look"

/** The small "Why?" that keeps reasons, quotes and pages out of sight until asked for. */
export function Why({ children, className, label, aside }: { children: ReactNode; className?: string; label?: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const living = useLiving()
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={cn("-ml-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-brand-700 transition-colors hover:bg-brand-50", living ? "min-h-9 text-[13.5px] font-medium" : "text-[13px] font-semibold")}>
        {label ?? <Trans>Why?</Trans>}
        <ChevronDown className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {aside}
      </div>
      <Collapsible shown={open}>
        <div id={id} inert={!open} className="flex flex-col gap-2 pt-1.5 text-[13.5px] leading-snug text-muted-foreground">
          {children}
        </div>
      </Collapsible>
    </div>
  )
}
