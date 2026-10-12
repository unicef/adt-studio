import { OutputReviewPanel } from "./output-review/OutputReviewPanel"
import { GENERATION_OUTPUT_KINDS } from "@adt/types"
import { getStageLabelI18n } from "../pipeline-i18n"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { AlertTriangle, TextCursorInput, Volume2 } from "lucide-react"
import { OUTPUT_KIND_TO_STAGE, type OutputKind, type OutputStatus, type StageName, type OutputDisclosureOptions } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useFloatingSaveDirtyEntries } from "./floating-save"
import { useStageStatus } from "@/hooks/use-stage-status"

import { useOutputs } from "@/hooks/use-outputs"
export { useOutputs } from "@/hooks/use-outputs"

/** Job completion and saved content are separate. An invalidated job must not
 * hide a preserved editor behind the first-run setup screen. */
export function useHasSavedOutputs(bookLabel: string, stage: StageName) {
  const { data } = useOutputs(bookLabel)
  return data?.outputs.some((output) => OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage &&
    output.identity.kind !== "preparation" && (output.usable || output.protected)) ?? false
}

export function OutputReview({ bookLabel, id, kinds, language, voiceSlot, dirty = false, compact = false, edited = false, description, showMissing = true }: {
  bookLabel: string; id: string; kinds: OutputKind[]; language?: string; voiceSlot?: string; dirty?: boolean; compact?: boolean; edited?: boolean; description?: string; showMissing?: boolean
}) {
  const { data } = useOutputs(bookLabel)
  const outputs = data?.outputs.filter((output) => (showMissing || !output.missing) && output.identity.id === id && kinds.includes(output.identity.kind) &&
    (!language || !output.identity.language || output.identity.language === language) && (!voiceSlot || !output.identity.voiceSlot || output.identity.voiceSlot === voiceSlot)) ?? []
  return <div className={compact ? "flex flex-wrap items-center gap-1" : "space-y-1"}>{outputs.map((output) => <OutputReviewItem key={JSON.stringify(output.identity)} bookLabel={bookLabel} output={output} outputs={data?.outputs ?? []} dirty={dirty} compact={compact} edited={edited} description={description} />)}</div>
}

