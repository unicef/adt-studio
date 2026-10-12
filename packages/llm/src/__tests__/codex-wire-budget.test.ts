// Opt-in real executable acceptance. All credentials and responses are synthetic.
// ADT_CODEX_BUDGET_EXECUTABLE=/absolute/path/to/codex
// These original assertions exposed internal continuations; the forwarding gate
// must satisfy them without hiding or relabeling any upstream request.
import http from "node:http"
import { gzipSync } from "node:zlib"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createLLMModel } from "../client.js"
import { createProviderRegistry } from "../registry.js"
import { codexProvider } from "../providers/codex/index.js"
import { createCodexStructuredTextBackend } from "../providers/codex/structured-text.js"
import { runCodexCli } from "../providers/codex/cli.js"

const executable = process.env.ADT_CODEX_BUDGET_EXECUTABLE
const apiKey = "synthetic-configured-key"
const accountId = "synthetic-account"

describe.skipIf(!executable)("real Codex CLI automatic budget", () => {
  let dir: string
  let server: http.Server
  let origin: string
  let mode: number | "quota" | "gzip-quota" | "no-retry" | "valid" | "invalid" | "closed" | "reset" | "truncated" | "hold" | "tool"
  let calls: Array<{
    authorization?: string
    account?: string
    url?: string
    organization?: string
    project?: string
  }>
  let loginToken: string
  let cleanup: AbortController
  let children: Promise<unknown>[]

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "adt-codex-budget-"))
    calls = []
    cleanup = new AbortController()
    children = []
    loginToken =
      "eyJhbGciOiJub25lIn0." +
      Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 86400,
          "https://api.openai.com/auth": {
            chatgpt_account_id: accountId,
            chatgpt_plan_type: "plus",
          },
        }),
      ).toString("base64url") +
      ".fixture"
    // Never read the user's login. This synthetic file exercises CLI selection only.
    await fs.writeFile(
      path.join(dir, "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        OPENAI_API_KEY: null,
        tokens: {
          id_token: loginToken,
          access_token: loginToken,
          refresh_token: "fake-refresh",
          account_id: accountId,
        },
        last_refresh: new Date().toISOString(),
      }),
    )
    server = http.createServer(async (req, res) => {
      let body = ""
      for await (const chunk of req) body += chunk
      if (req.method !== "POST") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ models: [], data: [] }))
        return
      }
      calls.push({
        authorization: req.headers.authorization,
        account: req.headers["chatgpt-account-id"] as string | undefined,
        url: req.url,
        organization: req.headers["openai-organization"] as string | undefined,
        project: req.headers["openai-project"] as string | undefined,
      })
      if (mode === "hold") return
      if (mode === "reset") {
        req.socket.destroy()
        return
      }
      if (mode === "no-retry") {
        res.writeHead(503, { "content-type": "application/json", "x-should-retry": "false" })
        res.end(JSON.stringify({ error: { type: "overloaded_error", message: "Synthetic local failure" } }))
        return
      }
      if (mode === "gzip-quota") {
        res.writeHead(429, { "content-type": "application/json", "content-encoding": "gzip" })
        res.end(gzipSync(JSON.stringify({ error: { type: "insufficient_quota", message: "Synthetic local failure" } })))
        return
      }
      if (typeof mode === "number" || mode === "quota") {
        res.writeHead(mode === "quota" ? 429 : mode, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            error: {
              type: mode === "quota" ? "insufficient_quota" : mode === 429 ? "rate_limit_error" : "server_error",
              message: "Synthetic local failure",
            },
          }),
        )
        return
      }
      res.writeHead(200, { "content-type": "text/event-stream" })
      const send = (type: string, fields: object) =>
        res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`)
      send("response.created", {
        response: { id: "resp_fixture", status: "in_progress", output: [] },
      })
      if (mode === "closed") {
        res.end()
        return
      }
      if (mode === "tool" && calls.length === 1) {
        // An unexpected tool call is invalid structured output, not permission
        // for an extra model round inside a single facade attempt.
        const item = {
          id: "tool_fixture",
          type: "function_call",
          call_id: "call_fixture",
          name: "unavailable_fixture_tool",
          arguments: "{}",
        }
        send("response.output_item.done", { output_index: 0, item })
        send("response.completed", {
          response: {
            id: "resp_fixture",
            status: "completed",
            output: [item],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        })
        res.end()
        return
      }
      const text = mode === "valid" || mode === "tool" ? '{"ok":true}' : "Invalid JSON"
      const item = {
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      }
      send("response.output_item.added", {
        output_index: 0,
        item: { ...item, status: "in_progress", content: [] },
      })
      send("response.output_text.delta", {
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: text,
      })
      send("response.output_item.done", { output_index: 0, item })
      send(mode === "truncated" ? "response.incomplete" : "response.completed", {
        response: {
          id: "resp_fixture",
          status: mode === "truncated" ? "incomplete" : "completed",
          output: [item],
          ...(mode === "truncated"
            ? { incomplete_details: { reason: "max_output_tokens" } }
            : {}),
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      })
      res.end()
    })
    // Reject all outside proxy connections; no real credentials or paid traffic.
    server.on("connect", (_req, socket) => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterEach(async () => {
    cleanup.abort()
    await Promise.allSettled(children)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fs.rm(dir, { recursive: true, force: true })
  })

  function model(login = false) {
    const registry = createProviderRegistry()
      .register({
        ...codexProvider,
        resolveServerCredentials: () => ({}),
        createStructuredTextBackend: (context) =>
          createCodexStructuredTextBackend(context, {
            executable,
            scratchDir: dir,
            runTurn: (request) => {
              const child = runCodexCli({
                ...request,
                apiBaseUrl: origin + "/v1",
                signal: AbortSignal.any([request.signal, cleanup.signal]),
                env: {
                  PATH: process.env.PATH!,
                  HOME: dir,
                  CODEX_HOME: dir,
                  TMPDIR: dir,
                  ...(request.env.CODEX_API_KEY
                    ? { CODEX_API_KEY: request.env.CODEX_API_KEY }
                    : {}),
                  OPENAI_BASE_URL: "http://unrelated-provider.invalid/v1",
                  HTTP_PROXY: origin,
                  HTTPS_PROXY: origin,
                  NO_PROXY: "127.0.0.1",
                  OPENAI_ORGANIZATION: "synthetic-org",
                  OPENAI_PROJECT: "synthetic-project",
                },
              })
              children.push(child)
              return child
            },
          }),
      })
      .freeze()
    return createLLMModel({
      modelId: "codex:gpt-4.1",
      registry,
      providerCredentials: { codex: login ? {} : { apiKey } },
      logLevel: "silent",
    })
  }
  const request = {
    schema: z.object({ ok: z.boolean() }),
    messages: [{ role: "user" as const, content: "Return structured output" }],
    maxRetries: 2,
    timeoutMs: 15000,
  }

  it.each(["quota", "gzip-quota", "no-retry", 503, 429, 403, "invalid", "closed", "reset", "truncated"] as const)(
    "counts actual requests for %s",
    async (failure) => {
      mode = failure
      const error = await model()
        .generateObject(request)
        .catch((error: unknown) => error)
      const expected = failure === "quota" || failure === "gzip-quota" || failure === "no-retry" || failure === 403 ? 1 : 3
      expect(calls).toHaveLength(expected)
      expect(error).toMatchObject({ providerCalls: expected })
      expect(calls.every((call) => call.authorization === `Bearer ${apiKey}`)).toBe(true)
      expect(calls.every((call) => call.url === "/v1/responses")).toBe(true)
    },
    60000,
  )
  it.each([false, true])(
    "preserves valid output and credential selection (login=%s)",
    async (login) => {
      mode = "valid"
      await expect(model(login).generateObject(request)).resolves.toMatchObject({
        object: { ok: true },
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      expect(calls).toHaveLength(1)
      expect(calls[0].authorization).toBe(`Bearer ${login ? loginToken : apiKey}`)
      if (login) expect(calls[0].account).toBe(accountId)
      expect(calls[0].organization).toBe("synthetic-org")
      expect(calls[0].project).toBe("synthetic-project")
    },
    60000,
  )
  it("does not hide an agent tool continuation inside one facade attempt", async () => {
    mode = "tool"
    // Either reject within the facade budget or succeed without another request.
    await model()
      .generateObject({ ...request, maxRetries: 0 })
      .catch(() => {})
    expect(calls).toHaveLength(1)
  }, 20000)
  it("cancels the real child without another provider request", async () => {
    mode = "hold"
    const controller = new AbortController()
    const pending = model()
      .generateObject({ ...request, signal: controller.signal })
      .catch((error: unknown) => error)
    try {
      await expect.poll(() => calls.length, { timeout: 10000 }).toBe(1)
      controller.abort()
      expect(await pending).toMatchObject({ classification: { errorClass: "cancelled" } })
      expect(calls).toHaveLength(1)
    } finally {
      controller.abort()
      await pending
    }
  }, 20000)
})
