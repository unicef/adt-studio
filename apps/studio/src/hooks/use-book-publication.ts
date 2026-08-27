import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  PUBLISH_STEP_COUNT,
  type Publication,
  type PublishFeatureSelection,
} from "@adt/types"
import {
  api,
  apiErrorCode,
  type BookPublicationStatus,
  type PublicationResponse,
  type PublishErrorCodeStudio,
  type PublishProgressEvent,
  type PublishStepId,
  type PublishStepStatus,
} from "@/api/client"

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

const PUBLISH_ERROR_CODES: readonly PublishErrorCodeStudio[] = [
  "publish_not_connected",
  "published_already",
  "not_published",
  "export_failed",
  "package_failed",
  "upload_failed",
  "worker_unreachable",
  "snapshot_too_large",
  "not_revoked",
]

function toPublishErrorCode(code: string | null): PublishErrorCodeStudio | "unknown" {
  return PUBLISH_ERROR_CODES.find((known) => known === code) ?? "unknown"
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
  const lastRunRef = useRef<{ kind: PublishRunKind; options: PublishOptions }>({
    kind: "publish",
    options: {},
  })

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(IDLE_STATE)
  }, [])

  const run = useCallback(
    (kind: PublishRunKind, options: PublishOptions = {}) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      lastRunRef.current = { kind, options }

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
    [label, queryClient],
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

  const retry = useCallback(() => {
    const last = lastRunRef.current
    run(last.kind, last.options)
  }, [run])

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
