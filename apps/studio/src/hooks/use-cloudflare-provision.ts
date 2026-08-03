import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PROVISION_STEP_COUNT } from "@adt/types"
import {
  api,
  type CloudflareConnectionStatus,
  type CloudflareCredentials,
  type CloudflareTokenScope,
  type ProvisionErrorCode,
  type ProvisionProgressEvent,
  type ProvisionStepStatus,
} from "@/api/client"
import { cloudflareConnectionKey } from "./use-cloudflare-connection"

export type ProvisionStatus = "idle" | "running" | "done" | "error"

export interface ProvisionFailure {
  code: ProvisionErrorCode | "unknown"
  detail: string | null
  resumeStep: number | null
  missingScopes: CloudflareTokenScope[]
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
  credentials: CloudflareCredentials,
): CloudflareProvisionController {
  const queryClient = useQueryClient()
  const [state, setState] = useState<ProvisionState>(IDLE_STATE)
  const abortRef = useRef<AbortController | null>(null)

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

  const start = useCallback(
    (resumeFromStep?: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

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
          setState((prev) => ({
            ...prev,
            status: "error",
            stepStates: prev.stepStates.map((value) => (value === "running" ? "error" : value)),
            failure: {
              code: "unknown",
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
