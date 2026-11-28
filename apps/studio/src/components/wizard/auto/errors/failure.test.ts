import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    return { id: strings.reduce((text, part, i) => text + part + (i < values.length ? String(values[i]) : ""), "") }
  },
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: unknown }) => children,
  Plural: () => null,
  useLingui: () => ({ t: (s: TemplateStringsArray) => s.join(""), i18n: { _: (v: { id?: string } | string) => (typeof v === "string" ? v : (v.id ?? "")) } }),
}))
import { classifySetupError, SetupFailure } from "./failure"

/** What the API client throws for an error answer (ApiError's shape). */
const apiError = (status: number, code: string | null, message: string) => Object.assign(new Error(message), { status, code })

describe("setup errors", () => {
  const kind = (e: unknown) => classifySetupError(e).kind
  afterEach(() => vi.unstubAllGlobals())

  it("sorts by the server's code", () => {
    expect(kind(apiError(400, "missing-credential", "OpenAI needs an API key."))).toBe("auth")
    expect(kind(apiError(400, "invalid-credential", "The key is malformed."))).toBe("auth")
    expect(kind(apiError(400, "invalid-model-id", "Unknown model"))).toBe("unknown")
    expect(kind(apiError(422, "pdf-no-pages", "The PDF has no pages"))).toBe("pdf")
    expect(kind(apiError(400, "pdf-unreadable", "Could not read the PDF: broken xref"))).toBe("pdf")
    expect(kind(apiError(422, "pdf-pages-unreadable", "Could not read the PDF's pages"))).toBe("pdf")
    expect(kind(apiError(413, null, "Request failed: 413"))).toBe("pdf")
  })

  it("reads the provider's own refusal from the status it forwarded", () => {
    expect(kind(apiError(502, "ai-provider-failed", "HTTP 401: Incorrect API key provided"))).toBe("auth")
    expect(kind(apiError(502, "ai-provider-failed", "HTTP 429: You exceeded your current quota"))).toBe("quota")
    expect(kind(apiError(502, "ai-provider-failed", "No object generated: response did not match schema"))).toBe("unknown")
    expect(kind(Object.assign(new Error("Incorrect API key provided"), { status: 401 }))).toBe("auth")
    expect(kind("boom")).toBe("unknown")
  })

  it("calls it offline only when the browser is offline", () => {
    expect(kind(new TypeError("Failed to fetch"))).toBe("unknown")
    expect(kind(new Error("getaddrinfo ENOTFOUND api.openai.com"))).toBe("unknown")
    vi.stubGlobal("navigator", { onLine: false })
    expect(kind(new TypeError("Failed to fetch"))).toBe("offline")
  })

  it("keeps an already sorted failure and its message", () => {
    const failure = new SetupFailure("quota", "429")
    expect(classifySetupError(failure)).toBe(failure)
    expect(classifySetupError(new Error("x")).detail).toBe("x")
  })
})
