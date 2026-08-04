import { describe, expect, it } from "vitest"
import { APICallError } from "ai"
import { classifyLLMError } from "../errors.js"

function apiError(
  statusCode: number | undefined,
  options: { cause?: unknown; isRetryable?: boolean } = {},
): APICallError {
  return new APICallError({
    message: statusCode ? `Request failed (${statusCode})` : "Request failed",
    url: "https://example.test/v1/responses",
    requestBodyValues: {},
    statusCode,
    cause: options.cause,
    isRetryable: options.isRetryable,
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
})
