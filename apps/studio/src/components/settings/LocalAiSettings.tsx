import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleAlert, Download, ExternalLink, Loader2, MonitorCog, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { api, type LocalAIModel, type LocalModelPullProgress } from "@/api/client"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { LocalSpeechSettings } from "./LocalSpeechSettings"

function formatGiB(bytes: number): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Storage unit symbol is locale-independent.
  return `${(bytes / 1024 ** 3).toFixed(bytes < 10 * 1024 ** 3 ? 1 : 0)} GB`
}

function progressPercent(progress: LocalModelPullProgress | null): number | undefined {
  if (!progress?.total || progress.completed == null) return undefined
  return Math.min(100, Math.round((progress.completed / progress.total) * 100))
}

export function LocalAiSettings({ compact = false }: { compact?: boolean }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [pullingModelId, setPullingModelId] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<LocalModelPullProgress | null>(null)
  const downloadAbortRef = useRef<AbortController | null>(null)

  const statusQuery = useQuery({
    queryKey: ["local-ai", "status"],
    queryFn: api.getLocalAIStatus,
    refetchOnWindowFocus: false,
    refetchInterval: 5000,
  })
  const defaultModelQuery = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })

  const selectMutation = useMutation({
    mutationFn: (modelId: string) => api.updateDefaultModel(modelId),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["default-model"], saved)
      await queryClient.invalidateQueries({ queryKey: ["global-config"] })
      toast.success(t`Local model selected.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Unable to select local model.`),
  })
  const stopMutation = useMutation({
    mutationFn: api.stopLocalAI,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["local-ai", "status"] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Unable to unload local model.`),
  })

  const installedCount = useMemo(
    () => statusQuery.data?.models.filter((model) => model.installed).length ?? 0,
    [statusQuery.data?.models],
  )

  async function download(model: LocalAIModel) {
    setPullingModelId(model.id)
    setPullProgress(null)
    const controller = new AbortController()
    downloadAbortRef.current = controller
    try {
      await api.pullLocalModel(model.id, setPullProgress, controller.signal)
      await queryClient.invalidateQueries({ queryKey: ["local-ai", "status"] })
      await selectMutation.mutateAsync(model.id)
      toast.success(t`Model downloaded and selected.`)
    } catch (error) {
      if (controller.signal.aborted) toast.info(t`Model download paused. You can resume it later.`)
      else toast.error(error instanceof Error ? error.message : t`Model download failed.`)
    } finally {
      downloadAbortRef.current = null
      setPullingModelId(null)
      setPullProgress(null)
    }
  }

  const status = statusQuery.data
  const percent = progressPercent(pullProgress)
  const visibleModels = compact
    ? status?.models.filter((model) => model.recommended || model.installed) ?? []
    : status?.models ?? []

  return (
    <div className={cn("flex w-full flex-col gap-5", !compact && "p-5")}>
      {!compact && (
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            <Trans>Local AI</Trans>
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
            <Trans>Run book generation privately with Gemma 4. No separate AI app is required.</Trans>
          </p>
        </header>
      )}

      {statusQuery.isLoading && (
        <div className="flex min-h-24 items-center justify-center rounded-lg border">
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-label={t`Checking local AI`} />
        </div>
      )}

      {status && !status.runtimeAvailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium"><Trans>Local AI runtime is unavailable</Trans></p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                <Trans>This app build is missing its embedded inference runtime. Reinstall ADT Studio or ask your administrator for a complete build.</Trans>
              </p>
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => statusQuery.refetch()}>
                  <Trans>Check again</Trans>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {status && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <MonitorCog className="size-5 text-primary" aria-hidden="true" />
            <span>
              <Trans>Detected {formatGiB(status.system.totalMemoryBytes)} memory</Trans>
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              <Trans>{installedCount} local models installed</Trans>
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              {status.state === "ready" ? `${status.backend} · ${status.loadedModelId}` : `${status.runtime} ${status.runtimeVersion ?? ""}`}
            </span>
            {status.state === "ready" && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}>
                <Trans>Unload model</Trans>
              </Button>
            )}
          </div>

          <div className={cn("grid gap-3", !compact && "md:grid-cols-2 xl:grid-cols-3")}>
            {visibleModels.map((model) => {
              const isPulling = pullingModelId === model.id
              const isSelected = defaultModelQuery.data?.model === model.id
              return (
                <section
                  key={model.id}
                  className={cn(
                    "rounded-lg border bg-card p-4",
                    model.recommended && "border-primary/60 ring-1 ring-primary/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">{model.label}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Trans>{formatGiB(model.downloadBytes)} download</Trans>
                      </p>
                      <a
                        className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
                        href={`https://huggingface.co/${model.repository}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`${model.repository}@${model.revision}`}
                      >
                        {model.repository} · {model.license}
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {model.recommended && (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                          <Trans>Recommended</Trans>
                        </span>
                      )}
                      {isSelected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-700 dark:text-green-300">
                          <Check className="size-3" aria-hidden="true" />
                          <Trans>Selected</Trans>
                        </span>
                      )}
                    </div>
                  </div>

                  {isPulling && (
                    <div className="mt-4 space-y-2" aria-live="polite">
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${percent ?? 8}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {percent == null ? pullProgress?.status ?? t`Starting download...` : t`${percent}% downloaded`}
                      </p>
                    </div>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant={model.installed ? "outline" : "default"}
                    className="mt-4 w-full"
                    disabled={(Boolean(pullingModelId) && !isPulling) || isSelected || selectMutation.isPending}
                    onClick={() => isPulling ? downloadAbortRef.current?.abort() : model.installed ? selectMutation.mutate(model.id) : download(model)}
                  >
                    {isPulling ? (
                      <X className="size-4" aria-hidden="true" />
                    ) : model.installed ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Download className="size-4" aria-hidden="true" />
                    )}
                    {isPulling ? <Trans>Pause download</Trans> : isSelected ? <Trans>In use</Trans> : model.installed ? <Trans>Use this model</Trans> : <Trans>Download model</Trans>}
                  </Button>
                </section>
              )
            })}
          </div>
        </>
      )}

      <p className="text-sm leading-6 text-muted-foreground">
        <Trans>Local generation is the private default. If you add OpenAI credits later, select an OpenAI model and rerun any step to regenerate or improve that result.</Trans>
      </p>
      {!compact && <LocalSpeechSettings />}
    </div>
  )
}
