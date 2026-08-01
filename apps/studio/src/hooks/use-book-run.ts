import { useEffect, useCallback, useRef, createContext, useContext, useState } from "react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { toast } from "sonner"
import {
  api,
  BASE_URL,
  type TaskInfoResponse,
  type StageRunProviderCredentials,
  type PageSummaryItem,
  type PageDetail,
  type PendingDecision,
} from "@/api/client"
import { STEP_TO_STAGE, PIPELINE, getStageClearOrder, PAGE_PROGRESS_STEPS } from "@adt/types"
import type { StageName } from "@adt/types"
import { isStageComplete } from "./run-state"
import { playCompletionSound, playErrorSound } from "@/lib/completion-sound"
import { useAnnouncer } from "@/components/a11y/LiveRegionAnnouncer"
import { getStageLabelI18n, getStageRunningLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { bookTasksKey } from "./use-book-tasks"
import { invalidateStoryboardDependents } from "./use-page-mutations"
import { useApiKey } from "./use-api-key"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StageState = "idle" | "queued" | "running" | "done" | "error"
export type StepState = "idle" | "running" | "done" | "error" | "skipped"

export interface StepProgress {
  page?: number
  totalPages?: number
  message?: string
}

export interface QueueRunOptions {
  fromStage: string
  toStage: string
  apiKey: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
  providerCredentials?: StageRunProviderCredentials
  /**
   * When true, navigate to the `toStage` step view after queueing. A no-op from
   * the step index (it already swaps to the view once running); a real switch
   * from the settings/overview route, so the run progression stays visible.
   */
  viewAfter?: boolean
}

/** Shape returned by the enriched GET /books/:label/step-status endpoint. */
interface StepStatusResponse {
  stages: Record<string, string>
  steps: Record<string, string>
  error: string | null
  stepErrors?: Record<string, string> | null
  stepMessages?: Record<string, string> | null
  runStatus?: "idle" | "running" | "cancelling" | "cancelled" | "completed" | "failed"
  pendingDecisions?: PendingDecision[]
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface BookRunContextValue {
  /** Stage state: idle / queued / running / done / error */
  stageState(stage: string): StageState
  /** Step state: idle / running / done / error */
  stepState(step: string): StepState
  /** Sub-step progress for running steps (page X/Y) */
  stepProgress(step: string): StepProgress | undefined
  /** Per-step error message (if in error state) */
  stepError(step: string): string | undefined
  /** Run error message */
  error: string | null
  /** Is any stage running or queued? */
  isRunning: boolean
  /** True from the cancel click until the run finishes unwinding. */
  isCancelling: boolean
  /** True while the initial step-status fetch is in flight */
  isStatusLoading: boolean
  /** Queue a stage run */
  queueRun(options: QueueRunOptions): void
  /** Request cancellation of the active run. Queued runs are preserved and
   *  start after it unwinds (a queue with no active run is cleared instead). */
  cancelRun(): void
  /** Page failures awaiting a skip/stop decision (interactive mode). */
  pendingDecisions: PendingDecision[]
  /** Resolve the head pending decision. */
  resolveDecision(decisionId: string, action: "skip" | "stop", applyToAll?: boolean): void
}

const BookRunContext = createContext<BookRunContextValue | null>(null)
export const BookRunProvider = BookRunContext.Provider

export function useBookRun(): BookRunContextValue {
  const ctx = useContext(BookRunContext)
  if (!ctx) throw new Error("useBookRun must be used within a BookRunProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const stepStatusKey = (label: string) => ["books", label, "step-status"] as const

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookRunStatus(label: string): BookRunContextValue {
  const queryClient = useQueryClient()
  const { anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion, geminiKey } = useApiKey()

  // Screen-reader announcements for long-running jobs. Held in a ref so the
  // always-on SSE effect (keyed on [label, queryClient]) can announce without
  // re-subscribing whenever the announcer identity changes.
  const { announce } = useAnnouncer()
  const announceRef = useRef(announce)
  announceRef.current = announce

  const navigate = useNavigate()
  // Held in a ref so the always-on SSE effect can navigate (from a toast action)
  // without listing navigate as a dependency and re-subscribing.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // Primary source of truth: enriched step-status from the server
  const { data, isPending } = useQuery<StepStatusResponse>({
    queryKey: stepStatusKey(label),
    queryFn: () => api.getStepStatus(label),
    enabled: !!label,
    refetchInterval: (query) => {
      const stages = query.state.data?.stages
      if (!stages) return false
      return Object.values(stages).some((s) => s === "running" || s === "queued")
        ? 2000
        : false
    },
  })

  // Sub-step progress is cosmetic (page X/Y during a running step).
  // Stored in a ref + state counter so we don't trigger full re-renders on
  // every progress tick — only the counter bump causes the memo to recalc.
  const progressRef = useRef<Map<string, StepProgress>>(new Map())
  const [progressTick, setProgressTick] = useState(0)

  // Throttle progressive page invalidations during storyboard runs
  const lastPageInvalidateRef = useRef<number>(0)

  // Throttle progressive TTS-list invalidations during speech runs
  const lastTtsInvalidateRef = useRef<number>(0)

  // Serialized run queue — chains API calls so they arrive in click order
  const runChainRef = useRef<Promise<void>>(Promise.resolve())

  // Cancellation UI state. Held in a ref too so the always-on SSE effect (keyed
  // on [label, queryClient]) can read/clear it without re-subscribing.
  const [isCancelling, setIsCancelling] = useState(false)
  const isCancellingRef = useRef(false)
  isCancellingRef.current = isCancelling

  // Interactive page-error decisions, keyed by decisionId. Fed by both the SSE
  // `decision-required` event and the polled `pendingDecisions` (recovery after
  // refresh/reconnect), deduped by id.
  const [pendingDecisions, setPendingDecisions] = useState<PendingDecision[]>([])

  // Per-step failed-page counts for toast/sound dedup within one run. A page
  // step emits one step-error per failed page; without this we'd fire a toast +
  // beep for each. Reset per step on step-start and wholesale on run boundaries.
  const errorCountByStepRef = useRef<Map<string, number>>(new Map())
  // Whether we've already played the error sound for the current run-level error.
  const runErrorNotifiedRef = useRef(false)

  // ------------------------------------------------------------------
  // Always-on SSE — opens on mount, closes on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!label) return

    const url = `${BASE_URL}/books/${label}/stages/status`
    const es = new EventSource(url)

    // Refetch on (re)connection to catch up on any missed events
    es.addEventListener("open", () => {
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data)
      const pipelineStep = d.step as string
      const uiStage = (STEP_TO_STAGE as Record<string, string>)[pipelineStep]
      if (!uiStage) return

      // Cancel any in-flight step-status fetch — its response reflects a
      // point-in-time snapshot that is already stale relative to this SSE event.
      // Only cancel if we already have baseline data; otherwise the initial
      // fetch (on page load) would be killed and the UI would stay idle.
      if (queryClient.getQueryData(stepStatusKey(label))) {
        queryClient.cancelQueries({ queryKey: stepStatusKey(label) })
      }

      if (d.type === "step-start") {
        // Fresh attempt at this step — reset its error toast/beep dedup so a new
        // failure notifies again, and clear any stale error state in the cache.
        errorCountByStepRef.current.delete(pipelineStep)
        // Mark step as running in the query cache
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "running" },
            steps: { ...old.steps, [pipelineStep]: "running" },
            stepMessages: removeStepMessage(old.stepMessages, pipelineStep),
            stepErrors: removeStepError(old.stepErrors, pipelineStep),
          }
        })
        // Clear progress for this step
        progressRef.current.delete(pipelineStep)
        // For page-processing steps, the runner has just cleared this step's
        // page data (e.g. web-rendering on a re-run). Refetch the page list now
        // so views reflect the empty state immediately — that's what flips the
        // storyboard step to its "loading pages" panel at the start of a re-run
        // instead of leaving the stale preview on screen. Page data then streams
        // back via the throttled step-progress invalidations below.
        if ((PAGE_PROGRESS_STEPS as ReadonlySet<string>).has(pipelineStep)) {
          lastPageInvalidateRef.current = Date.now()
          queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        }
      } else if (d.type === "step-progress") {
        const message = typeof d.message === "string" && d.message.trim().length > 0
          ? d.message
          : undefined
        const totalPages = typeof d.totalPages === "number" ? d.totalPages : undefined
        const page = typeof d.page === "number" ? d.page : undefined
        if (message || totalPages != null) {
          progressRef.current.set(pipelineStep, {
            page,
            totalPages,
            message,
          })
          setProgressTick((t) => t + 1)
        }
        // Also ensure step is marked running in the cache (handles missed step-start on reconnect)
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          const nextStepMessages = message
            ? { ...(old.stepMessages ?? {}), [pipelineStep]: message }
            : old.stepMessages
          if (
            old.steps[pipelineStep] === "running" &&
            (message ? old.stepMessages?.[pipelineStep] === message : true)
          ) {
            return old
          }
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "running" },
            steps: { ...old.steps, [pipelineStep]: "running" },
            stepMessages: nextStepMessages,
          }
        })
        // Progressively refresh page data during storyboard steps so the UI
        // can show sections/renderings as they complete (throttled to ~2s).
        // Invalidates both the page list (sidebar) and individual page details.
        if ((PAGE_PROGRESS_STEPS as ReadonlySet<string>).has(pipelineStep) && (totalPages ?? 0) > 0) {
          const now = Date.now()
          if (now - lastPageInvalidateRef.current > 2000) {
            lastPageInvalidateRef.current = now
            queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
          }
        }
        // Progressively refresh the TTS list during speech generation — GET
        // /tts serves the run's live snapshot, so each completed audio shows
        // up in the Speech view as it lands (throttled to ~2s).
        if (pipelineStep === "tts") {
          const now = Date.now()
          if (now - lastTtsInvalidateRef.current > 2000) {
            lastTtsInvalidateRef.current = now
            queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] })
          }
        }
      } else if (d.type === "step-complete" || d.type === "step-skip") {
        // The step finished — its failure toast/beep dedup no longer applies.
        errorCountByStepRef.current.delete(pipelineStep)
        // Mark step as done/skipped, recompute stage state
        const nextStepState: StepState = d.type === "step-skip" ? "skipped" : "done"
        // Only chime on the transition into done — not on every trailing
        // step event for a stage that's already complete (which would
        // re-register the same completion and beep repeatedly).
        let stageJustCompleted = false
        const completeMessage =
          typeof d.message === "string" && d.message.trim().length > 0 ? d.message : undefined
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          const wasComplete = old.stages[uiStage] === "done"
          const steps = { ...old.steps, [pipelineStep]: nextStepState }
          // A completed step is no longer in error — drop any stale per-page
          // error so a "skip and continue" outcome clears the red state. Also
          // preserve a completion message (e.g. "2 page(s) skipped") if present.
          const stepErrors = removeStepError(old.stepErrors, pipelineStep)
          const stepMessages = completeMessage
            ? { ...(old.stepMessages ?? {}), [pipelineStep]: completeMessage }
            : removeStepMessage(old.stepMessages, pipelineStep)

          // Recompute the parent stage from its steps without assuming "error":
          // done if all steps done/skipped, else error only if a step is still
          // errored, else preserve the running/queued state.
          const stageDef = PIPELINE.find((s) => s.name === uiStage)
          const stageStepStates = stageDef?.steps.map((s) => steps[s.name]) ?? []
          const allDone = isStageComplete(stageStepStates)
          const anyError = stageStepStates.some((s) => s === "error")
          const nextStageState = allDone
            ? "done"
            : anyError
              ? "error"
              : old.stages[uiStage]
          const stages = { ...old.stages, [uiStage]: nextStageState }

          // Recompute the run-level error banner from the remaining step errors.
          const remainingErrors = stepErrors ?? {}
          const error = Object.keys(remainingErrors).length > 0 ? old.error : null

          stageJustCompleted = allDone && !wasComplete
          return {
            ...old,
            stages,
            steps,
            stepErrors,
            stepMessages,
            error,
          }
        })
        if (stageJustCompleted) {
          playCompletionSound()
          // The chime alone tells a sighted user nothing about *which* stage
          // finished; announce it so screen-reader users know they can proceed.
          announceRef.current(i18n._(msg`${getStageLabelI18n(uiStage)} complete`))
        }
        progressRef.current.delete(pipelineStep)

        // Also invalidate data queries for the completed step's stage
        invalidateStageData(queryClient, label, uiStage)
        if (pipelineStep === "metadata") {
          queryClient.invalidateQueries({ queryKey: ["books", label] })
          queryClient.invalidateQueries({ queryKey: ["books"] })
        }
      } else if (d.type === "step-error") {
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "error" },
            steps: { ...old.steps, [pipelineStep]: "error" },
            stepErrors: { ...old.stepErrors, [pipelineStep]: d.error ?? i18n._(msg`Step failed`) },
            stepMessages: removeStepMessage(old.stepMessages, pipelineStep),
            error: d.error ?? i18n._(msg`Step failed`),
          }
        })
        // Assertive: a failed step blocks progress; the user needs to know now.
        announceRef.current(i18n._(msg`${getStageLabelI18n(uiStage)} failed`), "assertive")
        progressRef.current.delete(pipelineStep)

        // Toast + error sound, deduplicated per step. A per-page step emits one
        // step-error per failed page; we notify once and then update the same
        // toast with the aggregated count. Honest wording: a page failing does
        // NOT mean the step stopped — it keeps processing the other pages.
        // Suppressed during a cancel (a deliberate action shouldn't beep).
        if (!isCancellingRef.current) {
          const count = (errorCountByStepRef.current.get(pipelineStep) ?? 0) + 1
          errorCountByStepRef.current.set(pipelineStep, count)
          const stageLabel = getStageLabelI18n(uiStage)
          const message =
            count === 1
              ? i18n._(msg`A page failed in ${stageLabel}`)
              : i18n._(msg`${count} pages failed in ${stageLabel}`)
          if (count === 1) playErrorSound()
          toast.error(message, {
            id: `step-error:${pipelineStep}`,
            action: {
              label: i18n._(msg`View details`),
              onClick: () =>
                navigateRef.current({ to: "/books/$label/$step", params: { label, step: uiStage } }),
            },
          })
        }
        // Speech errors persist per-item failures into the TTS output —
        // refetch so the Speech view can mark the failed entries.
        if (pipelineStep === "tts") {
          queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] })
        }
      }
    })

    // A queued run has started executing — full refetch to reconcile
    es.addEventListener("queue-next", () => {
      progressRef.current.clear()
      lastPageInvalidateRef.current = 0
      errorCountByStepRef.current.clear()
      runErrorNotifiedRef.current = false
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    // Run completed — full refetch to reconcile with DB
    es.addEventListener("complete", () => {
      progressRef.current.clear()
      errorCountByStepRef.current.clear()
      runErrorNotifiedRef.current = false
      // A cancel that raced past the last checkpoint resolves as a normal
      // completion — clear the intermediate "cancelling…" state here too.
      setIsCancelling(false)
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
      invalidateBookQueries(queryClient, label)
    })

    // Cancellation finished unwinding — reset in-flight steps to idle and clear
    // the "cancelling…" state. No error toast/beep: this was deliberate.
    es.addEventListener("cancelled", () => {
      progressRef.current.clear()
      errorCountByStepRef.current.clear()
      runErrorNotifiedRef.current = false
      setIsCancelling(false)
      setPendingDecisions([])
      queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
        if (!old) return old
        const steps = { ...old.steps }
        for (const [step, state] of Object.entries(steps)) {
          if (state === "running") steps[step] = "idle"
        }
        const stages = { ...old.stages }
        for (const stage of PIPELINE) {
          const ss = stage.steps.map((s) => steps[s.name])
          if (ss.some((s) => s === "running")) continue
          if (stages[stage.name] === "running") {
            stages[stage.name] = ss.some((s) => s === "error") ? "error" : "idle"
          }
        }
        return { ...old, steps, stages, runStatus: "cancelled" }
      })
      announceRef.current(i18n._(msg`Run cancelled`))
      toast.info(i18n._(msg`Run cancelled`))
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
      invalidateBookQueries(queryClient, label)
    })

    // A page failed and the run is waiting for a skip/stop decision.
    es.addEventListener("decision-required", (e) => {
      const me = e as MessageEvent
      if (!me.data) return
      try {
        const d = JSON.parse(me.data) as PendingDecision
        setPendingDecisions((prev) =>
          prev.some((p) => p.decisionId === d.decisionId) ? prev : [...prev, d],
        )
      } catch { /* ignore */ }
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) return
      const me = e as MessageEvent
      // EventSource fires "error" for connection drops/reconnects too — those
      // carry no `data`. Only treat events WITH data as a real run error, so a
      // network blip never toasts or beeps.
      if (me.data) {
        try {
          const d = JSON.parse(me.data)
          const runError = d.error ?? i18n._(msg`Step run failed`)
          queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
            if (!old) return old
            return { ...old, error: runError }
          })
          // A cancel never emits stage-run-error, so any error here is real.
          setIsCancelling(false)
          if (!isCancellingRef.current) {
            // Only beep if per-page step-errors didn't already (they usually
            // arrive just before the run-error for the same failure).
            if (errorCountByStepRef.current.size === 0 && !runErrorNotifiedRef.current) {
              playErrorSound()
            }
            runErrorNotifiedRef.current = true
            toast.error(runError, { id: `run-error:${label}` })
          }
        } catch { /* ignore */ }
      }
      // Refetch to get the authoritative state
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    // Handle ad-hoc task events (image generation, packaging, etc.)
    es.addEventListener("task", (e) => {
      const d = JSON.parse(e.data) as { type: string; taskId: string; kind?: string; description?: string; pageId?: string; url?: string; error?: string; result?: unknown; message?: string; percent?: number }
      const tasksKey = bookTasksKey(label)

      queryClient.setQueryData<{ tasks: TaskInfoResponse[] }>(tasksKey, (old) => {
        const tasks = [...(old?.tasks ?? [])]
        const idx = tasks.findIndex((t) => t.taskId === d.taskId)

        if (d.type === "task-start") {
          if (idx === -1) {
            tasks.push({
              taskId: d.taskId,
              kind: d.kind ?? "package-adt",
              status: "running",
              description: d.description ?? "",
              pageId: d.pageId,
              url: d.url,
              startedAt: Date.now(),
            })
          }
        } else if (d.type === "task-complete") {
          if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], status: "completed", result: d.result, completedAt: Date.now() }
          }
          // Invalidate related data — use cache entry if available, fall back to polling
          const completedTask = idx !== -1 ? tasks[idx] : undefined
          if (completedTask?.kind === "package-adt") {
            queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
            queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
            queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] })
            queryClient.invalidateQueries({ queryKey: ["debug", "versions", label, "accessibility-assessment", "book"] })
            queryClient.invalidateQueries({ queryKey: ["book-config", label] })
          }
          if (
            (completedTask?.kind === "image-generate" ||
              completedTask?.kind === "re-render" ||
              completedTask?.kind === "ai-edit" ||
              completedTask?.kind === "layout-mirror" ||
              completedTask?.kind === "generate-activity") &&
            completedTask.pageId
          ) {
            queryClient.invalidateQueries({ queryKey: ["books", label, "pages", completedTask.pageId] })
            queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
            if (completedTask.kind === "ai-edit") {
              queryClient.invalidateQueries({ queryKey: ["books", label, "pages", completedTask.pageId, "ai-edit-history"] })
            }
            // generate-activity changes a page's section count, so the pages
            // list (which drives the storyboard sidebar) needs to refetch.
            // refetchQueries (not invalidate) makes the update deterministic —
            // it doesn't depend on the sidebar's query being marked stale or
            // active when the SSE event fires. `exact` is required: without it
            // this prefix-matches every cached ["books", label, "pages", pageId]
            // detail query and refetches them all, active or not.
            if (completedTask.kind === "generate-activity") {
              void queryClient.refetchQueries({ queryKey: ["books", label, "pages"], exact: true })
            }
          }
          if (
            completedTask?.kind === "re-render" ||
            completedTask?.kind === "ai-edit" ||
            completedTask?.kind === "image-generate" ||
            completedTask?.kind === "layout-mirror" ||
            completedTask?.kind === "generate-activity"
          ) {
            invalidateStoryboardDependents(queryClient, label)
          }
          if (completedTask?.kind === "transcribe-timestamps") {
            queryClient.invalidateQueries({ queryKey: ["books", label, "tts-timestamps"] })
          }
          if (completedTask?.kind === "translation-evaluation") {
            queryClient.invalidateQueries({ queryKey: ["evaluations", "translations", label] })
          }
          if (completedTask?.kind === "book-summary") {
            // Refresh the book detail so the banner shows the new summary.
            queryClient.invalidateQueries({ queryKey: ["books", label] })
          }
          // Always refetch tasks so we pick up the final state even if we missed start
          queryClient.invalidateQueries({ queryKey: bookTasksKey(label) })
        } else if (d.type === "task-error") {
          if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], status: "failed", error: d.error, completedAt: Date.now() }
          }
        } else if (d.type === "task-progress") {
          if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], progressMessage: d.message, progressPercent: d.percent }
          }
        }

        return { tasks }
      })

      if (d.type === "task-complete") {
        playCompletionSound()
        const kind =
          d.kind ??
          queryClient
            .getQueryData<{ tasks: TaskInfoResponse[] }>(tasksKey)
            ?.tasks.find((t) => t.taskId === d.taskId)?.kind
        announceRef.current(taskCompleteMessage(kind))
      } else if (d.type === "task-error") {
        announceRef.current(
          d.error ? i18n._(msg`Task failed: ${d.error}`) : i18n._(msg`Task failed`),
          "assertive",
        )
      }
    })

    return () => {
      es.close()
    }
  }, [label, queryClient])

  // ------------------------------------------------------------------
  // queueRun — optimistic update + API call
  // ------------------------------------------------------------------
  const queueRun = useCallback(
    (options: QueueRunOptions) => {
      const { fromStage, toStage, apiKey, renderOnly, viewAfter } = options
      const providerCredentials: StageRunProviderCredentials = {
        anthropicApiKey: anthropicKey || undefined,
        googleApiKey: googleKey || undefined,
        customBaseUrl: customBaseUrl || undefined,
        customApiKey: customApiKey || undefined,
        azure: { key: azureKey, region: azureRegion },
        geminiApiKey: geminiKey || undefined,
        ...options.providerCredentials,
      }

      // Optimistically mark target stage(s) as queued and clear downstream
      const stagesToClear = new Set(getStageClearOrder(fromStage as StageName))
      queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
        // Seed a base when the initial step-status fetch hasn't resolved yet
        // (e.g. a run kicked off right after landing on the book). Bailing out
        // on a cold cache would drop the optimistic "queued" state entirely and
        // leave the UI idle until the first poll lands.
        const base: StepStatusResponse = old ?? { stages: {}, steps: {}, error: null }
        const stages = { ...base.stages }
        const steps = { ...base.steps }
        const stepMessages = base.stepMessages ? { ...base.stepMessages } : null

        for (const stage of stagesToClear) {
          const stageDef = PIPELINE.find((s) => s.name === stage)
          if (stageDef) {
            for (const step of stageDef.steps) {
              // Render-only: preserve page-sectioning step state
              if (renderOnly && step.name === "page-sectioning") continue
              steps[step.name] = "idle"
              delete stepMessages?.[step.name]
            }
          }
          stages[stage] = "idle"
        }

        // Mark the target stage as queued
        stages[fromStage] = "queued"

        return {
          ...old,
          stages,
          steps,
          stepMessages: stepMessages && Object.keys(stepMessages).length > 0 ? stepMessages : null,
          error: null,
        }
      })

      // Optimistically clear the page data this run will regenerate, so the
      // step view immediately mirrors a first-time run instead of leaving stale
      // content up. Without this, a fast/cached re-run finishes before the async
      // refetch ever observes the cleared backend state. Extract re-extracts the
      // PDF (the pages themselves are dropped → empty the list); storyboard
      // clears web-rendering (page.rendering / hasRendering); sectioning/extract
      // also clear page-sectioning (sectioningTree / sectionCount).
      const clearsPages = stagesToClear.has("extract" as StageName)
      const clearsRendering = stagesToClear.has("storyboard" as StageName)
      const clearsSectioning =
        stagesToClear.has("sectioning" as StageName) || stagesToClear.has("extract" as StageName)
      if (clearsPages) {
        // Extract drops and rebuilds every page — empty the list so the extract
        // view shows its from-scratch run card while pages re-extract.
        queryClient.setQueryData<PageSummaryItem[]>(["books", label, "pages"], [])
      } else if (clearsRendering || clearsSectioning) {
        // Page list summaries (sidebar + run-card gating).
        queryClient.setQueryData<PageSummaryItem[]>(["books", label, "pages"], (old) =>
          old?.map((p) => ({
            ...p,
            ...(clearsRendering ? { hasRendering: false, renderingVersion: null } : {}),
            ...(clearsSectioning
              ? { sectionCount: 0, sections: [], prunedSections: [], sectioningVersion: null }
              : {}),
          }))
        )
        // Page detail caches (the storyboard preview reads page.rendering).
        // Match only the per-page detail queries (key length 4), not the list
        // (length 3) or the image queries (length 5).
        queryClient.setQueriesData<PageDetail>(
          {
            queryKey: ["books", label, "pages"],
            predicate: (q) => q.queryKey.length === 4 && q.queryKey[2] === "pages",
          },
          (old) =>
            old
              ? {
                  ...old,
                  ...(clearsRendering ? { rendering: null } : {}),
                  ...(clearsSectioning ? { sectioningTree: null } : {}),
                }
              : old,
        )
      }

      // Immediate spoken confirmation that the (button-click) run has started —
      // long LLM stages otherwise give a screen-reader user no feedback at all.
      announceRef.current(getStageRunningLabelI18n(fromStage))

      // Clear cosmetic progress only for downstream steps being reset
      for (const stage of stagesToClear) {
        const stageDef = PIPELINE.find((s) => s.name === stage)
        if (stageDef) {
          for (const step of stageDef.steps) {
            if (renderOnly && step.name === "page-sectioning") continue
            progressRef.current.delete(step.name)
          }
        }
      }
      setProgressTick((t) => t + 1)

      if (viewAfter) {
        navigate({ to: "/books/$label/$step", params: { label, step: toStage } })
      }

      // Chain the API call so they arrive in click order
      runChainRef.current = runChainRef.current.then(async () => {
        try {
          // The Studio always opts into interactive page-error handling.
          await api.runStages(label, apiKey, { fromStage, toStage, renderOnly, pageErrorPolicy: "ask" }, providerCredentials)
          // Refetch to reconcile — backend cleared step_runs
          queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
        } catch {
          // Don't reset — other stages may still be running/queued
        }
      })
    },
    [label, navigate, queryClient, anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion, geminiKey]
  )

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------
  const stageState = useCallback(
    (stage: string): StageState => {
      return (data?.stages[stage] as StageState) ?? "idle"
    },
    [data]
  )

  const stepStateAccessor = useCallback(
    (step: string): StepState => {
      return (data?.steps[step] as StepState) ?? "idle"
    },
    [data]
  )

  const stepProgressAccessor = useCallback(
    (step: string): StepProgress | undefined => {
      // Reference progressTick to ensure reactivity
      void progressTick
      const progress = progressRef.current.get(step)
      if (progress) return progress
      if (data?.steps?.[step] !== "running") return undefined
      const message = data?.stepMessages?.[step]
      return message ? { message } : undefined
    },
    [data?.stepMessages, data?.steps, progressTick]
  )

  const stepErrorAccessor = useCallback(
    (step: string): string | undefined => {
      return data?.stepErrors?.[step]
    },
    [data]
  )

  const isRunning = Object.values(data?.stages ?? {}).some(
    (s) => s === "running" || s === "queued"
  )

  // ------------------------------------------------------------------
  // Cancel + page-error decisions
  // ------------------------------------------------------------------
  const cancelRun = useCallback(() => {
    setIsCancelling(true)
    announceRef.current(i18n._(msg`Cancelling run…`), "assertive")
    void api.cancelRun(label).catch(() => {
      // 404s resolve inside api.cancelRun; anything else means the request
      // didn't take — refetch so the UI reflects the true state.
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })
  }, [label, queryClient])

  const resolveDecision = useCallback(
    (decisionId: string, action: "skip" | "stop", applyToAll?: boolean) => {
      // Optimistically drop it from the local queue; the server call (409 ==
      // already resolved) is treated as success.
      setPendingDecisions((prev) => prev.filter((p) => p.decisionId !== decisionId))
      void api.resolveDecision(label, { decisionId, action, applyToAll }).catch(() => {
        queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
      })
    },
    [label, queryClient]
  )

  // Reconcile "cancelling…" across refresh/reconnect from the polled runStatus.
  // Force true when the server says "cancelling"; clear only on a terminal state.
  // "running" is deliberately left alone: right after the cancel click the poll
  // may still report "running" before the abort is processed, and resetting here
  // would flicker the button back to "Cancel".
  const polledRunStatus = data?.runStatus
  useEffect(() => {
    if (polledRunStatus === "cancelling") {
      setIsCancelling(true)
    } else if (
      polledRunStatus === "idle" ||
      polledRunStatus === "completed" ||
      polledRunStatus === "failed" ||
      polledRunStatus === "cancelled"
    ) {
      setIsCancelling(false)
    }
  }, [polledRunStatus])

  // Recover pending decisions from the poll (after refresh/reconnect) — union
  // with the SSE-learned ones, deduped by id. Resolution is driven by
  // resolveDecision / the cancelled event / a 409, not by absence here, so a
  // just-arrived SSE decision doesn't flicker while the poll catches up.
  const polledDecisions = data?.pendingDecisions
  useEffect(() => {
    if (!polledDecisions || polledDecisions.length === 0) return
    setPendingDecisions((prev) => {
      const ids = new Set(prev.map((p) => p.decisionId))
      const additions = polledDecisions.filter((d) => !ids.has(d.decisionId))
      return additions.length > 0 ? [...prev, ...additions] : prev
    })
  }, [polledDecisions])

  return {
    stageState,
    stepState: stepStateAccessor,
    stepProgress: stepProgressAccessor,
    stepError: stepErrorAccessor,
    error: data?.error ?? null,
    isRunning,
    isCancelling,
    isStatusLoading: isPending,
    queueRun,
    cancelRun,
    pendingDecisions,
    resolveDecision,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Localized screen-reader announcement for a completed ad-hoc background task. */
function taskCompleteMessage(kind: string | undefined): string {
  switch (kind) {
    case "package-adt":
      return i18n._(msg`Book package ready`)
    case "image-generate":
      return i18n._(msg`Image generated`)
    case "ai-edit":
      return i18n._(msg`Image edit complete`)
    case "re-render":
      return i18n._(msg`Page re-rendered`)
    case "transcribe-timestamps":
      return i18n._(msg`Word highlighting ready`)
    default:
      return i18n._(msg`Task complete`)
  }
}

function invalidateBookQueries(qc: ReturnType<typeof useQueryClient>, label: string) {
  qc.invalidateQueries({ queryKey: ["books", label] })
  qc.invalidateQueries({ queryKey: ["books"] })
  qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
  qc.invalidateQueries({ queryKey: ["package-adt-status", label] })
  qc.invalidateQueries({ queryKey: ["debug"] })
}

function removeStepMessage(
  messages: Record<string, string> | null | undefined,
  step: string,
): Record<string, string> | null {
  if (!messages?.[step]) return messages ?? null
  const next = { ...messages }
  delete next[step]
  return Object.keys(next).length > 0 ? next : null
}

function removeStepError(
  errors: Record<string, string> | null | undefined,
  step: string,
): Record<string, string> | null {
  if (!errors?.[step]) return errors ?? null
  const next = { ...errors }
  delete next[step]
  return Object.keys(next).length > 0 ? next : null
}

/** Invalidate data queries when a stage completes so views refresh. */
function invalidateStageData(qc: ReturnType<typeof useQueryClient>, label: string, stage: string) {
  // Invalidate stage-specific data
  switch (stage) {
    case "extract":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      qc.invalidateQueries({ queryKey: ["books", label] })
      qc.invalidateQueries({ queryKey: ["books"] })
      break
    case "storyboard":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      qc.invalidateQueries({ queryKey: ["books", label] })
      break
    case "quizzes":
      qc.invalidateQueries({ queryKey: ["books", label, "quizzes"] })
      break
    case "captions":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      break
    case "glossary":
      qc.invalidateQueries({ queryKey: ["books", label, "glossary"] })
      qc.invalidateQueries({ queryKey: ["books", label, "sign-language-videos"] })
      break
    case "easy-read":
      qc.invalidateQueries({ queryKey: ["books", label, "easy-read"] })
      qc.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
      break
    case "translate":
      qc.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
      qc.invalidateQueries({ queryKey: ["books", label, "translated-images"] })
      qc.invalidateQueries({ queryKey: ["books", label, "captioned-images"] })
      break
    case "speech":
      qc.invalidateQueries({ queryKey: ["books", label, "tts"] })
      qc.invalidateQueries({ queryKey: ["books", label, "tts-timestamps"] })
      break
  }
}
