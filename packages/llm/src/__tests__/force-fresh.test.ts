import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { createLLMModel } from "../client.js"
import { computeHash, writeCache } from "../cache.js"

const fetchMock = vi.fn()
const schema = z.object({ value: z.string() })
const messages = [{ role: "user" as const, content: "Generate" }]
let cacheDir: string
function reply(value: string) {
  return new Response(JSON.stringify({
    id: "chatcmpl-test", object: "chat.completion", created: 0, model: "gpt-4o-mini",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ value }) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }), { headers: { "Content-Type": "application/json" } })
}
function model(forceFresh = false) {
  return createLLMModel({ modelId: "openai:gpt-4o-mini", cacheDir, forceFresh,
    credentials: { openaiApiKey: "test" }, logLevel: "silent" })
}
async function seed() {
  fetchMock.mockResolvedValueOnce(reply("previous"))
  await model().generateObject({ schema, messages })
  fetchMock.mockClear()
}
beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "force-fresh-"))
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(cacheDir, { recursive: true, force: true })
})

describe("force-fresh transport and filesystem cache contract (#731)", () => {
  it("makes a new transport call for each explicit request and writes through for ordinary reuse", async () => {
    await seed()
    expect((await model().generateObject({ schema, messages })).cached).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    for (const value of ["fresh-1", "fresh-2"]) {
      fetchMock.mockResolvedValueOnce(reply(value))
      const result = await model().generateObject({ schema, messages, forceFresh: true })
      expect(result).toMatchObject({ object: { value }, cached: false })
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await model().generateObject({ schema, messages })).object).toEqual({ value: "fresh-2" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("applies model-level freshness across calls without changing unrelated keys", async () => {
    await seed()
    const other = [{ role: "user" as const, content: "Other section" }]
    fetchMock.mockResolvedValueOnce(reply("neighbor"))
    await model().generateObject({ schema, messages: other })
    fetchMock.mockClear()
    const fresh = model(true)
    for (const value of ["render", "answer", "review"]) {
      fetchMock.mockResolvedValueOnce(reply(value))
      expect((await fresh.generateObject({ schema, messages })).cached).toBe(false)
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((await model().generateObject({ schema, messages: other })).object).toEqual({ value: "neighbor" })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("bypasses legacy entries and publishes the fresh result under the ordinary v2 key", async () => {
    writeCache(cacheDir, computeHash({ modelId: "openai:gpt-4o-mini", messages, schema }), { value: "legacy" })
    fetchMock.mockResolvedValueOnce(reply("fresh"))
    expect((await model(true).generateObject({ schema, messages })).object).toEqual({ value: "fresh" })
    expect((await model().generateObject({ schema, messages })).object).toEqual({ value: "fresh" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("bypasses cached validation retries and publishes only accepted fresh output for later reuse", async () => {
    const validate = (value: unknown) => ({ valid: (value as { value: string }).value !== "invalid", errors: ["Invalid value"] })
    for (const value of ["accepted-1", "accepted-2"]) {
      fetchMock.mockResolvedValueOnce(reply("invalid")).mockResolvedValueOnce(reply(value))
      const result = await model(true).generateObject({ schema, messages, validate, maxRetries: 1 })
      expect(result.object).toEqual({ value })
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect((await model().generateObject({ schema, messages, validate })).object).toEqual({ value: "accepted-2" })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each(["provider", "validation", "cancel"])("retains the previous cache when a fresh attempt fails: %s", async (failure) => {
    await seed()
    const before = fs.readdirSync(cacheDir).map((file) => [file, fs.readFileSync(path.join(cacheDir, file), "utf8")])
    const controller = new AbortController()
    if (failure === "provider") fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"denied"}}', { status: 401 }))
    else if (failure === "cancel") fetchMock.mockImplementationOnce(() => {
      controller.abort()
      throw controller.signal.reason
    })
    else fetchMock.mockResolvedValueOnce(reply("invalid"))
    await expect(model(true).generateObject({ schema, messages, signal: controller.signal,
      ...(failure === "validation" ? { validate: () => ({ valid: false, errors: ["Rejected"] }) } : {}),
    })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(cacheDir).map((file) => [file, fs.readFileSync(path.join(cacheDir, file), "utf8")])).toEqual(before)
    expect((await model().generateObject({ schema, messages })).object).toEqual({ value: "previous" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not start a fresh transport request after cancellation", async () => {
    await seed()
    const signal = AbortSignal.abort()
    await expect(model(true).generateObject({ schema, messages, signal })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await model().generateObject({ schema, messages })).object).toEqual({ value: "previous" })
  })

  it("writes the validator's accepted projection and supports an explicit per-call cache override", async () => {
    fetchMock.mockResolvedValueOnce(reply("raw"))
    await model(true).generateObject({ schema, messages,
      validate: () => ({ valid: true, errors: [], cleaned: { value: "accepted" } }),
    })
    const result = await model(true).generateObject({ schema, messages, forceFresh: false })
    expect(result).toMatchObject({ cached: true, object: { value: "accepted" } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
