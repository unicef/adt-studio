import type { ErrorHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { AiProviderError } from "@adt/llm"
import type { AiProviderErrorCode } from "@adt/types"

/** Provider configuration and billing failures have actionable client errors. */
const PROVIDER_ERROR_STATUS: Record<AiProviderErrorCode, 400 | 402 | 422> = {
  "unknown-provider": 400,
  "unsupported-modality": 422,
  "unsupported-capability": 422,
  "missing-credential": 400,
  "invalid-credential": 400,
  "invalid-model-id": 400,
  "payment-required": 402,
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  if (AiProviderError.is(err)) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        provider: err.details.providerId,
        credentialKey: err.details.credentialKey,
      },
      PROVIDER_ERROR_STATUS[err.code],
    )
  }
  console.error(err)
  return c.json({ error: "Internal server error" }, 500)
}
