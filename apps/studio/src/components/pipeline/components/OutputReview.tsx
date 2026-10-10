import { BulkOutputReview } from "./BulkOutputReview"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import { OUTPUT_KIND_TO_STAGE, type OutputKind, type OutputStatus, type StageName, type OutputDisclosureOptions } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { Button } from "@/components/ui/button"
import { useFloatingSaveDirtyEntries } from "./floating-save"
import { useStageStatus } from "@/hooks/use-stage-status"

export function useOutputs(bookLabel: string, disclosure = false, features?: OutputDisclosureOptions) {
  return useQuery({ queryKey: ["books", bookLabel, "outputs", disclosure, features], queryFn: () => disclosure ? api.getOutputDisclosure(bookLabel, features) : api.getOutputs(bookLabel), staleTime: 1000, enabled: !!bookLabel })
}

/** Job completion and saved content are separate. An invalidated job must not
 * hide a preserved editor behind the first-run setup screen. */
export function useHasSavedOutputs(bookLabel: string, stage: StageName) {
  const { data } = useOutputs(bookLabel)
  return data?.outputs.some((output) => OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage &&
    output.identity.kind !== "preparation" && (output.usable || output.protected)) ?? false
}

export function OutputReview({ bookLabel, id, kinds, language, voiceSlot, dirty = false }: {
  bookLabel: string; id: string; kinds: OutputKind[]; language?: string; voiceSlot?: string; dirty?: boolean
}) {
  const { data } = useOutputs(bookLabel)
  const outputs = data?.outputs.filter((output) => output.identity.id === id && kinds.includes(output.identity.kind) &&
    (!language || !output.identity.language || output.identity.language === language) && (!voiceSlot || !output.identity.voiceSlot || output.identity.voiceSlot === voiceSlot)) ?? []
  return <div className="space-y-1">{outputs.map((output) => <OutputReviewItem key={JSON.stringify(output.identity)} bookLabel={bookLabel} output={output} outputs={data?.outputs ?? []} dirty={dirty} />)}</div>
}

