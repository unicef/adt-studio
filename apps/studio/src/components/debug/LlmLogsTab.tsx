import { useState, useRef, useEffect } from "react"
import { RefreshCw, AlertTriangle, Check, Loader2, Circle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLlmLogs } from "@/hooks/use-debug"
import type { PipelineProgress, LlmLogSummary, StepName } from "@/hooks/use-pipeline"
import type { LlmLogEntry } from "@/api/client"
import { api } from "@/api/client"

const STEPS = [
  "extract",
  "metadata",
  "text-classification",
  "translation",
  "image-classification",
  "page-sectioning",
  "web-rendering",
] as const

const STEP_LABELS: Record<StepName, string> = {
  extract: "Extract",
  metadata: "Metadata",
  "text-classification": "Text",
  translation: "Translate",
  "image-classification": "Images",
  "page-sectioning": "Sections",
  "web-rendering": "Render",
}

interface LlmLogsTabProps {
  label: string
  progress: PipelineProgress
}

// --- Helpers ---

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 1000) return "just now"
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3600_000)}h ago`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  return d.toLocaleTimeString()
}

type RowStatus = "success" | "cached" | "error"

function getStatusFromLive(entry: LlmLogSummary): RowStatus {
  if (entry.validationErrors && entry.validationErrors.length > 0) return "error"
  if (entry.cacheHit) return "cached"
  return "success"
}

function getStatusFromHistory(entry: LlmLogEntry): RowStatus {
  if (entry.data.validationErrors && entry.data.validationErrors.length > 0) return "error"
  if (entry.data.cacheHit) return "cached"
  return "success"
}

const STATUS_DOT: Record<RowStatus, string> = {
  success: "bg-green-500",
  cached: "bg-yellow-400",
  error: "bg-red-500",
}

const STATUS_LABEL: Record<RowStatus, string> = {
  success: "Success",
  cached: "Cached",
  error: "Error",
}

// --- Step Tracker ---

function StepTracker({ progress }: { progress: PipelineProgress }) {
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-muted/20 shrink-0 overflow-x-auto">
      {STEPS.map((step, i) => {
        const completed = progress.completedSteps.has(step)
        const running = progress.currentStep === step
        const stepProg = progress.stepProgress.get(step)

        return (
          <div key={step} className="flex items-center gap-1 shrink-0">
            {i > 0 && <div className="w-3 border-t border-border" />}
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
                completed && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                running && "bg-primary/10 text-primary font-medium",
                !completed && !running && "text-muted-foreground",
              )}
            >
              {completed && <Check className="h-3 w-3" />}
              {running && <Loader2 className="h-3 w-3 animate-spin" />}
              {!completed && !running && <Circle className="h-2.5 w-2.5 opacity-40" />}
              {STEP_LABELS[step]}
              {running && stepProg?.page != null && stepProg.totalPages != null && (
                <span className="tabular-nums opacity-75">
                  {stepProg.page}/{stepProg.totalPages}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Expanded Detail View ---

function LogDetail({ data, loading }: { data: LlmLogEntry["data"] | null; loading: boolean }) {
  if (loading) {
    return (
      <td colSpan={9} className="px-4 py-3 bg-muted/20 text-xs text-muted-foreground">
        Loading details...
      </td>
    )
  }

  if (!data) {
    return (
      <td colSpan={9} className="px-4 py-3 bg-muted/20 text-xs text-muted-foreground">
        Details not available yet.
      </td>
    )
  }

  return (
    <td colSpan={9} className="p-0">
      <div className="px-4 py-3 bg-muted/20 space-y-3 text-xs">
        {/* Summary grid */}
        <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <div className="text-muted-foreground mb-0.5">Prompt</div>
            <div className="font-medium">{data.promptName}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Model</div>
            <div className="font-medium">{data.modelId}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Duration</div>
            <div className="font-medium">{formatSeconds(data.durationMs)}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Cache</div>
            <div className="font-medium">{data.cacheHit ? "Hit" : "Miss"}</div>
          </div>
          {data.usage && (
            <>
              <div>
                <div className="text-muted-foreground mb-0.5">Input Tokens</div>
                <div className="font-medium tabular-nums">
                  {data.usage.inputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Output Tokens</div>
                <div className="font-medium tabular-nums">
                  {data.usage.outputTokens.toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* System prompt */}
        {data.system && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">System Prompt</div>
            <pre className="bg-muted p-3 rounded text-[11px] whitespace-pre-wrap max-h-48 overflow-auto">
              {data.system}
            </pre>
          </div>
        )}

        {/* Messages */}
        {data.messages.length > 0 && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Messages</div>
            <div className="space-y-2">
              {data.messages.map((msg, i) => (
                <div key={i} className="bg-muted p-3 rounded">
                  <div className="font-medium mb-1 uppercase text-[10px] text-muted-foreground tracking-wide">
                    {msg.role}
                  </div>
                  {msg.content.map((part, j) => (
                    <div key={j}>
                      {part.type === "text" ? (
                        <pre className="text-[11px] whitespace-pre-wrap max-h-40 overflow-auto">
                          {part.text}
                        </pre>
                      ) : (
                        <div className="text-muted-foreground italic">
                          [Image: {part.width}x{part.height}, {Math.round(part.byteLength / 1024)}KB]
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation errors */}
        {data.validationErrors && data.validationErrors.length > 0 && (
          <div>
            <div className="font-medium text-destructive mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Validation Errors ({data.validationErrors.length})
            </div>
            <pre className="bg-red-50 dark:bg-red-950/30 p-3 rounded text-[11px] whitespace-pre-wrap text-destructive">
              {data.validationErrors.join("\n")}
            </pre>
          </div>
        )}
      </div>
    </td>
  )
}

// --- Live Log Row (from SSE) ---

function LiveLogRow({ entry, label }: { entry: LlmLogSummary; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<LlmLogEntry["data"] | null>(null)
  const [loading, setLoading] = useState(false)
  const status = getStatusFromLive(entry)

  const handleToggle = async () => {
    if (!expanded && !detail) {
      setLoading(true)
      try {
        const result = await api.getLlmLogs(label, {
          step: entry.step,
          itemId: entry.itemId,
          limit: 10,
        })
        const match = result.logs.find(
          (l) => l.data.promptName === entry.promptName,
        )
        if (match) setDetail(match.data)
      } catch {
        // Detail fetch failed — will show fallback message
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={handleToggle}
      >
        <td className="py-1.5 pl-4 pr-1">
          <span
            className={cn("block h-2 w-2 rounded-full shrink-0", STATUS_DOT[status])}
            title={STATUS_LABEL[status]}
          />
        </td>
        <td className="py-1.5 px-2 text-muted-foreground tabular-nums whitespace-nowrap">
          {formatRelativeTime(entry.receivedAt)}
        </td>
        <td className="py-1.5 px-2">
          <Badge variant="outline" className="text-[10px] font-mono">
            {entry.step}
          </Badge>
        </td>
        <td className="py-1.5 px-2 text-muted-foreground">{entry.itemId}</td>
        <td className="py-1.5 px-2 font-medium">{entry.promptName}</td>
        <td className="py-1.5 px-2 text-muted-foreground">{entry.modelId}</td>
        <td className="py-1.5 px-2 tabular-nums text-right">
          {formatSeconds(entry.durationMs)}
        </td>
        <td className="py-1.5 px-2 pr-4 tabular-nums text-right text-muted-foreground whitespace-nowrap">
          {entry.inputTokens != null
            ? ((entry.inputTokens ?? 0) + (entry.outputTokens ?? 0)).toLocaleString()
            : "\u2014"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <LogDetail data={detail} loading={loading} />
        </tr>
      )}
    </>
  )
}

// --- History Log Row (from REST) ---

function HistoryLogRow({ entry }: { entry: LlmLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const status = getStatusFromHistory(entry)

  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-1.5 pl-4 pr-1">
          <span
            className={cn("block h-2 w-2 rounded-full shrink-0", STATUS_DOT[status])}
            title={STATUS_LABEL[status]}
          />
        </td>
        <td className="py-1.5 px-2 text-muted-foreground tabular-nums whitespace-nowrap">
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="py-1.5 px-2">
          <Badge variant="outline" className="text-[10px] font-mono">
            {entry.step}
          </Badge>
        </td>
        <td className="py-1.5 px-2 text-muted-foreground">{entry.itemId}</td>
        <td className="py-1.5 px-2 font-medium">{entry.data.promptName}</td>
        <td className="py-1.5 px-2 text-muted-foreground">{entry.data.modelId}</td>
        <td className="py-1.5 px-2 tabular-nums text-right">
          {formatSeconds(entry.data.durationMs)}
        </td>
        <td className="py-1.5 px-2 pr-4 tabular-nums text-right text-muted-foreground whitespace-nowrap">
          {entry.data.usage
            ? (entry.data.usage.inputTokens + entry.data.usage.outputTokens).toLocaleString()
            : "\u2014"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <LogDetail data={entry.data} loading={false} />
        </tr>
      )}
    </>
  )
}

// --- Main Component ---

export function LlmLogsTab({ label, progress }: LlmLogsTabProps) {
  const [stepFilter, setStepFilter] = useState<string>("")
  const [itemIdFilter, setItemIdFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 50

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (progress.isRunning && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [progress.isRunning, progress.liveLlmLogs.length])

  const { data, isLoading, refetch } = useLlmLogs(label, {
    step: stepFilter || undefined,
    itemId: itemIdFilter || undefined,
    limit,
    offset,
  })

  const filteredLive = progress.liveLlmLogs.filter((log) => {
    if (stepFilter && log.step !== stepFilter) return false
    if (itemIdFilter && !log.itemId.includes(itemIdFilter)) return false
    return true
  })

  const hasLiveLogs = filteredLive.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Step tracker — visible when pipeline is running or just completed */}
      {(progress.isRunning || progress.isComplete) && (
        <StepTracker progress={progress} />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0">
        {progress.isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium shrink-0">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        )}

        <Select value={stepFilter} onValueChange={(v) => { setStepFilter(v === " " ? "" : v); setOffset(0) }}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="All steps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All steps</SelectItem>
            {STEPS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by item ID..."
          className="h-7 w-36 text-xs"
          value={itemIdFilter}
          onChange={(e) => { setItemIdFilter(e.target.value); setOffset(0) }}
        />

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>

        <div className="flex-1" />

        {/* Status legend */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Success
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-400" /> Cached
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Error
          </span>
        </div>
      </div>

      {/* Log table */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
            <tr className="border-b border-border/50 text-[10px] text-muted-foreground font-medium">
              <th className="w-6 py-1.5 pl-4 pr-1 text-left" />
              <th className="py-1.5 px-2 text-left whitespace-nowrap">Time</th>
              <th className="py-1.5 px-2 text-left">Step</th>
              <th className="py-1.5 px-2 text-left">Item</th>
              <th className="py-1.5 px-2 text-left">Prompt</th>
              <th className="py-1.5 px-2 text-left">Model</th>
              <th className="py-1.5 px-2 text-right whitespace-nowrap">Duration</th>
              <th className="py-1.5 px-2 pr-4 text-right">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {/* Live SSE logs */}
            {hasLiveLogs &&
              filteredLive.map((entry, i) => (
                <LiveLogRow key={`live-${i}`} entry={entry} label={label} />
              ))
            }

            {/* Waiting state */}
            {progress.isRunning && !hasLiveLogs && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  Waiting for LLM calls...
                </td>
              </tr>
            )}

            {/* Loading state */}
            {isLoading && !hasLiveLogs && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  Loading logs...
                </td>
              </tr>
            )}

            {/* Empty state */}
            {data && data.logs.length === 0 && !hasLiveLogs && !progress.isRunning && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  No log entries found. Run the pipeline to see LLM call logs.
                </td>
              </tr>
            )}

            {/* History logs from REST API */}
            {data?.logs.map((entry) => (
              <HistoryLogRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs sticky bottom-0 bg-background">
            <span className="text-muted-foreground tabular-nums">
              {offset + 1}&ndash;{Math.min(offset + limit, data.total)} of {data.total}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={offset + limit >= data.total}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
