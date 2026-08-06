import { describe, expect, it } from "vitest"
import { APICallError, NoObjectGeneratedError } from "ai"
import { classifyLLMError, LLMValidationError } from "../errors.js"

function apiError(
  statusCode: number | undefined,
  options: {
    cause?: unknown
    isRetryable?: boolean
    responseBody?: string
  } = {},
): APICallError {
  return new APICallError({
    message: statusCode ? `Request failed (${statusCode})` : "Request failed",
    url: "https://example.test/v1/responses",
    requestBodyValues: {},
    statusCode,
    cause: options.cause,
    isRetryable: options.isRetryable,
    responseBody: options.responseBody,
  })
}

describe("classifyLLMError", () => {
  it("classifies a wrapped Undici connect timeout as transient", () => {
    const cause = Object.assign(new Error("Connect Timeout Error"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    })

    expect(classifyLLMError(apiError(undefined, { cause }))).toEqual({
      errorClass: "connect-timeout",
      retryable: true,
    })
  })

  it("classifies a closed connection as transient", () => {
    expect(
      classifyLLMError(new Error("Cannot connect to API: other side closed")),
    ).toEqual({
      errorClass: "connection-closed",
      retryable: true,
    })
  })

  it("classifies malformed structured model output as retryable", () => {
    const error = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      cause: Object.assign(new Error("Type validation failed"), {
        name: "AI_TypeValidationError",
      }),
      text: "{ definitely not valid json",
      response: {
        id: "response-1",
        timestamp: new Date("2026-08-05T00:00:00.000Z"),
        modelId: "test-model",
      },
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    })

    expect(classifyLLMError(error)).toEqual({
      errorClass: "model-output",
      retryable: true,
    })
  })

  it.each(["AI_TypeValidationError", "AI_JSONParseError"])(
    "classifies a raw %s as retryable model output",
    (name) => {
      expect(classifyLLMError(Object.assign(new Error("Invalid output"), { name }))).toEqual({
        errorClass: "model-output",
        retryable: true,
      })
    },
  )

  it("classifies exhausted custom validation as retryable model output", () => {
    expect(
      classifyLLMError(new LLMValidationError(2, ["Missing result for image ID im001"])),
    ).toEqual({
      errorClass: "model-output",
      retryable: true,
    })
  })

  it("classifies EAI_AGAIN as a transient connection failure", () => {
    const error = Object.assign(new Error("getaddrinfo EAI_AGAIN api.openai.com"), {
      code: "EAI_AGAIN",
    })

    expect(classifyLLMError(error)).toEqual({
      errorClass: "connect-timeout",
      retryable: true,
    })
  })

  it("classifies AbortSignal.timeout as a transient request timeout", async () => {
    const signal = AbortSignal.timeout(1)
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true })
    })

    expect(classifyLLMError(signal.reason)).toEqual({
      errorClass: "request-timeout",
      retryable: true,
    })
  })

  it.each(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])(
    "classifies Undici %s as a transient request timeout",
    (code) => {
      expect(classifyLLMError(Object.assign(new Error("fetch failed"), { code }))).toEqual({
        errorClass: "request-timeout",
        retryable: true,
      })
    },
  )

  it.each([
    [408, "request-timeout"],
    [429, "rate-limit"],
    [503, "server-error"],
  ] as const)("classifies HTTP %i as transient %s", (statusCode, errorClass) => {
    expect(classifyLLMError(apiError(statusCode))).toEqual({
      errorClass,
      retryable: true,
      statusCode,
    })
  })

  it("honors an explicitly non-retryable 5xx response", () => {
    expect(classifyLLMError(apiError(501, { isRetryable: false }))).toEqual({
      errorClass: "non-retryable",
      retryable: false,
      statusCode: 501,
    })
  })

  it("classifies a provider authentication failure as non-retryable", () => {
    expect(classifyLLMError(apiError(401))).toEqual({
      errorClass: "non-retryable",
      retryable: false,
      statusCode: 401,
    })
  })

  it("classifies an insufficient-quota 429 payload as non-retryable", () => {
    const responseBody = JSON.stringify({
      error: {
        message: "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    })

    expect(classifyLLMError(apiError(429, { responseBody }))).toEqual({
      errorClass: "non-retryable",
      retryable: false,
      statusCode: 429,
    })
  })

  it.each([
    new Error("Invalid API key"),
    Object.assign(new Error("Quota exhausted"), { code: "insufficient_quota" }),
    apiError(undefined, { isRetryable: false }),
  ])("classifies a known permanent failure as non-retryable", (error) => {
    expect(classifyLLMError(error)).toEqual({
      errorClass: "non-retryable",
      retryable: false,
    })
  })

  it("keeps an unclassified failure retryable", () => {
    expect(classifyLLMError(new Error("Unexpected provider failure"))).toEqual({
      errorClass: "unknown",
      retryable: true,
    })
  })

  it.each([
    [{ status: 429 }, "rate-limit", 429],
    [{ response: { status: 503 } }, "server-error", 503],
    [{ cause: { response: { status: 408 } } }, "request-timeout", 408],
  ] as const)(
    "classifies provider-shaped HTTP metadata %# as transient",
    (error, errorClass, statusCode) => {
      expect(classifyLLMError(error)).toEqual({
        errorClass,
        retryable: true,
        statusCode,
      })
    },
  )

  it("stops walking a cyclic cause chain", () => {
    const error = new Error("Invalid request") as Error & { cause?: unknown }
    error.cause = error

    expect(classifyLLMError(error)).toEqual({
      errorClass: "unknown",
      retryable: true,
    })
  })
})
