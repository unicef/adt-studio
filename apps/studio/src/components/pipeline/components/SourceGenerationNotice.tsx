import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, RefreshCw } from "lucide-react"
import { api, type RunStagesOptions } from "@/api/client"
import { Button } from "@/components/ui/button"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useHasUnsavedChanges } from "./floating-save"
import { CascadeResetDialog } from "./CascadeResetDialog"
import { getStageLabelI18n } from "../pipeline-i18n"

/** Retained Quiz, Glossary or TOC content generated before a source edit.
 * Presented like the catalog stages' attention panel: Re-run regenerates the
 * whole stage; Keep accepts the content as current for today's inputs. */
export function SourceGenerationNotice({ bookLabel, stage }: { bookLabel: string; stage: string }) {
  const { sourceUpdateStages = [] } = useBookRun()
  return sourceUpdateStages.includes(stage) ? <UpdateNotice key={`${bookLabel}:${stage}`} bookLabel={bookLabel} stage={stage} /> : null
}

function UpdateNotice({ bookLabel, stage }: { bookLabel: string; stage: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { isRunning, isCancelling, queueRun } = useBookRun()
  const { apiKey } = useApiKey()
  const hasProvider = useBookStructuredTextAvailability(bookLabel)
  const hasUnsavedChanges = useHasUnsavedChanges()
  const status = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: stage === "toc",
  })
  const [replacement, setReplacement] = useState<RunStagesOptions["protectedReplacements"] | null>(null)
  const keep = useMutation({
    mutationFn: () => api.keepSourceGeneration(bookLabel, stage),
    // Step status carries the warning and the stage's completed state.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["books", bookLabel] }),
  })
  const busy = isRunning || isCancelling || hasUnsavedChanges || keep.isPending
  const rerunDisabled = busy || !hasProvider || (stage === "toc" && (status.isPending || status.isError))
  const queue = (options: Pick<RunStagesOptions, "replaceManual" | "protectedReplacements"> = {}) =>
    queueRun({ fromStage: stage, toStage: stage, apiKey, viewAfter: true, ...options })
  const rerun = () => {
    if (rerunDisabled) return
    const protectedToc = (status.data?.protectedWork ?? []).filter((record) => record.node === "toc-generation")
    if (stage === "toc" && protectedToc.length > 0) {
      // Freeze the versions the author confirms. A refetch must never authorize
      // replacing an intervening edit; the shared run admission rejects it.
      setReplacement(protectedToc.map(({ node, itemId, version }) => ({ node, itemId, version })))
    } else queue()
  }
  const stageLabel = getStageLabelI18n(stage)
  return (
    <div className="px-4">
      <section role="status" className="my-2 min-w-0 rounded-lg border bg-background">
        <div className="space-y-1.5 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto flex flex-wrap items-center gap-x-2 gap-y-1">
              <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <span className="text-sm font-medium"><Trans>Generated before your latest edits</Trans></span>
            </div>
            <Button size="sm"
              className="h-8 border border-amber-600 bg-amber-500 text-xs text-amber-950 shadow-sm hover:bg-amber-400"
              disabled={rerunDisabled}
              onClick={rerun}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <Trans>Re-run</Trans>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (!busy) keep.mutate() }}>
              <Trans>Keep existing content</Trans>
            </Button>
          </div>
          <p className="text-muted-foreground">
            <Trans>Your content is retained. Re-run this stage to update it from the edited book.</Trans>{" "}
            <Trans>Keep accepts existing content without regenerating it.</Trans>
          </p>
          {hasUnsavedChanges && <p><Trans>Save or discard your changes before re-running.</Trans></p>}
          {!hasProvider && <p><Trans>Configure an AI provider in Settings to re-run this stage.</Trans></p>}
          {stage === "toc" && status.isPending && <p><Trans>Loading saved content…</Trans></p>}
          {stage === "toc" && status.isError && <p className="text-red-700">{status.error.message}</p>}
          {keep.isPending && <p><Trans>Applying changes…</Trans></p>}
          {keep.error && <p className="text-red-700">{keep.error.message}</p>}
        </div>
      </section>
      <CascadeResetDialog
        open={replacement !== null}
        onOpenChange={(open) => { if (!open) setReplacement(null) }}
        affectedStages={[]}
        headerStageSlug={stage}
        title={<Trans>Re-run {stageLabel}?</Trans>}
        description={<Trans>Review the affected stages after this change.</Trans>}
        confirmLabel={<Trans>Re-run</Trans>}
        confirmColorClass="bg-amber-600 hover:bg-amber-700"
        confirmDisabledReason={hasUnsavedChanges ? t`Save or discard your changes before re-running.`
          : !hasProvider ? t`Configure an AI provider in Settings to re-run this stage.`
          : status.isError ? status.error.message
          : status.isPending ? t`Loading saved content…`
          : busy ? t`Applying changes…` : undefined}
        onConfirm={() => {
          if (rerunDisabled || replacement === null) return
          queue({ replaceManual: true, protectedReplacements: replacement })
          setReplacement(null)
        }}
      >
        <p className="text-sm"><Trans>This replaces the manually edited or legacy table of contents. Its saved version remains in history.</Trans></p>
      </CascadeResetDialog>
    </div>
  )
}
