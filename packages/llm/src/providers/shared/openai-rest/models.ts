import { z } from "zod"
import type { DiscoveredModel } from "../../../ports/index.js"
import { ModelDiscoveryError } from "../../../model-discovery.js"

const DEFAULT_TIMEOUT_MS = 15_000

export interface ListOpenAiCompatibleModelsOptions {
  /** Base URL including the API version segment, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  apiKey?: string
  signal?: AbortSignal
  timeoutMs?: number
}

const ModelsResponse = z.object({
  data: z
    .array(z.object({ id: z.string().min(1) }).passthrough())
    .default([]),
})

/**
 * GET `/models` on any OpenAI-compatible endpoint. Advisory discovery only —
 * a failure throws `ModelDiscoveryError` and the caller degrades gracefully.
 */
export async function listOpenAiCompatibleModels(
  options: ListOpenAiCompatibleModelsOptions,
): Promise<DiscoveredModel[]> {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/models`
  const signal = combineSignals(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      signal,
    })
  } catch {
    throw new ModelDiscoveryError("unreachable", `Could not reach ${url}`)
  }

  if (!response.ok) {
    // Only a 401 means the key itself was refused. A 403 is a key that works
    // but may not list models (an OpenAI restricted key without the Models
    // read permission still runs generation), so it is not reported as a bad key.
    const code = response.status === 401
      ? "missing-credential"
      : response.status === 403
        ? "unsupported"
        : "unreachable"
    throw new ModelDiscoveryError(code, `Model listing failed with HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ModelDiscoveryError("invalid-response", "Model listing returned invalid JSON")
  }

  const parsed = ModelsResponse.safeParse(payload)
  if (!parsed.success) {
    throw new ModelDiscoveryError("invalid-response", "Unexpected model listing shape")
  }

  const seen = new Set<string>()
  const models: DiscoveredModel[] = []
  for (const entry of parsed.data.data) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    models.push({ id: entry.id })
  }
  return models
}

function combineSignals(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!external) return timeout
  return AbortSignal.any([external, timeout])
}
