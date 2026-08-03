import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  LOCAL_GEMMA_MODELS,
  findLocalLlmModel,
  localLlmDownloadBytes,
  recommendLocalGemma,
} from "../services/local-llm-catalog.js"
import {
  installLocalLlmModel,
  isLocalLlmModelInstalled,
  removeLocalLlmModel,
} from "../services/local-llm-model-store.js"
import {
  createLocalLlmRuntime,
  type LocalLlmRuntime,
} from "../services/local-llm-runtime.js"

const ModelRequest = z.object({ modelId: z.string().startsWith("local:") })
const installing = new Set<string>()

export { LOCAL_GEMMA_MODELS, recommendLocalGemma }

export function createLocalAIRoutes(options: {
  modelsDir?: string
  runtimeDir?: string
  runtime?: LocalLlmRuntime
  fetchImpl?: typeof fetch
  totalMemoryBytes?: number
} = {}) {
  const app = new Hono()
  const fetchImpl = options.fetchImpl ?? fetch
  const projectRoot = process.env.PROJECT_ROOT ?? process.cwd()
  const modelsDir = path.resolve(options.modelsDir ?? process.env.LOCAL_LLM_MODELS_DIR ?? path.join(projectRoot, ".local-models", "llm"))
  const runtimeDir = path.resolve(options.runtimeDir ?? process.env.LOCAL_LLM_RUNTIME_DIR ?? path.join(projectRoot, "apps", "desktop", ".runtime", "llama"))
  const runtime = options.runtime ?? createLocalLlmRuntime({ runtimeDir, modelsDir, fetchImpl })

  app.get("/local-ai/status", async (c) => {
    const totalMemoryBytes = options.totalMemoryBytes ?? os.totalmem()
    const recommended = recommendLocalGemma(totalMemoryBytes)
    return c.json({
      ...runtime.status(),
      system: {
        platform: os.platform(),
        architecture: os.arch(),
        totalMemoryBytes,
      },
      recommendedModelId: recommended.id,
      models: LOCAL_GEMMA_MODELS.map((model) => ({
        id: model.id,
        label: model.label,
        repository: model.repository,
        revision: model.revision,
        license: model.license,
        downloadBytes: localLlmDownloadBytes(model),
        minimumMemoryBytes: model.minimumMemoryBytes,
        installed: isLocalLlmModelInstalled(modelsDir, model),
        recommended: model.id === recommended.id,
        downloading: installing.has(model.id),
      })),
    })
  })

  app.post("/local-ai/pull", async (c) => {
    const parsed = ModelRequest.safeParse(await c.req.json().catch(() => null))
    const model = parsed.success ? findLocalLlmModel(parsed.data.modelId) : undefined
    if (!model) throw new HTTPException(400, { message: "Invalid local model id" })
    if (installing.has(model.id)) throw new HTTPException(409, { message: "This model is already downloading" })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        installing.add(model.id)
        let closed = false
        const send = (value: unknown) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)) }
          catch { closed = true }
        }
        void installLocalLlmModel({
          modelsDir,
          id: model.id,
          fetchImpl,
          signal: c.req.raw.signal,
          onProgress: send,
        }).then(() => {
          send({ status: "complete", total: localLlmDownloadBytes(model), completed: localLlmDownloadBytes(model) })
          if (!closed) controller.close()
        }).catch((error: unknown) => {
          send({ error: error instanceof Error ? error.message : String(error) })
          if (!closed) controller.close()
        }).finally(() => installing.delete(model.id))
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    })
  })

  app.delete("/local-ai/models/:alias", async (c) => {
    const model = findLocalLlmModel(c.req.param("alias"))
    if (!model) throw new HTTPException(404, { message: "Unknown local model" })
    if (runtime.status().loadedModelId === model.id) await runtime.stop()
    try {
      removeLocalLlmModel(modelsDir, model.id)
    } catch (error) {
      throw new HTTPException(404, { message: error instanceof Error ? error.message : String(error) })
    }
    return c.json({ removed: model.id })
  })

  app.post("/local-ai/stop", async (c) => {
    await runtime.stop()
    return c.json(runtime.status())
  })

  app.all("/local-ai/openai/v1/*", async (c) => {
    const requestUrl = new URL(c.req.url)
    const suffix = requestUrl.pathname.split("/local-ai/openai/v1")[1] || "/"
    const rawBody = c.req.method === "GET" || c.req.method === "HEAD"
      ? undefined
      : await c.req.arrayBuffer()
    let modelId = ""
    if (rawBody?.byteLength) {
      try {
        const body = JSON.parse(new TextDecoder().decode(rawBody)) as { model?: unknown }
        if (typeof body.model === "string") modelId = body.model
      } catch {
        throw new HTTPException(400, { message: "Invalid OpenAI-compatible request body" })
      }
    }
    const model = findLocalLlmModel(modelId)
    if (!model) throw new HTTPException(400, { message: "Unknown embedded local model" })

    let endpoint: { baseUrl: string; apiKey: string }
    try {
      endpoint = await runtime.ensureRunning(model.id)
    } catch (error) {
      throw new HTTPException(503, { message: error instanceof Error ? error.message : String(error) })
    }

    const headers = new Headers(c.req.raw.headers)
    headers.delete("host")
    headers.delete("content-length")
    headers.set("authorization", `Bearer ${endpoint.apiKey}`)
    const startedAt = Date.now()
    const upstream = await fetchImpl(`${endpoint.baseUrl}${suffix}${requestUrl.search}`, {
      method: c.req.method,
      headers,
      body: rawBody,
      signal: c.req.raw.signal,
    }).catch((error: unknown) => {
      throw new HTTPException(502, { message: `Local inference failed: ${error instanceof Error ? error.message : String(error)}` })
    })

    const contentType = upstream.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = await upstream.text()
      try { runtime.recordResponse(Date.now() - startedAt, JSON.parse(body)) }
      catch { runtime.recordResponse(Date.now() - startedAt, null) }
      return new Response(body, { status: upstream.status, headers: upstream.headers })
    }
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers })
  })

  return app
}
