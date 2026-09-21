import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/lib/elapsed"
import type { LoaderStatus, LoaderStep, LoaderStepState } from "./CalmStepLoader"

const COLUMNS = 3
const MIN_SHOWN_DURATION_MS = 1000
const GAP_X = 48
const GAP_Y = 30
const NODE_HEIGHT = 68

type Side = "top" | "right" | "bottom" | "left"

interface Cell {
  row: number
  column: number
  flowsRight: boolean
}

function cellOf(index: number): Cell {
  const row = Math.floor(index / COLUMNS)
  const withinRow = index % COLUMNS
  const flowsRight = row % 2 === 0
  return { row, column: flowsRight ? withinRow : COLUMNS - 1 - withinRow, flowsRight }
}

function isSettled(state: LoaderStepState): boolean {
  return state === "done" || state === "skipped"
}

/** The provisioning stream carries statuses, not timings. */
function useStepDurations(stepStates: readonly LoaderStepState[]): (number | null)[] {
  const timings = useRef<{ startedAt: number; endedAt: number | null }[]>([])
  const [, force] = useState(0)

  useEffect(() => {
    let changed = false
    stepStates.forEach((state, index) => {
      const held = timings.current[index]
      if (state === "running" && !held) {
        timings.current[index] = { startedAt: Date.now(), endedAt: null }
        changed = true
      }
      if (held && !held.endedAt && (isSettled(state) || state === "error")) {
        held.endedAt = Date.now()
        changed = true
      }
      if (state === "pending" && held) {
        delete timings.current[index]
        changed = true
      }
    })
    if (changed) force((n) => n + 1)
  }, [stepStates])

  return stepStates.map((_, index) => {
    const held = timings.current[index]
    if (!held?.endedAt) return null
    const took = held.endedAt - held.startedAt
    return took >= MIN_SHOWN_DURATION_MS ? took : null
  })
}

function useMeasuredWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function nodeRect(cell: Cell, nodeWidth: number) {
  return {
    x: cell.column * (nodeWidth + GAP_X),
    y: cell.row * (NODE_HEIGHT + GAP_Y),
    width: nodeWidth,
    height: NODE_HEIGHT,
  }
}

function handlePoint(cell: Cell, side: Side, nodeWidth: number): { x: number; y: number } {
  const { x, y, width, height } = nodeRect(cell, nodeWidth)
  if (side === "left") return { x, y: y + height / 2 }
  if (side === "right") return { x: x + width, y: y + height / 2 }
  if (side === "top") return { x: x + width / 2, y }
  return { x: x + width / 2, y: y + height }
}

function edgeSides(from: Cell, to: Cell): { out: Side; into: Side } {
  if (from.row !== to.row) return { out: "bottom", into: "top" }
  return from.flowsRight ? { out: "right", into: "left" } : { out: "left", into: "right" }
}

function StepGlyph({ state, icon: Icon }: { state: LoaderStepState; icon: LoaderStep["icon"] }) {
  if (state === "done") return <Check className="size-3.5" aria-hidden="true" />
  if (state === "error") return <X className="size-3.5" aria-hidden="true" />
  if (state === "skipped") return <Minus className="size-3.5" aria-hidden="true" />
  if (state === "running") {
    return (
      <Loader2
        className="size-3.5 motion-safe:animate-spin motion-reduce:opacity-60"
        aria-hidden="true"
      />
    )
  }
  return <Icon className="size-3.5" aria-hidden="true" />
}

function Handle({ side, carried }: { side: Side; carried: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-2 rounded-full border transition-colors duration-500",
        "motion-reduce:transition-none",
        carried ? "border-brand-500 bg-brand-500" : "border-muted-foreground/40 bg-card",
        side === "left" && "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
        side === "right" && "right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
        side === "top" && "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
        side === "bottom" && "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
      )}
    />
  )
}

export interface ProvisionPipelineProps {
  steps: readonly LoaderStep[]
  status: LoaderStatus
  stepStates: readonly LoaderStepState[]
  activeStep?: number | null
  elapsedMs: number
  testIdPrefix: string
  rootTestId?: string
  copy: {
    done: string
    doneDetail: string
    error: string
    errorDetail: string
    idle?: string
    idleDetail?: string
  }
  idleAction?: ReactNode
  errorContent?: ReactNode
}

