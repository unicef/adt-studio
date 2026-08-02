import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Loader2, Play, Search, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"

export function LocalSpeechSettings() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ["local-speech", "status"], queryFn: api.getLocalSpeechStatus })
  const [repository, setRepository] = useState("onnx-community/Kokoro-82M-v1.0-ONNX")
  const [voice, setVoice] = useState("af_heart")
  const [search, setSearch] = useState("")
  const results = useQuery({
    queryKey: ["local-speech", "search", search],
    queryFn: () => api.searchLocalSpeechModels(search),
    enabled: search.trim().length > 1,
  })
  const install = useMutation({
    mutationFn: () => api.installLocalSpeechModel(repository, voice),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["local-speech", "status"] }); toast.success(t`Local voice installed.`) },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Model download failed.`),
  })
  const remove = useMutation({
    mutationFn: api.removeLocalSpeechModel,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["local-speech", "status"] }),
  })
  const test = useMutation({
    mutationFn: ({ repo, selectedVoice }: { repo: string; selectedVoice: string }) => api.testLocalSpeechModel(repo, selectedVoice, t`Local speech is ready.`),
    onSuccess: (blob) => { const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); void audio.play() },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Speech test failed.`),
  })

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold"><Trans>Local speech</Trans></h2>
        <p className="mt-1 text-sm text-muted-foreground"><Trans>Generate English narration locally with Kokoro. WAV files are embedded in the exported ADT.</Trans></p>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
        <Input value={repository} onChange={(event) => setRepository(event.target.value)} aria-label={t`Hugging Face repository or URL`} placeholder="owner/model or Hugging Face URL" />
        <select value={voice} onChange={(event) => setVoice(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label={t`Local voice`}>
          {(status.data?.voices ?? ["af_heart"]).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button onClick={() => install.mutate()} disabled={install.isPending}>
          {install.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          <Trans>Download</Trans>
        </Button>
      </div>
      <div className="space-y-2">
        <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t`Search compatible models on Hugging Face`} /></div>
        {results.data?.map((model) => (
          <button type="button" key={model.id} disabled={!model.compatible} onClick={() => setRepository(model.id)} className="flex w-full justify-between rounded border px-3 py-2 text-left text-sm disabled:opacity-50">
            <span>{model.id}</span><span>{model.compatible ? t`Compatible` : t`Unsupported`}</span>
          </button>
        ))}
      </div>
      {status.data?.installed.map((model) => (
        <div key={model.repository} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <div><div className="font-medium">{model.repository}</div><div className="text-xs text-muted-foreground">{model.dtype} · {model.voices.join(", ")} · {model.revision.slice(0, 8)}</div></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => test.mutate({ repo: model.repository, selectedVoice: model.voices[0] })} disabled={test.isPending}><Play className="size-4" /><Trans>Test</Trans></Button>
            <Button size="icon" variant="ghost" aria-label={t`Remove model`} onClick={() => remove.mutate(model.repository)} disabled={remove.isPending}><Trash2 className="size-4" /></Button>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground"><Trans>Kokoro is currently limited to English. Route other languages to a cloud provider.</Trans></p>
    </section>
  )
}
