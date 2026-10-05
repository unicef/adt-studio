/* eslint-disable lingui/no-unlocalized-strings -- error kinds and provider messages from the recommender, never shown as UI copy */
import { getPdfPageCount } from "@/components/wizard/shared/pdfMetadata"
import type { SetupErrorKind } from "../errors/SetupError"
import { setupResultSchema, type SetupRequest, type SetupResult } from "./contract"
import { MOCK_ERROR_DETAIL, mockResult } from "./fixtures"

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

/** Lab scenarios for the mock client: how the next run should go. */
export type SetupScenario = "confident" | "unsure" | "slow" | SetupErrorKind

const MOCK_MS = { answer: 3600, error: 2800 }

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      window.clearTimeout(id)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

/**
 * Stands in for the recommender until the API serves it: answers like the backend would for the
 * lab's sample books (see fixtures), validated against the same contract. `scenario()` is read at the
 * start of each run so the lab can switch outcomes.
 */
export function createMockSetupClient(scenario: () => SetupScenario, aspect: () => number | undefined): SetupClient {
  return {
    async recommend(request, signal) {
      const s = scenario()
      if (s === "auth" || s === "quota" || s === "offline" || s === "unknown") {
        await wait(MOCK_MS.error, signal)
        throw new SetupFailure(s, MOCK_ERROR_DETAIL[s])
      }
      const [pageCount] = await Promise.all([getPdfPageCount(request.file).catch(() => 0), wait(s === "slow" ? 600_000 : MOCK_MS.answer, signal)])
      return setupResultSchema.parse(mockResult(request, aspect(), s === "unsure", pageCount))
    },
  }
}
