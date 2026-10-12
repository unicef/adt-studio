// Opt-in real executable acceptance. All credentials and responses are synthetic.
// ADT_CLAUDE_BUDGET_EXECUTABLE=/absolute/path/to/claude
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
import { claudeAgentProvider } from "../providers/claude-agent/index.js"
import { createClaudeAgentStructuredTextBackend } from "../providers/claude-agent/structured-text.js"
import { runClaudeCli } from "../providers/claude-agent/cli.js"

const executable = process.env.ADT_CLAUDE_BUDGET_EXECUTABLE

describe.skipIf(!executable)("real Claude CLI automatic budget", () => {
  let dir: string
  let server: http.Server
  let origin: string
  let mode: number | "quota" | "gzip-quota" | "no-retry" | "valid" | "invalid" | "closed" | "hold" | "truncated"
  let calls: string[]
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "adt-claude-budget-"))
    calls = []
    server = http.createServer(async (req, res) => {
      calls.push(`${req.method} ${req.url}`)
      let body = ""
      for await (const chunk of req) body += chunk
      if (mode === "hold") return
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
            type: "error",
            error: {
              type:
                mode === "quota" ? "insufficient_quota" : mode === 403
                  ? "permission_error"
                  : mode === 429
                    ? "rate_limit_error"
                    : "overloaded_error",
              message: "Synthetic local failure",
            },
          }),
        )
        return
      }
      const request = JSON.parse(body)
      const tool = request.tools?.find(
        (entry: { name: string }) => entry.name === "StructuredOutput",
      )
      res.writeHead(200, { "content-type": "text/event-stream" })
      const send = (type: string, fields: object) =>
        res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`)
      send("message_start", {
        message: {
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      })
      if (mode === "closed") {
        res.end()
        return
      }
      const valid = mode === "valid" && tool
      send("content_block_start", {
        index: 0,
        content_block: valid
          ? { type: "tool_use", id: "tool_fixture", name: tool.name, input: {} }
          : { type: "text", text: "" },
      })
      send("content_block_delta", {
        index: 0,
        delta: valid
          ? { type: "input_json_delta", partial_json: '{"ok":true}' }
          : { type: "text_delta", text: "Invalid JSON" },
      })
      send("content_block_stop", { index: 0 })
      send("message_delta", {
        delta: {
          stop_reason: valid ? "tool_use" : mode === "truncated" ? "max_tokens" : "end_turn",
          stop_sequence: null,
        },
        usage: { output_tokens: 5 },
      })
      send("message_stop", {})
      res.end()
    })
    // All proxy egress is rejected. Only this server's synthetic API is allowed.
    server.on("connect", (_req, socket) => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fs.rm(dir, { recursive: true, force: true })
  })
  function model() {
    const registry = createProviderRegistry()
      .register({
        ...claudeAgentProvider,
        resolveServerCredentials: () => ({}),
        createStructuredTextBackend: (context) =>
          createClaudeAgentStructuredTextBackend(context, {
            resolveExecutable: () => executable,
            scratchDir: dir,
            runCli: (request) =>
              runClaudeCli({
                ...request,
                env: {
                  // Isolate config/login; retain the production adapter's retry settings.
                  PATH: process.env.PATH,
                  HOME: dir,
                  TMPDIR: dir,
                  CLAUDE_CONFIG_DIR: dir,
                  ANTHROPIC_API_KEY: request.env.ANTHROPIC_API_KEY,
                  ANTHROPIC_BASE_URL: origin,
                  CLAUDE_CODE_MAX_RETRIES: request.env.CLAUDE_CODE_MAX_RETRIES,
                  MAX_STRUCTURED_OUTPUT_RETRIES: request.env.MAX_STRUCTURED_OUTPUT_RETRIES,
                  MAX_THINKING_TOKENS: request.env.MAX_THINKING_TOKENS,
                  CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK:
                    request.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK,
                  HTTP_PROXY: origin,
                  HTTPS_PROXY: origin,
                  NO_PROXY: "127.0.0.1",
                  DISABLE_TELEMETRY: "1",
                  DISABLE_ERROR_REPORTING: "1",
                  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
                },
              }),
          }),
      })
      .freeze()
    return createLLMModel({
      modelId: "claude-agent:claude-sonnet-4-5",
      registry,
      providerCredentials: { "claude-agent": { apiKey: "synthetic-fixture-key" } },
      logLevel: "silent",
    })
  }
  const request = {
    schema: z.object({ ok: z.boolean() }),
    messages: [{ role: "user" as const, content: "Return structured output" }],
    maxRetries: 2,
  }
  it.each(["quota", "gzip-quota", "no-retry", 503, 429, 403, "invalid", "closed", "truncated"] as const)(
    "counts actual requests for %s",
    async (failure) => {
      mode = failure
      const error = await model()
        .generateObject(request)
        .catch((error: unknown) => error)
      const expected = failure === "quota" || failure === "gzip-quota" || failure === "no-retry" || failure === 403 ? 1 : 3
      expect(error).toMatchObject({ providerCalls: expected })
      expect(calls).toHaveLength(expected)
      expect(calls.every((call) => call === "POST /v1/messages?beta=true")).toBe(true)
    },
    20000,
  )
  it("accepts valid structured output with one request", async () => {
    mode = "valid"
    await expect(model().generateObject(request)).resolves.toMatchObject({
      object: { ok: true },
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    expect(calls).toHaveLength(1)
  }, 20000)
  it("cancels the real child without another request", async () => {
    mode = "hold"
    const controller = new AbortController()
    const pending = model()
      .generateObject({ ...request, signal: controller.signal })
      .catch((error: unknown) => error)
    try {
      await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1)
      controller.abort()
      expect(await pending).toMatchObject({ classification: { errorClass: "cancelled" } })
      expect(calls).toHaveLength(1)
    } finally {
      controller.abort()
      await pending
    }
  }, 20000)
})
