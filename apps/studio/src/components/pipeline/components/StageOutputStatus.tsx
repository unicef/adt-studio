import { useLingui } from "@lingui/react/macro"
import { TriangleAlert } from "lucide-react"
import type { OutputScopeSummary, StageName } from "@adt/types"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getStageLabelI18n } from "../pipeline-i18n"
import { CatalogSummary } from "./OutputReview"

/** Job errors/progress keep their own indicator; this opens the saved outputs
 * needing attention, even when the last attempt completed successfully. */
export function StageOutputStatus({ bookLabel, stage, summary, active = false }: {
  bookLabel: string; stage: string; summary: OutputScopeSummary; active?: boolean
}) {
  const { t } = useLingui()
  const { updates, reviews = 0, warnings, missing } = summary
  if (!updates && !reviews && !warnings && !missing) return null
  const label = getStageLabelI18n(stage)
  const description = t`Updates: ${updates}. Needs review: ${reviews}. Warnings: ${warnings}. Missing: ${missing}.`
  const title = t`Review ${label} outputs`
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={`${title}. ${description}`} title={`${title}. ${description}`}
        className={cn("relative z-20 shrink-0 rounded p-1 hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Amber-600 keeps 3:1 against white; on the active stage's colored row, match its white text.
          active ? "text-white" : "text-amber-600")}>
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      </button>
    </DialogTrigger>
    {/* Bounded grid column: truncated item text must not widen the panel past
        the dialog and push its actions outside. */}
    <DialogContent className="max-w-3xl grid-cols-[minmax(0,1fr)]">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <CatalogSummary bookLabel={bookLabel} stage={stage as StageName} expanded />
    </DialogContent>
  </Dialog>
}
