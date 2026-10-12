import { EditConflictError } from "../services/edit-conflict.js"
import type { ErrorHandler } from "hono"
import { BookBusyError, ExtractionAdmissionError } from "@adt/storage"
import { SectioningSafetyError, AuthoredReplacementError } from "@adt/pipeline"
import { HTTPException } from "hono/http-exception"
import { AiProviderError } from "@adt/llm"
import type { AiProviderErrorCode } from "@adt/types"

/** A missing or unusable provider selection is a request problem, not a bug. */
const PROVIDER_ERROR_STATUS: Record<AiProviderErrorCode, 400 | 422> = {
  "unknown-provider": 400,
  "unsupported-modality": 422,
  "unsupported-capability": 422,
  "missing-credential": 400,
  "invalid-credential": 400,
  "invalid-model-id": 400,
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AuthoredReplacementError) return c.json({ error: err.message,
    code: err.code, currentVersion: err.currentVersion,
  }, err.status)
  if (err instanceof EditConflictError) return c.json({ error: err.message, code: err.code, currentVersion: err.currentVersion }, 409)
  if (err instanceof BookBusyError || err instanceof SectioningSafetyError || err instanceof ExtractionAdmissionError) return c.json({ error: err.message, code: err.code, ...(err instanceof ExtractionAdmissionError && err.summary ? { summary: err.summary } : {}) }, 409)
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
