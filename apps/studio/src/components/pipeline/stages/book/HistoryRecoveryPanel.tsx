import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import type { HistoryCheckpointRequest, HistoryIssue, HistoryRepairRequest } from "@adt/types"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"

/** Book identity resets the entire dialog/request lifecycle, even when two
 * books happen to have identical local version numbers and record names. */
export function HistoryRecoveryPanel({ bookLabel }: { bookLabel: string }) {
  return <BookHistoryRecovery key={bookLabel} bookLabel={bookLabel} />
}

function BookHistoryRecovery({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const client = useQueryClient()
  const [opened, setOpened] = useState(false)
  const [confirmation, setConfirmation] = useState<{ snapshot: string; requestId: string } | null>(null)
  const [audit, setAudit] = useState<unknown[] | null>(null)
  const state = useQuery({
    queryKey: ["books", bookLabel, "history-recovery"],
    queryFn: ({ signal }) => api.inspectHistoryRecovery(bookLabel, signal), enabled: opened,
  })
  const recoverable = state.data?.issues.filter(issue => issue.reason === "recoverable") ?? []
  const operation = recoverable.length > 0 ? "repair" : "checkpoint"
  const mutation = useMutation({
    mutationFn: (request: HistoryCheckpointRequest | HistoryRepairRequest) => "records" in request
      ? api.repairHistory(bookLabel, request) : api.checkpointHistory(bookLabel, request),
    onSuccess: async () => {
      setConfirmation(null)
      // A recovered payload does not make a stage complete. Refetch the shared
      // read models rather than manufacturing optimistic completion/freshness.
      await client.invalidateQueries({ predicate: query => query.queryKey.includes(bookLabel) || query.queryKey[0] === "books" })
    },
  })
  const auditQuery = useMutation({ mutationFn: (requestId: string) => api.getHistoryRecoveryAudit(bookLabel, requestId), onSuccess: setAudit })
  const busy = state.isFetching || mutation.isPending
  const ready = state.data && !state.isError && !busy &&
    confirmation?.snapshot === state.data.snapshot &&
    (recoverable.length > 0 || state.data.issueCount === 0 && state.data.checkpointable > 0)
  const reason = (issue: HistoryIssue) => {
    switch (issue.reason) {
      case "recoverable": return t`Verified original available`
      case "missing-witness": return t`No original evidence was saved before damage`
      case "changed-record": return t`This record was changed or recreated; older evidence cannot restore it`
      case "invalid-witness": return t`Original evidence or record continuity cannot be verified`
      case "missing-record": return t`A historical record is missing; it cannot be reconstructed safely`
    }
  }
  const inspect = () => { setOpened(true); setConfirmation(null); setAudit(null); mutation.reset(); void state.refetch() }
  return <section className="space-y-3 rounded-lg border p-4">
    <h2 className="font-medium"><Trans>History recovery</Trans></h2>
    <p className="text-sm text-muted-foreground"><Trans>Inspect identity history before recovery. Only verified original bytes can be restored. Recovery keeps damaged evidence and assets, and does not regenerate content.</Trans></p>
    <Button variant="outline" onClick={inspect} disabled={busy}><Trans>Inspect history</Trans></Button>
    {opened && state.isPending && <p role="status"><Trans>Inspecting history…</Trans></p>}
    {opened && state.data && <>
      <p className="text-sm"><Trans>{state.data.issueCount} history issue(s); {state.data.checkpointable} readable record(s) without a checkpoint. Showing up to 20 affected versions.</Trans></p>
      {state.data.issueCount === 0 && state.data.checkpointable > 0 && <details className="text-sm">
        <summary><Trans>Readable versions included in this checkpoint</Trans></summary>
        <ul className="max-h-60 overflow-auto">{(state.data.checkpointRecords ?? []).map(row => <li key={JSON.stringify([row.node, row.itemId, row.version])}><code>{row.node} / {row.itemId} / {row.version}</code></li>)}</ul>
      </details>}
      <ul className="space-y-1 text-sm">
        {state.data.issues.map(issue => <li key={JSON.stringify([issue.node, issue.itemId, issue.version])}>
          <code>{issue.node} / {issue.itemId} / {issue.version}</code>: {reason(issue)}
        </li>)}
      </ul>
      {state.data.issues.some(issue => issue.reason !== "recoverable") && <p className="text-sm"><Trans>Some history cannot be recovered from the available evidence. Existing content stays retained. A verified book backup may be needed; choosing an older selected version does not repair missing history.</Trans></p>}
      {(recoverable.length > 0 || state.data.issueCount === 0 && state.data.checkpointable > 0) && <>
        <p className="text-sm">{operation === "repair"
          ? <Trans>Restore the listed recoverable versions exactly. A selected version receives a new version number so old edit drafts cannot overwrite it. Review new replacement consent before running Sectioning.</Trans>
          : <Trans>Save recovery evidence for currently readable history. A checkpoint cannot recover records that were already damaged.</Trans>}</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmation?.snapshot === state.data.snapshot} disabled={busy}
            onChange={event => setConfirmation(event.target.checked ? { snapshot: state.data!.snapshot, requestId: crypto.randomUUID() } : null)} />
          <Trans>I reviewed this book and the affected versions, and explicitly confirm this operation.</Trans>
        </label>
        <div className="flex gap-2">
          <Button disabled={!ready} onClick={() => {
            if (!ready || !confirmation) return
            const request: HistoryCheckpointRequest = { ...confirmation, confirmed: true }
            mutation.mutate(operation === "repair" ? { ...request, records: recoverable.map(({ node, itemId, version, beforeHash, witnessHash }) => ({ node, itemId, version, beforeHash, witnessHash: witnessHash! })) } : request)
          }}>{operation === "repair" ? <Trans>Restore verified history</Trans> : <Trans>Save history checkpoint</Trans>}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { setConfirmation(null); setOpened(false); mutation.reset(); setAudit(null); void client.cancelQueries({ queryKey: ["books", bookLabel, "history-recovery"], exact: true }) }}><Trans>Cancel</Trans></Button>
        </div>
      </>}
    </>}
    {(state.error || mutation.error || auditQuery.error) && <p role="alert" className="text-sm text-destructive">{(state.error || mutation.error || auditQuery.error)?.message}</p>}
    {mutation.data && <div className="space-y-2 text-sm" role="status">
      <p><Trans>Operation recorded for {mutation.data.count} version(s). Review the current inspection before continuing. Generation has not been started.</Trans></p>
      {mutation.data.operation === "repair" && <Button variant="outline" disabled={auditQuery.isPending} onClick={() => auditQuery.mutate(mutation.data.requestId)}><Trans>View recovery evidence</Trans></Button>}
    </div>}
    {audit && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{JSON.stringify(audit, null, 2)}</pre>}
  </section>
}
