import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { OUTPUT_KIND_TO_STAGE, STAGE_ORDER, type OutputStatus } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { Button } from "@/components/ui/button"
import { useFloatingSaveDirtyEntries } from "./floating-save"

/** Selection only narrows publication. The server expands required context. */
export function BulkOutputReview({ bookLabel, outputs }: { bookLabel: string; outputs: OutputStatus[] }) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const client = useQueryClient()
  const dirty = useFloatingSaveDirtyEntries().length > 0
  const [scope, setScope] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [replace, setReplace] = useState(false)
  const kindLabel = (output: OutputStatus) => output.identity.kind === "translation" ? t`Translation` : output.identity.kind === "preparation" ? t`Speech text` : output.identity.kind === "audio" ? t`Audio` : output.identity.kind === "caption" ? t`Caption` : output.identity.kind === "easy-read" ? t`Easy Read` : output.identity.kind === "timestamps" ? t`Timestamps` : t`Image translation`
  const key = (output: OutputStatus) => JSON.stringify(output.identity)
  const candidates = outputs.filter((output) => !scope || [...output.pageIds, ...output.sectionIds, output.group].includes(scope))
  const chosen = candidates.filter((output) => selected.includes(key(output)))
  const protectedCount = chosen.filter((output) => output.protected).length
  const scopes = [...new Set(outputs.flatMap((output) => [...output.pageIds, ...output.sectionIds, ...(output.group ? [output.group] : [])]))]
  const mutation = useMutation({ mutationFn: async (action: "keep" | "checked" | "generate") => {
    if (action !== "generate") {
      for (const output of chosen) {
        if (!output.usable || action === "keep" && !output.protected || action === "checked" && (output.identity.kind !== "preparation" || !output.warnings.some((warning) => !warning.source && warning.reason.startsWith("preparation-")))) continue
        await api.reviewOutput(bookLabel, { identity: output.identity, signature: output.signature, contentHash: output.contentHash, action })
      }
    } else {
      const stages = STAGE_ORDER.filter((stage) => chosen.some((output) => OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage))
      if (!stages.length) return
      for (const stage of stages) await api.runStages(bookLabel, apiKey, { fromStage: stage, toStage: stage, outputScope: {
        selection: { identities: chosen.map((output) => output.identity) },
        ...(replace ? { replace: chosen.filter((output) => output.protected).map((output) => ({ identity: output.identity, signature: output.signature, contentHash: output.contentHash })) } : {}),
      } })
    }
  }, onSettled: () => client.invalidateQueries({ queryKey: ["books", bookLabel] }) })
  return <div className="my-2 space-y-2 rounded border p-2 text-xs">
    <label className="flex items-center gap-2">{t`Review scope`}
      <select className="rounded border p-1" value={scope} onChange={(event) => { setScope(event.target.value); setSelected([]); setReplace(false) }}>
        <option value="">{t`All outputs`}</option>
        {scopes.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <Button size="sm" variant="ghost" onClick={() => setSelected(candidates.map(key))}>{t`Select this scope`}</Button>
    <div className="max-h-40 overflow-auto">
      {candidates.map((output) => <label key={key(output)} className="flex gap-2 py-1">
        <input type="checkbox" checked={selected.includes(key(output))} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, key(output)] : previous.filter((item) => item !== key(output)))} />
        <span>{kindLabel(output)} · {output.identity.id} · {output.identity.language} · {output.identity.voiceSlot}{output.protected && <> · {t`Protected content`}</>}</span>
      </label>)}
    </div>
    <p>{t`Generation uses required section or page context and publishes only selected outputs. Current and protected outputs are kept.`}</p>
    {protectedCount > 0 && <label className="flex gap-2"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />{t`Replace ${protectedCount} selected protected outputs`}</label>}
    {dirty ? <p>{t`Save or cancel your draft before reviewing outputs.`}</p> : <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" disabled={!chosen.length || mutation.isPending} onClick={() => mutation.mutate("keep")}>{t`Keep selected content`}</Button>
      <Button size="sm" variant="ghost" disabled={!chosen.length || mutation.isPending} onClick={() => mutation.mutate("checked")}>{t`Mark selected fallbacks checked`}</Button>
      <Button size="sm" variant="outline" disabled={!chosen.length || mutation.isPending} onClick={() => mutation.mutate("generate")}>{replace ? t`Regenerate and replace selected edits` : t`Generate selected outputs`}</Button>
    </div>}
    {mutation.error && <p className="text-red-700">{mutation.error.message}</p>}
  </div>
}
