import { useId } from "react"
import { Trans } from "@lingui/react/macro"
import { PencilLine, RefreshCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DraftConflict({ error, paths, onResolve, wholeDocument = false }: { wholeDocument?: boolean; error: string | null; paths?: string[]; onResolve: (choice: "draft" | "latest") => void }) {
  const keepDescriptionId = useId()
  const latestDescriptionId = useId()
  if (!error) return null
  const hasConflicts = !!paths?.length

  return (
    <div className="m-4 shrink-0 overflow-hidden rounded-xl border border-amber-200/70 bg-background shadow-sm">
      <div role="alert" className="flex items-start gap-3 bg-amber-50/60 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
          <TriangleAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 max-w-3xl space-y-1">
          <h3 className="text-sm font-semibold text-amber-900">
            {hasConflicts ? <Trans>Conflicting changes detected</Trans> : <Trans>Changes not saved</Trans>}
          </h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {hasConflicts && wholeDocument ? (
              <Trans>The table of contents was reorganized or replaced. Your draft is intact. Choose which complete document to keep before editing again.</Trans>
            ) : hasConflicts ? (
              <Trans>This page was changed after you started editing, so some values are now out of sync. Your changes have not been saved.</Trans>
            ) : error}
          </p>
          {!hasConflicts && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <Trans>Your changes are still here. Review them before saving again.</Trans>
            </p>
          )}
        </div>
      </div>
      {hasConflicts && (
        <div className="space-y-3 border-t border-amber-200/50 px-4 py-4 sm:pl-16">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal text-left" aria-describedby={keepDescriptionId} onClick={() => onResolve("draft")}>
                <PencilLine className="h-4 w-4" aria-hidden />
                <Trans>Keep my changes</Trans>
              </Button>
              <p id={keepDescriptionId} className="text-xs leading-relaxed text-muted-foreground">
                {wholeDocument ? <Trans>Keep your entire table of contents, including its chapter targets and order.</Trans> : <Trans>Keep the values you entered where changes overlap.</Trans>}
              </p>
            </div>
            <div className="space-y-1.5">
              <Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal text-left" aria-describedby={latestDescriptionId} onClick={() => onResolve("latest")}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                <Trans>Load latest saved values</Trans>
              </Button>
              <p id={latestDescriptionId} className="text-xs leading-relaxed text-muted-foreground">
                {wholeDocument ? <Trans>Discard this draft and load the entire latest saved table of contents.</Trans> : <Trans>Replace your overlapping changes with the latest saved values.</Trans>}
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {wholeDocument ? <Trans>Review the chosen document, then save again.</Trans> : <Trans>Your other edits will be kept. Review the result, then save again.</Trans>}
          </p>
        </div>
      )}
    </div>
  )
}