function OutputReviewItem({ bookLabel, output, outputs, dirty = false, disclosure = false, detail = false }: {
  bookLabel: string; output: OutputStatus; outputs: OutputStatus[]; dirty?: boolean; disclosure?: boolean; detail?: boolean
}) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const queryClient = useQueryClient()
  const dirtyEntries = useFloatingSaveDirtyEntries()
  const hasDraft = dirty || dirtyEntries.length > 0
  const [replace, setReplace] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const { isRunning } = useStageStatus(OUTPUT_KIND_TO_STAGE[output.identity.kind])
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["books", bookLabel] })
  const mutation = useMutation({
    mutationFn: async (action: "keep" | "checked" | "generate" | "replace" | "retry" | "skip") => {
      if (action === "skip") return api.skipOutputs(bookLabel, { identities: [output.identity] })
      if (action === "keep" || action === "checked") return api.reviewOutput(bookLabel, { identity: output.identity, signature: output.signature, contentHash: output.contentHash, action })
      const stage = OUTPUT_KIND_TO_STAGE[output.identity.kind]
      return api.runStages(bookLabel, apiKey, { fromStage: stage, toStage: stage, outputScope: {
        selection: { kinds: [output.identity.kind], ids: [output.identity.id], ...(output.identity.language ? { languages: [output.identity.language] } : {}), ...(output.identity.voiceSlot ? { voiceSlots: [output.identity.voiceSlot] } : {}) },
        ...(action === "retry" ? { retry: [output.identity] } : {}),
        ...(action === "replace" ? { replace: [{ identity: output.identity, signature: output.signature, contentHash: output.contentHash }] } : {}),
      } })
    }, onSuccess: async () => { setReplace(false); await refresh() },
  })
  if (output.excluded) return null
  const warnings = output.warnings
  const fallback = output.identity.kind === "preparation" && warnings.some((warning) => !warning.source && warning.reason.startsWith("preparation-"))
  const ownWarning = warnings.some((warning) => !warning.source)
  const source = warnings.find((warning) => warning.source)?.source
  const upstream = source && outputs.find((item) => item.identity.kind === source.kind && item.identity.id === source.id && item.identity.language === source.language && item.identity.voiceSlot === source.voiceSlot)
  if (!warnings.length && !output.updateNeeded && !output.missing && !output.manual) return null
  const label = output.identity.kind === "translation" ? t`Translation` : output.identity.kind === "preparation" ? t`Speech text` : output.identity.kind === "audio" ? t`Audio` : output.identity.kind === "caption" ? t`Caption` : output.identity.kind === "easy-read" ? t`Easy Read` : output.identity.kind === "timestamps" ? t`Timestamps` : t`Image translation`
  const reason = warnings.some((warning) => warning.reason === "legacy") ? t`Freshness is unknown. Existing content has been kept.`
    : warnings.some((warning) => warning.reason === "source-changed") ? t`Source changed. Your edit has been kept.`
    : warnings.some((warning) => warning.reason === "preparation-failed") ? t`Text preparation failed. Speech text uses the original text.`
    : warnings.some((warning) => warning.reason === "preparation-outdated") ? t`Text preparation is outdated. Speech text uses the original text.`
    : warnings.some((warning) => warning.reason === "preparation-missing") ? t`Text preparation is missing. Speech text uses the original text.`
    : source ? t`An input needs review.` : ""
  return <div className="rounded border border-amber-200/70 bg-amber-50/40 px-2 py-1 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{label}</span>
      {output.manual && <span>{t`Manual edit`}</span>}
      {output.updateNeeded && <span className="font-medium">{t`Update needed`}</span>}
      {warnings.length > 0 && <span className="inline-flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" />{t`Warning`}</span>}
      {output.missing && <span className="font-medium">{t`Missing`}</span>}
    </div>
    {detail && output.sourceText && <p className="mt-1 text-muted-foreground">{output.sourceText}</p>}
    {detail && output.text && output.text !== output.sourceText && <p className="mt-1">{output.text}</p>}
    {reason && <p className="mt-1">{reason}</p>}
    {disclosure && <p>{output.included ? t`Existing output is included.` : t`Missing output is omitted.`}</p>}
    {!hasDraft && !disclosure && ["easy-read", "preparation", "audio", "caption"].includes(output.identity.kind) && <p className="mt-1 text-muted-foreground">{t`Generation uses required section or page context and publishes only selected outputs. Current and protected outputs are kept.`}</p>}
    {!hasDraft && !disclosure && <div className="mt-1 flex flex-wrap gap-1">
      {isRunning && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("skip")}>{t`Skip this run`}</Button>}
      {output.usable && output.protected && ownWarning && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("keep")}>{output.manual ? t`Keep my edit` : t`Keep existing content`}</Button>}
      {fallback && output.usable && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("checked")}>{t`Mark checked`}</Button>}
      {fallback && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("retry")}>{t`Retry preparation`}</Button>}
      {(output.updateNeeded || output.missing) && (!output.protected) && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("generate")}>{t`Generate selected output`}</Button>}
      {output.protected && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => setReplace(!replace)}>{t`Regenerate`}</Button>}
      {replace && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("replace")}>{t`Regenerate and replace my edit`}</Button>}
      {upstream && <Button size="sm" variant="ghost" onClick={() => setShowSource(!showSource)}>{t`Review source`}</Button>}
    </div>}
    {showSource && upstream && <div className="mt-2 border-l pl-2"><p className="mb-1 font-mono">{upstream.identity.id} {upstream.identity.language}</p><OutputReviewItem bookLabel={bookLabel} output={upstream} outputs={outputs} dirty={dirty} disclosure={disclosure} detail /></div>}
    {mutation.error && <p className="mt-1 text-red-700">{mutation.error.message}</p>}
  </div>
}

export function CatalogSummary({ bookLabel, stage, disclosure = false, features }: { bookLabel: string; stage?: StageName; disclosure?: boolean; features?: OutputDisclosureOptions }) {
  const { t } = useLingui()
  const { data, error } = useOutputs(bookLabel, disclosure, features)
  const [open, setOpen] = useState(false)
  const outputs = (data?.outputs ?? []).filter((output) => !output.excluded && (!stage || OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage))
  const updates = outputs.filter((output) => output.updateNeeded).length
  const warnings = outputs.filter((output) => output.warnings.length).length
  const missing = outputs.filter((output) => output.missing).length
  if (error) return <p className="text-xs text-red-700">{error.message}</p>
  if (!updates && !warnings && !missing) return null
  return <div className="my-2 rounded border border-amber-200 p-2">
    <button type="button" className="flex items-center gap-2 text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
      <AlertTriangle className="h-4 w-4" />{t`${updates} updates needed · ${warnings} warnings · ${missing} missing`}
    </button>
    {open && !disclosure && <BulkOutputReview bookLabel={bookLabel} outputs={outputs} />}
    {open && <div className="mt-2 max-h-96 space-y-2 overflow-auto">{outputs.filter((output) => output.updateNeeded || output.missing || output.warnings.length).map((output) => <div key={JSON.stringify(output.identity)}>
      <p className="mb-1 text-xs font-mono">{output.identity.id} {output.identity.language} {output.identity.voiceSlot}</p>
      <OutputReviewItem bookLabel={bookLabel} output={output} outputs={data?.outputs ?? []} disclosure={disclosure} detail />
    </div>)}</div>}
  </div>
}
