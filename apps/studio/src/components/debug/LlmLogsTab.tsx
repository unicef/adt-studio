import { useState, useEffect } from "react"
import { RefreshCw, AlertTriangle } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
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
import { BASE_URL, type LlmLogEntry } from "@/api/client"
import { ALL_STEP_NAMES } from "@adt/types"

const STEP_FILTERS = Array.from(ALL_STEP_NAMES)

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

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function getStatus(entry: LlmLogEntry): RowStatus {
  if (entry.data.success === false) return "error"
  if (
    entry.data.success === undefined &&
    entry.data.validationErrors &&
    entry.data.validationErrors.length > 0
  ) return "error"
  if (entry.data.cacheHit) return "cached"
  return "success"
}

/**
 * Human-readable labels for the request-parameter keys a call may record.
 * Keys not listed here fall back to the raw key, so a new param still shows up
 * rather than being silently dropped.
 *
 * Declared as `msg` descriptors and resolved with `i18n._()` because this lives
 * outside a component. The `t` macro from `useLingui()` only compiles where the
 * transform can see it bound in scope — passing it into a plain helper leaves
 * the tagged template untransformed, and the runtime `t` then receives a string
 * array instead of a descriptor and returns nothing. That rendered every label
 * blank while the values still showed.
 */
const PARAM_LABELS: Record<string, MessageDescriptor> = {
  voice: msg`Voice`,
  model: msg`Model`,
  language: msg`Language`,
  outputFormat: msg`Format`,
  stability: msg`Stability`,
  similarityBoost: msg`Similarity`,
  style: msg`Style`,
  useSpeakerBoost: msg`Speaker boost`,
  speed: msg`Speed`,
  applyTextNormalization: msg`Normalization`,
  contextBefore: msg`Context before`,
  contextAfter: msg`Context after`,
  contextBeforeChars: msg`Context before (chars)`,
  contextAfterChars: msg`Context after (chars)`,
}

const YES = msg`Yes`
const NO = msg`No`

/**
 * Render one request parameter's value. Values arrive as `unknown` because the
 * `params` record is free-form per call type, so this handles the scalar cases
 * and falls back to JSON rather than rendering "[object Object]".
 */
function formatParamValue(value: unknown, i18n: I18n): string {
  if (typeof value === "boolean") return i18n._(value ? YES : NO)
  if (typeof value === "number") return value.toLocaleString()
  if (typeof value === "string") return value
  if (value === null || value === undefined) return "—"
  return JSON.stringify(value)
}

/**
 * Request parameters as a compact label/value grid.
 *
 * Reuses the header grid's cell markup rather than adding cells to the header
 * itself — ~10 more cells there would swamp Prompt/Model/Duration/Cache. Keys
 * render in insertion order (the order the producer chose), so related settings
 * stay adjacent instead of being alphabetised apart.
 */