export function ProvisionPipeline({
  steps,
  status,
  stepStates,
  elapsedMs,
  testIdPrefix,
  rootTestId,
  copy,
  idleAction,
  errorContent,
}: ProvisionPipelineProps) {
  const { i18n, t } = useLingui()
  const durations = useStepDurations(stepStates)
  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasWidth = useMeasuredWidth(canvasRef)

  const total = steps.length
  const settled = stepStates.filter(isSettled).length
  const rows = Math.ceil(total / COLUMNS)
  const nodeWidth = Math.max(0, (canvasWidth - GAP_X * (COLUMNS - 1)) / COLUMNS)
  const canvasHeight = rows * NODE_HEIGHT + (rows - 1) * GAP_Y

  const headline =
    status === "done" ? copy.done : status === "error" ? copy.error : (copy.idle ?? "")
  const detail =
    status === "done"
      ? copy.doneDetail
      : status === "error"
        ? copy.errorDetail
        : (copy.idleDetail ?? "")

  return (
    <div data-testid={rootTestId} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          {status === "running" ? (
            <span />
          ) : (
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-foreground">{headline}</p>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>
          )}
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <Trans>
              {settled} of {total}
            </Trans>
            {status !== "idle" && <span className="ml-3">{formatElapsed(elapsedMs)}</span>}
          </p>
        </div>

        {status === "running" && (
          <span className="h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(settled / total) * 100}%` }}
            />
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 p-5 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px]">
        <div ref={canvasRef} className="relative" style={{ height: canvasHeight }}>
          {canvasWidth > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={canvasWidth}
              height={canvasHeight}
            >
              {steps.slice(0, -1).map((step, index) => {
                const from = cellOf(index)
                const to = cellOf(index + 1)
                const { out, into } = edgeSides(from, to)
                const start = handlePoint(from, out, nodeWidth)
                const end = handlePoint(to, into, nodeWidth)
                const state = stepStates[index] ?? "pending"
                const flowing = state === "running"
                return (
                  <line
                    key={step.id}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeDasharray={flowing ? "4 7" : undefined}
                    className={cn(
                      "transition-[stroke] duration-500 motion-reduce:transition-none",
                      state === "error"
                        ? "stroke-destructive/50"
                        : isSettled(state) || flowing
                          ? "stroke-brand-400"
                          : "stroke-border",
                      flowing && "motion-safe:animate-edge-dash",
                    )}
                  />
                )
              })}
            </svg>
          )}

          <ol aria-label={t`Setup steps`} className="contents">
            {steps.map((step, index) => {
              const state = stepStates[index] ?? "pending"
              const cell = cellOf(index)
              const { x, y } = nodeRect(cell, nodeWidth)
              const previous = index > 0 ? cellOf(index - 1) : null
              const next = index < total - 1 ? cellOf(index + 1) : null

              return (
                <li
                  key={step.id}
                  data-testid={`${testIdPrefix}-${step.number}`}
                  data-step-id={step.id}
                  data-state={state}
                  className="absolute"
                  style={{ left: x, top: y, width: nodeWidth || undefined, height: NODE_HEIGHT }}
                >
                  <div
                    className={cn(
                      "relative flex h-full items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-sm",
                      "transition-colors duration-300 motion-reduce:transition-none",
                      state === "running" && "border-brand-400 bg-brand-50 dark:bg-brand-500/10",
                      state === "done" && "border-emerald-500/40 bg-card",
                      state === "error" && "border-destructive/50 bg-destructive/5",
                      state === "skipped" && "border-dashed border-border bg-card/60 opacity-60",
                      state === "pending" && "border-border bg-card",
                    )}
                  >
                    {previous && (
                      <Handle
                        side={edgeSides(previous, cell).into}
                        carried={isSettled(stepStates[index - 1] ?? "pending")}
                      />
                    )}
                    {next && <Handle side={edgeSides(cell, next).out} carried={isSettled(state)} />}

                    <span
                      className={cn(
                        "relative mt-px flex size-6 shrink-0 items-center justify-center rounded-full",
                        "transition-colors duration-300 motion-reduce:transition-none",
                        state === "running" && "bg-brand-500 text-white",
                        state === "done" && "bg-emerald-500 text-white",
                        state === "error" && "bg-destructive text-white",
                        (state === "pending" || state === "skipped") &&
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {state === "running" && (
                        <span
                          aria-hidden="true"
                          className="absolute -inset-1 rounded-full bg-brand-400/30 motion-safe:animate-medallion-halo"
                        />
                      )}
                      <span className="relative">
                        <StepGlyph state={state} icon={step.icon} />
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          {...(state === "running"
                            ? { role: "status" as const, "aria-live": "polite" as const }
                            : {})}
                          className={cn(
                            "truncate text-[13px] font-medium leading-5",
                            state === "pending" || state === "skipped"
                              ? "text-muted-foreground"
                              : "text-foreground",
                          )}
                        >
                          {i18n._(step.title)}
                        </span>
                        {durations[index] !== null && (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {formatElapsed(durations[index] ?? 0)}
                          </span>
                        )}
                      </span>
                      {state === "running" && (
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                          {i18n._(step.detail)}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {status === "error" && errorContent ? (
        <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          {errorContent}
        </div>
      ) : null}

      {status === "idle" && idleAction ? <div>{idleAction}</div> : null}
    </div>
  )
}
