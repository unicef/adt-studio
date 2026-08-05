import { APICallError, NoObjectGeneratedError } from "ai"

export type LLMErrorClass =
  | "connect-timeout"
  | "request-timeout"
  | "connection-closed"
  | "model-output"
  | "rate-limit"
  | "server-error"
  | "unknown"
  | "non-retryable"

export interface LLMErrorClassification {
  errorClass: LLMErrorClass
  retryable: boolean
  statusCode?: number
}

const CONNECT_TIMEOUT_CODES = new Set([
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
])

const REQUEST_TIMEOUT_CODES = new Set([
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
])

const CONNECTION_CLOSED_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_SOCKET",
])

const PERMANENT_ERROR_CODES = new Set([
  "BILLING_HARD_LIMIT_REACHED",
  "INSUFFICIENT_QUOTA",
  "INVALID_API_KEY",
  "MODEL_NOT_FOUND",
])

const PERMANENT_ERROR_MESSAGE =
  /\b(?:invalid|incorrect|missing) api key\b|\bapi key (?:is )?(?:missing|required)\b|\bauthentication (?:failed|error)\b|\bunauthorized\b|\bforbidden\b|\binsufficient[_ ]quota\b|\bunsupported (?:provider|model)\b|\bmodel (?:is )?not found\b/i

interface ErrorLike {
  cause?: unknown
  code?: unknown
  type?: unknown
  error?: unknown
  message?: unknown
  name?: unknown
  statusCode?: unknown
  status?: unknown
  response?: unknown
  responseBody?: unknown
  data?: unknown
  isRetryable?: unknown
}

/**
 * Classify provider and transport failures without relying on one SDK wrapper.
 * Provider SDKs commonly wrap the original Undici error, so every `cause` is
 * inspected until a concrete HTTP status or transport signal is found.
 */
export function classifyLLMError(error: unknown): LLMErrorClassification {
  const chain = errorChain(error)

  for (const current of chain) {
    const status = statusCode(current)
    if (isKnownPermanentError(current)) {
      return {
        errorClass: "non-retryable",
        retryable: false,
        ...(status != null ? { statusCode: status } : {}),
      }
    }
    if (status === 408) {
      return { errorClass: "request-timeout", retryable: true, statusCode: status }
    }
    if (status === 429) {
      return { errorClass: "rate-limit", retryable: true, statusCode: status }
    }
    if (status != null && status >= 500 && status <= 599) {
      const explicitlyNonRetryable =
        APICallError.isInstance(current) && current.isRetryable === false
      return {
        errorClass: explicitlyNonRetryable ? "non-retryable" : "server-error",
        retryable: !explicitlyNonRetryable,
        statusCode: status,
      }
    }
    if (status != null) {
      return { errorClass: "non-retryable", retryable: false, statusCode: status }
    }
  }

  for (const current of chain) {
    const code = errorCode(current)
    const message = errorMessage(current)
    const name = errorName(current)

    if (
      NoObjectGeneratedError.isInstance(current) ||
      name === "AI_TypeValidationError" ||
      name === "AI_JSONParseError"
    ) {
      return { errorClass: "model-output", retryable: true }
    }

    if (
      CONNECT_TIMEOUT_CODES.has(code) ||
      /connect(?:ion)?\s*timeout|connecttimeouterror|timed out while connecting/i.test(message)
    ) {
      return { errorClass: "connect-timeout", retryable: true }
    }

    if (
      name === "TimeoutError" ||
      REQUEST_TIMEOUT_CODES.has(code) ||
      /request\s*timeout|headers\s*timeout|body\s*timeout/i.test(message)
    ) {
      return { errorClass: "request-timeout", retryable: true }
    }

    if (
      CONNECTION_CLOSED_CODES.has(code) ||
      /other side closed|connection (?:was )?(?:closed|reset|terminated)|socket hang up|premature close|broken pipe|\bEPIPE\b|\bECONNRESET\b/i.test(
        message,
      )
    ) {
      return { errorClass: "connection-closed", retryable: true }
    }
  }

  for (const current of chain) {
    if (APICallError.isInstance(current) && current.isRetryable === false) {
      return { errorClass: "non-retryable", retryable: false }
    }
  }

  // Preserve the retry contract that existed before classification was added.
  // Unknown failures may be transient; only known-permanent cases fast-fail.
  return { errorClass: "unknown", retryable: true }
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current != null && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = isErrorLike(current) ? current.cause : undefined
  }

  return chain
}

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === "object" && value !== null
}

function statusCode(value: unknown): number | undefined {
  if (!isErrorLike(value)) return undefined
  if (typeof value.statusCode === "number") return value.statusCode
  if (typeof value.status === "number") return value.status
  if (isErrorLike(value.response) && typeof value.response.status === "number") {
    return value.response.status
  }
  return undefined
}

function errorCode(value: unknown): string {
  if (!isErrorLike(value)) return ""
  return typeof value.code === "string" ? value.code.toUpperCase() : ""
}

function errorName(value: unknown): string {
  if (!isErrorLike(value)) return ""
  return typeof value.name === "string" ? value.name : ""
}

function errorMessage(value: unknown): string {
  if (typeof value === "string") return value
  if (!isErrorLike(value)) return ""
  return typeof value.message === "string" ? value.message : ""
}

function isKnownPermanentError(value: unknown): boolean {
  return (
    providerErrorCodes(value).some((code) => PERMANENT_ERROR_CODES.has(code)) ||
    PERMANENT_ERROR_MESSAGE.test(errorMessage(value))
  )
}

function providerErrorCodes(value: unknown): string[] {
  if (!isErrorLike(value)) return []

  const codes = new Set<string>()
  addProviderErrorCodes(codes, value)
  addProviderErrorCodes(codes, parseProviderPayload(value.responseBody))
  addProviderErrorCodes(codes, value.data)
  if (isErrorLike(value.response)) {
    addProviderErrorCodes(codes, value.response)
    addProviderErrorCodes(codes, value.response.data)
  }
  return [...codes]
}

function parseProviderPayload(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function addProviderErrorCodes(codes: Set<string>, value: unknown): void {
  if (!isErrorLike(value)) return
  for (const candidate of [value.code, value.type]) {
    if (typeof candidate === "string") codes.add(candidate.toUpperCase())
  }
  if (isErrorLike(value.error)) {
    for (const candidate of [value.error.code, value.error.type]) {
      if (typeof candidate === "string") codes.add(candidate.toUpperCase())
    }
  }
}
