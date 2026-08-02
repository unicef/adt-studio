import os from "node:os"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { DEFAULT_OLLAMA_BASE_URL, resolveOllamaModelName } from "@adt/llm"

const GiB = 1024 ** 3

export const LOCAL_GEMMA_MODELS = [
  {
    id: "ollama:gemma4-e2b",
    ollamaName: "gemma4:e2b",
    label: "Gemma 4 E2B",
    downloadBytes: 7.2 * GiB,
    minimumMemoryBytes: 8 * GiB,
  },
  {
    id: "ollama:gemma4-e4b",
    ollamaName: "gemma4:e4b",
    label: "Gemma 4 E4B",
    downloadBytes: 9.6 * GiB,
    minimumMemoryBytes: 12 * GiB,
  },
  {
    id: "ollama:gemma4-12b",
    ollamaName: "gemma4:12b",
    label: "Gemma 4 12B",
    downloadBytes: 7.6 * GiB,
    minimumMemoryBytes: 20 * GiB,
  },
  {
    id: "ollama:gemma4-26b",
    ollamaName: "gemma4:26b",
    label: "Gemma 4 26B A4B",
    downloadBytes: 18 * GiB,
    minimumMemoryBytes: 48 * GiB,
  },
  {
    id: "ollama:gemma4-31b",
    ollamaName: "gemma4:31b",
    label: "Gemma 4 31B",
    downloadBytes: 20 * GiB,
    minimumMemoryBytes: 64 * GiB,
  },
] as const

const LocalModelId = z.enum(LOCAL_GEMMA_MODELS.map((model) => model.id) as [
  (typeof LOCAL_GEMMA_MODELS)[number]["id"],
  ...(typeof LOCAL_GEMMA_MODELS)[number]["id"][],
])

const PullRequest = z.object({ modelId: LocalModelId })

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string; size?: number }>
}

export function recommendLocalGemma(totalMemoryBytes: number) {
  const candidates = LOCAL_GEMMA_MODELS.filter(
    (model) => totalMemoryBytes >= model.minimumMemoryBytes,
  )
  return candidates.at(-1) ?? LOCAL_GEMMA_MODELS[0]
}

function ollamaUrl(path: string): string {
  const base = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "")
  return `${base}${path}`
}

export function createLocalAIRoutes(options: {
  fetchImpl?: typeof fetch
  totalMemoryBytes?: number
} = {}) {
  const app = new Hono()
  const fetchImpl = options.fetchImpl ?? fetch

  app.get("/local-ai/status", async (c) => {
    const totalMemoryBytes = options.totalMemoryBytes ?? os.totalmem()
    const recommended = recommendLocalGemma(totalMemoryBytes)

    try {
      const tagsResponse = await fetchImpl(ollamaUrl("/api/tags"), {
        signal: AbortSignal.timeout(3_000),
      })
      if (!tagsResponse.ok) throw new Error(`Ollama returned HTTP ${tagsResponse.status}`)
      const tags = await tagsResponse.json() as OllamaTagsResponse
      const installedNames = new Set(
        (tags.models ?? [])
          .map((model) => model.model || model.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => name.replace(/:latest$/, "")),
      )

      return c.json({
        runtime: "ollama" as const,
        runtimeAvailable: true,
        runtimeInstallUrl: "https://ollama.com/download",
        endpoint: ollamaUrl(""),
        system: {
          platform: os.platform(),
          architecture: os.arch(),
          totalMemoryBytes,
        },
        recommendedModelId: recommended.id,
        models: LOCAL_GEMMA_MODELS.map((model) => ({
          ...model,
          installed: installedNames.has(model.ollamaName),
          recommended: model.id === recommended.id,
        })),
      })
    } catch (error) {
      return c.json({
        runtime: "ollama" as const,
        runtimeAvailable: false,
        runtimeInstallUrl: "https://ollama.com/download",
        endpoint: ollamaUrl(""),
        error: error instanceof Error ? error.message : String(error),
        system: {
          platform: os.platform(),
          architecture: os.arch(),
          totalMemoryBytes,
        },
        recommendedModelId: recommended.id,
        models: LOCAL_GEMMA_MODELS.map((model) => ({
          ...model,
          installed: false,
          recommended: model.id === recommended.id,
        })),
      })
    }
  })

  app.post("/local-ai/pull", async (c) => {
    const parsed = PullRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid local model id" })
    }

    const model = LOCAL_GEMMA_MODELS.find((item) => item.id === parsed.data.modelId)!
    const response = await fetchImpl(ollamaUrl("/api/pull"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: resolveOllamaModelName(model.id.slice("ollama:".length)) }),
      signal: c.req.raw.signal,
    }).catch((error: unknown) => {
      throw new HTTPException(503, {
        message: `Unable to reach Ollama: ${error instanceof Error ? error.message : String(error)}`,
      })
    })

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "")
      throw new HTTPException(502, {
        message: detail || `Ollama returned HTTP ${response.status}`,
      })
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    })
  })

  return app
}
