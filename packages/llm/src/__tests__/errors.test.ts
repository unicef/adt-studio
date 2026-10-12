// Classification cases adapted from PR #712, extended for current provider ports.
import { describe, expect, it } from "vitest"
import { APICallError } from "ai"
import { boundedRetryDelay, classifyLLMError, LLMValidationError } from "../errors.js"
import { AiProviderError } from "../ports/errors.js"

describe("bounded error classification", () => {
  it.each([
    ["EAI_AGAIN", "connect-timeout"],
    ["UND_ERR_CONNECT_TIMEOUT", "connect-timeout"],
    ["ETIMEDOUT", "connect-timeout"],
    ["UND_ERR_BODY_TIMEOUT", "request-timeout"],
    ["ECONNRESET", "connection-closed"],
    ["UND_ERR_SOCKET", "connection-closed"],
    ["EPIPE", "connection-closed"],
  ])("classifies nested %s", (code, errorClass) => {
    expect(classifyLLMError(new Error("fetch failed", { cause: { code } }))).toEqual({
      errorClass,
      retryable: true,
    })
  })
  it.each([408, 429, 500, 502, 503, 504])("retries HTTP %s", (statusCode) => {
    expect(classifyLLMError({ statusCode }).retryable).toBe(true)
  })
  it.each([400, 401, 403, 404, 422])("fast-fails HTTP %s", (statusCode) => {
    expect(classifyLLMError({ statusCode }).retryable).toBe(false)
  })
  it("lets structured nested quota override a transient wrapper", () => {
    expect(
      classifyLLMError({
        statusCode: 429,
        cause: { responseBody: JSON.stringify({ error: { type: "insufficient_quota" } }) },
      }),
    ).toMatchObject({ errorClass: "non-retryable", retryable: false, statusCode: 429 })
  })
  it("respects an explicit typed non-retryable response", () => {
    expect(
      classifyLLMError(
        new APICallError({
          message: "try later",
          url: "https://invalid.test",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: false,
        }),
      ).retryable,
    ).toBe(false)
  })
  it("keeps unknown and malformed output retryable but not configuration errors", () => {
    expect(classifyLLMError(new Error("unexpected"))).toEqual({
      errorClass: "unknown",
      retryable: true,
    })
    expect(classifyLLMError(new LLMValidationError(["invalid"]))).toEqual({
      errorClass: "model-output",
      retryable: true,
    })
    expect(classifyLLMError({ name: "AI_JSONParseError" }).retryable).toBe(true)
    expect(
      classifyLLMError(AiProviderError.missingCredential("openai", "apiKey", "API key")).retryable,
    ).toBe(false)
  })
  it("distinguishes an internal timeout from an abort", () => {
    expect(classifyLLMError(new DOMException("timeout", "TimeoutError")).errorClass).toBe(
      "request-timeout",
    )
    expect(classifyLLMError(new DOMException("cancel", "AbortError")).retryable).toBe(false)
  })
  it("terminates on cycles, deep graphs, oversized bodies and throwing getters", () => {
    const cyclic: Record<string, unknown> = { statusCode: 429 }
    cyclic.cause = cyclic
    cyclic.data = cyclic
    expect(classifyLLMError(cyclic).errorClass).toBe("rate-limit")
    let deep: unknown = { code: "INSUFFICIENT_QUOTA" }
    for (let n = 0; n < 10000; n++) deep = { cause: deep }
    expect(classifyLLMError(deep).errorClass).toBe("unknown")
    expect(classifyLLMError({ responseBody: "x".repeat(1_000_000) }).errorClass).toBe("unknown")
    expect(
      classifyLLMError({
        get cause() {
          throw new Error("secret")
        },
      }).errorClass,
    ).toBe("unknown")
  })
  it("does not let message heuristics override trusted transient status", () => {
    expect(classifyLLMError({ statusCode: 503, message: "invalid api key" }).errorClass).toBe(
      "server-error",
    )
  })
})

it("bounds provider retry-after without shortening exponential backoff", () => {
  const error = (delay: string) =>
    new APICallError({
      message: "busy",
      url: "http://test",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { "retry-after": delay },
    })
  expect(boundedRetryDelay(error("9999999"), 1000)).toBe(66000)
  expect(boundedRetryDelay(error("2"), 1000)).toBe(2000)
  expect(boundedRetryDelay(error("0.1"), 2000)).toBe(2000)
  expect(boundedRetryDelay(error("invalid"), 1000)).toBe(1000)
})

it("classifies native timeout and abort causes behind SDK or CLI wrappers", () => {
  expect(
    classifyLLMError(new Error("wrapped", { cause: new DOMException("timeout", "TimeoutError") })),
  ).toMatchObject({ errorClass: "request-timeout", retryable: true })
  expect(
    classifyLLMError(new Error("wrapped", { cause: new DOMException("stop", "AbortError") })),
  ).toMatchObject({ errorClass: "cancelled", retryable: false })
  expect(
    classifyLLMError(new Error("Codex returned no structured output: usage limit reached")),
  ).toMatchObject({ retryable: false })
})
