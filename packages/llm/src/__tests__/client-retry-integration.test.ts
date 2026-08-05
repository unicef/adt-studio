import http from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createLLMModel } from "../client.js"

type FailureMode = "malformed-output" | "unauthorized"

const servers = new Set<http.Server>()

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
  servers.clear()
})

async function createFaultServer(mode: FailureMode): Promise<{
  baseUrl: string
  requestCount: () => number
}> {
  let requests = 0
  const server = http.createServer((_request, response) => {
    requests += 1

    if (mode === "unauthorized") {
      response.writeHead(401, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          error: {
            message: "Invalid API key",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
      )
      return
    }

    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        id: `chatcmpl-${requests}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4.1",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "{ this is definitely not json",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
  })
  servers.add(server)

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Fault server did not expose a TCP port")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requestCount: () => requests,
  }
}

function createTestModel(baseUrl: string) {
  return createLLMModel({
    modelId: "custom:gpt-4.1",
    credentials: { customBaseUrl: baseUrl, customApiKey: "test" },
    logLevel: "silent",
  })
}

const request = {
  mode: "json" as const,
  schema: z.object({ ok: z.boolean() }),
  messages: [{ role: "user" as const, content: "Return JSON" }],
  maxRetries: 2,
}

describe("createLLMModel retry integration", () => {
  it(
    "retries malformed structured output through the real SDK",
    async () => {
      const fault = await createFaultServer("malformed-output")

      await expect(createTestModel(fault.baseUrl).generateObject(request)).rejects.toMatchObject({
        name: "AI_NoObjectGeneratedError",
      })
      expect(fault.requestCount()).toBe(3)
    },
    10_000,
  )

  it("fast-fails a permanent HTTP 401 through the real SDK", async () => {
    const fault = await createFaultServer("unauthorized")

    await expect(createTestModel(fault.baseUrl).generateObject(request)).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(fault.requestCount()).toBe(1)
  })
})
