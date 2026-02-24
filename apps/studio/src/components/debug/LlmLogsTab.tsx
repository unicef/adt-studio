import { useState, useEffect } from "react"
import { RefreshCw, AlertTriangle } from "lucide-react"
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
import { BASE_URL } from "@/api/client"
import type { LlmLogEntry } from "@/api/client"

const STEPS = [
  "extract",
  "metadata",
  "text-classification",
  "translation",
  "image-filtering",
  "image-cropping",
  "image-meaningfulness",
  "page-sectioning",
  "web-rendering",
  "image-captioning",
  "glossary",
  "quiz-generation",
  "text-catalog",
  "catalog-translation",
  "book-summary",
  "tts",
  "package-web",
] as const

interface LlmLogsTabProps {
  label: string
  isRunning: boolean
}

type RowStatus = "success" | "cached" | "error"

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

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  return d.toLocaleTimeString()
}

function getStatus(entry: LlmLogEntry): RowStatus {
  if (entry.data.validationErrors && entry.data.validationErrors.length > 0) return "error"
  if (entry.data.cacheHit) return "cached"
  return "success"
}

function LogDetail({ data, label }: { data: LlmLogEntry["data"]; label: string }) {
  return (
    <td colSpan={8} className="p-0">
      <div className="px-4 py-3 bg-muted/20 space-y-3 text-xs">
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

        {data.system && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">System Prompt</div>
            <pre className="bg-muted p-3 rounded text-[11px] whitespace-pre-wrap max-h-48 overflow-auto">
              {data.system}
            </pre>
          </div>
        )}

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
                        <div className="my-1">
                          <img
                            src={`${BASE_URL}/books/${label}/debug/llm-image/${part.hash}`}
                            alt={`${part.width}x${part.height}`}
                            className="max-h-48 rounded border bg-muted object-contain"
                            loading="lazy"
                          />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {part.width}x{part.height}, {Math.round(part.byteLength / 1024)}KB
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

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

function HistoryLogRow({ entry, label }: { entry: LlmLogEntry; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const status = getStatus(entry)

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
            : "-"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <LogDetail data={entry.data} label={label} />
        </tr>
      )}
    </>
  )
}

export function LlmLogsTab({ label, isRunning }: LlmLogsTabProps) {
  const [stepFilter, setStepFilter] = useState<string>("")
  const [itemIdFilter, setItemIdFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 50

  const { data, isLoading, refetch } = useLlmLogs(label, {
    step: stepFilter || undefined,
    itemId: itemIdFilter || undefined,
    limit,
    offset,
  })

  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(() => {
      void refetch()
    }, 3000)
    return () => window.clearInterval(id)
  }, [isRunning, refetch])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0">
        {isRunning && (
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

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>

        <div className="flex-1" />

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

      <div className="flex-1 overflow-auto min-h-0">
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
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  Loading logs...
                </td>
              </tr>
            )}

            {!isLoading && data && data.logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  No log entries found yet.
                </td>
              </tr>
            )}

            {data?.logs.map((entry) => (
              <HistoryLogRow key={entry.id} entry={entry} label={label} />
            ))}
          </tbody>
        </table>

        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs sticky bottom-0 bg-background">
            <span className="text-muted-foreground tabular-nums">
              {offset + 1}-{Math.min(offset + limit, data.total)} of {data.total}
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
