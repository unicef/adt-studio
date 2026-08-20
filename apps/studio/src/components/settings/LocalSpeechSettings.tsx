import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Loader2, Play, Search, Square, Trash2, Volume2 } from "lucide-react"
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
  const [runtime, setRuntime] = useState<"onnx" | "mlx">("onnx")
  const [search, setSearch] = useState("")
  const [previewText, setPreviewText] = useState(t`Welcome to ADT Studio. This is a sample of the selected local voice.`)
  const [previewVoices, setPreviewVoices] = useState<Record<string, string>>({})
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const results = useQuery({
    queryKey: ["local-speech", "search", search],
    queryFn: () => api.searchLocalSpeechModels(search),
    enabled: search.trim().length > 1,
  })
  const install = useMutation({
    mutationFn: () => {
      const existing = status.data?.installed.find((model) => model.repository === repository)
      return existing
        ? api.installLocalSpeechVoice(repository, voice)
        : api.installLocalSpeechModel(repository, voice, runtime)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["local-speech", "status"] }); toast.success(t`Local voice installed.`) },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Model download failed.`),
  })
  const remove = useMutation({
    mutationFn: api.removeLocalSpeechModel,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["local-speech", "status"] }),
  })
  const preview = useMutation({
    mutationFn: async ({ model, selectedVoice }: { model: NonNullable<typeof status.data>["installed"][number]; selectedVoice: string }) => {
      if (!model.voices.includes(selectedVoice)) {
        await api.installLocalSpeechVoice(model.repository, selectedVoice)
        await queryClient.invalidateQueries({ queryKey: ["local-speech", "status"] })
      }
      const blob = await api.testLocalSpeechModel(model.repository, selectedVoice, previewText)
      return { blob, key: `${model.repository}:${selectedVoice}` }
    },
    onSuccess: ({ blob, key }) => {
      stopPreview()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audioUrlRef.current = url
      setPlayingKey(key)
      audio.onended = stopPreview
      void audio.play().catch((error) => {
        stopPreview()
        toast.error(error instanceof Error ? error.message : t`Unable to play voice preview.`)
      })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Speech test failed.`),
  })

  function stopPreview() {
    audioRef.current?.pause()
    audioRef.current = null
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
    setPlayingKey(null)
  }

  useEffect(() => () => {
    audioRef.current?.pause()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
  }, [])

  function voiceLabel(id: string) {
    const name = id.split("_").slice(1).join(" ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    const profile = id.startsWith("af_")
      ? t`American female`
      : id.startsWith("am_")
        ? t`American male`
        : id.startsWith("bf_")
          ? t`British female`
          : t`British male`
    return `${name} · ${profile}`
  }

  const existingRepository = status.data?.installed.find((model) => model.repository === repository)
  const selectedVoiceInstalled = existingRepository?.voices.includes(voice) ?? false

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold"><Trans>Local speech</Trans></h2>
        <p className="mt-1 text-sm text-muted-foreground"><Trans>Generate English narration locally with Kokoro. Download a voice, preview it below, then select it during the Speech stage. WAV files are embedded in the exported ADT.</Trans></p>
      </div>
      <div className="rounded-md border bg-muted/20 p-4">
        <h3 className="text-sm font-medium"><Trans>Add a voice</Trans></h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_190px_210px_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-medium">
            <Trans>Model repository</Trans>
            <Input value={repository} onChange={(event) => setRepository(event.target.value)} aria-label={t`Hugging Face repository or URL`} placeholder="owner/model or Hugging Face URL" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            <Trans>Voice</Trans>
            <select value={voice} onChange={(event) => setVoice(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label={t`Local voice`}>
              {(status.data?.voices ?? ["af_heart"]).map((item) => <option key={item} value={item}>{voiceLabel(item)}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            <Trans>Runtime</Trans>
            <select
              value={existingRepository?.runtime ?? runtime}
              disabled={Boolean(existingRepository)}
              onChange={(event) => {
                const value = event.target.value as "onnx" | "mlx"
                setRuntime(value)
                if (value === "mlx" && status.data?.acceleratedRepository) setRepository(status.data.acceleratedRepository)
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
              aria-label={t`Local speech runtime`}
            >
              <option value="onnx"><Trans>Compatible (ONNX)</Trans></option>
              <option value="mlx" disabled={!status.data?.mlxRuntimeAvailable}><Trans>Fastest on this Mac (MLX)</Trans></option>
            </select>
          </label>
          <Button onClick={() => install.mutate()} disabled={install.isPending || selectedVoiceInstalled}>
            {install.isPending ? <Loader2 className="size-4 animate-spin" /> : selectedVoiceInstalled ? <Volume2 className="size-4" /> : <Download className="size-4" />}
            {selectedVoiceInstalled
              ? <Trans>Voice installed</Trans>
              : existingRepository
                ? <Trans>Add voice</Trans>
                : <Trans>Download model</Trans>}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium"><Trans>Find another compatible model</Trans></h3>
        <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t`Search compatible models on Hugging Face`} /></div>
        {results.data?.map((model) => (
          <button type="button" key={model.id} disabled={!model.compatible && !model.mlxCompatible} onClick={() => { setRepository(model.id); setRuntime(model.mlxCompatible && !model.compatible ? "mlx" : "onnx") }} className="flex w-full justify-between rounded border px-3 py-2 text-left text-sm disabled:opacity-50">
            <span>{model.id}</span><span>{model.compatible || model.mlxCompatible ? t`Compatible` : t`Unsupported`}</span>
          </button>
        ))}
      </div>
      <div className="space-y-3 border-t pt-4">
        <div>
          <h3 className="text-sm font-medium"><Trans>Preview voices</Trans></h3>
          <p className="mt-1 text-xs text-muted-foreground"><Trans>Choose a voice and listen before using it in a book. Voices not yet installed are downloaded when you preview them.</Trans></p>
        </div>
        <label className="grid gap-1.5 text-xs font-medium">
          <Trans>Preview phrase</Trans>
          <Input value={previewText} maxLength={500} onChange={(event) => setPreviewText(event.target.value)} />
        </label>
        {status.data?.installed.map((model) => {
          const selectedVoice = previewVoices[model.repository] ?? model.voices[0] ?? "af_heart"
          const key = `${model.repository}:${selectedVoice}`
          const isPending = preview.isPending && `${preview.variables?.model.repository}:${preview.variables?.selectedVoice}` === key
          const isPlaying = playingKey === key
          const isInstalled = model.voices.includes(selectedVoice)
          return (
            <div key={model.repository} className="grid items-center gap-3 rounded-md bg-muted/40 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="min-w-0">
                <div className="truncate font-medium">{model.repository}</div>
                <div className="text-xs text-muted-foreground">{model.runtime.toUpperCase()} · {model.dtype} · {model.revision.slice(0, 8)}</div>
              </div>
              <select
                value={selectedVoice}
                onChange={(event) => setPreviewVoices((current) => ({ ...current, [model.repository]: event.target.value }))}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label={t`Voice to preview`}
              >
                {(status.data?.voices ?? model.voices).map((item) => (
                  <option key={item} value={item}>
                    {voiceLabel(item)}{model.voices.includes(item) ? "" : ` · ${t`download required`}`}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => isPlaying ? stopPreview() : preview.mutate({ model, selectedVoice })}
                  disabled={preview.isPending || !previewText.trim()}
                >
                  {isPending
                    ? <Loader2 className="size-4 animate-spin" />
                    : isPlaying
                      ? <Square className="size-3.5 fill-current" />
                      : <Play className="size-4" />}
                  {isPending
                    ? <Trans>Preparing...</Trans>
                    : isPlaying
                      ? <Trans>Stop</Trans>
                      : isInstalled
                        ? <Trans>Preview voice</Trans>
                        : <Trans>Download & preview</Trans>}
                </Button>
                <Button size="icon" variant="ghost" aria-label={t`Remove model`} onClick={() => remove.mutate(model.repository)} disabled={remove.isPending}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground"><Trans>Kokoro is currently limited to English. Route other languages to a cloud provider.</Trans></p>
    </section>
  )
}
