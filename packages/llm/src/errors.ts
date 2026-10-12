// Adapted from PR #712 (92ce4d19), Kemal Sokolovic; bounded for provider ports.
import { APICallError, NoObjectGeneratedError } from "ai"
import type { LLMErrorClassification } from "@adt/types"
import type { TokenUsage } from "./types.js"
import { AiProviderError } from "./ports/errors.js"

export class LLMValidationError extends Error {
  constructor(
    readonly feedback: string[],
    readonly output?: unknown,
    readonly usage?: TokenUsage,
  ) {
    super("Model output did not satisfy validation")
    this.name = "LLMValidationError"
  }
}

/** Safe to surface in page progress and persist; never retains a raw provider body. */
export class LLMCallError extends Error {
  constructor(
    readonly classification: LLMErrorClassification,
    readonly attempts: number,
    readonly providerCalls: number,
    readonly requestId: string,
  ) {
    super(`${safeLLMErrorMessage(classification)} (${attempts} attempts)`)
    this.name = "LLMCallError"
  }
}

const CONNECT = new Set(["EAI_AGAIN", "ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"])
const TIMEOUT = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])
const CLOSED = new Set(["ECONNABORTED", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET"])
const PERMANENT = new Set([
  "BILLING_HARD_LIMIT_REACHED",
  "INSUFFICIENT_QUOTA",
  "INVALID_API_KEY",
  "MODEL_NOT_FOUND",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "BILLING_NOT_ACTIVE",
])

// Inspect only data properties: hostile getters, cycles and huge payloads cannot
// hang classification or cause the error body to enter a log.
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value
  } catch {
    return undefined
  }
}
function str(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 4096) : ""
}
function chain(error: unknown): unknown[] {
  const queue = [error]
  const result: unknown[] = []
  const seen = new Set<unknown>()
  for (let index = 0; index < queue.length && index < 32; index++) {
    const value = queue[index]
    if (value == null || seen.has(value)) continue
    seen.add(value)
    result.push(value)
    for (const key of ["cause", "error", "data", "response", "responseBody"]) {
      let child = field(value, key)
      if (typeof child === "string") {
        if (child.length > 16384) continue
        try {
          child = JSON.parse(child) as unknown
        } catch {
          continue
        }
      }
      if (child && typeof child === "object" && queue.length < 32) queue.push(child)
    }
  }
  return result
}
function status(value: unknown): number | undefined {
  const code = field(value, "statusCode") ?? field(value, "status")
  return typeof code === "number" && Number.isInteger(code) ? code : undefined
}

// DOMException names are native accessors rather than own data properties.
// Call the native getter directly so an untrusted own getter is never invoked.
function errorName(value: unknown): string {
  if (value instanceof DOMException) {
    try {
      return Object.getOwnPropertyDescriptor(DOMException.prototype, "name")?.get?.call(value) ?? ""
    } catch {
      return ""
    }
  }
  return str(field(value, "name"))
}

export function classifyLLMError(error: unknown): LLMErrorClassification {
  if (error instanceof LLMCallError) return error.classification
  const values = chain(error)
  const http = values.map(status).find((s) => s !== undefined)
  const result = (
    errorClass: LLMErrorClassification["errorClass"],
    retryable: boolean,
  ): LLMErrorClassification => ({
    errorClass,
    retryable,
    ...(http !== undefined ? { statusCode: http } : {}),
  })

  // Typed permanent payloads anywhere in the bounded graph override outer 429s.
  if (
    values.some(
      (v) =>
        AiProviderError.is(v) ||
        [field(v, "code"), field(v, "type")].some((c) => PERMANENT.has(str(c).toUpperCase())) ||
        [400, 401, 403, 404, 422].includes(status(v) ?? 0),
    )
  )
    return result("non-retryable", false)
  if (values.some((v) => errorName(v) === "AbortError")) return result("cancelled", false)
  if (values.some((v) => APICallError.isInstance(v) && v.isRetryable === false))
    return result("non-retryable", false)
  if (http === 408) return result("request-timeout", true)
  if (http === 429) return result("rate-limit", true)
  if (http !== undefined && http >= 500 && http <= 599) return result("server-error", true)
  if (
    values.some(
      (v) =>
        v instanceof LLMValidationError ||
        NoObjectGeneratedError.isInstance(v) ||
        ["AI_TypeValidationError", "AI_JSONParseError", "ZodError"].includes(errorName(v)),
    )
  )
    return result("model-output", true)
  for (const v of values) {
    const code = str(field(v, "code")).toUpperCase()
    if (CONNECT.has(code)) return result("connect-timeout", true)
    if (TIMEOUT.has(code) || errorName(v) === "TimeoutError") return result("request-timeout", true)
    if (CLOSED.has(code)) return result("connection-closed", true)
  }
  // Text is a fallback only; trusted typed signals above take precedence.
  const messages = values.map((v) => str(field(v, "message")) || str(v)).join(" ")
  if (
    /invalid[_ ]api[_ ]key|incorrect api key|insufficient[_ ]quota|billing hard limit|unauthorized|forbidden|unsupported (?:provider|model)|model (?:is )?not found|usage limit reached/i.test(
      messages,
    )
  )
    return result("non-retryable", false)
  if (/connect(?:ion)?\s*timeout|connecttimeouterror|timed out while connecting/i.test(messages))
    return result("connect-timeout", true)
  if (/request\s*timeout|headers\s*timeout|body\s*timeout/i.test(messages))
    return result("request-timeout", true)
  if (
    /other side closed|connection (?:was )?(?:closed|reset|terminated)|socket hang up|premature close|broken pipe/i.test(
      messages,
    )
  )
    return result("connection-closed", true)
  return result("unknown", true)
}

export function safeLLMErrorMessage(classification: LLMErrorClassification): string {
  const messages = {
    "connect-timeout": "Temporary provider connection failure",
    "request-timeout": "Provider request timed out",
    "connection-closed": "Provider connection closed",
    "model-output": "Model output did not satisfy validation",
    "rate-limit": "Provider rate limit reached",
    "server-error": "Temporary provider server failure",
    unknown: "Provider request failed",
    "non-retryable":
      "Provider configuration, credentials, quota, request or local storage must be corrected",
    cancelled: "Request cancelled",
  }
  return messages[classification.errorClass]
}

/** Provider delay is advisory and cannot exceed the existing 60s + 10% ceiling. */
export function boundedRetryDelay(error: unknown, fallbackMs: number): number {
  for (const value of chain(error)) {
    if (!APICallError.isInstance(value)) continue
    const raw = field(field(value, "responseHeaders"), "retry-after")
    if (typeof raw !== "string" || raw.length > 128) continue
    const seconds = Number(raw)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now()
    if (Number.isFinite(delay) && delay > 0) return Math.min(66_000, Math.max(fallbackMs, delay))
  }
  return fallbackMs
}
