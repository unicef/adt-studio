import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  PUBLISH_STEP_COUNT,
  PublishErrorCodeStudio,
  type Publication,
  type PublishFeatureSelection,
  type PublishRunSnapshot,
} from "@adt/types"
import {
  api,
  apiErrorCode,
  type BookPublicationStatus,
  type PublicationResponse,
  type PublishProgressEvent,
  type PublishStepId,
  type PublishStepStatus,
} from "@/api/client"
import { notifyPublishRunStarted } from "./use-publish-run-notice"

/** The contract only names steps the server has started; the checklist also has
 *  to draw the ones it hasn't reached yet. */
export type PublishChecklistState = PublishStepStatus | "pending"

export const bookPublicationKey = (label: string) =>
  ["books", label, "publication"] as const

export function useBookPublication(label: string) {
  return useQuery<BookPublicationStatus>({
    queryKey: bookPublicationKey(label),
    queryFn: () => api.getBookPublication(label),
    retry: false,
    staleTime: 30_000,
  })
}

export type PublicationLifecycle = "none" | "active" | "expired" | "revoked"

/** The panel branches on this, not on raw timestamps. The worker's own
 *  `publication` wins when present; the local record is the fallback so the
 *  panel still reads correctly while the worker is unreachable. */
export function publicationLifecycle(
  status: BookPublicationStatus | undefined,
  now: number = Date.now(),
): PublicationLifecycle {
  if (!status?.record && !status?.publication) return "none"
  const revokedAt = status.publication?.revoked_at ?? status.record?.revoked_at ?? null
  if (revokedAt) return "revoked"
  const expiresAt = status.publication?.expires_at ?? status.record?.expires_at ?? null
  if (expiresAt && Date.parse(expiresAt) <= now) return "expired"
  return "active"
}

export type PublishRunStatus = "idle" | "running" | "done" | "error"

export type PublishRunKind = "publish" | "update"

export interface PublishFailure {
  code: PublishErrorCodeStudio | "unknown"
  detail: string | null
  stepId: PublishStepId | null
}

export interface PublishOptions {
  expiresAt?: string | null
  accessCode?: string | null
  /** Absent means the whole book, which is what publishing did before this existed. */
  features?: PublishFeatureSelection
}

export interface PublishRunResult {
  publication: Publication
  url: string
}

/**
 * How far through its own work the running step is, when it knows.
 *
 * Kept as the server's own two numbers rather than a percentage, because the screens need to
 * *say* them ("184 of 340 files") as well as draw them, and a percentage cannot be unsaid back
 * into a count.
 */
export interface PublishStepProgress {
  done: number
  total: number
  unit: "files" | "pages" | "bytes"
}

export interface BookPublishRunController {
  status: PublishRunStatus
  kind: PublishRunKind
  stepStates: PublishChecklistState[]
  activeStep: number | null
  /** Null while the running step is indeterminate, which most of them always are. */
  progress: PublishStepProgress | null
  failure: PublishFailure | null
  result: PublishRunResult | null
  publish: (options?: PublishOptions) => void
  update: () => void
  retry: () => void
  reset: () => void
}

interface RunState {
  status: PublishRunStatus
  kind: PublishRunKind
  stepStates: PublishChecklistState[]
  activeStep: number | null
  progress: PublishStepProgress | null
  failure: PublishFailure | null
  result: PublishRunResult | null
}

function pendingSteps(): PublishChecklistState[] {
  return Array.from({ length: PUBLISH_STEP_COUNT }, () => "pending" as PublishChecklistState)
}

const IDLE_STATE: RunState = {
  status: "idle",
  kind: "publish",
  stepStates: pendingSteps(),
  activeStep: null,
  progress: null,
  failure: null,
  result: null,
}

/* Parsed against the zod enum rather than a hand-copied list: the copy had already drifted —
   it was missing `worker_outdated`, so stale-worker failures rendered as the generic error
   instead of "install the update". A subset-typed array can never catch that; the schema can. */
function toPublishErrorCode(code: string | null): PublishErrorCodeStudio | "unknown" {
  const parsed = PublishErrorCodeStudio.safeParse(code)
  return parsed.success ? parsed.data : "unknown"
}

