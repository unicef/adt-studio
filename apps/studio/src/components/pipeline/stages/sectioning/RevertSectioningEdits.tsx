import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { api, ApiError } from "@/api/client"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { CascadeResetDialog } from "../../components/CascadeResetDialog"

/** A shortcut to the existing guarded restore, without a history browser. */
export function RevertSectioningEdits({
  bookLabel,
  pageId,
  pageNumber,
  currentVersion,
  disabledReason,
  onBusyChange,
}: {
  bookLabel: string
  pageId: string
  pageNumber: number
  currentVersion: number
  disabledReason?: string
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const downstreamAffected = useDownstreamWithOutput("sectioning")
  const [target, setTarget] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const inFlight = useRef(false)
  const history = useQuery({
    queryKey: ["books", bookLabel, "sectioning-revert", pageId, currentVersion],
    queryFn: () => api.getVersionHistory(bookLabel, "page-sectioning", pageId, true),
  })
  // Only trust explicit AI authorship. After a rollback, a newer AI version
  // belongs to a different editing sequence and is not this edit's baseline.
  const generatedVersion = history.data?.versions.reduce<number | null>((latest, entry) => {
    const data = entry.data
    return entry.version < currentVersion && data && typeof data === "object"
      && "source" in data && data.source === "ai"
      ? Math.max(latest ?? 0, entry.version)
      : latest
  }, null)
  const unavailableReason = disabledReason ?? (history.isPending
    ? t`Loading saved content…`
    : history.isError
      ? t`Could not load saved content.`
      : generatedVersion == null
        ? t`No earlier AI-generated version is available for this page.`
        : undefined)

  const restore = async () => {
    if (target == null || unavailableReason || inFlight.current) return
    inFlight.current = true
    setRestoring(true)
    onBusyChange(true)
    setTarget(null)
    try {
      await api.restoreVersion(bookLabel, "page-sectioning", pageId, target, currentVersion)
      invalidateStoryboardDependents(queryClient, bookLabel)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel] })
      await queryClient.invalidateQueries({ queryKey: ["editable-activities", bookLabel, pageId] })
      toast.success(t`Manual edits reverted for page ${pageNumber}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(t`This page changed or a run started. Your edits were kept. Try again.`)
        await queryClient.invalidateQueries({ queryKey: ["books", bookLabel] })
      } else {
        toast.error(t`Could not revert this page. Your edits were kept. Try again.`)
      }
    } finally {
      inFlight.current = false
      setRestoring(false)
      onBusyChange(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!unavailableReason || restoring}
          title={unavailableReason}
          onClick={() => setTarget(generatedVersion ?? null)}
        >
          {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          <Trans>Revert manual edits</Trans>
        </button>
        {history.isError ? (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void history.refetch()}>
            <Trans>Could not load saved content. Retry</Trans>
          </button>
        ) : history.isSuccess && generatedVersion == null ? (
          <p className="text-xs text-muted-foreground"><Trans>No earlier AI-generated version is available for this page.</Trans></p>
        ) : null}
      </div>
      <CascadeResetDialog
        open={target != null}
        onOpenChange={(open) => { if (!open) setTarget(null) }}
        affectedStages={downstreamAffected}
        headerStageSlug="sectioning"
        title={<Trans>Revert manual edits on page {pageNumber}?</Trans>}
        description={<Trans>This restores the last generated sectioning for this page. Your edited version stays in history. Other pages keep their edits. Replacing this page later requires a separate confirmation.</Trans>}
        confirmLabel={<Trans>Revert manual edits</Trans>}
        confirmColorClass="bg-sky-600 hover:bg-sky-700"
        confirmIcon={Undo2}
        confirmDisabledReason={unavailableReason}
        onConfirm={() => void restore()}
      />
    </>
  )
}
