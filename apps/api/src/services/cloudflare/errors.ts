import {
  type CloudflareTokenScope,
  type ProvisionErrorCode,
  type ProvisionStepId,
  provisionStep,
} from "@adt/types"

export interface ProvisionErrorOptions {
  code: ProvisionErrorCode
  message: string
  stepId?: ProvisionStepId
  missingScopes?: CloudflareTokenScope[]
  cause?: unknown
}

export class ProvisionError extends Error {
  readonly code: ProvisionErrorCode
  readonly stepId: ProvisionStepId | null
  readonly resumeFromStep: number | null
  readonly missingScopes: CloudflareTokenScope[] | undefined

  constructor(options: ProvisionErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = "ProvisionError"
    this.code = options.code
    this.stepId = options.stepId ?? null
    this.resumeFromStep = options.stepId ? provisionStep(options.stepId).number : null
    this.missingScopes = options.missingScopes
  }
}

export function isProvisionError(error: unknown): error is ProvisionError {
  return error instanceof ProvisionError
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
