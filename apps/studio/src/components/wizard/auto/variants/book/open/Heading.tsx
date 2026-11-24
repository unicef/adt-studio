import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"

/** A step's title (a word in the brand gradient) with an optional counter above and one short line under it. */
export function Heading({ kicker, title, line, stepKey }: { kicker?: ReactNode; title: ReactNode; line?: ReactNode; stepKey: string }) {
  return (
    <div key={stepKey} className="flex flex-col items-center gap-2 text-center animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
      {kicker && <p className="rounded-full bg-brand-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.12em] text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:ring-brand-500/30">{kicker}</p>}
      <h1 id="open-book-heading" tabIndex={-1} className={cn("text-[30px] font-bold leading-[1.05] tracking-[-0.035em] outline-none sm:text-[40px]")}>
        {title}
      </h1>
      {line && <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">{line}</p>}
    </div>
  )
}
