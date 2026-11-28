import { SETUP_RECOMMENDATION_ERROR_CODES } from "@adt/types"
import type { SetupErrorKind } from "./SetupError"

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

/** The PDF's own problems (pdf-invalid, pdf-too-large, pdf-unreadable, pdf-no-pages, pdf-pages-unreadable). */
const PDF_CODES = new Set<string>(SETUP_RECOMMENDATION_ERROR_CODES.filter((c) => c.startsWith("pdf-")))
/** AiProviderError codes about the key itself (the others, like an unknown model, aren't the key's fault). */
const KEY_CODES = new Set(["missing-credential", "invalid-credential"])

const field = (error: unknown, name: "status" | "code") =>
  typeof error === "object" && error !== null && name in error ? (error as Record<string, unknown>)[name] : undefined

/**
 * Sorts whatever the recommender (or the network) threw into an error kind. The server answers with
 * a `code` (SetupRecommendationErrorCode, or the AiProviderError code of a provider that isn't set
 * up); a provider's own refusal comes as `ai-provider-failed` whose message starts with its HTTP status.
 * "offline" only when the browser says it is: any other failed request is "unknown" (Try again).
 */
export function classifySetupError(error: unknown): SetupFailure {
  if (error instanceof SetupFailure) return error
  const status = field(error, "status") === undefined ? undefined : Number(field(error, "status"))
  const code = typeof field(error, "code") === "string" ? (field(error, "code") as string) : null
  const detail = error instanceof Error ? error.message : String(error)
  const text = detail.toLowerCase()
  if (status === undefined && typeof navigator !== "undefined" && navigator.onLine === false) return new SetupFailure("offline", detail)
  if ((code && PDF_CODES.has(code)) || status === 413) return new SetupFailure("pdf", detail)
  if ((code && KEY_CODES.has(code)) || status === 401 || status === 403 || /\bhttp 40[13]\b|incorrect api key|invalid api key|openai_api_key|unauthorized|authentication/.test(text))
    return new SetupFailure("auth", detail)
  if (status === 429 || /\bhttp 429\b|quota|rate limit|too many requests/.test(text)) return new SetupFailure("quota", detail)
  return new SetupFailure("unknown", detail)
}
