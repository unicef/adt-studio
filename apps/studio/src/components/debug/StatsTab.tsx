import { Trans, useLingui } from "@lingui/react/macro"
import { usePipelineStats } from "@/hooks/use-debug"
import { Badge } from "@/components/ui/badge"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

interface StatsTabProps {
  label: string
  isRunning: boolean
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatTokens(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

function estimateCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens * 2.5 + outputTokens * 10) / 1_000_000
  return `$${cost.toFixed(4)}`
}

export function StatsTab({ label, isRunning }: StatsTabProps) {
  const { i18n } = useLingui()
  const { data, isLoading, error } = usePipelineStats(label, {
    refetchInterval: isRunning ? 3000 : false,
  })
  const localAI = useQuery({
    queryKey: ["local-ai", "status"],
    queryFn: api.getLocalAIStatus,
    refetchInterval: isRunning ? 3000 : 10_000,
  })

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Trans>Loading stats...</Trans>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        <Trans>Failed to load stats:</Trans> {error.message}
      </div>
    )
  }

  if (!data) return null

  const { steps, totals, pipelineRun } = data
  const cacheHitRate = totals.calls > 0
    ? ((totals.cacheHits / totals.calls) * 100).toFixed(1)
    : "0"

  return (
    <div className="p-6 space-y-6 text-sm">
      {localAI.data && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 text-xs font-medium text-muted-foreground">
            <Trans>Local AI runtime</Trans>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-xs text-muted-foreground"><Trans>Model</Trans></div><div className="mt-1 font-mono text-xs">{localAI.data.loadedModelId ?? "-"}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Compute</Trans></div><div className="mt-1">{localAI.data.state === "ready" ? `${localAI.data.backend}${localAI.data.deviceMemoryBytes ? ` · ${(localAI.data.deviceMemoryBytes / 1024 ** 3).toFixed(0)} GB` : ""}` : localAI.data.state}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Context</Trans></div><div className="mt-1 tabular-nums">{localAI.data.contextSize.toLocaleString(i18n.locale)} tokens</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Last request</Trans></div><div className="mt-1 tabular-nums">{localAI.data.lastRequestMs == null ? "-" : formatDuration(localAI.data.lastRequestMs)}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Prompt speed</Trans></div><div className="mt-1 tabular-nums">{localAI.data.promptTokensPerSecond == null ? "-" : `${localAI.data.promptTokensPerSecond.toFixed(1)} tok/s`}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Generation speed</Trans></div><div className="mt-1 tabular-nums">{localAI.data.generatedTokensPerSecond == null ? "-" : `${localAI.data.generatedTokensPerSecond.toFixed(1)} tok/s`}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Runtime</Trans></div><div className="mt-1 font-mono text-xs">llama.cpp {localAI.data.runtimeVersion ?? "-"}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Requests</Trans></div><div className="mt-1 tabular-nums">{localAI.data.requests}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>GPU layers</Trans></div><div className="mt-1 tabular-nums">{localAI.data.gpuLayersLoaded == null ? "-" : localAI.data.gpuLayersLoaded}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Model on GPU</Trans></div><div className="mt-1 tabular-nums">{localAI.data.modelGpuMemoryBytes == null ? "-" : `${(localAI.data.modelGpuMemoryBytes / 1024 ** 3).toFixed(1)} GB`}</div></div>
            <div><div className="text-xs text-muted-foreground"><Trans>Process</Trans></div><div className="mt-1 tabular-nums">{localAI.data.processId ?? "-"}</div></div>
          </div>
          {localAI.data.device && <p className="mt-3 text-xs text-muted-foreground">{localAI.data.device}</p>}
          {localAI.data.error && <p className="mt-3 text-xs text-destructive">{localAI.data.error}</p>}
        </div>
      )}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">
            <Trans>LLM Calls</Trans>
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totals.calls}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">
            <Trans>Cache Hit Rate</Trans>
          </div>
          <div className="text-2xl font-semibold tabular-nums">{cacheHitRate}%</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">
            <Trans>Total Tokens</Trans>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatTokens(totals.inputTokens + totals.outputTokens, i18n.locale)}
          </div>
        </div>
        {pipelineRun?.wallClockMs != null ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">
              <Trans>Wall Clock</Trans>
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatDuration(pipelineRun.wallClockMs)}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">
              <Trans>Wall Clock</Trans>
            </div>
            <div className="text-2xl font-semibold text-muted-foreground">-</div>
          </div>
        )}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">
            <Trans>Est. Cost</Trans>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {estimateCost(totals.inputTokens, totals.outputTokens)}
          </div>
        </div>
        <div className={`rounded-lg border p-4 ${totals.errorCount > 0 ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : "bg-card"}`}>
          <div className="text-xs text-muted-foreground mb-1">
            <Trans>Errors</Trans>
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${totals.errorCount > 0 ? "text-destructive" : ""}`}>
            {totals.errorCount}
          </div>
        </div>
      </div>

      {steps.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-3">
            <Trans>Per-Step Breakdown</Trans>
          </h4>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="py-2.5 px-4 font-medium">
                    <Trans>Step</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Calls</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Cache Hits</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Misses</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Tokens In</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Tokens Out</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Avg Duration</Trans>
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    <Trans>Errors</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr
                    key={s.step}
                    className={`border-b last:border-0 ${s.errorCount > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                  >
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-xs font-mono">
                        {s.step}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{s.calls}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{s.cacheHits}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{s.cacheMisses}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {formatTokens(s.inputTokens, i18n.locale)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {formatTokens(s.outputTokens, i18n.locale)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {formatDuration(s.avgDurationMs)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {s.errorCount > 0 ? (
                        <span className="text-destructive font-medium">{s.errorCount}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {steps.length === 0 && (
        <div className="text-muted-foreground">
          <Trans>No pipeline data yet. Run the pipeline to see stats.</Trans>
        </div>
      )}
    </div>
  )
}
