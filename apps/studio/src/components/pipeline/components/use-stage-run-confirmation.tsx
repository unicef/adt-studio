import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import { api, type RunStagesOptions } from "@/api/client"
import { Button } from "@/components/ui/button"
import { CascadeResetDialog } from "./CascadeResetDialog"
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
  const currentScope = useRef(scope)
  currentScope.current = scope
  const availableRef = useRef(available)
  availableRef.current = available
  const pending = useRef<{ scope: typeof scope; resolve: (value: RunConsent | null) => void } | null>(null)
  const executing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; work: ProtectedWork } | null>(null)
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
      if (pending.current?.scope === scope) {
        pending.current.resolve(null)
        pending.current = null
      }
    }
  }, [scope])
  const isCurrent = () => scope.active && currentScope.current === scope && availableRef.current
  const finish = (value: RunConsent | null) => {
    if (pending.current?.scope !== scope) return
    pending.current.resolve(value)
    pending.current = null
    setSnapshot(null)
  }
  const requestRun = async (run: (options: RunConsent, stillCurrent: () => boolean) => void | boolean | Promise<void | boolean>): Promise<boolean> => {
    if (!isCurrent() || executing.current) return false
    executing.current = true
    setBusy(true)
    setError(null)
    try {
      let work: ProtectedWork = []
      if (protectedStage) {
        // Read again at the action boundary: a warm cache or a cancelled query
        // cannot silently turn unknown protection into an empty consent scope.
        let completed: { data: Awaited<ReturnType<typeof api.getStepStatus>>; signal: AbortSignal } | undefined
        // Own this read so polling cannot deduplicate it onto an older request.
        // Keep it book-scoped so deliberate cancellation still invalidates it.
        const queryKey = ["books", bookLabel, "step-status", "confirmation", stage, instanceId, ++protectionRead.current]
        try {
          await queryClient.fetchQuery({
            queryKey, staleTime: 0, gcTime: 0,
            queryFn: async ({ signal }) => {
              const data = await api.getStepStatus(bookLabel)
              completed = { data, signal }
              return data
            },
          })
        } finally {
          queryClient.removeQueries({ queryKey, exact: true })
        }
        if (!isCurrent()) return false
        // Query cancellation may resolve with reverted cached data. Only this
        // request's completed, non-aborted read can define replacement consent.
        if (!completed || completed.signal.aborted) throw new Error(t`Saved content could not be verified. Try again.`)
        work = (completed.data.protectedWork ?? []).filter(record => record.node === (stage === "toc" ? "toc-generation" : "page-sectioning")).map(record => ({ ...record }))
      }
      let consent: RunConsent | null = {}
      if (work.length || confirmDownstream) {
        consent = await new Promise(resolve => {
          pending.current = { scope, resolve }
          setReplaceManual(false)
          setSnapshot({ scope, work })
        })
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
  // A background poll must not disable queueing. The click still verifies saved
  // content with its own fresh read before it can authorize any run.
  const loading = protectedStage && status.isPending
  const disabledReason = busy || loading ? t`Loading saved content…` : protectedStage && status.isError ? status.error.message : undefined
  const work = snapshot?.scope === scope ? snapshot.work : []
  const stageLabel = getStageLabelI18n(stage)
  const notice = <>
    {loading && <p className="text-xs text-muted-foreground"><Trans>Loading saved content…</Trans></p>}
    {(error || (protectedStage && status.isError)) && <div role="alert" className="space-y-1 text-sm text-red-700">
      <p>{error ?? status.error?.message}</p>
      {protectedStage && <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => { setError(null); void status.refetch() }}><Trans>Retry</Trans></Button>}
    </div>}
  </>
  const dialog = <CascadeResetDialog
    open={snapshot?.scope === scope}
    onOpenChange={open => { if (!open) finish(null) }}
    affectedStages={affectedStages}
    headerStageSlug={stage}
    title={<Trans>Re-run {stageLabel}?</Trans>}
    description={stage === "sectioning" && work.length > 0
      ? <Trans>Pages listed below will keep their saved content unless you choose to replace them. All other pages will be regenerated.</Trans>
      : <Trans>Review the affected stages after this change.</Trans>}
    confirmLabel={confirmLabel ?? <Trans>Re-run</Trans>}
    confirmColorClass={colorClass}
    confirmDisabledReason={!available ? t`Please wait for the current operation to finish` : undefined}
    onConfirm={() => {
      if (!isCurrent() || snapshot?.scope !== scope) return
      const replace = work.length > 0 && (stage === "toc" || replaceManual)
      finish({ replaceManual: replace, protectedReplacements: replace ? work.map(({ node, itemId, version }) => ({ node, itemId, version })) : [] })
    }}
  >
    {work.length > 0 && (stage === "toc"
      ? <p className="text-sm"><Trans>This replaces the manually edited or legacy table of contents. Its saved version remains in history.</Trans></p>
      : <div className="space-y-2 text-sm">
        <p><Trans>Pages with manual edits or unknown authorship:</Trans> {work.map(record => record.pageNumber ?? record.itemId).join(", ")}</p>
        <label className="flex gap-2"><input type="checkbox" checked={replaceManual} onChange={event => setReplaceManual(event.target.checked)} /><Trans>Also regenerate these pages and replace their saved content</Trans></label>
      </div>)}
  </CascadeResetDialog>
  return { requestRun, disabledReason, notice, dialog, busy }
}
