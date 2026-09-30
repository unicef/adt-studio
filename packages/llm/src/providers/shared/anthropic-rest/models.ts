import { z } from "zod"
import type { DiscoveredModel } from "../../../ports/index.js"
import { ModelDiscoveryError } from "../../../model-discovery.js"

export const ANTHROPIC_ORIGIN = "https://api.anthropic.com"

const MODELS_URL = `${ANTHROPIC_ORIGIN}/v1/models?limit=1000`
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_TIMEOUT_MS = 15_000

const ModelsResponse = z.object({
  data: z
    .array(
      z
        .object({ id: z.string().min(1), display_name: z.string().min(1).optional() })
        .passthrough(),
    )
    .default([]),
})

export interface ListAnthropicModelsOptions {
  apiKey: string
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * GET `/v1/models`. Advisory discovery only — a failure throws
 * `ModelDiscoveryError` and the caller degrades to the static lists.
 */
export async function listAnthropicModels(
  options: ListAnthropicModelsOptions,
): Promise<DiscoveredModel[]> {
  const signal = combineSignals(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(MODELS_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      signal,
    })
  } catch {
    throw new ModelDiscoveryError(
      "unreachable",
      "Could not reach the Anthropic model listing",
    )
  }

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "missing-credential"
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

  return parsed.data.data.map((entry) => ({
    id: entry.id,
    ...(entry.display_name ? { displayName: entry.display_name } : {}),
  }))
}

function combineSignals(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return external ? AbortSignal.any([external, timeout]) : timeout
}
