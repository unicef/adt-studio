import { useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/** A small "Why?" that folds the long explanation, the AI's words and the pages away until asked for. */
export function Why({ children, label, className }: { children: ReactNode; label?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 outline-none hover:text-brand-800 focus-visible:ring-2 focus-visible:ring-brand-400">
        {label ?? <Trans>Why?</Trans>}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapsible shown={open}>
        <div inert={!open} className="flex flex-col gap-2 pt-2.5">
          {children}
        </div>
      </Collapsible>
    </div>
  )
}

/** The sticky note's paper and tape, around any content. */
export function Paper({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) {
  return (
    <article className={cn("relative rounded-[4px] px-4 pb-4 pt-5 shadow-[0_2px_2px_rgba(0,0,0,0.06),0_18px_34px_-18px_rgba(60,45,0,0.7)] dark:shadow-[0_18px_34px_-18px_rgba(0,0,0,0.9)]", tone, className)}>
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/55 shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-white/15" />
      {children}
    </article>
  )
}
