import type { SetupErrorKind } from "../errors/SetupError"
import type { SetupRequest, SetupResult } from "./contract"

/** What the screens need from the recommender. The integration implements this over the API client. */
export interface SetupClient {
  recommend(request: SetupRequest, signal: AbortSignal): Promise<SetupResult>
}

/** A failed setup, already sorted into what the user can do about it, with the raw message kept for "Show details". */
export class SetupFailure extends Error {
  constructor(
    readonly kind: SetupErrorKind,
    readonly detail: string,
  ) {
    super(detail)
    this.name = "SetupFailure"
  }
}

/**
 * Sorts whatever the recommender (or the network) threw into an error kind. The backend reports
 * provider errors as the OpenAI SDK's status codes and messages, and its own checks as plain messages
 * (missing key, unparsable or invalid structured output, unreadable PDF).
 */
export function classifySetupError(error: unknown): SetupFailure {
  if (error instanceof SetupFailure) return error
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : undefined
  const detail = error instanceof Error ? error.message : String(error)
  const text = detail.toLowerCase()
  if (status === 401 || status === 403 || /api key|openai_api_key|unauthorized|authentication/.test(text)) return new SetupFailure("auth", detail)
  if (status === 429 || /quota|rate limit|too many requests/.test(text)) return new SetupFailure("quota", detail)
  if ((typeof navigator !== "undefined" && navigator.onLine === false) || /fetch failed|failed to fetch|networkerror|enotfound|econnrefused|econnreset|etimedout/.test(text)) return new SetupFailure("offline", detail)
  return new SetupFailure("unknown", detail)
}