export function ParamGrid({ title, data }: { title: string; data: Record<string, unknown> }) {
  const { i18n } = useLingui()
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  return (
    <div>
      <div className="font-medium text-muted-foreground mb-1">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-muted p-3 rounded">
        {entries.map(([key, value]) => {
          const label = PARAM_LABELS[key]
          return (
            <div key={key}>
              <div className="text-muted-foreground mb-0.5">
                {label ? i18n._(label) : key}
              </div>
              {/* Values are provider identifiers and numbers — never translated. */}
              <div className="font-medium break-words">{formatParamValue(value, i18n)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LogDetail({ data, label }: { data: LlmLogEntry["data"]; label: string }) {
  const { t } = useLingui()

  return (
    <td colSpan={8} className="p-0">
      <div className="px-4 py-3 bg-muted/20 space-y-3 text-xs">
        <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <div className="text-muted-foreground mb-0.5">
              <Trans>Prompt</Trans>
            </div>
            <div className="font-medium">{data.promptName}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">
              <Trans>Model</Trans>
            </div>
            <div className="font-medium">{data.modelId}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">
              <Trans>Duration</Trans>
            </div>
            <div className="font-medium">{formatSeconds(data.durationMs)}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">
              <Trans>Cache</Trans>
            </div>
            <div className="font-medium">{data.cacheHit ? t`Hit` : t`Miss`}</div>
          </div>
          {data.usage && (
            <>
              <div>
                <div className="text-muted-foreground mb-0.5">
                  <Trans>Input Tokens</Trans>
                </div>
                <div className="font-medium tabular-nums">
                  {data.usage.inputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">
                  <Trans>Output Tokens</Trans>
                </div>
                <div className="font-medium tabular-nums">
                  {data.usage.outputTokens.toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* What was actually sent to the provider. Only present for call types
            that record it — currently ElevenLabs TTS. */}
        {data.params && <ParamGrid title={t`Request settings`} data={data.params} />}

        {data.system && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">
              <Trans>System Prompt</Trans>
            </div>
            <pre className="bg-muted p-3 rounded text-[11px] whitespace-pre-wrap max-h-48 overflow-auto">
              {data.system}
            </pre>
          </div>
        )}

        {data.messages.length > 0 && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">
              <Trans>Messages</Trans>
            </div>
            <div className="space-y-2">
              {data.messages.map((msg, i) => (
                <div key={i} className="bg-muted p-3 rounded">
                  <div className="font-medium mb-1 uppercase text-[10px] text-muted-foreground tracking-wide">
                    {msg.role}
                  </div>
                  {msg.content.map((part, j) => (
                    <div key={j}>
                      {part.type === "text" ? (
                        <pre className="text-[11px] whitespace-pre-wrap">
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
                            {part.width}x{part.height}, {Math.round(part.byteLength / 1024)} {t`KB`}
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

        {data.success !== true && data.validationErrors && data.validationErrors.length > 0 && (
          <div>
            <div className="font-medium text-destructive mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              <Trans>Validation Errors ({data.validationErrors.length})</Trans>
            </div>
            <pre className="bg-red-50 dark:bg-red-950/30 p-3 rounded text-[11px] whitespace-pre-wrap text-destructive">
              {data.validationErrors.join("\n")}
            </pre>
          </div>
        )}

        {data.success === false && data.error && (
          <div>
            <div className="font-medium text-destructive mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              <Trans>Error</Trans>
            </div>
            <pre className="bg-red-50 dark:bg-red-950/30 p-3 rounded text-[11px] whitespace-pre-wrap text-destructive">
              {data.error}
            </pre>
          </div>
        )}
      </div>
    </td>
  )
}

function HistoryLogRow({ entry, label }: { entry: LlmLogEntry; label: string }) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const status = getStatus(entry)

  const statusLabels: Record<RowStatus, string> = {
    success: t`Success`,
    cached: t`Cached`,
    error: t`Error`,
  }

  function formatTimestamp(iso: string): string {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) {
      return t`${String(Math.floor(diff / 1000))}s ago`
    }
    if (diff < 3600_000) {
      return t`${String(Math.floor(diff / 60_000))}m ago`
    }
    return d.toLocaleTimeString()
  }

  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-1.5 pl-4 pr-1">
          <span
            className={cn("block h-2 w-2 rounded-full shrink-0", STATUS_DOT[status])}
            title={statusLabels[status]}
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
  const { t } = useLingui()
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
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border sticky top-0 bg-background z-20">
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium shrink-0">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <Trans>Live</Trans>
          </span>
        )}

        <Select
          value={stepFilter}
          onValueChange={(v) => {
            setStepFilter(v === " " ? "" : v)
            setOffset(0)
          }}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder={t`All steps`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" "><Trans>All steps</Trans></SelectItem>
            {STEP_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder={t`Filter by item ID...`}
          className="h-7 w-36 text-xs"
          value={itemIdFilter}
          onChange={(e) => {
            setItemIdFilter(e.target.value)
            setOffset(0)
          }}
        />

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />{" "}
            <Trans>Success</Trans>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />{" "}
            <Trans>Cached</Trans>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" />{" "}
            <Trans>Error</Trans>
          </span>
        </div>
      </div>

      <div>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
            <tr className="border-b border-border/50 text-[10px] text-muted-foreground font-medium">
              <th className="w-6 py-1.5 pl-4 pr-1 text-left" />
              <th className="py-1.5 px-2 text-left whitespace-nowrap"><Trans>Time</Trans></th>
              <th className="py-1.5 px-2 text-left"><Trans>Step</Trans></th>
              <th className="py-1.5 px-2 text-left"><Trans>Item</Trans></th>
              <th className="py-1.5 px-2 text-left"><Trans>Prompt</Trans></th>
              <th className="py-1.5 px-2 text-left"><Trans>Model</Trans></th>
              <th className="py-1.5 px-2 text-right whitespace-nowrap"><Trans>Duration</Trans></th>
              <th className="py-1.5 px-2 pr-4 text-right"><Trans>Tokens</Trans></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  <Trans>Loading logs...</Trans>
                </td>
              </tr>
            )}

            {!isLoading && data && data.logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                  <Trans>No log entries found yet.</Trans>
                </td>
              </tr>
            )}

            {data?.logs.map((entry) => (
              <HistoryLogRow key={entry.id} entry={entry} label={label} />
            ))}
          </tbody>
        </table>

        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground tabular-nums">
              {offset + 1}-{Math.min(offset + limit, data.total)} {t`of`} {data.total}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                <Trans>Prev</Trans>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={offset + limit >= data.total}
                onClick={() => setOffset(offset + limit)}
              >
                <Trans>Next</Trans>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