/** How often a page that picked up someone else's stream re-reads the run. */
const ADOPTED_POLL_MS = 1200

/** The server's snapshot, drawn the way the page draws its own stream. A stopped run is no run:
 *  the author asked for the form back. */
function fromSnapshot(run: PublishRunSnapshot): RunState {
  if (run.status === "cancelled") return IDLE_STATE
  return {
    status: run.status,
    kind: run.kind,
    stepStates: run.step_states,
    activeStep: run.active_step,
    progress: run.progress,
    failure: run.failure
      ? { code: run.failure.code, detail: run.failure.message || null, stepId: run.failure.step_id }
      : null,
    result: run.result,
  }
}

/**
 * Drives `POST /books/:label/publication` (first publish) and
 * `POST …/publication/versions` ("Update site"), turning the shared SSE framing
 * into the four-step checklist state the panel renders.
 */
export function useBookPublishRun(label: string): BookPublishRunController {
  const queryClient = useQueryClient()
  const [state, setState] = useState<RunState>(IDLE_STATE)
  const abortRef = useRef<AbortController | null>(null)
  /** `null` once the page is following a run it did not start: it never saw the choices that
   *  run was made with, so it cannot repeat them. */
  const lastRunRef = useRef<{ kind: PublishRunKind; options: PublishOptions } | null>({
    kind: "publish",
    options: {},
  })
  const pollRef = useRef<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const stopFollowing = useCallback(() => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current)
    pollRef.current = null
  }, [])

  /**
   * Follows a run this page has no stream for: one a reload or a trip to another stage left
   * running on the server, or one another window started. Reads the snapshot until it ends, and
   * lands on the same states a stream would have — so the author sees the conveyor belt at the
   * step it has really reached, not a form offering to start what is already happening.
   */
  const follow = useCallback(() => {
    stopFollowing()
    abortRef.current = null
    lastRunRef.current = null
    notifyPublishRunStarted(label)

    const read = async () => {
      try {
        const { run } = await api.getPublishRun(label)
        if (!run) {
          setState(IDLE_STATE)
          return
        }
        setState(fromSnapshot(run))
        if (run.status === "running") {
          pollRef.current = window.setTimeout(() => void read(), ADOPTED_POLL_MS)
          return
        }
        pollRef.current = null
        void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
      } catch {
        /** A missed read is not an ending; try again rather than guess one. */
        pollRef.current = window.setTimeout(() => void read(), ADOPTED_POLL_MS * 2)
      }
    }
    void read()
  }, [label, queryClient, stopFollowing])

  /** A run already going when the page opened. Only a *running* one is picked up: the server
   *  keeps the last ending around, and a page must not reopen onto a run that finished hours ago. */
  useEffect(() => {
    let cancelled = false
    void api
      .getPublishRun(label)
      .then(({ run }) => {
        if (cancelled || run?.status !== "running") return
        if (abortRef.current || stateRef.current.status !== "idle") return
        follow()
      })
      .catch(() => {
        /* no snapshot to read; the page starts idle, which is what it would have done anyway */
      })
    return () => {
      cancelled = true
    }
  }, [label, follow])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      stopFollowing()
    },
    [stopFollowing],
  )

  /**
   * The way off the run screen: "Stop" while it runs, "Change how you share" after it failed.
   *
   * Dropping the stream no longer stops anything — the server finishes what the browser leaves
   * — so a Stop has to ask the run itself. If it is past the point it can safely stop (the link
   * is being made), the page keeps following it rather than pretending it stopped.
   */
  const reset = useCallback(() => {
    const wasRunning = stateRef.current.status === "running"
    abortRef.current?.abort()
    abortRef.current = null
    stopFollowing()
    setState(IDLE_STATE)
    if (!wasRunning) return
    void api
      .cancelPublishRun(label)
      .then(async ({ cancelled }) => {
        if (cancelled) return
        const { run } = await api.getPublishRun(label)
        if (run?.status === "running") follow()
      })
      .catch(() => {
        /* the run may already be over; the status query will say how it ended */
      })
  }, [label, follow, stopFollowing])

  const run = useCallback(
    (kind: PublishRunKind, options: PublishOptions = {}) => {
      abortRef.current?.abort()
      stopFollowing()
      const controller = new AbortController()
      abortRef.current = controller
      lastRunRef.current = { kind, options }
      notifyPublishRunStarted(label)

      setState({
        status: "running",
        kind,
        stepStates: pendingSteps(),
        activeStep: 1,
        progress: null,
        failure: null,
        result: null,
      })

      let sawTerminalEvent = false

      const handleEvent = (event: PublishProgressEvent) => {
        if (event.type === "complete") {
          sawTerminalEvent = true
          setState((prev) => ({
            ...prev,
            status: "done",
            stepStates: prev.stepStates.map(() => "done"),
            activeStep: null,
            progress: null,
            failure: null,
            result: { publication: event.publication, url: event.url },
          }))
          void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
          return
        }

        if (event.type === "error") {
          sawTerminalEvent = true
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: {
              code: toPublishErrorCode(event.code),
              detail: event.message || null,
              stepId: event.step_id ?? null,
            },
          }))
          void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
          return
        }

        const index = event.number - 1
        if (index < 0 || index >= PUBLISH_STEP_COUNT) return

        setState((prev) => {
          const stepStates = [...prev.stepStates]
          stepStates[index] = event.status
          return {
            ...prev,
            stepStates,
            activeStep: event.number,
            /** Carried only while the step that reported it is the one running. A count left
             *  over from the previous step would draw a bar that describes work already done. */
            progress:
              event.status === "running" && event.total !== undefined && event.done !== undefined
                ? { done: event.done, total: event.total, unit: event.unit ?? "files" }
                : event.status === "running"
                  ? prev.progress
                  : null,
            status: event.status === "error" ? "error" : prev.status,
          }
        })
      }

      const stream =
        kind === "publish"
          ? api.publishBook(label, {
              onEvent: handleEvent,
              expiresAt: options.expiresAt ?? null,
              accessCode: options.accessCode ?? null,
              ...(options.features === undefined ? {} : { features: options.features }),
              signal: controller.signal,
            })
          : api.publishBookVersion(label, {
              onEvent: handleEvent,
              signal: controller.signal,
            })

      void stream
        .then(() => {
          if (sawTerminalEvent || controller.signal.aborted) return
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: { code: "unknown", detail: null, stepId: null },
          }))
          void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          /** Another page — or this one, before a reload — already has a run going for this
           *  book. That is not a failure; it is the run to watch. */
          if (apiErrorCode(error) === "publish_in_progress") {
            follow()
            return
          }
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: {
              code: toPublishErrorCode(apiErrorCode(error)),
              detail: error instanceof Error ? error.message : null,
              stepId: null,
            },
          }))
          void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
        })
    },
    [label, queryClient, follow, stopFollowing],
  )

  const publish = useCallback(
    (options?: PublishOptions) => {
      run("publish", options)
    },
    [run],
  )

  const update = useCallback(() => {
    run("update")
  }, [run])

  /** Repeats the run that failed, choices and all. A followed first share never had its choices
   *  here, and guessing them would publish under a different access code — so it goes back to
   *  the form instead. An update has no choices to lose. */
  const retry = useCallback(() => {
    const last = lastRunRef.current
    if (last) {
      run(last.kind, last.options)
      return
    }
    if (stateRef.current.kind === "update") run("update")
    else reset()
  }, [run, reset])

  return { ...state, publish, update, retry, reset }
}

export function useRevokePublication(label: string) {
  const queryClient = useQueryClient()
  return useMutation<PublicationResponse, Error, void>({
    mutationFn: () => api.revokeBookPublication(label),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
    },
  })
}

export function useResumePublication(label: string) {
  const queryClient = useQueryClient()
  return useMutation<PublicationResponse, Error, void>({
    mutationFn: () => api.resumeBookPublication(label),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
    },
  })
}

export function useSetPublicationAccessCode(label: string) {
  const queryClient = useQueryClient()
  return useMutation<PublicationResponse, Error, string | null>({
    mutationFn: (accessCode) => api.setBookPublicationAccessCode(label, accessCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
    },
  })
}

export function useSetPublicationExpiry(label: string) {
  const queryClient = useQueryClient()
  return useMutation<PublicationResponse, Error, string | null>({
    mutationFn: (expiresAt) => api.setBookPublicationExpiry(label, expiresAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
    },
  })
}
