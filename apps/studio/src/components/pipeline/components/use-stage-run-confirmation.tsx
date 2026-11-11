import { runConfirmationQueryKey } from "@/hooks/run-confirmation-query"
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import { api, type RunStagesOptions } from "@/api/client"
import { Button } from "@/components/ui/button"
import { CascadeResetDialog } from "./CascadeResetDialog"
import { HistoryRecoveryLink } from "./HistoryRecoveryLink"
import { getStageLabelI18n } from "../pipeline-i18n"

type RunConsent = Pick<RunStagesOptions, "replaceManual" | "protectedReplacements">
type ProtectedWork = NonNullable<Awaited<ReturnType<typeof api.getStepStatus>>["protectedWork"]>

/** Shared confirmation for the existing whole-stage run entry points. Consent
 * names a frozen version, never whatever a later status refresh happens to show. */
export function useStageRunConfirmation({ bookLabel, stage, available, affectedStages = [], confirmDownstream = false, confirmLabel, colorClass }: {
  bookLabel: string
  stage: string
  available: boolean
  affectedStages?: StageName[]
  confirmDownstream?: boolean
  confirmLabel?: ReactNode
  colorClass: string
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const instanceId = useId()
  const protectionRead = useRef(0)
  const protectedStage = stage === "sectioning" || stage === "toc"
  const status = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: protectedStage,
    refetchOnMount: "always",
  })
  const scope = useMemo(() => ({ active: true }), [bookLabel, stage])
  const protectionQuery = useRef<{ scope: typeof scope; key: ReturnType<typeof runConfirmationQueryKey> } | null>(null)
  const currentScope = useRef(scope)
  currentScope.current = scope
  const availableRef = useRef(available)
  availableRef.current = available
  const pending = useRef<{ scope: typeof scope; resolve: (value: RunConsent | null) => void } | null>(null)
  const executing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; work: ProtectedWork; settingsSaved?: boolean } | null>(null)
  const [replaceManual, setReplaceManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useLayoutEffect(() => {
    scope.active = true
    executing.current = false
    setBusy(false)
    setSnapshot(null)
    setError(null)
    return () => {
      scope.active = false
      if (protectionQuery.current?.scope === scope) void queryClient.cancelQueries({ queryKey: protectionQuery.current.key, exact: true })
      if (pending.current?.scope === scope) {
        pending.current.resolve(null)
        pending.current = null
      }
    }
  }, [scope, queryClient])
  const isCurrent = () => scope.active && currentScope.current === scope && availableRef.current
  const finish = (value: RunConsent | null) => {
    if (pending.current?.scope !== scope) return
    pending.current.resolve(value)
    pending.current = null
    setSnapshot(null)
  }
  const readWork = async (): Promise<ProtectedWork> => {
    if (!protectedStage) return []
    // Only this request's completed, non-aborted read can define consent;
    // cancelled/deduplicated queries cannot authorize warm cached records.
    let completed: { data: Awaited<ReturnType<typeof api.getStepStatus>>; signal: AbortSignal } | undefined
    const queryKey = runConfirmationQueryKey(bookLabel, stage, instanceId, ++protectionRead.current)
    protectionQuery.current = { scope, key: queryKey }
    try {
      // Background status reads may already be running. A request-owned key
      // guarantees this explicit action gets its own fresh, cancellable read.
      await queryClient.fetchQuery({
        queryKey, staleTime: 0, gcTime: 0,
        queryFn: async ({ signal }) => {
          const data = await api.getStepStatus(bookLabel, signal)
          completed = { data, signal }
          return data
        },
      })
      if (!completed || completed.signal.aborted) throw new Error(t`Saved content could not be verified. Try again.`)
      return (completed.data.protectedWork ?? [])
        .filter(record => record.node === (stage === "toc" ? "toc-generation" : "page-sectioning"))
        .map(record => ({ ...record }))
    } finally {
      queryClient.removeQueries({ queryKey, exact: true })
      if (protectionQuery.current?.key === queryKey) protectionQuery.current = null
    }
  }
  const confirm = (work: ProtectedWork, settingsSaved = false): Promise<RunConsent | null> => new Promise(resolve => {
    pending.current = { scope, resolve }
    setReplaceManual(false)
    setSnapshot({ scope, work, settingsSaved })
  })
  const requestRun = async (
    run: (options: RunConsent, stillCurrent: () => boolean) => void | boolean | Promise<void | boolean>,
    beforeRun?: () => Promise<void>,
  ): Promise<boolean> => {
    if (!isCurrent() || executing.current) return false
    executing.current = true
    setBusy(true)
    setError(null)
    try {
      const work = await readWork()
      if (!isCurrent()) return false
      let consent: RunConsent | null = work.length || confirmDownstream ? await confirm(work) : {}
      if (!consent || !isCurrent()) return false
      // Settings still confirm before saving, so first-dialog Cancel is inert.
      // An acknowledged Save can change the generation inputs. Replacement
      // needs a new, explicitly chosen receipt; never silently refresh consent.
      if (beforeRun) {
        await beforeRun()
        if (!isCurrent()) return false
        if (stage === "sectioning" && consent.replaceManual) {
          const refreshed = await readWork()
          if (!isCurrent()) return false
          const changedInputs = work.some(record => !record.sectioningInputSignature ||
            refreshed.find(next => next.itemId === record.itemId)?.sectioningInputSignature !== record.sectioningInputSignature)
          if (changedInputs) consent = await confirm(refreshed, true)
          // Unchanged settings retain the first frozen entity versions. An
          // unrelated content save must conflict at the server, not gain consent.
        }
      }
      if (!consent || !isCurrent()) return false
      const result = await run(consent, isCurrent)
      return result !== false && scope.active && currentScope.current === scope
    } catch (cause) {
      if (scope.active && currentScope.current === scope) setError(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      if (scope.active && currentScope.current === scope) {
        executing.current = false
        setBusy(false)
      }
    }
  }
  const loading = protectedStage && (status.isPending || status.isFetching)
  const disabledReason = busy || loading ? t`Loading saved content…` : protectedStage && status.isError ? status.error.message : undefined
  const work = snapshot?.scope === scope ? snapshot.work : []
  const replacementUnavailable = stage === "sectioning" && work.some(record => !record.sectioningInputSignature)
  const stageLabel = getStageLabelI18n(stage)
  const notice = <>
    {loading && <p className="text-xs text-muted-foreground"><Trans>Loading saved content…</Trans></p>}
    {(error || (protectedStage && status.isError)) && <div role="alert" className="space-y-1 text-sm text-red-700">
      <p>{error ?? status.error?.message} <HistoryRecoveryLink bookLabel={bookLabel} error={error ?? status.error?.message} /></p>
      {protectedStage && <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => { setError(null); void status.refetch() }}><Trans>Retry</Trans></Button>}
    </div>}
  </>
  const dialog = <CascadeResetDialog
    open={snapshot?.scope === scope}
    onOpenChange={open => { if (!open) finish(null) }}
    affectedStages={stage === "sectioning" && !replaceManual ? [] : affectedStages}
    headerStageSlug={stage}
    title={<Trans>Re-run {stageLabel}?</Trans>}
    description={stage === "sectioning" && work.length > 0
      ? <Trans>Existing pages stay unchanged. This run fills missing Sectioning only unless you explicitly choose replacement.</Trans>
      : <Trans>Review the affected stages after this change.</Trans>}
    confirmLabel={confirmLabel ?? <Trans>Re-run</Trans>}
    confirmColorClass={colorClass}
    confirmDisabledReason={!available ? t`Please wait for the current operation to finish` : undefined}
    onConfirm={() => {
      if (!isCurrent() || snapshot?.scope !== scope) return
      const replace = work.length > 0 && (stage === "toc" || replaceManual)
      if (replace && replacementUnavailable) return
      finish({ replaceManual: replace, protectedReplacements: replace ? work.map(({ pageNumber: _pageNumber, ...record }) => record) : [] })
    }}
  >
    {snapshot?.settingsSaved && <p className="text-sm"><Trans>Settings were saved. Review replacement again using the updated configuration and page window.</Trans></p>}
    {work.length > 0 && (stage === "toc"
      ? <p className="text-sm"><Trans>This replaces the manually edited or legacy table of contents. Its saved version remains in history.</Trans></p>
      : <div className="space-y-2 text-sm">
        <p><Trans>Saved pages:</Trans></p>
        <ul className="max-h-48 overflow-y-auto">{work.map(r => <li key={r.itemId}><Trans>Page {r.pageNumber ?? r.itemId} ({r.itemId}): Sectioning v{r.version}, Storyboard v{r.renderingVersion ?? 0}, render tree v{r.renderTreeVersion ?? 0}, activities v{r.editableActivityVersion ?? 0}</Trans></li>)}</ul>
        <p><Trans>Replacing these pages resets their current Storyboard, including manual edits. Saved versions and media stay in history; Storyboard must be rebuilt even if generation is cancelled or fails.</Trans></p>
        {replacementUnavailable && <p role="status"><Trans>Replacement inputs could not be verified. Existing pages will stay unchanged.</Trans></p>}
        <label className="flex gap-2"><input type="checkbox" checked={replaceManual} disabled={replacementUnavailable} onChange={event => setReplaceManual(event.target.checked)} /><Trans>Replace these pages and reset their Storyboard</Trans></label>
      </div>)}
  </CascadeResetDialog>
  return { requestRun, disabledReason, notice, dialog, busy }
}