function OutputReviewItem({ bookLabel, output, outputs, dirty = false, disclosure = false, detail = false, compact = false, inline = false, edited = false, description }: {
  bookLabel: string; output: OutputStatus; outputs: OutputStatus[]; dirty?: boolean; disclosure?: boolean; detail?: boolean; compact?: boolean; inline?: boolean; edited?: boolean; description?: string
}) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const queryClient = useQueryClient()
  const dirtyEntries = useFloatingSaveDirtyEntries()
  const hasDraft = dirty || edited || dirtyEntries.length > 0
  const [replace, setReplace] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const { isRunning } = useStageStatus(OUTPUT_KIND_TO_STAGE[output.identity.kind])
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["books", bookLabel] })
  const mutation = useMutation({
    mutationFn: async (action: "keep" | "checked" | "generate" | "replace" | "retry" | "skip") => {
      if (action === "skip") return api.skipOutputs(bookLabel, { identities: [output.identity] })
      if (action === "keep" || action === "checked") return api.reviewOutput(bookLabel, { identity: output.identity, signature: output.signature, contentHash: output.contentHash, revision: output.revision, action })
      const stage = OUTPUT_KIND_TO_STAGE[output.identity.kind]
      return api.runStages(bookLabel, apiKey, { fromStage: stage, toStage: stage, outputScope: {
        selection: { kinds: [output.identity.kind], ids: [output.identity.id], ...(output.identity.language ? { languages: [output.identity.language] } : {}), ...(output.identity.voiceSlot ? { voiceSlots: [output.identity.voiceSlot] } : {}) },
        ...(action === "retry" ? { retry: [output.identity] } : {}),
        ...(action === "replace" ? { replace: [{ identity: output.identity, signature: output.signature, contentHash: output.contentHash, revision: output.revision }] } : {}),
      } })
    }, onSuccess: async () => { setReplace(false); await refresh() },
  })
  if (output.excluded) return null
  const warnings = output.warnings
  const fallback = output.identity.kind === "preparation" && warnings.some((warning) => !warning.source && warning.reason.startsWith("preparation-"))
  const ownWarning = warnings.some((warning) => !warning.source)
  const upstream = outputs.filter((item) => warnings.some(({ source }) => source && item.identity.kind === source.kind && item.identity.id === source.id && item.identity.language === source.language && item.identity.voiceSlot === source.voiceSlot))
  if (output.identity.kind === "sectioning") return null
  if (!warnings.length && !output.updateNeeded && !output.missing && !output.manual && !edited) return null
  const label = GENERATION_OUTPUT_KINDS.some((kind) => kind === output.identity.kind) ? getStageLabelI18n(OUTPUT_KIND_TO_STAGE[output.identity.kind]) : output.identity.kind === "translation" ? t`Translation` : output.identity.kind === "preparation" ? t`Speech text` : output.identity.kind === "audio" ? t`Audio` : output.identity.kind === "caption" ? t`Caption` : output.identity.kind === "easy-read" ? t`Easy Read` : output.identity.kind === "timestamps" ? t`Timestamps` : t`Image translation`
  const reasons = [...new Set(warnings.map((warning) => warning.reason === "legacy" ? t`Freshness is unknown. Existing content has been kept.`
    : warning.reason === "source-changed" ? t`Source changed. Your edit has been kept.`
    : warning.reason === "preparation-failed" ? t`Text preparation failed. Speech text uses the original text.`
    : warning.reason === "preparation-outdated" ? t`Text preparation is outdated. Speech text uses the original text.`
    : warning.reason === "preparation-missing" ? t`Text preparation is missing. Speech text uses the original text.`
    : t`An input needs review.`))]
  const collectionItem = (output.identity.kind === "quizzes" || output.identity.kind === "glossary") && output.identity.id !== "book"
  const content = <div className={compact || inline ? "space-y-2 text-xs" : "rounded border border-amber-200/70 bg-amber-50/40 px-2 py-1 text-xs"}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{label}</span>
      {(output.manual || edited) && <span>{edited ? t`Unsaved edit` : t`Edited manually`}</span>}
      {output.updateNeeded && <span className="font-medium">{t`Update needed`}</span>}
      {warnings.length > 0 && <span className="inline-flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" />{t`Warning`}</span>}
      {output.missing && <span className="font-medium">{t`Missing`}</span>}
    </div>
    {detail && output.sourceText && <p className="mt-1 text-muted-foreground">{output.sourceText}</p>}
    {detail && output.text && output.text !== output.sourceText && <p className="mt-1">{output.text}</p>}
    {reasons.map((reason) => <p key={reason} className="mt-1">{reason}</p>)}
    {description && <p className="mt-1 text-muted-foreground">{description}</p>}
    {disclosure && <p>{output.included ? t`Existing output is included.` : t`Missing output is omitted.`}</p>}
    {hasDraft && <p className="text-muted-foreground">{t`Save or cancel your draft before reviewing outputs.`}</p>}
    {!compact && !inline && !hasDraft && !disclosure && ["easy-read", "preparation", "audio", "caption"].includes(output.identity.kind) && <p className="mt-1 text-muted-foreground">{t`Generation uses required section or page context and publishes only selected outputs. Current and protected outputs are kept.`}</p>}
    {!hasDraft && !disclosure && <div className="mt-1 flex flex-wrap gap-1">
      {isRunning && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("skip")}>{t`Skip this run`}</Button>}
      {output.usable && output.protected && ownWarning && <Button size="sm" variant="ghost" disabled={mutation.isPending || output.blocked} onClick={() => mutation.mutate("keep")}>{output.manual ? t`Keep my edit` : t`Keep existing content`}</Button>}
      {fallback && output.usable && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("checked")}>{t`Mark checked`}</Button>}
      {fallback && <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate("retry")}>{t`Retry preparation`}</Button>}
      {(output.updateNeeded || output.missing) && (!output.protected) && <Button size="sm" variant="ghost" disabled={mutation.isPending || output.blocked} onClick={() => mutation.mutate("generate")}>{t`Generate selected output`}</Button>}
      {output.protected && !collectionItem && <Button size="sm" variant="ghost" disabled={mutation.isPending || output.blocked} onClick={() => setReplace(!replace)}>{t`Regenerate`}</Button>}
      {replace && <Button size="sm" variant="outline" disabled={mutation.isPending || output.blocked} onClick={() => mutation.mutate("replace")}>{t`Regenerate and replace my edit`}</Button>}
      {upstream.length > 0 && <Button size="sm" variant="ghost" onClick={() => setShowSource(!showSource)}>{t`Review source`}</Button>}
    </div>}
    {showSource && upstream.map((source) => <div key={JSON.stringify(source.identity)} className="mt-2 border-l pl-2"><p className="mb-1 font-mono">{source.identity.id} {source.identity.language}</p><OutputReviewItem bookLabel={bookLabel} output={source} outputs={outputs} dirty={dirty} disclosure={disclosure} detail inline={inline} /></div>)}
    {mutation.error && <p className="mt-1 text-red-700">{mutation.error.message}</p>}
  </div>
  if (!compact) return content

  const optionalAudio = output.identity.kind === "audio" && output.missing
  const outOfSync = output.updateNeeded || warnings.some((warning) => warning.reason === "source-changed" || warning.reason === "preparation-outdated")
  const indicator = edited ? t`Unsaved edit` : output.manual ? t`Edited manually` : optionalAudio ? t`No audio` : outOfSync ? t`Out of sync` : output.missing ? t`Missing` : t`Needs review`
  const needsAttention = !edited && !optionalAudio && (outOfSync || warnings.length > 0)
  const manualEdit = edited || output.manual
  return <Popover onOpenChange={() => { setReplace(false); setShowSource(false) }}>
    <PopoverTrigger asChild>
      <button type="button" title={`${label}: ${indicator}`} aria-label={`${label}: ${indicator}`}
        className={cn("inline-flex min-h-5 items-center gap-1 whitespace-nowrap rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", needsAttention && "text-amber-700",
          manualEdit && "rounded-full bg-amber-50 px-1.5 font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 hover:text-amber-900")}>
        {manualEdit ? <TextCursorInput className="h-3 w-3" /> : optionalAudio ? <Volume2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {manualEdit ? t`Manual edit` : indicator}
        {manualEdit && needsAttention && <AlertTriangle className="h-3 w-3" />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3">{content}</PopoverContent>
  </Popover>
}

export function CatalogSummary({ bookLabel, stage, disclosure = false, features, expanded = false }: { bookLabel: string; stage?: StageName; disclosure?: boolean; features?: OutputDisclosureOptions; expanded?: boolean }) {
  const { t } = useLingui()
  const { data, error } = useOutputs(bookLabel, disclosure, features)
  // Optional speech preparation is reviewed beside saved speech text, not as
  // unfinished translation work merely because a display string was edited.
  const outputs = (data?.outputs ?? []).filter((output) => !output.excluded && (!stage || OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage) &&
    (disclosure || stage !== "translate" || output.identity.kind !== "preparation"))
  if (error) return <p className="text-xs text-red-700">{error.message}</p>
  const ownershipPages = [...new Set(data?.ownershipWarnings?.map((warning) => warning.pageId) ?? [])].join(", ")
  return <>{ownershipPages && <p className="rounded border border-amber-300 p-2 text-xs text-amber-800">{t`Some rendered sections on ${ownershipPages} have no verified section owner and are omitted from preview and export. Their content and history are retained. Review their section identities in Storyboard.`}</p>}<OutputReviewPanel defaultOpen={expanded} bookLabel={bookLabel} outputs={outputs} catalog={data?.outputs ?? []} conflicts={data?.conflicts} disclosure={disclosure}
    renderDetail={(output) => <OutputReviewItem bookLabel={bookLabel} output={output} outputs={data?.outputs ?? []} disclosure={disclosure} detail inline />} /></>
}
