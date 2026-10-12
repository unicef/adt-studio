import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import type { ValidationRepairRequest, ValidationRepairTarget } from "@adt/types"
import { api, ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"

/** Request identity survives lost replies and navigation. It is only client
 * continuity; the common server task receipt owns admission and actual status. */
export function ValidationRepairAction({ label, pageId, target, onOpenEditor }: {
  label: string; pageId: string; target: ValidationRepairTarget; onOpenEditor: () => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const key = JSON.stringify([label, pageId, target])
  const storageKey = `validation-render:${key}`
  const [request, setRequest] = useState<ValidationRepairRequest | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "null") } catch { return null }
  })
  const [confirm, setConfirm] = useState(false)
  const [rejected, setRejected] = useState(false)
  const submitting = useRef(false)
  const availability = useQuery({ queryKey: ["validation-repair", label, pageId, target],
    queryFn: () => api.getValidationRepairAvailability(label, pageId, target), staleTime: 0 })
  const receipt = useQuery({ queryKey: ["task-request", label, request?.requestId],
    queryFn: () => api.getTaskRequest(label, request!.requestId), enabled: !!request,
    refetchInterval: (query) => ["completed", "failed", "cancelled"].includes(query.state.data?.task?.status ?? "") ? false : 1000 })
  const task = receipt.data?.task
  const submit = useMutation({ mutationFn: (body: ValidationRepairRequest) => api.submitValidationRepair(label, pageId, body),
    onError: (error) => { if (error instanceof ApiError && [400, 404, 409].includes(error.status)) setRejected(true) },
    onSettled: () => { submitting.current = false; void receipt.refetch() } })
  const cancel = useMutation({ mutationFn: () => api.cancelTask(label, task!.taskId), onSettled: () => { void receipt.refetch() } })
  useEffect(() => {
    if (!task || !["completed", "failed", "cancelled"].includes(task.status)) return
    void queryClient.invalidateQueries({ queryKey: ["validation-repair", label] })
    void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
    void queryClient.invalidateQueries({ queryKey: ["books", label, "outputs"] })
  }, [task?.status, task?.taskId, label, queryClient])
  const remember = (value: ValidationRepairRequest | null) => {
    setRequest(value)
    try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey) } catch { /* In-memory identity still protects retries in this view. */ }
  }
  const start = () => {
    if (submitting.current) return
    const state = availability.data
    const body = request ?? (state?.available && state.baseVersion && state.renderingVersion ? {
      ...target, requestId: crypto.randomUUID(), baseVersion: state.baseVersion, renderingVersion: state.renderingVersion,
    } : null)
    if (!body) return
    remember(body); submitting.current = true; setRejected(false); submit.mutate(body)
  }
  const reason = availability.data?.reason
  const message = reason === "historical" ? t`This finding describes older output. Open the editor or run validation again.`
    : reason === "protected" ? t`Manual, custom or unknown-origin content requires review in the editor.`
      : reason === "unsupported" ? t`This layout does not support semantic section rerendering.`
        : t`The target cannot be proven safe to rerender. Open the editor to inspect it.`
  const status = task?.status === "queued" ? t`Queued` : task?.status === "running" ? t`Running`
    : task?.status === "completed" ? t`Completed` : task?.status === "cancelled" ? t`Cancelled` : t`Failed`
  return <div className="space-y-2 rounded-md border p-2 text-xs">
    {task ? <div role="status"><strong>{status}</strong> — {target.sectionId}
      <p><Trans>The finding is unchanged. Run validation again for new automated evidence; human decisions require an explicit review action.</Trans></p>
      {task.error ? <p>{task.error}</p> : null}
      <Button variant="link" size="sm" onClick={onOpenEditor}><Trans>Open task output in Storyboard</Trans></Button>
      {task.cancellable && ["queued", "running"].includes(task.status) ? <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}><Trans>Cancel task</Trans></Button> : null}
    </div> : null}
    {cancel.error ? <p role="alert">{cancel.error.message}</p> : null}
    {submit.error && !task ? <p role="alert">{rejected ? t`The request was rejected. Refresh before trying again; your finding and draft are unchanged.` : t`The response is uncertain. Checking the accepted request; retrying uses the same request identity.`}</p> : null}
    {request && !task && !rejected ? <Button variant="outline" size="sm" disabled={submit.isPending} onClick={start}><Trans>Check or retry same request</Trans></Button> : null}
    {rejected && !task ? <Button variant="outline" size="sm" onClick={async () => {
      const result = await receipt.refetch()
      if (!result.isError && !result.data?.task) { remember(null); setRejected(false); submit.reset(); await availability.refetch() }
    }}><Trans>Refresh current target</Trans></Button> : null}
    {!request && availability.data?.available ? <Button variant="outline" size="sm" onClick={() => setConfirm(true)} aria-label={t`Rerender section ${target.sectionId}`}><Trans>Rerender section</Trans></Button> : null}
    {!availability.data?.available && !availability.isLoading ? <p role="status">{message}</p> : null}
    {task && ["failed", "cancelled"].includes(task.status) && availability.data?.available ? <Button variant="outline" size="sm" onClick={() => { remember(null); submit.reset(); setConfirm(true) }}><Trans>Start a new rerender</Trans></Button> : null}
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle><Trans>Rerender selected section?</Trans></AlertDialogTitle>
        <AlertDialogDescription><Trans>Replace generated output for {target.sectionId} on {pageId}. Provider calls may cost money. Other sections and human review decisions are retained. This does not mark the finding fixed.</Trans></AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel><AlertDialogAction onClick={start}><Trans>Confirm rerender</Trans></AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>
}
