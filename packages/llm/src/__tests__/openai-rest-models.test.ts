import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listOpenAiCompatibleModels } from "../providers/shared/openai-rest/models.js"
import { ModelDiscoveryError } from "../model-discovery.js"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("listOpenAiCompatibleModels", () => {
  it("requests /models on the base URL and maps ids", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "gpt-x" }, { id: "gpt-y" }] }),
    )

    const models = await listOpenAiCompatibleModels({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
    })

    expect(models).toEqual([{ id: "gpt-x" }, { id: "gpt-y" }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models")
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test")
  })

  it("trims a trailing slash from the base URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    await listOpenAiCompatibleModels({ baseUrl: "http://localhost:1234/v1/" })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:1234/v1/models")
  })

  it("omits the Authorization header when no api key is given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    await listOpenAiCompatibleModels({ baseUrl: "http://localhost:1234/v1" })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it("dedupes repeated ids", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "dup" }, { id: "dup" }, { id: "solo" }] }),
    )
    const models = await listOpenAiCompatibleModels({ baseUrl: "https://api.openai.com/v1" })
    expect(models.map((m) => m.id)).toEqual(["dup", "solo"])
  })

  it("throws missing-credential on 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 401))
    await expect(
      listOpenAiCompatibleModels({ baseUrl: "https://api.openai.com/v1" }),
    ).rejects.toMatchObject({ code: "missing-credential" })
  })

  it("throws unreachable on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(
      listOpenAiCompatibleModels({ baseUrl: "https://api.openai.com/v1" }),
    ).rejects.toBeInstanceOf(ModelDiscoveryError)
  })

  it("throws invalid-response on an unexpected shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: 123 }))
    await expect(
      listOpenAiCompatibleModels({ baseUrl: "https://api.openai.com/v1" }),
    ).rejects.toMatchObject({ code: "invalid-response" })
  })
})
