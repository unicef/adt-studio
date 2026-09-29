import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PROVISION_STEP_COUNT, ProvisionErrorCode } from "@adt/types"
import {
  api,
  apiErrorCode,
  type CloudflareConnectionStatus,
  type CloudflareCredentials,
  type CloudflareTokenScope,
  type ProvisionProgressEvent,
  type ProvisionRunSnapshot,
  type ProvisionStepStatus,
} from "@/api/client"
import { cloudflareConnectionKey } from "./use-cloudflare-connection"
import { notifyProvisionRunStarted } from "./use-provision-run-notice"

export type ProvisionStatus = "idle" | "running" | "done" | "error"

export interface ProvisionFailure {
  code: ProvisionErrorCode | "unknown"
  detail: string | null
  resumeStep: number | null
  missingScopes: CloudflareTokenScope[]
}

const ADOPTED_POLL_MS = 1200

/** Maps the server's live view of a run onto the same shape the SSE stream produces. */
function adopt(run: ProvisionRunSnapshot): ProvisionState {
  return {
    status: run.status,
    stepStates: run.step_states,
    activeStep: run.active_step,
    failure: run.failure
      ? {
          code: run.failure.code,
          detail: run.failure.message || null,
          resumeStep: run.failure.resume_from_step,
          missingScopes: run.failure.missing_scopes,
        }
      : null,
    connection: null,
  }
}

export interface CloudflareProvisionController {
  status: ProvisionStatus
  stepStates: ProvisionStepStatus[]
  activeStep: number | null
  failure: ProvisionFailure | null
  connection: CloudflareConnectionStatus | null
  start: (resumeFromStep?: number) => void
  reset: () => void
}

interface ProvisionState {
  status: ProvisionStatus
  stepStates: ProvisionStepStatus[]
  activeStep: number | null
  failure: ProvisionFailure | null
  connection: CloudflareConnectionStatus | null
}

function seedStepStates(resumeFromStep?: number): ProvisionStepStatus[] {
  const resumeIndex = resumeFromStep && resumeFromStep > 1 ? resumeFromStep - 1 : 0
  return Array.from({ length: PROVISION_STEP_COUNT }, (_, index) =>
    index < resumeIndex ? "done" : "pending",
  )
}

const IDLE_STATE: ProvisionState = {
  status: "idle",
  stepStates: seedStepStates(),
  activeStep: null,
  failure: null,
  connection: null,
}

/**
 * Drives `POST /cloudflare/provision` and turns its SSE progress into a
 * per-step checklist state. Re-running is how upgrades and retries work, so
 * `start` accepts the step number to resume from.
 */
export function useCloudflareProvision(
  credentials: Partial<CloudflareCredentials>,
): CloudflareProvisionController {
  const queryClient = useQueryClient()
  const [state, setState] = useState<ProvisionState>(IDLE_STATE)
  const abortRef = useRef<AbortController | null>(null)
  /** True once this hook owns a live SSE stream. An adopted run must not poll over the top
   *  of one, and the stream must win: it is the authoritative view. */
  const streamingRef = useRef(false)

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  /** A reload drops the SSE stream but not the run behind it, so on mount we ask whether one
   *  is still going and follow it to its end. Without this a refresh mid-provision shows an
   *  idle screen while resources are still being created in the user\'s account. */
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      if (cancelled || streamingRef.current) return
      try {
        const { run } = await api.getCloudflareProvisionRun()
        if (cancelled || streamingRef.current || !run) return
        if (run.status === "running" || run.finished_at) setState(adopt(run))
        if (run.status === "done") {
          queryClient.invalidateQueries({ queryKey: cloudflareConnectionKey })
          return
        }
        if (run.status === "running") timer = window.setTimeout(() => void poll(), ADOPTED_POLL_MS)
      } catch {
        /* the run view is a convenience; a failed read just leaves the screen as it was */
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [queryClient])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(IDLE_STATE)
  }, [])

  const start = useCallback(
    (resumeFromStep?: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      streamingRef.current = true
      notifyProvisionRunStarted()

      setState({
        status: "running",
        stepStates: seedStepStates(resumeFromStep),
        activeStep: resumeFromStep ?? 1,
        failure: null,
        connection: null,
      })

      let sawTerminalEvent = false

      const handleEvent = (event: ProvisionProgressEvent) => {
        if (event.type === "complete") {
          sawTerminalEvent = true
          setState((prev) => ({
            status: "done",
            stepStates: prev.stepStates.map((value) =>
              value === "skipped" ? "skipped" : "done",
            ),
            activeStep: null,
            failure: null,
            connection: event.connection,
          }))
          queryClient.setQueryData(cloudflareConnectionKey, event.connection)
          queryClient.invalidateQueries({ queryKey: cloudflareConnectionKey })
          return
        }

        if (event.type === "error") {
          sawTerminalEvent = true
          const failure: ProvisionFailure = {
            code: event.code,
            detail: event.message || null,
            resumeStep: event.resume_from_step,
            missingScopes: event.missing_scopes ?? [],
          }
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value, index) =>
              value === "running" || index + 1 === failure.resumeStep ? "error" : value,
            ),
            activeStep: failure.resumeStep,
            failure,
          }))
          return
        }

        const index = event.number - 1
        if (index < 0 || index >= PROVISION_STEP_COUNT) return

        setState((prev) => {
          const stepStates = [...prev.stepStates]
          stepStates[index] = event.status
          return {
            ...prev,
            stepStates,
            activeStep: event.number,
            status: event.status === "error" ? "error" : prev.status,
          }
        })
      }

      void api
        .provisionCloudflare(credentials, {
          onEvent: handleEvent,
          resumeFromStep,
          signal: controller.signal,
        })
        .then(() => {
          if (sawTerminalEvent || controller.signal.aborted) return
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: {
              code: "partial_provision",
              detail: null,
              resumeStep: prev.activeStep,
              missingScopes: [],
            },
          }))
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          /** A route that fails *before* the stream opens answers with a code — `r2_not_enabled`
           *  being the one that matters most, since its cure is a specific screen and not a
           *  generic apology. Parsed against the schema rather than matched against a copy of
           *  the list, so a code added there can never quietly degrade to "unknown" here. */
          const parsed = ProvisionErrorCode.safeParse(apiErrorCode(error))
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: {
              code: parsed.success ? parsed.data : "unknown",
              detail: error instanceof Error ? error.message : null,
              resumeStep: prev.activeStep,
              missingScopes: [],
            },
          }))
        })
    },
    [credentials, queryClient],
  )

  return { ...state, start, reset }
}
