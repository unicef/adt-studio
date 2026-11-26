import { describe, expect, it, vi } from "vitest"

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

describe("setup errors", () => {
  const kind = (e: unknown) => classifySetupError(e).kind
  it("sorts provider and network errors", () => {
    expect(kind(Object.assign(new Error("Incorrect API key provided"), { status: 401 }))).toBe("auth")
    expect(kind(new Error("OPENAI_API_KEY is required in the environment or .env file"))).toBe("auth")
    expect(kind(Object.assign(new Error("You exceeded your current quota"), { status: 429 }))).toBe("quota")
    expect(kind(new TypeError("fetch failed"))).toBe("offline")
    expect(kind(new Error("getaddrinfo ENOTFOUND api.openai.com"))).toBe("offline")
    expect(kind(new Error("OpenAI response for renderStrategy cites unsampled page 14"))).toBe("unknown")
    expect(kind("boom")).toBe("unknown")
  })
  it("keeps an already sorted failure and its message", () => {
    const failure = new SetupFailure("quota", "429")
    expect(classifySetupError(failure)).toBe(failure)
    expect(classifySetupError(new Error("x")).detail).toBe("x")
  })
})
