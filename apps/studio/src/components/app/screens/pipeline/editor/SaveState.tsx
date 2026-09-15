import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SaveStateProps {
  dirty: boolean
  saving: boolean
}

export function SaveState({ dirty, saving }: SaveStateProps) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
        <Trans>Saving…</Trans>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[11.5px] transition-colors duration-200",
        dirty ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors duration-200",
          dirty ? "bg-amber-500" : "bg-emerald-500",
        )}
      />
      {dirty ? <Trans>Unsaved changes</Trans> : <Trans>Saved</Trans>}
    </span>
  )
}
