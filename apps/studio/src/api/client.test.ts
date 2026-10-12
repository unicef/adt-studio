// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/utils", () => ({
  isElectron: vi.fn(() => false),
}))

import { isElectron } from "@/lib/utils"
import {
  cancelProviderCliLogin,
  logoutProviderCli,
  resolveBaseUrl,
  startProviderCliLogin,
} from "./client.js"

const mockedIsElectron = vi.mocked(isElectron)

describe("resolveBaseUrl", () => {
  beforeEach(() => {
    mockedIsElectron.mockReturnValue(false)
  })

  it("returns relative /api in browser dev mode", () => {
    expect(resolveBaseUrl({ protocol: "http:", hostname: "localhost" })).toBe("/api")
  })

  it("returns relative /api for standard browser origins", () => {
    expect(resolveBaseUrl({ protocol: "https:", hostname: "example.com" })).toBe("/api")
  })

  describe("when running in Electron", () => {
    beforeEach(() => {
      mockedIsElectron.mockReturnValue(true)
    })

    afterEach(() => {
      delete (window as { api?: unknown }).api
    })

    it("targets the loopback address the API binds to, using window.api.apiPort", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 5421 }
      expect(resolveBaseUrl()).toBe("http://127.0.0.1:5421/api")
    })

    it("ignores location and uses the Electron port", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 5421 }
      expect(resolveBaseUrl({ protocol: "https:", hostname: "example.com" })).toBe(
        "http://127.0.0.1:5421/api",
      )
    })

    it("reflects the current apiPort on each call", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 9000 }
      expect(resolveBaseUrl()).toBe("http://127.0.0.1:9000/api")
      ;(window as { api: { apiPort: number } }).api = { apiPort: 9001 }
      expect(resolveBaseUrl()).toBe("http://127.0.0.1:9001/api")
    })

    it("falls back to /api when the Electron bridge is not available", () => {
      delete (window as { api?: unknown }).api
      expect(resolveBaseUrl({ protocol: "http:", hostname: "localhost" })).toBe("/api")
    })
  })
})

describe("CLI sign-in requests", () => {
  it("adds the required action header to every state-changing request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ providerId: "codex", state: "idle" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await startProviderCliLogin("codex")
    await cancelProviderCliLogin("codex")
    await logoutProviderCli("codex")

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    for (const [, init] of fetchSpy.mock.calls) {
      expect(new Headers(init?.headers).get("X-ADT-CLI-Action")).toBe("1")
    }
  })
})

it("Validation rerender sends stored provider credentials as headers and keeps them out of the request body", async () => {
  const { api } = await import("./client.js")
  mockedIsElectron.mockReturnValue(false)
  localStorage.setItem("validation-test-provider-key", "test-secret")
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const data = String(url).endsWith("/providers") ? { providers: [{ manifest: {
      id: "openai", credentialFields: [{ key: "apiKey", header: "X-OpenAI-Key", storageKey: "validation-test-provider-key", legacyStorageKeys: [] }],
    } }] } : { taskId: "accepted" }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  })
  try {
    await api.submitValidationRepair("book", "page", { requestId: crypto.randomUUID(), sectionId: "stable", baseVersion: 1, renderingVersion: 2,
      finding: { kind: "violation", assessmentVersion: 3, ruleId: "heading-order" } })
    const [url, init] = spy.mock.calls.find(([url]) => String(url).endsWith("/render-tasks"))!
    expect(new Headers(init?.headers).get("X-OpenAI-Key")).toBe("test-secret")
    expect(String(url)).not.toContain("test-secret"); expect(init?.body).not.toContain("test-secret")
  } finally { spy.mockRestore(); localStorage.removeItem("validation-test-provider-key") }
})
