import {
  PROVISION_STEPS,
  type CloudflareTokenScope,
  type ProvisionErrorCode,
  type ProvisionProgressEvent,
  type ProvisionStepStatus,
} from "@adt/types"

/**
 * In-memory live view of the Cloudflare provisioning run.
 *
 * The run is driven over SSE, and the browser drops that stream whenever the tab reloads or
 * the wizard unmounts — but the run itself keeps going on the server. Without this, a refresh
 * mid-provision looks exactly like "nothing is happening" while resources are still being
 * created in someone's account.
 *
 * Only one run can be in flight at a time (the route guards it), so a single slot is enough.
 * The terminal snapshot is kept rather than cleared, so a client that reconnects after the run
 * finished still learns how it ended.
 *
 * Scoped to a routes instance rather than the module, matching the in-flight guard beside it,
 * so two servers in one process cannot see each other's runs.
 */
export interface ProvisionRunSnapshot {
  status: "running" | "done" | "error"
  step_states: ProvisionStepStatus[]
  active_step: number | null
  failure: {
    code: ProvisionErrorCode | "unknown"
    message: string
    resume_from_step: number | null
    missing_scopes: CloudflareTokenScope[]
  } | null
  started_at: string
  finished_at: string | null
}

export interface ProvisionRunView {
  begin: () => void
  record: (event: ProvisionProgressEvent) => void
  get: () => ProvisionRunSnapshot | null
}

export function createProvisionRunView(now: () => Date = () => new Date()): ProvisionRunView {
  let run: ProvisionRunSnapshot | null = null

  return {
    begin() {
      run = {
        status: "running",
        step_states: PROVISION_STEPS.map((): ProvisionStepStatus => "pending"),
        active_step: null,
        failure: null,
        started_at: now().toISOString(),
        finished_at: null,
      }
    },

    record(event) {
      if (!run) return

      if (event.type === "step") {
        const index = event.number - 1
        if (index >= 0 && index < run.step_states.length) run.step_states[index] = event.status
        if (event.status === "running") run.active_step = event.number
        return
      }

      if (event.type === "complete") {
        run.status = "done"
        run.step_states = run.step_states.map((value) => (value === "skipped" ? "skipped" : "done"))
        run.active_step = null
        run.finished_at = now().toISOString()
        return
      }

      run.status = "error"
      run.active_step = null
      run.finished_at = now().toISOString()
      run.failure = {
        code: event.code,
        message: event.message,
        resume_from_step: event.resume_from_step,
        missing_scopes: event.missing_scopes ?? [],
      }
    },

    get() {
      return run ? { ...run, step_states: [...run.step_states] } : null
    },
  }
}
