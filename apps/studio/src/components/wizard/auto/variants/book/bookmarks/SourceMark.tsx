import { Trans } from "@lingui/react/macro"
import { PencilLine, Sparkles, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SettingSource } from "../model"

const STYLE: Record<SettingSource, string> = {
  ai: "text-brand-700 bg-brand-50 ring-brand-200 dark:bg-brand-500/15 dark:ring-brand-500/30",
  answered: "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/15 dark:ring-emerald-500/30",
  changed: "text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:ring-amber-500/30",
}

export function SourceText({ source }: { source: SettingSource }) {
  if (source === "answered") return <Trans>From your answer</Trans>
  if (source === "changed") return <Trans>Changed by you</Trans>
  return <Trans>AI pick</Trans>
}

/** Who set a bookmark: the AI, the user's answer on a note, or the user by hand. Icon only unless `withText`. */
export function SourceMark({ source, withText, className }: { source: SettingSource; withText?: boolean; className?: string }) {
  const Icon = source === "answered" ? UserRound : source === "changed" ? PencilLine : Sparkles
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full text-[11px] font-semibold ring-1", withText ? "px-2 py-0.5" : "size-5 justify-center", STYLE[source], className)}>
      <Icon className="size-3" aria-hidden />
      {withText ? (
        <SourceText source={source} />
      ) : (
        <span className="sr-only">
          <SourceText source={source} />
        </span>
      )}
    </span>
  )
}
