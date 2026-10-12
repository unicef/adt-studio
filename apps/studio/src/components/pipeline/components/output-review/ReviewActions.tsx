import { useEffect, useState, type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { RefreshCw } from "lucide-react"
import { OUTPUT_KIND_TO_STAGE, STAGE_ORDER, type OutputStatus } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { Button } from "@/components/ui/button"
import { useFloatingSaveDirtyEntries } from "../floating-save"
import { getStageLabelI18n } from "../../pipeline-i18n"
import { buildReviewPlan, hasFallback, identityKey, reviewGuard } from "./review-plan"

export function ReviewActions({ bookLabel, outputs, catalog, filtered, heading, detailsButton, scopeKey }: {
  bookLabel: string; outputs: OutputStatus[]; catalog: OutputStatus[]; filtered: boolean
  heading: ReactNode; detailsButton: ReactNode; scopeKey: string
}) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const client = useQueryClient()
  const dirty = useFloatingSaveDirtyEntries().length > 0
  const { isRunning } = useBookRun()
  const [confirmReplace, setConfirmReplace] = useState(false)
  // Changing filters closes replacement confirmation without remounting the
  // focused filter controls or losing the pending state of a bulk action.
  useEffect(() => setConfirmReplace(false), [scopeKey])
  const plan = buildReviewPlan(outputs, catalog)
  const sources = plan.sourceStages.map(getStageLabelI18n).join(", ")
  const mutation = useMutation({
    mutationFn: async (action: "keep" | "update" | "replace") => {
      if (dirty || isRunning) return
      if (action === "keep") {
        await api.reviewOutputs(bookLabel, plan.keep.map((output) => ({ ...reviewGuard(output), action: output.protected ? "keep" : "checked" })))
        return
      }
      const targets = action === "replace" ? plan.replacement : plan.update
      for (const stage of STAGE_ORDER) {
        const work = targets.filter((output) => OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage)
        if (!work.length) continue
        await api.runStages(bookLabel, apiKey, { fromStage: stage, toStage: stage, outputScope: {
          selection: { identities: work.map((output) => output.identity) },
          retry: work.filter(hasFallback).map((output) => output.identity),
          ...(action === "replace" ? { replace: work.filter((output) => output.protected).map(reviewGuard) } : {}),
        } })
      }
    },
    onSuccess: () => setConfirmReplace(false),
    // A partial bulk acceptance or a rejected stale guard must also refresh.
    onSettled: () => client.invalidateQueries({ queryKey: ["books", bookLabel] }),
  })
  const disabled = dirty || isRunning || mutation.isPending
  const count = plan.replace.length
  return <div className="space-y-1.5 px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto">{heading}</div>
      {plan.update.length > 0 && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled} onClick={() => mutation.mutate("update")}><RefreshCw className="h-3.5 w-3.5" />{filtered ? t`Update filtered items` : t`Update all`}</Button>}
      {plan.keep.length > 0 && <Button size="sm" variant="outline" disabled={disabled} onClick={() => mutation.mutate("keep")}>{filtered ? t`Keep filtered content` : t`Keep all existing content`}</Button>}
      {count > 0 && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirmReplace(!confirmReplace)} aria-expanded={confirmReplace}>{t`Replace edits…`}</Button>}
      {detailsButton}
    </div>
    <p className="text-muted-foreground">
      {plan.update.length > 0 && <>{t`Updates preserve manual edits.`} </>}
      {plan.keep.length > 0 && <>{t`Keep accepts existing content without regenerating it.`} </>}
      {sources && t`Includes linked source items in: ${sources}.`}
    </p>
    {dirty && <p>{t`Save or cancel your draft before reviewing outputs.`}</p>}
    {isRunning && <p role="status">{t`Updates are running. You can continue reviewing the book.`}</p>}
    {mutation.isPending && !isRunning && <p role="status">{t`Applying changes…`}</p>}
    {confirmReplace && <div className="space-y-2 rounded border p-3">
      <p>{t`Regenerate and replace ${count} protected items? This replaces the edits listed below and updates their affected outputs.`}</p>
      <ul className="max-h-32 list-disc overflow-auto pl-4 text-muted-foreground">{plan.replace.map((output) => <li key={identityKey(output.identity)}>{output.text || output.sourceText || output.identity.id} {output.identity.language && <span>({output.identity.language})</span>}</li>)}</ul>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => mutation.mutate("replace")}>{t`Regenerate and replace edits`}</Button>
        <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => setConfirmReplace(false)}>{t`Cancel`}</Button>
      </div>
    </div>}
    {mutation.error && <p role="alert" className="text-red-700">{t`Some items could not be updated. The list has been refreshed; completed changes are kept.`} {mutation.error.message}</p>}
  </div>
}
