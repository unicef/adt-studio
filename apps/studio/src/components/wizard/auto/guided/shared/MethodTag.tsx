import { Trans } from "@lingui/react/macro"
import { LayoutTemplate, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/** Layouts the AI builds page by page; the others are laid out from a template. */
const AI_LAYOUTS = ["llm", "llm-overlay"]
export const usesAI = (strategy: string) => AI_LAYOUTS.includes(strategy)

/** How a page layout is made: by the AI (slower, uses credits) or from a template (quick, no AI cost). */
export function MethodTag({ strategy, long, className }: { strategy: string; long?: boolean; className?: string }) {
  const ai = usesAI(strategy)
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium", ai ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-black/[0.05] text-foreground/70 dark:bg-white/[0.08]", className)}>
      {ai ? <Sparkles aria-hidden className="size-3" /> : <LayoutTemplate aria-hidden className="size-3" />}
      {ai ? long ? <Trans>Made by the AI · takes longer, may cost money</Trans> : <Trans>Made by the AI</Trans> : long ? <Trans>Ready-made layout · quick, costs nothing extra</Trans> : <Trans>Ready-made layout</Trans>}
    </span>
  )
}
